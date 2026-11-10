// apps/api/src/use-cases/tasks/sync-task-batch.ts
// Caso de uso: Sincronización por lotes de tareas operativas offline-first (F6.1).
// Procesa mutaciones en cola generadas en el dispositivo móvil en estricto orden FIFO,
// registrando occurredAt (timestamp cliente) y receivedAt (timestamp servidor).
// Implementa política Servidor-Gana (Server-Wins) ante conflictos de estado concurrentes
// e idempotencia transaccional única por (tenantId, idempotencyKey).

import type {
  SyncTaskBatchItem,
  SyncTaskBatchResult,
  SyncBatchItemResult,
  SyncBatchItemStatus,
  ConfirmTaskStepPayload,
  ConfirmReceiptLinePayload,
} from "@wms/shared-types";
import type { Prisma } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";
import type { IdempotencyStore } from "../../ports/idempotency-store.js";
import { PrismaIdempotencyStore } from "../../adapters/prisma-idempotency-store.js";
import { getAmbientTenantScope } from "../security/tenant-context.js";
import { confirmTaskStep } from "./confirm-task-step.js";
import { confirmReceiptLine } from "./confirm-receipt-line.js";

export const MAX_SYNC_BATCH_SIZE = 100;

export interface SyncTaskBatchParams {
  tenantId: string;
  userId?: string | undefined;
  items: SyncTaskBatchItem[];
  idempotencyStore?: IdempotencyStore | undefined;
  tx?: Prisma.TransactionClient | undefined;
}

/**
 * Determina si un error de dominio corresponde a un conflicto de estado
 * servidor-gana (ej. paso ya completado por otro operario, tarea cancelada/cerrada,
 * stock insuficiente o secuencia desfasada) o a un rechazo de validación.
 */
function isConflictError(code: string, message: string): boolean {
  if (code === "CONFLICT" || code === "INSUFFICIENT_STOCK" || code === "WRONG_STEP_SEQUENCE") {
    return true;
  }
  const lowerMsg = message.toLowerCase();
  return (
    lowerMsg.includes("already completed") ||
    lowerMsg.includes("already cancelled") ||
    lowerMsg.includes("already in_progress") ||
    lowerMsg.includes("conflict")
  );
}

/**
 * Procesa un lote de mutaciones offline de tareas en orden FIFO.
 */
