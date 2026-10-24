// apps/api/src/use-cases/tasks/confirm-task-step.ts
// Caso de uso: Confirmar un paso de tarea operativa (PUTAWAY o PICKING) o reportar excepción.
// Verifica pertenencia multi-tenant, estado del paso, código escaneado (barcode/SKU/locationCode),
// ejecuta el movimiento de stock en el Ledger (PUTAWAY: RECEIVING -> STORAGE, PICKING: STORAGE -> PACKING),
// actualiza reservas/líneas de pedido y cierra la tarea cuando todos los pasos finalizan.

import { prisma } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";
import { moveStock } from "../inventory/move-stock.js";

export interface ConfirmTaskStepParams {
  taskId: string;
  stepId: string;
  tenantId: string;
  scannedCode: string;
  quantity?: number | undefined;
  reportException?: boolean | undefined;
  exceptionNote?: string | undefined;
  userId?: string | undefined;
}

export interface ConfirmTaskStepResult {
  stepId: string;
  scannedQty: number;
  expectedQty: number;
  remainingQty: number;
  stepStatus: "COMPLETED" | "PENDING" | "EXCEPTION";
  taskStatus: "IN_PROGRESS" | "COMPLETED" | "EXCEPTION";
  taskComplete: boolean;
  note?: string;
}

/**
 * Confirma el escaneo de un paso en una tarea de almacén (PUTAWAY / PICKING)
 * o registra una excepción reportada por el operario.
 */
