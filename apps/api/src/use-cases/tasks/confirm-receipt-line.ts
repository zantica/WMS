// apps/api/src/use-cases/tasks/confirm-receipt-line.ts
// Caso de uso: Confirmar el escaneo de una línea de recepción (RECEIVING).
// Registra la entrada física de stock hacia la ubicación RECEIVING mediante moveStock,
// actualiza el progreso del TaskStep y, al completarse todos los pasos de la tarea,
// marca la tarea RECEIVING como COMPLETED y dispara automáticamente createPutawayTask.

import { prisma } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";
import { moveStock } from "../inventory/move-stock.js";
import { createPutawayTask } from "../inventory/create-putaway-task.js";

export interface ConfirmReceiptLineParams {
  taskId: string;
  tenantId: string;
  productId: string;
  scannedQty: number;
  barcode?: string | undefined;
  userId?: string | undefined;
}

export interface ConfirmReceiptLineResult {
  stepId: string;
  scannedQty: number;
  expectedQty: number;
  stepStatus: "COMPLETED" | "PENDING";
  taskStatus: "COMPLETED" | "IN_PROGRESS";
  putawayTaskId: string | null;
  remainingQty: number;
}

/**
 * Confirma la recepción parcial o total de un producto en muelle (RECEIVING).
 */
export async function confirmReceiptLine(
  params: ConfirmReceiptLineParams,
): Promise<ConfirmReceiptLineResult> {
  const { taskId, tenantId, productId, scannedQty, barcode, userId } = params;

  if (scannedQty <= 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "Scanned quantity must be positive",
      422,
    );
  }

  const task = await prisma.warehouseTask.findFirst({
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
    const product = await prisma.product.findFirst({
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
  });

  // Actualizar el step
  const newScannedQty = Number(step.scannedQty) + scannedQty;
  const isComplete = newScannedQty >= Number(step.expectedQty);

  await prisma.taskStep.update({
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
    await prisma.warehouseTask.update({
      where: { id: taskId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    putawayTaskId = await createPutawayTask({
      receivingTaskId: taskId,
      tenantId,
    });
  }

  return {
    stepId: step.id,
    scannedQty: newScannedQty,
    expectedQty: Number(step.expectedQty),
    stepStatus: isComplete ? "COMPLETED" : "PENDING",
    taskStatus: allComplete ? "COMPLETED" : "IN_PROGRESS",
    putawayTaskId,
    remainingQty: Math.max(0, Number(step.expectedQty) - newScannedQty),
  };
}