export async function syncTaskBatch(
  params: SyncTaskBatchParams,
): Promise<SyncTaskBatchResult> {
  const { tenantId, userId, items } = params;

  if (!Array.isArray(items) || items.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "Sync batch cannot be empty. Must provide at least one item.",
      422,
    );
  }

  if (items.length > MAX_SYNC_BATCH_SIZE) {
    throw new WmsError(
      "VALIDATION_ERROR",
      `Sync batch exceeds maximum allowed limit of ${MAX_SYNC_BATCH_SIZE} items. Received: ${items.length}`,
      422,
    );
  }

  // Validar estructura de cada ítem antes del procesamiento
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item?.idempotencyKey || typeof item.idempotencyKey !== "string" || item.idempotencyKey.trim() === "") {
      throw new WmsError(
        "VALIDATION_ERROR",
        `Item at index ${i} has invalid or missing idempotencyKey`,
        422,
      );
    }
    if (item.action !== "CONFIRM_STEP" && item.action !== "CONFIRM_RECEIPT_LINE") {
      throw new WmsError(
        "VALIDATION_ERROR",
        `Item at index ${i} has unsupported action: "${String(item.action)}"`,
        422,
      );
    }
    if (!item.occurredAt || isNaN(Date.parse(item.occurredAt))) {
      throw new WmsError(
        "VALIDATION_ERROR",
        `Item at index ${i} has invalid or missing occurredAt ISO timestamp`,
        422,
      );
    }
    if (!item.payload || typeof item.payload !== "object") {
      throw new WmsError(
        "VALIDATION_ERROR",
        `Item at index ${i} has invalid or missing payload`,
        422,
      );
    }
  }

  const store = params.idempotencyStore ?? new PrismaIdempotencyStore();
  const effectiveTx =
    params.tx ?? getAmbientTenantScope<Prisma.TransactionClient>()?.scope;

  // Orden FIFO estricto: preserva el orden de ocurrencia en cliente (occurredAt ASC).
  // Si los timestamps son iguales, conserva el orden relativo original del array.
  const indexedItems = items.map((item, originalIndex) => ({
    item,
    originalIndex,
    time: Date.parse(item.occurredAt),
  }));

  indexedItems.sort((a, b) => {
    if (a.time !== b.time) {
      return a.time - b.time;
    }
    return a.originalIndex - b.originalIndex;
  });

  const results: SyncBatchItemResult[] = [];
  let appliedCount = 0;
  let alreadyAppliedCount = 0;
  let conflictCount = 0;
  let rejectedCount = 0;

  for (const { item } of indexedItems) {
    const receivedAt = new Date().toISOString();

    // 1. Verificación previa en IdempotencyStore
    const existing = await store.find(tenantId, item.idempotencyKey, effectiveTx);
    if (existing) {
      alreadyAppliedCount++;
      results.push({
        idempotencyKey: item.idempotencyKey,
        action: item.action,
        status: "ALREADY_APPLIED",
        occurredAt: item.occurredAt,
        receivedAt,
        result: existing.responseBody,
      });
      continue;
    }

    // 2. Ejecución según la acción
    try {
      if (item.action === "CONFIRM_STEP") {
        const payload = item.payload as ConfirmTaskStepPayload;
        if (!payload.taskId || !payload.stepId || !payload.scannedCode) {
          throw new WmsError(
            "VALIDATION_ERROR",
            "Missing required fields for CONFIRM_STEP (taskId, stepId, scannedCode)",
            422,
          );
        }

        const confirmRes = await confirmTaskStep({
          taskId: payload.taskId,
          stepId: payload.stepId,
          tenantId,
          scannedCode: payload.scannedCode,
          quantity: payload.quantity,
          reportException: payload.reportException,
          exceptionNote: payload.exceptionNote,
          userId,
          idempotencyKey: item.idempotencyKey,
          occurredAt: item.occurredAt,
          idempotencyStore: store,
          ...(effectiveTx ? { tx: effectiveTx } : {}),
        });

        if (confirmRes.idempotencyStatus === "ALREADY_APPLIED") {
          alreadyAppliedCount++;
          results.push({
            idempotencyKey: item.idempotencyKey,
            action: item.action,
            status: "ALREADY_APPLIED",
            occurredAt: item.occurredAt,
            receivedAt,
            result: confirmRes,
          });
        } else {
          appliedCount++;
          results.push({
            idempotencyKey: item.idempotencyKey,
            action: item.action,
            status: "APPLIED",
            occurredAt: item.occurredAt,
            receivedAt,
            result: confirmRes,
          });
        }
      } else if (item.action === "CONFIRM_RECEIPT_LINE") {
        const payload = item.payload as ConfirmReceiptLinePayload;
        if (!payload.taskId || !payload.productId || typeof payload.scannedQty !== "number") {
          throw new WmsError(
            "VALIDATION_ERROR",
            "Missing required fields for CONFIRM_RECEIPT_LINE (taskId, productId, scannedQty)",
            422,
          );
        }

        const receiptRes = await confirmReceiptLine({
          taskId: payload.taskId,
          productId: payload.productId,
          scannedQty: payload.scannedQty,
          barcode: payload.barcode,
          tenantId,
          userId,
          idempotencyKey: item.idempotencyKey,
          occurredAt: item.occurredAt,
          idempotencyStore: store,
          ...(effectiveTx ? { tx: effectiveTx } : {}),
        });

        if (receiptRes.idempotencyStatus === "ALREADY_APPLIED") {
          alreadyAppliedCount++;
          results.push({
            idempotencyKey: item.idempotencyKey,
            action: item.action,
            status: "ALREADY_APPLIED",
            occurredAt: item.occurredAt,
            receivedAt,
            result: receiptRes,
          });
        } else {
          appliedCount++;
          results.push({
            idempotencyKey: item.idempotencyKey,
            action: item.action,
            status: "APPLIED",
            occurredAt: item.occurredAt,
            receivedAt,
            result: receiptRes,
          });
        }
      }
    } catch (err: unknown) {
      // Política Servidor-Gana (Server-Wins):
      // Si la mutación no puede aplicarse por inconsistencia con el estado consolidado
      // del servidor, se clasifica como CONFLICT o REJECTED y se registra en IdempotencyStore.
      const isWms = err instanceof WmsError;
      const errorCode = isWms ? err.code : "INTERNAL_ERROR";
      const message = err instanceof Error ? err.message : String(err);
      const details = isWms ? err.details : undefined;
      const statusCode = isWms ? err.statusCode : 500;

      const conflict = isConflictError(errorCode, message);
      const itemStatus: SyncBatchItemStatus = conflict ? "CONFLICT" : "REJECTED";

      if (conflict) {
        conflictCount++;
      } else {
        rejectedCount++;
      }

      const errorPayload = {
        code: errorCode,
        message,
        ...(details !== undefined ? { details } : {}),
      };

      const itemResult: SyncBatchItemResult = {
        idempotencyKey: item.idempotencyKey,
        action: item.action,
        status: itemStatus,
        occurredAt: item.occurredAt,
        receivedAt,
        error: errorPayload,
      };

      // Persistir el resultado de conflicto/rechazo en IdempotencyStore para que
      // reintentos posteriores devuelvan el mismo resultado sin re-evaluar
      try {
        await store.save(
          {
            tenantId,
            idempotencyKey: item.idempotencyKey,
            action: `SYNC_BATCH_${item.action}`,
            responseStatus: statusCode,
            responseBody: itemResult,
            occurredAt: item.occurredAt,
          },
          effectiveTx,
        );
      } catch {
        // Si el save de idempotencia falla (ej. carrera concurrente), se ignora
        // para asegurar que la respuesta del batch sea devuelta al cliente
      }

      results.push(itemResult);
    }
  }

  return {
    total: items.length,
    appliedCount,
    alreadyAppliedCount,
    conflictCount,
    rejectedCount,
    processedAt: new Date().toISOString(),
    items: results,
  };
}