export async function confirmTaskStep(
  params: ConfirmTaskStepParams,
): Promise<ConfirmTaskStepResult> {
  const {
    taskId,
    stepId,
    tenantId,
    scannedCode,
    quantity,
    reportException,
    exceptionNote,
    userId,
  } = params;

  const task = await prisma.warehouseTask.findFirst({
    where: { id: taskId, tenantId },
    include: {
      steps: {
        where: { id: stepId },
        include: {
          location: true,
          product: true,
        },
      },
    },
  });

  if (!task) {
    throw new WmsError("TASK_NOT_FOUND", `Task ${taskId} not found`, 404);
  }

  const step = task.steps[0];
  if (!step) {
    throw new WmsError("TASK_NOT_FOUND", `Step ${stepId} not found`, 404);
  }

  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    throw new WmsError(
      "VALIDATION_ERROR",
      `Task ${taskId} is already ${task.status}`,
      409,
    );
  }

  if (step.status === "COMPLETED") {
    throw new WmsError(
      "VALIDATION_ERROR",
      `Step ${stepId} is already completed`,
      409,
    );
  }

  // ── 1. Excepción reportada por el operario ──────────────────────────────
  if (reportException || exceptionNote) {
    const note = exceptionNote ?? "Operator reported exception";

    await prisma.taskStep.update({
      where: { id: step.id },
      data: {
        status: "EXCEPTION",
        exceptionNote: note,
      },
    });

    await prisma.warehouseTask.update({
      where: { id: task.id },
      data: {
        status: "EXCEPTION",
      },
    });

    return {
      stepId: step.id,
      scannedQty: Number(step.scannedQty),
      expectedQty: Number(step.expectedQty),
      remainingQty: Math.max(
        0,
        Number(step.expectedQty) - Number(step.scannedQty),
      ),
      stepStatus: "EXCEPTION",
      taskStatus: "EXCEPTION",
      taskComplete: false,
      note,
    };
  }

  // ── 2. Validar cantidad y código escaneado ──────────────────────────────
  const qtyToScan = quantity ?? 1;
  if (qtyToScan <= 0) {
    throw new WmsError("VALIDATION_ERROR", "Quantity must be positive", 422);
  }

  const codeMatch =
    scannedCode === step.product.barcode ||
    scannedCode === step.product.sku ||
    scannedCode === step.location.code;

  if (!codeMatch) {
    throw new WmsError(
      "INVALID_SCAN",
      `Scanned code "${scannedCode}" does not match expected product ${step.product.sku}`,
      422,
      {
        expected: step.product.barcode ?? step.product.sku,
        expectedLocation: step.location.code,
        scanned: scannedCode,
      },
    );
  }

  // ── 3. Ejecutar movimiento de stock según el tipo de tarea ──────────────
  if (task.type === "PICKING") {
    if (!task.orderId) {
      throw new WmsError(
        "ORDER_NOT_FOUND",
        "Picking task has no associated order",
        404,
      );
    }

    const order = await prisma.salesOrder.findFirst({
      where: { id: task.orderId, tenantId },
      select: { id: true, warehouseId: true },
    });

    if (!order) {
      throw new WmsError(
        "ORDER_NOT_FOUND",
        `Order ${task.orderId} not found`,
        404,
      );
    }

    const packingLocation = await prisma.location.findFirst({
      where: {
        tenantId,
        warehouseId: order.warehouseId,
        type: "PACKING",
        isActive: true,
      },
    });

    if (!packingLocation) {
      throw new WmsError(
        "LOCATION_NOT_FOUND",
        "No PACKING location configured for this warehouse",
        409,
      );
    }

    await moveStock({
      tenantId,
      productId: step.productId,
      fromLocationId: step.locationId,
      toLocationId: packingLocation.id,
      quantity: qtyToScan,
      reason: "PICK",
      referenceId: task.orderId,
      ...(userId ? { userId } : {}),
    });

    // Liberar la cantidad reservada (allocatedQty) en la ubicación STORAGE de origen
    await prisma.inventoryBalance.updateMany({
      where: {
        tenantId,
        locationId: step.locationId,
        productId: step.productId,
      },
      data: {
        allocatedQty: { decrement: qtyToScan },
      },
    });

    // Incrementar la cantidad recogida (pickedQty) en la línea del pedido
    await prisma.orderLine.updateMany({
      where: {
        orderId: task.orderId,
        productId: step.productId,
        order: { tenantId },
      },
      data: {
        pickedQty: { increment: qtyToScan },
      },
    });
  } else if (task.type === "PUTAWAY") {
    const receivingLocation = await prisma.location.findFirst({
      where: {
        tenantId,
        warehouseId: step.location.warehouseId,
        type: "RECEIVING",
        isActive: true,
      },
    });

    if (!receivingLocation) {
      throw new WmsError(
        "LOCATION_NOT_FOUND",
        "No RECEIVING location configured for this warehouse",
        409,
      );
    }

    await moveStock({
      tenantId,
      productId: step.productId,
      fromLocationId: receivingLocation.id,
      toLocationId: step.locationId,
      quantity: qtyToScan,
      reason: "PUTAWAY",
      referenceId: task.id,
      ...(userId ? { userId } : {}),
    });
  }

  // ── 4. Actualizar progreso del paso ─────────────────────────────────────
  const newScannedQty = Number(step.scannedQty) + qtyToScan;
  const isStepComplete = newScannedQty >= Number(step.expectedQty);

  await prisma.taskStep.update({
    where: { id: step.id },
    data: {
      scannedQty: newScannedQty,
      status: isStepComplete ? "COMPLETED" : "PENDING",
      completedAt: isStepComplete ? new Date() : null,
    },
  });

  // ── 5. Verificar si todos los pasos de la tarea han finalizado ──────────
  const allSteps = await prisma.taskStep.findMany({
    where: { taskId: task.id, task: { tenantId } },
  });
  const allDone = allSteps.every((s) =>
    s.id === step.id
      ? isStepComplete
      : s.status === "COMPLETED" || s.status === "EXCEPTION",
  );

  if (allDone) {
    await prisma.warehouseTask.update({
      where: { id: task.id },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    if (task.type === "PICKING" && task.orderId) {
      await prisma.salesOrder.update({
        where: { id: task.orderId },
        data: { status: "PACKED" },
      });
    }
  }

  return {
    stepId: step.id,
    scannedQty: newScannedQty,
    expectedQty: Number(step.expectedQty),
    remainingQty: Math.max(0, Number(step.expectedQty) - newScannedQty),
    stepStatus: isStepComplete ? "COMPLETED" : "PENDING",
    taskStatus: allDone ? "COMPLETED" : "IN_PROGRESS",
    taskComplete: allDone,
  };
}
