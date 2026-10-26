// apps/api/src/use-cases/inventory/handle-picking-exception.ts
// Caso de uso: Gestionar excepciones operativas durante el Picking (rotura de stock,
// producto dañado o ubicación vacía) y re-asignar stock automáticamente.
//
// Garantías e invariantes de dominio:
// 1. Transacción SQL Serializable con bloqueo pesimista (SELECT ... FOR UPDATE) sobre inventory_balances
// 2. Aislamiento estricto por tenantId en todas las consultas SQL y Prisma
// 3. Liberación de la reserva no recogida en la ubicación original con asiento ALLOCATION_CANCEL
// 4. Búsqueda de ubicaciones STORAGE alternativas (ATP > 0) ordenadas por location.code ASC
// 5. Si hay ATP suficiente: reserva en ubicación(es) alternativa(s) con asiento ALLOCATION y crea nuevo(s) TaskStep
// 6. Si NO hay ATP suficiente: libera reservas pendientes del resto de pasos, marca tarea EXCEPTION y pedido ON_HOLD

import { prisma, type Prisma } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";

export interface HandlePickingExceptionParams {
  taskId: string;
  stepId: string;
  tenantId: string;
  exceptionNote?: string | undefined;
  userId?: string | undefined;
}

export interface ReplacementStepInfo {
  id: string;
  sequence: number;
  locationId: string;
  locationCode: string;
  expectedQty: number;
}

export interface HandlePickingExceptionResult {
  stepId: string;
  taskId: string;
  orderId: string;
  stepStatus: "EXCEPTION";
  taskStatus: "IN_PROGRESS" | "EXCEPTION";
  orderStatus: string;
  reallocated: boolean;
  releasedOriginalQty: number;
  replacementSteps: ReplacementStepInfo[];
  note: string;
}

/**
 * Gestiona una excepción reportada por un operario en un paso de una tarea PICKING:
 * libera la reserva de la ubicación original e intenta re-asignar la cantidad faltante
 * desde ubicaciones STORAGE alternativas. Si no hay stock disponible suficiente,
 * libera las reservas restantes de la tarea y coloca el pedido en estado ON_HOLD.
 */
