// apps/mobile/src/offline/sync-queue.ts
// Motor Hexagonal OfflineSyncQueue para @wms/mobile.
// Desacoplado de React y Expo; gestiona la cola FIFO con generación de idempotencyKey criptográfica,
// backoff exponencial con límite y cuarentena estricta para mutaciones con conflicto Server-Wins.

import type {
  SyncTaskActionType,
  SyncTaskBatchResult,
} from "@wms/shared-types";
import type { ConnectivityMonitor } from "./ports/connectivity-monitor.js";
import type { OfflineQueueStorage } from "./ports/queue-storage.js";
import type { SyncTransport } from "./ports/sync-transport.js";
import {
  toSyncTaskBatchItem,
  type NetworkStatus,
  type OfflineQueueItem,
  type OfflineQueuePayload,
  type QueueSnapshot,
  type SyncExecutionResult,
} from "./types.js";

export interface OfflineSyncQueueOptions {
  readonly storage: OfflineQueueStorage;
  readonly transport: SyncTransport;
  readonly connectivity: ConnectivityMonitor;
  readonly idGenerator?: () => string;
  readonly maxBatchSize?: number;
  readonly initialBackoffMs?: number;
  readonly maxBackoffMs?: number;
  readonly backoffMultiplier?: number;
  readonly autoSyncOnOnline?: boolean;
  readonly nowProvider?: () => Date;
  readonly scheduleTimeout?: (fn: () => void, ms: number) => unknown;
  readonly clearScheduledTimeout?: (id: unknown) => void;
}

function defaultIdGenerator(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  // En node / tests
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("node:crypto");
    if (typeof nodeCrypto.randomUUID === "function") {
      return nodeCrypto.randomUUID();
    }
  } catch {
    // fallback
  }
  throw new Error("crypto.randomUUID is not available in current runtime");
}

export class OfflineSyncQueue {
  private readonly storage: OfflineQueueStorage;
  private readonly transport: SyncTransport;
  private readonly connectivity: ConnectivityMonitor;
  private readonly idGenerator: () => string;
  private readonly maxBatchSize: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly backoffMultiplier: number;
  private readonly autoSyncOnOnline: boolean;
  private readonly nowProvider: () => Date;
  private readonly scheduleTimeout: (fn: () => void, ms: number) => unknown;
  private readonly clearScheduledTimeout: (id: unknown) => void;

  private items: OfflineQueueItem[] = [];
  private activeSyncPromise: Promise<SyncExecutionResult> | null = null;
  private consecutiveNetworkFailures = 0;
  private scheduledRetryId: unknown | null = null;
  private unsubscribeConnectivity: (() => void) | null = null;
  private lastSyncAt?: string | undefined;
  private lastError?: string | undefined;
  private readonly listeners: Set<(snapshot: QueueSnapshot) => void> = new Set();
  private initialized = false;

  constructor(options: OfflineSyncQueueOptions) {
    this.storage = options.storage;
    this.transport = options.transport;
    this.connectivity = options.connectivity;
    this.idGenerator = options.idGenerator ?? defaultIdGenerator;
    this.maxBatchSize = options.maxBatchSize ?? 50;
    this.initialBackoffMs = options.initialBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30000;
    this.backoffMultiplier = options.backoffMultiplier ?? 2;
    this.autoSyncOnOnline = options.autoSyncOnOnline ?? true;
    this.nowProvider = options.nowProvider ?? (() => new Date());
    this.scheduleTimeout =
      options.scheduleTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearScheduledTimeout =
      options.clearScheduledTimeout ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  }

