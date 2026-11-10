// apps/api/src/use-cases/tasks/confirm-task-step.ts
// Caso de uso: Confirmar un paso de tarea operativa (PUTAWAY o PICKING) o reportar excepción.
// Verifica pertenencia multi-tenant, estado del paso, código escaneado (barcode/SKU/locationCode),
// ejecuta el movimiento de stock en el Ledger (PUTAWAY: RECEIVING -> STORAGE, PICKING: STORAGE -> PACKING),
// actualiza reservas/líneas de pedido y cierra la tarea cuando todos los pasos finalizan.
//
// Hito 6 (F6.1): Soporta idempotencia transaccional mediante el puerto IdempotencyStore.
// Reintentos con la misma idempotencyKey devuelven ALREADY_APPLIED con el resultado original
// sin duplicar InventoryTransaction ni alterar InventoryBalance.

import { prisma, type Prisma } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";
import {
  handlePickingException,
  type ReplacementStepInfo,
} from "../inventory/handle-picking-exception.js";
import { moveStock } from "../inventory/move-stock.js";
import type { IdempotencyStore } from "../../ports/idempotency-store.js";
import { PrismaIdempotencyStore } from "../../adapters/prisma-idempotency-store.js";
import { getAmbientTenantScope } from "../security/tenant-context.js";

export interface ConfirmTaskStepParams {
  taskId: string;
  stepId: string;
  tenantId: string;
  scannedCode: string;
  quantity?: number | undefined;
  reportException?: boolean | undefined;
  exceptionNote?: string | undefined;
  userId?: string | undefined;
  idempotencyKey?: string | undefined;
  occurredAt?: Date | string | undefined;
  idempotencyStore?: IdempotencyStore | undefined;
  tx?: Prisma.TransactionClient | undefined;
}

