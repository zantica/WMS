// apps/api/src/use-cases/tasks/__tests__/sync-task-batch.test.ts
// Tests unitarios para el caso de uso syncTaskBatch (F6.1).
// Cubre:
// 1. Happy Path: Lotes FIFO mixtos (CONFIRM_STEP y CONFIRM_RECEIPT_LINE)
// 2. Orden FIFO: Ejecución cronológica basada en occurredAt
// 3. Idempotencia: Reintentos devuelven ALREADY_APPLIED con resultado previo
// 4. Política Servidor-Gana (Server-Wins): Conflictos concurrentes devuelven CONFLICT
// 5. Rechazos de validación: REJECTED ante escaneos erróneos
// 6. Casos Borde: Lote vacío, tamaño superior al límite (100)
// 7. Aislamiento Multi-Tenant

import { describe, it, expect, beforeEach, vi } from "vitest";
import { syncTaskBatch, MAX_SYNC_BATCH_SIZE } from "../sync-task-batch.js";
import { InMemoryIdempotencyStore } from "../../../adapters/in-memory-idempotency-store.js";
import { WmsError } from "../../../plugins/error-handler.js";
import type { SyncTaskBatchItem } from "@wms/shared-types";

// Mock de confirmTaskStep y confirmReceiptLine para pruebas unitarias desacopladas
const mockConfirmTaskStep = vi.fn();
const mockConfirmReceiptLine = vi.fn();

vi.mock("../confirm-task-step.js", () => ({
  confirmTaskStep: (...args: unknown[]) => mockConfirmTaskStep(...args),
}));

vi.mock("../confirm-receipt-line.js", () => ({
  confirmReceiptLine: (...args: unknown[]) => mockConfirmReceiptLine(...args),
}));