export async function handlePickingException(
  params: HandlePickingExceptionParams,
): Promise<HandlePickingExceptionResult> {
  const { taskId, stepId, tenantId, exceptionNote, userId } = params;
  const note = exceptionNote ?? "Operator reported exception";

  return await prisma.$transaction(
    async (tx) => {
      // ── 1. Cargar tarea, pedido y todos los pasos filtrando por tenantId ──
      const task = await tx.warehouseTask.findFirst({
        where: { id: taskId, tenantId },
        include: {
          order: true,
          steps: {
            orderBy: { sequence: "asc" },
            include: {
              location: true,
              product: true,
            },
          },
        },
      });

      if (!task || task.tenantId !== tenantId) {
        throw new WmsError("TASK_NOT_FOUND", `Task ${taskId} not found`, 404);
      }

      if (task.type !== "PICKING") {
        throw new WmsError(
          "VALIDATION_ERROR",
          `Task ${taskId} is not a PICKING task`,
          422,
        );
      }

      if (task.status === "COMPLETED" || task.status === "CANCELLED") {
        throw new WmsError(
          "VALIDATION_ERROR",
          `Task ${taskId} is already ${task.status}`,
          409,
        );
      }

      if (!task.orderId || !task.order || task.order.tenantId !== tenantId) {
        throw new WmsError(
          "ORDER_NOT_FOUND",
          `Order for picking task ${taskId} not found`,
          404,
        );
      }

      const step = task.steps.find((s) => s.id === stepId);
      if (!step) {
        throw new WmsError("TASK_NOT_FOUND", `Step ${stepId} not found`, 404);
      }

      if (
        step.status === "COMPLETED" ||
        step.status === "EXCEPTION" ||
        step.status === "SKIPPED"
      ) {
        throw new WmsError(
          "VALIDATION_ERROR",
          `Step ${stepId} is already ${step.status}`,
          409,
        );
      }

      const missingQty = Math.max(
        0,
        Number(step.expectedQty) - Number(step.scannedQty),
      );

      // ── 2. Marcar el paso actual como EXCEPTION ───────────────────────────
      await tx.taskStep.update({
        where: { id: step.id },
        data: {
          status: "EXCEPTION",
          exceptionNote: note,
        },
      });

      // ── 3. Liberar reserva no recogida en la ubicación original ───────────
      let releasedOriginalQty = 0;

      if (missingQty > 0) {
        const lockedOrigBalances = await tx.$queryRaw<
          Array<{
            id: string;
            on_hand_qty: number;
            allocated_qty: number;
          }>
        >`
          SELECT id, "onHandQty" as on_hand_qty, "allocatedQty" as allocated_qty
          FROM inventory_balances
          WHERE "tenantId" = ${tenantId}
            AND "locationId" = ${step.locationId}
            AND "productId" = ${step.productId}
          FOR UPDATE
        `;

        const origBalance = lockedOrigBalances[0];
        if (origBalance) {
          const currentAllocated = Math.max(
            0,
            Number(origBalance.allocated_qty),
          );
          const toRelease = Math.min(currentAllocated, missingQty);

          if (toRelease > 0) {
            await tx.inventoryBalance.update({
              where: { id: origBalance.id },
              data: {
                allocatedQty: { decrement: toRelease },
              },
            });

            await tx.inventoryTransaction.create({
              data: {
                tenantId,
                productId: step.productId,
                fromLocationId: step.locationId,
                quantity: toRelease,
                reason: "ALLOCATION_CANCEL",
                referenceId: task.order.id,
                userId: userId ?? null,
                notes: `Picking exception at ${step.location.code}: ${note}`,
              },
            });

            releasedOriginalQty = toRelease;
          }
        }
      }

      // ── 4. Buscar ubicaciones STORAGE alternativas con ATP > 0 ────────────
      const candidateBalances =
        missingQty > 0
          ? await tx.$queryRaw<
              Array<{
                id: string;
                location_id: string;
                location_code: string;
                on_hand_qty: number;
                allocated_qty: number;
              }>
            >`
              SELECT ib.id, ib."locationId" as location_id, l.code as location_code,
                     ib."onHandQty" as on_hand_qty, ib."allocatedQty" as allocated_qty
              FROM inventory_balances ib
              JOIN locations l ON l.id = ib."locationId"
              WHERE ib."productId" = ${step.productId}
                AND ib."tenantId" = ${tenantId}
                AND l."tenantId" = ${tenantId}
                AND l."warehouseId" = ${task.order.warehouseId}
                AND l.type = 'STORAGE'
                AND l."isActive" = true
                AND l.id <> ${step.locationId}
                AND (ib."onHandQty" - ib."allocatedQty") > 0
              ORDER BY l.code ASC
              FOR UPDATE OF ib
            `
          : [];

      const totalAlternativeAtp = candidateBalances.reduce((acc, b) => {
        const atp = Math.max(
          0,
          Number(b.on_hand_qty) - Number(b.allocated_qty),
        );
        return acc + atp;
      }, 0);

      // ── 5A. Stock alternativo suficiente → Re-alocar y crear pasos ────────
      if (totalAlternativeAtp >= missingQty) {
        let remaining = missingQty;
        let nextSequence =
          task.steps.reduce((max, s) => Math.max(max, s.sequence), 0) + 1;
        const replacementSteps: ReplacementStepInfo[] = [];

        for (const balance of candidateBalances) {
          if (remaining <= 0) break;

          const atp = Math.max(
            0,
            Number(balance.on_hand_qty) - Number(balance.allocated_qty),
          );
          if (atp <= 0) continue;

          const toAllocate = Math.min(atp, remaining);

          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { allocatedQty: { increment: toAllocate } },
          });

          await tx.inventoryTransaction.create({
            data: {
              tenantId,
              productId: step.productId,
              fromLocationId: balance.location_id,
              quantity: toAllocate,
              reason: "ALLOCATION",
              referenceId: task.order.id,
              userId: userId ?? null,
              notes: `Re-allocated after picking exception at ${step.location.code} for order ${task.order.externalRef ?? task.order.id}`,
            },
          });

          const createdStep = await tx.taskStep.create({
            data: {
              taskId: task.id,
              sequence: nextSequence,
              locationId: balance.location_id,
              productId: step.productId,
              expectedQty: toAllocate,
              scannedQty: 0,
              status: "PENDING",
            },
          });

          replacementSteps.push({
            id: createdStep.id,
            sequence: nextSequence,
            locationId: balance.location_id,
            locationCode: balance.location_code,
            expectedQty: toAllocate,
          });

          nextSequence += 1;
          remaining -= toAllocate;
        }

        await tx.warehouseTask.update({
          where: { id: task.id },
          data: { status: "IN_PROGRESS" },
        });

        return {
          stepId: step.id,
          taskId: task.id,
          orderId: task.order.id,
          stepStatus: "EXCEPTION",
          taskStatus: "IN_PROGRESS",
          orderStatus: task.order.status,
          reallocated: true,
          releasedOriginalQty,
          replacementSteps,
          note,
        };
      }

      // ── 5B. Stock alternativo insuficiente → Liberar otros pasos y ON_HOLD ─
      for (const otherStep of task.steps) {
        if (otherStep.id === step.id || otherStep.status !== "PENDING") {
          continue;
        }

        const otherMissingQty = Math.max(
          0,
          Number(otherStep.expectedQty) - Number(otherStep.scannedQty),
        );

        if (otherMissingQty > 0) {
          const lockedOtherBalances = await tx.$queryRaw<
            Array<{
              id: string;
              on_hand_qty: number;
              allocated_qty: number;
            }>
          >`
            SELECT id, "onHandQty" as on_hand_qty, "allocatedQty" as allocated_qty
            FROM inventory_balances
            WHERE "tenantId" = ${tenantId}
              AND "locationId" = ${otherStep.locationId}
              AND "productId" = ${otherStep.productId}
            FOR UPDATE
          `;

          const otherBalance = lockedOtherBalances[0];
          if (otherBalance) {
            const currentAllocated = Math.max(
              0,
              Number(otherBalance.allocated_qty),
            );
            const toReleaseOther = Math.min(currentAllocated, otherMissingQty);

            if (toReleaseOther > 0) {
              await tx.inventoryBalance.update({
                where: { id: otherBalance.id },
                data: {
                  allocatedQty: { decrement: toReleaseOther },
                },
              });

              await tx.inventoryTransaction.create({
                data: {
                  tenantId,
                  productId: otherStep.productId,
                  fromLocationId: otherStep.locationId,
                  quantity: toReleaseOther,
                  reason: "ALLOCATION_CANCEL",
                  referenceId: task.order.id,
                  userId: userId ?? null,
                  notes: `Released due to unresolvable picking exception on task ${task.id}`,
                },
              });
            }
          }
        }

        await tx.taskStep.update({
          where: { id: otherStep.id },
          data: { status: "SKIPPED" },
        });
      }

      await tx.warehouseTask.update({
        where: { id: task.id },
        data: { status: "EXCEPTION" },
      });

      await tx.salesOrder.update({
        where: { id: task.order.id },
        data: { status: "ON_HOLD" },
      });

      return {
        stepId: step.id,
        taskId: task.id,
        orderId: task.order.id,
        stepStatus: "EXCEPTION",
        taskStatus: "EXCEPTION",
        orderStatus: "ON_HOLD",
        reallocated: false,
        releasedOriginalQty,
        replacementSteps: [],
        note,
      };
    },
    {
      timeout: 15_000,
      isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel,
    },
  );
}