export interface ConfirmTaskStepResult {
  stepId: string;
  scannedQty: number;
  expectedQty: number;
  remainingQty: number;
  stepStatus: "COMPLETED" | "PENDING" | "EXCEPTION";
  taskStatus: "IN_PROGRESS" | "COMPLETED" | "EXCEPTION";
  taskComplete: boolean;
  note?: string | undefined;
  reallocated?: boolean | undefined;
  orderStatus?: string | undefined;
  replacementSteps?: ReplacementStepInfo[] | undefined;
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
    idempotencyKey,
    occurredAt,
  } = params;

  const store = params.idempotencyStore ?? new PrismaIdempotencyStore();

  // ── 0. Comprobación de idempotencia previa ─────────────────────────────
  if (idempotencyKey) {
    const existing = await store.find<ConfirmTaskStepResult>(
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

  const executeStep = async (client: ClientOrTx): Promise<ConfirmTaskStepResult> => {
    const task = await client.warehouseTask.findFirst({
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

    // ── 1. Excepción reportada por el operario ───────────────────────────
    if (reportException || exceptionNote) {
      const note = exceptionNote ?? "Operator reported exception";

      if (task.type === "PICKING") {
        const exceptionResult = await handlePickingException({
          taskId: task.id,
          stepId: step.id,
          tenantId,
          exceptionNote: note,
          ...(userId ? { userId } : {}),
          ...(client !== prisma ? { tx: client as Prisma.TransactionClient } : {}),
        });

        const exResult: ConfirmTaskStepResult = {
          stepId: step.id,
          scannedQty: Number(step.scannedQty),
          expectedQty: Number(step.expectedQty),
          remainingQty: Math.max(
            0,
            Number(step.expectedQty) - Number(step.scannedQty),
          ),
          stepStatus: "EXCEPTION",
          taskStatus: exceptionResult.taskStatus,
          taskComplete: false,
          note: exceptionResult.note,
          reallocated: exceptionResult.reallocated,
          orderStatus: exceptionResult.orderStatus,
          replacementSteps: exceptionResult.replacementSteps,
          idempotencyStatus: idempotencyKey ? "APPLIED" : undefined,
        };

        if (idempotencyKey) {
          await store.save(
            {
              tenantId,
              idempotencyKey,
              action: "CONFIRM_TASK_STEP",
              responseBody: exResult,
              occurredAt,
            },
            client,
          );
        }

        return exResult;
      }

      await client.taskStep.update({
        where: { id: step.id },
        data: {
          status: "EXCEPTION",
          exceptionNote: note,
        },
      });

      await client.warehouseTask.update({
        where: { id: task.id },
        data: {
          status: "EXCEPTION",
        },
      });

      const genericExResult: ConfirmTaskStepResult = {
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
        idempotencyStatus: idempotencyKey ? "APPLIED" : undefined,
      };

      if (idempotencyKey) {
        await store.save(
          {
            tenantId,
            idempotencyKey,
            action: "CONFIRM_TASK_STEP",
            responseBody: genericExResult,
            occurredAt,
          },
          client,
        );
      }

      return genericExResult;
    }

    // ── 2. Validar cantidad y código escaneado ───────────────────────────
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

    // ── 3. Ejecutar movimiento de stock según el tipo de tarea ───────────
    if (task.type === "PICKING") {
      if (!task.orderId) {
        throw new WmsError(
          "ORDER_NOT_FOUND",
          "Picking task has no associated order",
          404,
        );
      }

      const order = await client.salesOrder.findFirst({
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

      const packingLocation = await client.location.findFirst({
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
        ...(client !== prisma ? { tx: client as Prisma.TransactionClient } : {}),
      });

      // Liberar la cantidad reservada (allocatedQty) en la ubicación STORAGE de origen
      await client.inventoryBalance.updateMany({
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
      await client.orderLine.updateMany({
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
      const receivingLocation = await client.location.findFirst({
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
        ...(client !== prisma ? { tx: client as Prisma.TransactionClient } : {}),
      });
    }

    // ── 4. Actualizar progreso del paso ──────────────────────────────────
    const newScannedQty = Number(step.scannedQty) + qtyToScan;
    const isStepComplete = newScannedQty >= Number(step.expectedQty);

    await client.taskStep.update({
      where: { id: step.id },
      data: {
        scannedQty: newScannedQty,
        status: isStepComplete ? "COMPLETED" : "PENDING",
        completedAt: isStepComplete ? new Date() : null,
      },
    });

    // ── 5. Verificar si todos los pasos de la tarea han finalizado ───────
    const allSteps = await client.taskStep.findMany({
      where: { taskId: task.id, task: { tenantId } },
    });
    const allDone = allSteps.every((s) =>
      s.id === step.id
        ? isStepComplete
        : s.status === "COMPLETED" || s.status === "EXCEPTION",
    );

    if (allDone) {
      await client.warehouseTask.update({
        where: { id: task.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      if (task.type === "PICKING" && task.orderId) {
        await client.salesOrder.update({
          where: { id: task.orderId },
          data: { status: "PACKED" },
        });
      }
    }

    const result: ConfirmTaskStepResult = {
      stepId: step.id,
      scannedQty: newScannedQty,
      expectedQty: Number(step.expectedQty),
      remainingQty: Math.max(0, Number(step.expectedQty) - newScannedQty),
      stepStatus: isStepComplete ? "COMPLETED" : "PENDING",
      taskStatus: allDone ? "COMPLETED" : "IN_PROGRESS",
      taskComplete: allDone,
      idempotencyStatus: idempotencyKey ? "APPLIED" : undefined,
    };

    if (idempotencyKey) {
      await store.save(
        {
          tenantId,
          idempotencyKey,
          action: "CONFIRM_TASK_STEP",
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
    return await executeStep(reusableTx);
  }

  // Si se provee idempotencyKey pero no hay transacción exterior,
  // ejecutamos dentro de una transacción interactiva Serializable para garantizar
  // que el movimiento de stock y el registro de idempotencia queden atómicamente vinculados.
  if (idempotencyKey && typeof prisma.$transaction === "function") {
    try {
      return await prisma.$transaction(
        async (tx) => executeStep(tx),
        { isolationLevel: "Serializable" },
      );
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        const replay = await store.find<ConfirmTaskStepResult>(
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

  return await executeStep(prisma);
}