describe("syncTaskBatch (Hito 6 — F6.1)", () => {
  let store: InMemoryIdempotencyStore;
  const tenantId = "tenant-offline-1";
  const userId = "user-operator-1";

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    vi.clearAllMocks();
  });

  // ── 1. Happy Path ──────────────────────────────────────────────────────────
  it("procesa un lote exitoso con CONFIRM_STEP y CONFIRM_RECEIPT_LINE devolviendo APPLIED", async () => {
    mockConfirmTaskStep.mockResolvedValueOnce({
      stepId: "step-1",
      scannedQty: 2,
      expectedQty: 2,
      remainingQty: 0,
      stepStatus: "COMPLETED",
      taskStatus: "COMPLETED",
      taskComplete: true,
      idempotencyStatus: "APPLIED",
    });

    mockConfirmReceiptLine.mockResolvedValueOnce({
      stepId: "step-rec-1",
      scannedQty: 10,
      expectedQty: 10,
      stepStatus: "COMPLETED",
      taskStatus: "COMPLETED",
      putawayTaskId: "putaway-task-1",
      remainingQty: 0,
      idempotencyStatus: "APPLIED",
    });

    const items: SyncTaskBatchItem[] = [
      {
        idempotencyKey: "key-step-1",
        action: "CONFIRM_STEP",
        occurredAt: "2026-11-10T02:00:00.000Z",
        payload: {
          taskId: "task-1",
          stepId: "step-1",
          scannedCode: "PROD-SKU-1",
          quantity: 2,
        },
      },
      {
        idempotencyKey: "key-rec-1",
        action: "CONFIRM_RECEIPT_LINE",
        occurredAt: "2026-11-10T02:01:00.000Z",
        payload: {
          taskId: "task-rec-1",
          productId: "prod-1",
          scannedQty: 10,
        },
      },
    ];

    const result = await syncTaskBatch({
      tenantId,
      userId,
      items,
      idempotencyStore: store,
    });

    expect(result.total).toBe(2);
    expect(result.appliedCount).toBe(2);
    expect(result.alreadyAppliedCount).toBe(0);
    expect(result.conflictCount).toBe(0);
    expect(result.rejectedCount).toBe(0);
    expect(result.items).toHaveLength(2);

    expect(result.items[0]?.status).toBe("APPLIED");
    expect(result.items[0]?.idempotencyKey).toBe("key-step-1");
    expect(result.items[0]?.occurredAt).toBe("2026-11-10T02:00:00.000Z");
    expect(result.items[0]?.receivedAt).toBeDefined();

    expect(result.items[1]?.status).toBe("APPLIED");
    expect(result.items[1]?.idempotencyKey).toBe("key-rec-1");

    expect(mockConfirmTaskStep).toHaveBeenCalledTimes(1);
    expect(mockConfirmReceiptLine).toHaveBeenCalledTimes(1);
  });

  // ── 2. Orden FIFO ─────────────────────────────────────────────────────────
  it("ejecuta las mutaciones estrictamente en orden FIFO cronológico por occurredAt", async () => {
    const executionOrder: string[] = [];

    mockConfirmTaskStep.mockImplementation(async (params: { stepId: string }) => {
      executionOrder.push(params.stepId);
      return {
        stepId: params.stepId,
        scannedQty: 1,
        expectedQty: 1,
        stepStatus: "COMPLETED",
        taskStatus: "IN_PROGRESS",
        taskComplete: false,
      };
    });

    // Ítems enviados en orden desordenado en el array
    const items: SyncTaskBatchItem[] = [
      {
        idempotencyKey: "key-t3",
        action: "CONFIRM_STEP",
        occurredAt: "2026-11-10T02:05:00.000Z", // Ocurrió de tercero
        payload: { taskId: "t", stepId: "step-third", scannedCode: "C3" },
      },
      {
        idempotencyKey: "key-t1",
        action: "CONFIRM_STEP",
        occurredAt: "2026-11-10T02:01:00.000Z", // Ocurrió de primero
        payload: { taskId: "t", stepId: "step-first", scannedCode: "C1" },
      },
      {
        idempotencyKey: "key-t2",
        action: "CONFIRM_STEP",
        occurredAt: "2026-11-10T02:03:00.000Z", // Ocurrió de segundo
        payload: { taskId: "t", stepId: "step-second", scannedCode: "C2" },
      },
    ];

    const res = await syncTaskBatch({
      tenantId,
      items,
      idempotencyStore: store,
    });

    expect(executionOrder).toEqual(["step-first", "step-second", "step-third"]);
    expect(res.appliedCount).toBe(3);
  });

  // ── 3. Idempotencia y Reintentos ──────────────────────────────────────────
  it("devuelve ALREADY_APPLIED sin re-ejecutar el caso de uso cuando la clave ya existe", async () => {
    // Simulamos un registro ya existente en IdempotencyStore
    const previousResult = {
      stepId: "step-prev",
      scannedQty: 5,
      expectedQty: 5,
      stepStatus: "COMPLETED",
    };

    await store.save({
      tenantId,
      idempotencyKey: "key-already-done",
      action: "CONFIRM_TASK_STEP",
      responseBody: previousResult,
      occurredAt: "2026-11-10T01:50:00.000Z",
    });

    const items: SyncTaskBatchItem[] = [
      {
        idempotencyKey: "key-already-done",
        action: "CONFIRM_STEP",
        occurredAt: "2026-11-10T01:50:00.000Z",
        payload: { taskId: "task-1", stepId: "step-prev", scannedCode: "SKU-PREV" },
      },
    ];

    const res = await syncTaskBatch({
      tenantId,
      items,
      idempotencyStore: store,
    });

    expect(res.total).toBe(1);
    expect(res.appliedCount).toBe(0);
    expect(res.alreadyAppliedCount).toBe(1);
    expect(res.items[0]?.status).toBe("ALREADY_APPLIED");
    expect(res.items[0]?.result).toEqual(previousResult);

    // No se llamó al caso de uso de ejecución
    expect(mockConfirmTaskStep).not.toHaveBeenCalled();
  });

  // ── 4. Política Servidor-Gana (Server-Wins / CONFLICT) ────────────────────
  it("marca CONFLICT cuando el estado en servidor difiere (ej. paso ya completado) y continúa el lote", async () => {
    // Primer paso falla por conflicto (paso ya completado concurrentemente)
    mockConfirmTaskStep.mockRejectedValueOnce(
      new WmsError("VALIDATION_ERROR", "Step step-conflict is already completed", 409),
    );

    // Segundo paso es independiente y exitoso
    mockConfirmTaskStep.mockResolvedValueOnce({
      stepId: "step-ok",
      scannedQty: 1,
      expectedQty: 1,
      remainingQty: 0,
      stepStatus: "COMPLETED",
      taskStatus: "COMPLETED",
      taskComplete: true,
      idempotencyStatus: "APPLIED",
    });

    const items: SyncTaskBatchItem[] = [
      {
        idempotencyKey: "key-conflict",
        action: "CONFIRM_STEP",
        occurredAt: "2026-11-10T02:00:00.000Z",
        payload: { taskId: "task-1", stepId: "step-conflict", scannedCode: "SKU-1" },
      },
      {
        idempotencyKey: "key-ok",
        action: "CONFIRM_STEP",
        occurredAt: "2026-11-10T02:01:00.000Z",
        payload: { taskId: "task-1", stepId: "step-ok", scannedCode: "SKU-2" },
      },
    ];

    const res = await syncTaskBatch({
      tenantId,
      items,
      idempotencyStore: store,
    });

    expect(res.total).toBe(2);
    expect(res.conflictCount).toBe(1);
    expect(res.appliedCount).toBe(1);

    expect(res.items[0]?.status).toBe("CONFLICT");
    expect(res.items[0]?.error?.code).toBe("VALIDATION_ERROR");
    expect(res.items[0]?.error?.message).toContain("already completed");

    expect(res.items[1]?.status).toBe("APPLIED");

    // El resultado de conflicto quedó guardado en el store para reintentos
    const recordedConflict = await store.find(tenantId, "key-conflict");
    expect(recordedConflict).not.toBeNull();
  });

  // ── 5. Rechazos de validación (REJECTED) ──────────────────────────────────
  it("marca REJECTED cuando hay un fallo de escaneo inválido", async () => {
    mockConfirmTaskStep.mockRejectedValueOnce(
      new WmsError("INVALID_SCAN", "Scanned code does not match expected product", 422),
    );

    const items: SyncTaskBatchItem[] = [
      {
        idempotencyKey: "key-invalid-scan",
        action: "CONFIRM_STEP",
        occurredAt: "2026-11-10T02:00:00.000Z",
        payload: { taskId: "t", stepId: "s", scannedCode: "WRONG_BARCODE" },
      },
    ];

    const res = await syncTaskBatch({
      tenantId,
      items,
      idempotencyStore: store,
    });

    expect(res.rejectedCount).toBe(1);
    expect(res.items[0]?.status).toBe("REJECTED");
    expect(res.items[0]?.error?.code).toBe("INVALID_SCAN");
  });

  // ── 6. Casos Borde y Validaciones ─────────────────────────────────────────
  it("rechaza lote vacío con VALIDATION_ERROR", async () => {
    await expect(
      syncTaskBatch({
        tenantId,
        items: [],
        idempotencyStore: store,
      }),
    ).rejects.toThrow("Sync batch cannot be empty");
  });

  it("rechaza lote que excede el límite máximo de 100 ítems", async () => {
    const tooManyItems = Array.from({ length: MAX_SYNC_BATCH_SIZE + 1 }, (_, i) => ({
      idempotencyKey: `key-${i}`,
      action: "CONFIRM_STEP" as const,
      occurredAt: new Date().toISOString(),
      payload: { taskId: "t", stepId: "s", scannedCode: "c" },
    }));

    await expect(
      syncTaskBatch({
        tenantId,
        items: tooManyItems,
        idempotencyStore: store,
      }),
    ).rejects.toThrow("Sync batch exceeds maximum allowed limit");
  });

  it("rechaza ítems con clave de idempotencia vacía o faltante", async () => {
    await expect(
      syncTaskBatch({
        tenantId,
        items: [
          {
            idempotencyKey: "",
            action: "CONFIRM_STEP",
            occurredAt: new Date().toISOString(),
            payload: { taskId: "t", stepId: "s", scannedCode: "c" },
          },
        ],
        idempotencyStore: store,
      }),
    ).rejects.toThrow("invalid or missing idempotencyKey");
  });

  it("rechaza ítems con timestamp de ocurrencia inválido", async () => {
    await expect(
      syncTaskBatch({
        tenantId,
        items: [
          {
            idempotencyKey: "valid-key",
            action: "CONFIRM_STEP",
            occurredAt: "fecha-invalida",
            payload: { taskId: "t", stepId: "s", scannedCode: "c" },
          },
        ],
        idempotencyStore: store,
      }),
    ).rejects.toThrow("invalid or missing occurredAt ISO timestamp");
  });

  // ── 7. Aislamiento Multi-Tenant ──────────────────────────────────────────
  it("garantiza que la idempotencia de un tenant no afecte a otro tenant", async () => {
    // Guardamos una mutación en tenant-A
    await store.save({
      tenantId: "tenant-A",
      idempotencyKey: "shared-key-1",
      action: "CONFIRM_TASK_STEP",
      responseBody: { source: "tenant-A" },
    });

    mockConfirmTaskStep.mockResolvedValueOnce({
      stepId: "step-b",
      scannedQty: 1,
      expectedQty: 1,
      remainingQty: 0,
      stepStatus: "COMPLETED",
      taskStatus: "COMPLETED",
      taskComplete: true,
      idempotencyStatus: "APPLIED",
    });

    // Invocamos syncTaskBatch para tenant-B con la misma clave
    const res = await syncTaskBatch({
      tenantId: "tenant-B",
      items: [
        {
          idempotencyKey: "shared-key-1",
          action: "CONFIRM_STEP",
          occurredAt: "2026-11-10T02:00:00.000Z",
          payload: { taskId: "task-b", stepId: "step-b", scannedCode: "SKU-B" },
        },
      ],
      idempotencyStore: store,
    });

    // Se ejecutó como APPLIED para tenant-B sin colisión
    expect(res.appliedCount).toBe(1);
    expect(res.alreadyAppliedCount).toBe(0);
    expect(mockConfirmTaskStep).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-B",
        idempotencyKey: "shared-key-1",
      }),
    );
  });
});
