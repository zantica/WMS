// apps/api/src/use-cases/tasks/confirm-receipt-line.ts
// Caso de uso: Confirmar el escaneo de una línea de recepción (RECEIVING).
// Registra la entrada física de stock hacia la ubicación RECEIVING mediante moveStock,
// actualiza el progreso del TaskStep y, al completarse todos los pasos de la tarea,
// marca la tarea RECEIVING como COMPLETED y dispara automáticamente createPutawayTask.
//
// Hito 6 (F6.1): Soporta idempotencia transaccional mediante el puerto IdempotencyStore.
// Reintentos con la misma idempotencyKey devuelven ALREADY_APPLIED con el resultado original
// sin duplicar InventoryTransaction ni alterar InventoryBalance.

import { prisma, type Prisma } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";
import { moveStock } from "../inventory/move-stock.js";
import { createPutawayTask } from "../inventory/create-putaway-task.js";
import type { IdempotencyStore } from "../../ports/idempotency-store.js";
import { PrismaIdempotencyStore } from "../../adapters/prisma-idempotency-store.js";
import { getAmbientTenantScope } from "../security/tenant-context.js";

export interface ConfirmReceiptLineParams {
  taskId: string;
  tenantId: string;
  productId: string;
  scannedQty: number;
  barcode?: string | undefined;
  userId?: string | undefined;
  idempotencyKey?: string | undefined;
  occurredAt?: Date | string | undefined;
  idempotencyStore?: IdempotencyStore | undefined;
  tx?: Prisma.TransactionClient | undefined;
}

export interface ConfirmReceiptLineResult {
  stepId: string;
  scannedQty: number;
  expectedQty: number;
  stepStatus: "COMPLETED" | "PENDING";
  taskStatus: "COMPLETED" | "IN_PROGRESS";
  putawayTaskId: string | null;
  remainingQty: number;
  idempotencyStatus?: "APPLIED" | "ALREADY_APPLIED" | undefined;
}

type ClientOrTx = Prisma.TransactionClient | typeof prisma;

function isUniqueConstraintError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const code = (err as { code?: string }).code;
    const msg = (err as { message?: string }).message ?? "";
    return code === "P2002" || code === "23505" || msg.includes("Unique constraint");
  }
  return false;
}

/**
 * Confirma la recepción parcial o total de un producto en muelle (RECEIVING).
 */
