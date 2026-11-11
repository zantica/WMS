// apps/api/src/use-cases/inventory/cancel-order.ts
// Caso de uso: Cancelar un pedido de venta y liberar atómicamente sus reservas activas.
// Orquesta planOrderCancellation, WarehouseTask.cancel() e InventoryBalance.releaseUpTo()
// dentro de un UnitOfWork Serializable con SELECT ... FOR UPDATE.

import {
  planOrderCancellation,
  TaskStep,
  WarehouseTask,
  type OrderCancellationPlan,
} from "@wms/domain";
import { WmsError } from "../../plugins/error-handler.js";
import type { UnitOfWork } from "../../ports/unit-of-work.js";
import { PrismaUnitOfWork } from "../../adapters/prisma-unit-of-work.js";
import { rethrowDomainErrorAsWmsError } from "../../shared/domain-error-mapper.js";

export interface CancelOrderParams {
  orderId: string;
  tenantId: string;
  userId?: string | undefined;
  reason?: string | undefined;
  unitOfWork?: UnitOfWork | undefined;
  tx?: unknown;
}

export interface ReleasedAllocation {
  productId: string;
  locationId: string;
  quantity: number;
}

export interface CancelOrderResult {
  orderId: string;
  status: "CANCELLED";
  cancelledTaskIds: string[];
  releasedAllocations: ReleasedAllocation[];
}

/**
 * Cancela un pedido de venta, libera el stock reservado pendiente de picking (ALLOCATION_CANCEL)
 * y cancela las tareas operativas de picking asociadas en un único UnitOfWork Serializable.
 */
export async function cancelOrder(
  params: CancelOrderParams,
): Promise<CancelOrderResult> {
  const { orderId, tenantId, userId, reason } = params;
  const uow = params.unitOfWork ?? new PrismaUnitOfWork(undefined, params.tx);

  try {
    return await uow.execute(
      tenantId,
      async (repos) => {
        // ── 1. Cargar pedido filtrando por tenantId ────────────────────────
        const order = await repos.orders.findById(tenantId, orderId);

        if (!order || order.tenantId !== tenantId) {
          throw new WmsError(
            "ORDER_NOT_FOUND",
            `Order ${orderId} not found`,
            404,
          );
        }

        let plan: OrderCancellationPlan;
        try {
          plan = planOrderCancellation(order.status);
        } catch {
          throw new WmsError(
            "VALIDATION_ERROR",
            `Cannot cancel order ${orderId} in status ${order.status}`,
            409,
            { orderId, currentStatus: order.status },
          );
        }

        const cancelledTaskIds: string[] = [];
        const releasedAllocations: ReleasedAllocation[] = [];

        // ── 2. Liberar reservas pendientes de las tareas PICKING activas ───
        const activeTasks = await repos.orders.findActivePickingTasks(
          tenantId,
          order.id,
        );

        for (const taskData of activeTasks) {
          const domainSteps = taskData.steps.map(
            (s) =>
              new TaskStep({
                id: s.id,
                expectedQty: s.expectedQty,
                scannedQty: s.scannedQty,
                status: s.status,
              }),
          );
          const taskAgg = new WarehouseTask({
            id: taskData.id,
            tenantId,
            status: taskData.status,
            steps: domainSteps,
          });

          if (plan.releasesStock) {
            for (const stepData of taskData.steps) {
              if (stepData.status !== "PENDING") {
                continue;
              }

              const domainStep = domainSteps.find((ds) => ds.id === stepData.id);
              const remainingToRelease = domainStep
                ? domainStep.remainingQty
                : Math.max(0, stepData.expectedQty - stepData.scannedQty);

              if (remainingToRelease > 0) {
                const balance = await repos.inventory.findBalanceForUpdate(
                  tenantId,
                  stepData.locationId,
                  stepData.productId,
                );

                if (balance) {
                  const released = balance.releaseUpTo(remainingToRelease);

                  if (released > 0) {
                    await repos.inventory.saveBalance(balance);

                    await repos.inventory.recordTransaction({
                      tenantId,
                      productId: stepData.productId,
                      fromLocationId: stepData.locationId,
                      quantity: released,
                      reason: "ALLOCATION_CANCEL",
                      referenceId: order.id,
                      userId: userId ?? null,
                      notes: reason
                        ? `Order cancelled (${order.externalRef ?? order.id}): ${reason}`
                        : `Allocation cancelled for order ${order.externalRef ?? order.id}`,
                    });

                    releasedAllocations.push({
                      productId: stepData.productId,
                      locationId: stepData.locationId,
                      quantity: released,
                    });
                  }
                }
              }
            }
          }

          taskAgg.cancel();
          await repos.tasks.save(taskAgg, { completedAt: new Date() });
          cancelledTaskIds.push(taskAgg.id);
        }

        // ── 3. Actualizar estado del pedido a CANCELLED ────────────────────
        const updatedNotes = reason
          ? order.notes
            ? `${order.notes} | Cancelled: ${reason}`
            : `Cancelled: ${reason}`
          : (order.notes ?? null);

        await repos.orders.updateStatus(
          tenantId,
          order.id,
          plan.nextStatus,
          updatedNotes,
        );

        return {
          orderId: order.id,
          status: plan.nextStatus,
          cancelledTaskIds,
          releasedAllocations,
        };
      },
      { isolationLevel: "Serializable", timeoutMs: 15_000 },
    );
  } catch (err) {
    rethrowDomainErrorAsWmsError(err);
  }
}