  /**
   * Inicializa la cola cargando ítems persistidos y suscribiéndose al monitor de conectividad.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const stored = await this.storage.load();
    // Si la app se cerró durante un envío previo, reseteamos ítems SYNCING a PENDING
    this.items = stored.map((item) =>
      item.status === "SYNCING" ? { ...item, status: "PENDING" as const } : item,
    );

    if (this.items.some((i) => i.status === "PENDING" && stored.some((s) => s.status === "SYNCING"))) {
      await this.storage.save(this.items);
    }

    this.unsubscribeConnectivity = this.connectivity.subscribe((isOnline) => {
      this.notifyListeners();
      if (isOnline && this.autoSyncOnOnline && this.getPendingCount() > 0) {
        void this.sync().catch(() => {});
      }
    });

    this.notifyListeners();

    if (this.connectivity.isOnline() && this.autoSyncOnOnline && this.getPendingCount() > 0) {
      void this.sync().catch(() => {});
    }
  }

  /**
   * Encola una nueva mutación generando la `idempotencyKey` criptográfica
   * en el momento exacto del escaneo o acción del operario.
   */
  public async enqueue(
    action: SyncTaskActionType,
    payload: OfflineQueuePayload,
  ): Promise<OfflineQueueItem> {
    const item: OfflineQueueItem = {
      idempotencyKey: this.idGenerator(),
      action,
      occurredAt: this.nowProvider().toISOString(),
      payload,
      status: "PENDING",
      retryCount: 0,
    };

    this.items.push(item);
    await this.storage.save(this.items);
    this.notifyListeners();

    if (this.connectivity.isOnline()) {
      void this.sync().catch(() => {});
    }

    return item;
  }

  /**
   * Ejecuta el ciclo de sincronización en estricto orden FIFO.
   */
  public async sync(): Promise<SyncExecutionResult> {
    if (this.activeSyncPromise) {
      return this.activeSyncPromise;
    }

    this.activeSyncPromise = this.performSync();
    try {
      return await this.activeSyncPromise;
    } finally {
      this.activeSyncPromise = null;
    }
  }

  private async performSync(): Promise<SyncExecutionResult> {
    if (!this.connectivity.isOnline()) {
      return {
        processed: 0,
        applied: 0,
        alreadyApplied: 0,
        quarantined: 0,
        skipped: "offline",
      };
    }

    // Cancelamos cualquier reintento agendado previo
    this.cancelScheduledRetry();

    // Filtramos ítems PENDING (los QUARANTINED quedan aislados)
    const pendingItems = this.items
      .filter((i) => i.status === "PENDING")
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    if (pendingItems.length === 0) {
      return {
        processed: 0,
        applied: 0,
        alreadyApplied: 0,
        quarantined: 0,
      };
    }

    const batch = pendingItems.slice(0, this.maxBatchSize);
    const nowIso = this.nowProvider().toISOString();

    for (const item of batch) {
      item.status = "SYNCING";
      item.lastAttemptAt = nowIso;
    }

    this.notifyListeners();

    try {
      const batchResult: SyncTaskBatchResult = await this.transport.sendBatch(
        batch.map(toSyncTaskBatchItem),
      );

      const resultMap = new Map(
        batchResult.items.map((res) => [res.idempotencyKey, res]),
      );

      let applied = 0;
      let alreadyApplied = 0;
      let quarantined = 0;

      for (const item of batch) {
        const result = resultMap.get(item.idempotencyKey);
        if (!result) {
          // Si el servidor no devolvió respuesta para este ítem específico,
          // lo regresamos a PENDING para reintento seguro
          item.status = "PENDING";
          item.retryCount += 1;
          continue;
        }

        if (result.status === "APPLIED" || result.status === "ALREADY_APPLIED") {
          if (result.status === "APPLIED") applied += 1;
          else alreadyApplied += 1;
          // Retiramos el ítem confirmado de la cola
          this.items = this.items.filter(
            (i) => i.idempotencyKey !== item.idempotencyKey,
          );
        } else if (result.status === "CONFLICT" || result.status === "REJECTED") {
          quarantined += 1;
          item.status = "QUARANTINED";
          item.quarantinedAt = nowIso;
          item.quarantineReason = result.error ?? {
            code: result.status,
            message: `Operación rechazada con estado ${result.status}`,
          };
        }
      }

      this.consecutiveNetworkFailures = 0;
      this.lastSyncAt = nowIso;
      this.lastError = undefined;

      await this.storage.save(this.items);
      this.notifyListeners();

      const result: SyncExecutionResult = {
        processed: batch.length,
        applied,
        alreadyApplied,
        quarantined,
      };

      // Si aún quedan ítems PENDING, sincronizamos el siguiente lote
      if (this.getPendingCount() > 0 && this.connectivity.isOnline()) {
        void this.sync().catch(() => {});
      }

      return result;
    } catch (networkError: unknown) {
      // Error de red, timeout o fallo de transporte (no es conflicto de negocio)
      this.consecutiveNetworkFailures += 1;
      this.lastError =
        networkError instanceof Error ? networkError.message : String(networkError);

      for (const item of batch) {
        item.status = "PENDING";
        item.retryCount += 1;
      }

      await this.storage.save(this.items);
      this.scheduleExponentialBackoffRetry();
      this.notifyListeners();

      return {
        processed: batch.length,
        applied: 0,
        alreadyApplied: 0,
        quarantined: 0,
        error: this.lastError,
      };
    }
  }