export async function confirmReceiptLine(
  params: ConfirmReceiptLineParams,
): Promise<ConfirmReceiptLineResult> {
  const {
    taskId,
    tenantId,
    productId,
    scannedQty,
    barcode,
    userId,
    idempotencyKey,
    occurredAt,
  } = params;

  if (scannedQty <= 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "Scanned quantity must be positive",
      422,
    );
  }

  const store = params.idempotencyStore ?? new PrismaIdempotencyStore();

  // ── 0. Comprobación de idempotencia previa ─────────────────────────────
  if (idempotencyKey) {
    const existing = await store.find<ConfirmReceiptLineResult>(
      tenantId,
      idempotencyKey,
      params.tx,
    );
    if (existing) {
      return {
        ...existing.responseBody,
        idempotencyStatus: "ALREADY_APPLIED",
      };
    }
  }

  const executeConfirm = async (client: ClientOrTx): Promise<ConfirmReceiptLineResult> => {
    const task = await client.warehouseTask.findFirst({
      where: { id: taskId, tenantId, type: "RECEIVING" },
      include: {
        steps: { include: { location: true, product: true } },
      },
    });

    if (!task) {
      throw new WmsError(
        "TASK_NOT_FOUND",
        `Receipt task ${taskId} not found`,
        404,
      );
    }

    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      throw new WmsError(
        "VALIDATION_ERROR",
        `Receipt task ${taskId} is already ${task.status}`,
        409,
      );
    }

    // Validar barcode si se proveyó (confirmar que el operario escanea el producto correcto)
    if (barcode !== undefined) {
      const product = await client.product.findFirst({
        where: { id: productId, tenantId },
      });
      if (!product) {
        throw new WmsError("PRODUCT_NOT_FOUND", "Product not found", 404);
      }
      const matchesCode =
        product.barcode === barcode || product.sku === barcode;
      if (!matchesCode) {
        throw new WmsError(
          "INVALID_SCAN",
          `Scanned barcode "${barcode}" does not match product barcode "${product.barcode ?? product.sku}"`,
          422,
        );
      }
    }

    // Buscar el step pendiente para el producto
    const step = task.steps.find(
      (s) => s.productId === productId && s.status === "PENDING",
    );
    if (!step) {
      const completedStep = task.steps.find(
        (s) => s.productId === productId && s.status === "COMPLETED",
      );
      if (completedStep) {
        throw new WmsError(
          "VALIDATION_ERROR",
          "Step for this product is already completed",
          409,
        );
      }
      throw new WmsError(
        "WRONG_STEP_SEQUENCE",
        "No pending step found for this product in this task",
        409,
      );
    }

    // Ejecutar el movimiento de stock: exterior (sin origen) → RECEIVING (Ledger + Balance)
    await moveStock({
      tenantId,
      productId,
      toLocationId: step.locationId,
      quantity: scannedQty,
      reason: "INBOUND_RECEIPT",
      referenceId: taskId,
      ...(userId ? { userId } : {}),
      notes: `Received ${scannedQty} units at ${step.location.code}`,
      ...(client !== prisma ? { tx: client as Prisma.TransactionClient } : {}),
    });

    // Actualizar el step
    const newScannedQty = Number(step.scannedQty) + scannedQty;
    const isComplete = newScannedQty >= Number(step.expectedQty);

    await client.taskStep.update({
      where: { id: step.id },
      data: {
        scannedQty: newScannedQty,
        status: isComplete ? "COMPLETED" : "PENDING",
        completedAt: isComplete ? new Date() : null,
      },
    });

    // Si todos los steps están completos, marcar la tarea como completada
    // y generar automáticamente la tarea de PUTAWAY hacia ubicaciones STORAGE
    const allComplete = task.steps.every((s) =>
      s.id === step.id ? isComplete : s.status === "COMPLETED",
    );

    let putawayTaskId: string | null = null;

    if (allComplete) {
      await client.warehouseTask.update({
        where: { id: taskId },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      putawayTaskId = await createPutawayTask({
        receivingTaskId: taskId,
        tenantId,
        ...(client !== prisma ? { tx: client as Prisma.TransactionClient } : {}),
      });
    }

    const result: ConfirmReceiptLineResult = {
      stepId: step.id,
      scannedQty: newScannedQty,
      expectedQty: Number(step.expectedQty),
      stepStatus: isComplete ? "COMPLETED" : "PENDING",
      taskStatus: allComplete ? "COMPLETED" : "IN_PROGRESS",
      putawayTaskId,
      remainingQty: Math.max(0, Number(step.expectedQty) - newScannedQty),
      idempotencyStatus: idempotencyKey ? "APPLIED" : undefined,
    };

    if (idempotencyKey) {
      await store.save(
        {
          tenantId,
          idempotencyKey,
          action: "CONFIRM_RECEIPT_LINE",
          responseBody: result,
          occurredAt,
        },
        client,
      );
    }

    return result;
  };

  const ambientStore = getAmbientTenantScope<Prisma.TransactionClient>();
  const reusableTx = params.tx ?? ambientStore?.scope;
  if (reusableTx) {
    return await executeConfirm(reusableTx);
  }

  if (idempotencyKey && typeof prisma.$transaction === "function") {
    try {
      return await prisma.$transaction(
        async (tx) => executeConfirm(tx),
        { isolationLevel: "Serializable" },
      );
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        const replay = await store.find<ConfirmReceiptLineResult>(
          tenantId,
          idempotencyKey,
        );
        if (replay) {
          return {
            ...replay.responseBody,
            idempotencyStatus: "ALREADY_APPLIED",
          };
        }
      }
      throw err;
    }
  }

  return await executeConfirm(prisma);
}
