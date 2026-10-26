// apps/api/src/use-cases/inventory/cancel-order.ts
// Caso de uso: Cancelar un pedido de venta y liberar atómicamente sus reservas activas.
//
// Garantías e invariantes de dominio:
// 1. Transacción SQL Serializable con bloqueo pesimista (SELECT ... FOR UPDATE) sobre inventory_balances
// 2. Aislamiento estricto por tenantId en todas las consultas
// 3. Liberación de reservas no recogidas (expectedQty - scannedQty) sin permitir allocatedQty < 0
// 4. Registro inmutable append-only en InventoryTransaction con reason: "ALLOCATION_CANCEL"
// 5. Cancelación de WarehouseTask de tipo PICKING activas y marcado de pasos pendientes como SKIPPED

import { prisma, type Prisma } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";

export interface CancelOrderParams {
  orderId: string;
  tenantId: string;
  userId?: string | undefined;
  reason?: string | undefined;
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

const CANCELLABLE_ORDER_STATUSES = new Set([
  "PENDING",
  "ON_HOLD",
  "ALLOCATED",
  "PICKING",
]);

/**
 * Cancela un pedido de venta, libera el stock reservado pendiente de picking (ALLOCATION_CANCEL)
 * y cancela las tareas operativas de picking asociadas en una única transacción Serializable.
 */
export async function cancelOrder(
  params: CancelOrderParams,
): Promise<CancelOrderResult> {
  const { orderId, tenantId, userId, reason } = params;

  return await prisma.$transaction(
    async (tx) => {
      // ── 1. Cargar pedido y tareas PICKING activas filtrando por tenantId ───
      const order = await tx.salesOrder.findFirst({
        where: { id: orderId, tenantId },
        include: {
          tasks: {
            where: {
              tenantId,
              type: "PICKING",
              status: { in: ["PENDING", "IN_PROGRESS", "EXCEPTION"] },
            },
            include: {
              steps: {
                orderBy: { sequence: "asc" },
              },
            },
          },
        },
      });

      if (!order || order.tenantId !== tenantId) {
        throw new WmsError(
          "ORDER_NOT_FOUND",
          `Order ${orderId} not found`,
          404,
        );
      }

      if (!CANCELLABLE_ORDER_STATUSES.has(order.status)) {
        throw new WmsError(
          "VALIDATION_ERROR",
          `Cannot cancel order ${orderId} in status ${order.status}`,
          409,
          { orderId, currentStatus: order.status },
        );
      }

      const cancelledTaskIds: string[] = [];
      const releasedAllocations: ReleasedAllocation[] = [];

      // ── 2. Liberar reservas pendientes de las tareas de PICKING activas ───
      for (const task of order.tasks) {
        for (const step of task.steps) {
          if (step.status === "COMPLETED" || step.status === "SKIPPED") {
            continue;
          }

          const remainingToRelease = Math.max(
            0,
            Number(step.expectedQty) - Number(step.scannedQty),
          );

          if (remainingToRelease > 0) {
            // Bloquear fila de balance con SELECT ... FOR UPDATE acotado por tenant_id
            const lockedBalances = await tx.$queryRaw<
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

            const balance = lockedBalances[0];
            if (balance) {
              const currentAllocated = Math.max(
                0,
                Number(balance.allocated_qty),
              );
              const toRelease = Math.min(currentAllocated, remainingToRelease);

              if (toRelease > 0) {
                await tx.inventoryBalance.update({
                  where: { id: balance.id },
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
                    referenceId: order.id,
                    userId: userId ?? null,
                    notes: reason
                      ? `Order cancelled (${order.externalRef ?? order.id}): ${reason}`
                      : `Allocation cancelled for order ${order.externalRef ?? order.id}`,
                  },
                });

                releasedAllocations.push({
                  productId: step.productId,
                  locationId: step.locationId,
                  quantity: toRelease,
                });
              }
            }
          }

          await tx.taskStep.update({
            where: { id: step.id },
            data: { status: "SKIPPED" },
          });
        }

        await tx.warehouseTask.update({
          where: { id: task.id },
          data: {
            status: "CANCELLED",
            completedAt: new Date(),
          },
        });

        cancelledTaskIds.push(task.id);
      }

      // ── 3. Actualizar estado del pedido a CANCELLED ───────────────────────
      const updatedNotes = reason
        ? order.notes
          ? `${order.notes} | Cancelled: ${reason}`
          : `Cancelled: ${reason}`
        : (order.notes ?? null);

      await tx.salesOrder.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
          notes: updatedNotes,
        },
      });

      return {
        orderId: order.id,
        status: "CANCELLED",
        cancelledTaskIds,
        releasedAllocations,
      };
    },
    {
      timeout: 15_000,
      isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel,
    },
  );
}