  private scheduleExponentialBackoffRetry(): void {
    this.cancelScheduledRetry();

    if (!this.connectivity.isOnline() || this.getPendingCount() === 0) {
      return;
    }

    const exponent = Math.max(0, this.consecutiveNetworkFailures - 1);
    const delay = Math.min(
      this.initialBackoffMs * Math.pow(this.backoffMultiplier, exponent),
      this.maxBackoffMs,
    );

    this.scheduledRetryId = this.scheduleTimeout(() => {
      this.scheduledRetryId = null;
      if (this.connectivity.isOnline() && this.getPendingCount() > 0) {
        void this.sync().catch(() => {});
      }
    }, delay);
  }

  private cancelScheduledRetry(): void {
    if (this.scheduledRetryId !== null) {
      this.clearScheduledTimeout(this.scheduledRetryId);
      this.scheduledRetryId = null;
    }
  }

  /**
   * Reactiva un ítem en cuarentena pasándolo a estado PENDING para que sea reintentado.
   */
  public async retryQuarantined(idempotencyKey: string): Promise<boolean> {
    const item = this.items.find(
      (i) => i.idempotencyKey === idempotencyKey && i.status === "QUARANTINED",
    );
    if (!item) return false;

    item.status = "PENDING";
    item.retryCount = 0;
    item.quarantineReason = undefined;
    item.quarantinedAt = undefined;

    await this.storage.save(this.items);
    this.notifyListeners();

    if (this.connectivity.isOnline()) {
      void this.sync().catch(() => {});
    }

    return true;
  }

  /**
   * Descarta definitivamente un ítem en cuarentena (ej. descarte por parte del operario o supervisor).
   */
  public async discardQuarantined(idempotencyKey: string): Promise<boolean> {
    const beforeCount = this.items.length;
    this.items = this.items.filter(
      (i) => !(i.idempotencyKey === idempotencyKey && i.status === "QUARANTINED"),
    );

    if (this.items.length !== beforeCount) {
      await this.storage.save(this.items);
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Descarta todos los ítems en cuarentena.
   */
  public async clearQuarantined(): Promise<number> {
    const quarantined = this.items.filter((i) => i.status === "QUARANTINED");
    if (quarantined.length === 0) return 0;

    this.items = this.items.filter((i) => i.status !== "QUARANTINED");
    await this.storage.save(this.items);
    this.notifyListeners();
    return quarantined.length;
  }

  public getQuarantinedItems(): OfflineQueueItem[] {
    return this.items.filter((i) => i.status === "QUARANTINED");
  }

  public getPendingCount(): number {
    return this.items.filter((i) => i.status === "PENDING").length;
  }

  public getSyncingCount(): number {
    return this.items.filter((i) => i.status === "SYNCING").length;
  }

  public getQuarantinedCount(): number {
    return this.items.filter((i) => i.status === "QUARANTINED").length;
  }

  public getSnapshot(): QueueSnapshot {
    let networkStatus: NetworkStatus = "OFFLINE";
    if (this.activeSyncPromise !== null || this.getSyncingCount() > 0) {
      networkStatus = "SYNCING";
    } else if (this.connectivity.isOnline()) {
      networkStatus = "ONLINE";
    }

    return {
      items: [...this.items],
      pendingCount: this.getPendingCount(),
      syncingCount: this.getSyncingCount(),
      quarantinedCount: this.getQuarantinedCount(),
      networkStatus,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
    };
  }

  public subscribe(listener: (snapshot: QueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  public dispose(): void {
    this.cancelScheduledRetry();
    if (this.unsubscribeConnectivity) {
      this.unsubscribeConnectivity();
      this.unsubscribeConnectivity = null;
    }
    this.listeners.clear();
  }
}
