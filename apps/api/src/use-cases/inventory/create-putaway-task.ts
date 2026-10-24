// apps/api/src/use-cases/inventory/create-putaway-task.ts
// Caso de uso: Generar automáticamente la tarea de PUTAWAY al completar una tarea RECEIVING.
// Cuando un operario termina de recibir mercancía en la zona de descarga (RECEIVING),
// este caso de uso asigna ubicaciones STORAGE activas del mismo almacén (ordenadas por code ASC)
// y crea la WarehouseTask de tipo PUTAWAY con sus TaskSteps listos para ejecución.

import { prisma, type Prisma } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";

export interface CreatePutawayTaskParams {
  receivingTaskId: string;
  tenantId: string;
}

interface PutawayStepPlan {
  productId: string;
  locationId: string;
  locationCode: string;
  quantity: number;
}

/**
 * Crea una WarehouseTask de tipo PUTAWAY a partir de una tarea RECEIVING completada.
 * Asigna ubicaciones STORAGE activas del mismo almacén ordenadas por `code ASC`
 * y genera los TaskSteps ordenados por secuencia de recorrido.
 */
export async function createPutawayTask(
  params: CreatePutawayTaskParams,
): Promise<string> {
  const { receivingTaskId, tenantId } = params;

  return await prisma.$transaction(
    async (tx) => {
      // ── 1. Cargar la tarea de recepción y validar pertenencia y estado ──
      const receivingTask = await tx.warehouseTask.findFirst({
        where: { id: receivingTaskId, tenantId },
        include: {
          steps: {
            include: { location: true },
            orderBy: { sequence: "asc" },
          },
        },
      });

      if (!receivingTask) {
        throw new WmsError(
          "TASK_NOT_FOUND",
          `Receiving task ${receivingTaskId} not found`,
          404,
        );
      }

      if (receivingTask.type !== "RECEIVING") {
        throw new WmsError(
          "VALIDATION_ERROR",
          `Task ${receivingTaskId} is not a RECEIVING task (type: ${receivingTask.type})`,
          422,
        );
      }

      if (receivingTask.status !== "COMPLETED") {
        throw new WmsError(
          "VALIDATION_ERROR",
          `Receiving task ${receivingTaskId} is not COMPLETED (status: ${receivingTask.status})`,
          409,
        );
      }

      // Filtrar pasos con cantidad efectivamente recibida (> 0)
      const receivedSteps = receivingTask.steps.filter(
        (step) => Number(step.scannedQty) > 0,
      );

      const firstStep = receivedSteps[0];
      if (!firstStep) {
        throw new WmsError(
          "VALIDATION_ERROR",
          `Receiving task ${receivingTaskId} has no received items with scannedQty > 0`,
          422,
        );
      }

      const warehouseId = firstStep.location.warehouseId;

      // ── 2. Buscar ubicaciones STORAGE activas del mismo almacén ─────────
      const storageLocations = await tx.location.findMany({
        where: {
          tenantId,
          warehouseId,
          type: "STORAGE",
          isActive: true,
        },
        orderBy: { code: "asc" },
      });

      if (storageLocations.length === 0) {
        throw new WmsError(
          "LOCATION_NOT_FOUND",
          `No active STORAGE locations found in warehouse ${warehouseId}`,
          409,
        );
      }

      // Asegurar orden determinista por location.code ASC
      const sortedStorageLocations = [...storageLocations].sort((a, b) =>
        a.code.localeCompare(b.code),
      );

      // ── 3. Planificar pasos de PUTAWAY y ordenar por location.code ASC ──
      const putawayPlan: PutawayStepPlan[] = receivedSteps.map(
        (step, index) => {
          const targetLocation =
            sortedStorageLocations[index % sortedStorageLocations.length]!;
          return {
            productId: step.productId,
            locationId: targetLocation.id,
            locationCode: targetLocation.code,
            quantity: Number(step.scannedQty),
          };
        },
      );

      const sortedPlan = putawayPlan.sort((a, b) =>
        a.locationCode.localeCompare(b.locationCode),
      );

      // ── 4. Crear la WarehouseTask de tipo PUTAWAY con sus TaskSteps ─────
      const putawayTask = await tx.warehouseTask.create({
        data: {
          tenantId,
          orderId: null,
          receiptRef: receivingTask.receiptRef,
          type: "PUTAWAY",
          status: "PENDING",
          assignedTo: null,
          steps: {
            create: sortedPlan.map((step, index) => ({
              sequence: index + 1,
              locationId: step.locationId,
              productId: step.productId,
              expectedQty: step.quantity,
              scannedQty: 0,
              status: "PENDING",
            })),
          },
        },
      });

      return putawayTask.id;
    },
    {
      timeout: 15_000,
      isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel,
    },
  );
}
