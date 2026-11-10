// apps/mobile/src/offline/types.ts
// Definiciones de tipos para el motor de sincronización offline-first,
// cola con cuarentena y caché local de tareas de @wms/mobile.

import type {
  ConfirmReceiptLinePayload,
  ConfirmTaskStepPayload,
  SyncTaskActionType,
  SyncTaskBatchItem,
} from "@wms/shared-types";

export type QueueItemStatus = "PENDING" | "SYNCING" | "QUARANTINED";

export type NetworkStatus = "ONLINE" | "OFFLINE" | "SYNCING";

export interface QuarantineReason {
  code: string;
  message: string;
  details?: unknown;
}

export type OfflineQueuePayload =
  | ConfirmTaskStepPayload
  | ConfirmReceiptLinePayload;

export interface OfflineQueueItem {
  readonly idempotencyKey: string;
  readonly action: SyncTaskActionType;
  readonly occurredAt: string; // ISO 8601 generado en el dispositivo
  readonly payload: OfflineQueuePayload;
  status: QueueItemStatus;
  retryCount: number;
  lastAttemptAt?: string | undefined;
  quarantinedAt?: string | undefined;
  quarantineReason?: QuarantineReason | undefined;
}

export interface QueueSnapshot {
  readonly items: readonly OfflineQueueItem[];
  readonly pendingCount: number;
  readonly syncingCount: number;
  readonly quarantinedCount: number;
  readonly networkStatus: NetworkStatus;
  readonly lastSyncAt?: string | undefined;
  readonly lastError?: string | undefined;
}

export interface OfflineValidationResult {
  readonly isValid: boolean;
  readonly code?: string | undefined;
  readonly message?: string | undefined;
}

export interface SyncExecutionResult {
  readonly processed: number;
  readonly applied: number;
  readonly alreadyApplied: number;
  readonly quarantined: number;
  readonly skipped?: string | undefined;
  readonly error?: string | undefined;
}

export function toSyncTaskBatchItem(
  item: OfflineQueueItem,
): SyncTaskBatchItem {
  return {
    idempotencyKey: item.idempotencyKey,
    action: item.action,
    occurredAt: item.occurredAt,
    payload: item.payload,
  };
}
