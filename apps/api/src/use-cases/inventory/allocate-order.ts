// apps/api/src/use-cases/inventory/allocate-order.ts
// Caso de uso: Reservar stock para un pedido.
// Cuando un pedido entra, este use case busca stock disponible (ATP > 0),
// reserva la cantidad necesaria y crea las tareas de picking.
//
// Garantías:
// - SELECT FOR UPDATE por línea de balance (anti race condition)
// - Si no hay stock suficiente para cualquier línea → rollback total
// - Los TaskSteps se ordenan por location.code (recorrido eficiente del almacén)

import { prisma, type Prisma } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";

export interface AllocateOrderParams {
  orderId: string;
  tenantId: string;
  userId?: string;
}

interface AllocationPlan {
  productId: string;
  locationId: string;
  locationCode: string;
  quantity: number;
}

/**
 * Reserva stock para todas las líneas del pedido y crea la WarehouseTask de picking.
 * Transaccional y con bloqueo pesimista — seguro ante requests concurrentes.
 */
export async function allocateOrder(
  params: AllocateOrderParams,
): Promise<string> {
  const { orderId, tenantId, userId } = params;

  return await prisma.$transaction(
    async (tx) => {
      // ── 1. Cargar el pedido y verificar que está en estado correcto ──────
      const order = await tx.salesOrder.findUnique({
        where: { id: orderId },
        include: { lines: { include: { product: true } } },
      });

      if (!order || order.tenantId !== tenantId) {
        throw new WmsError("ORDER_NOT_FOUND", `Order ${orderId} not found`, 404);
      }

      if (order.status !== "PENDING" && order.status !== "ON_HOLD") {
        throw new WmsError(
          "ORDER_ALREADY_ALLOCATED",
          `Order ${orderId} is already in status ${order.status}`,
          409,
        );
      }

      // ── 2. Por cada línea del pedido, buscar stock disponible (ATP) ──────
      const allocationPlan: AllocationPlan[] = [];

      for (const line of order.lines) {
        let remaining = Number(line.requestedQty);

        // Buscar balances con ATP > 0, en ubicaciones STORAGE, ordenadas por código
        // SELECT FOR UPDATE bloquea las filas para evitar doble reserva concurrente
        const balances = await tx.$queryRaw<
          Array<{
            id: string;
            location_id: string;
            location_code: string;
            on_hand_qty: number;
            allocated_qty: number;
          }>
        >`
          SELECT ib.id, ib.location_id, l.code as location_code,
                 ib.on_hand_qty, ib.allocated_qty
          FROM inventory_balances ib
          JOIN locations l ON l.id = ib.location_id
          WHERE ib.product_id = ${line.productId}
            AND ib.tenant_id = ${tenantId}
            AND l.type = 'STORAGE'
            AND (ib.on_hand_qty - ib.allocated_qty) > 0
          ORDER BY l.code ASC
          FOR UPDATE OF ib
        `;

        if (balances.length === 0) {
          throw new WmsError(
            "INSUFFICIENT_STOCK",
            `No available stock for product ${line.product.sku} (${line.productId})`,
            409,
            { productId: line.productId, sku: line.product.sku },
          );
        }

        for (const balance of balances) {
          if (remaining <= 0) break;

          const atp = Number(balance.on_hand_qty) - Number(balance.allocated_qty);
          if (atp <= 0) continue;

          const toAllocate = Math.min(atp, remaining);

          // Actualizar allocatedQty en la proyección
          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: { allocatedQty: { increment: toAllocate } },
          });

          // Registrar en el Ledger
          await tx.inventoryTransaction.create({
            data: {
              tenantId,
              productId: line.productId,
              fromLocationId: balance.location_id,
              quantity: toAllocate,
              reason: "ALLOCATION",
              referenceId: orderId,
              userId,
              notes: `Allocated for order ${order.externalRef ?? orderId}`,
            },
          });

          allocationPlan.push({
            productId: line.productId,
            locationId: balance.location_id,
            locationCode: balance.location_code,
            quantity: toAllocate,
          });

          remaining -= toAllocate;
        }

        if (remaining > 0) {
          throw new WmsError(
            "INSUFFICIENT_STOCK",
            `Insufficient stock for product ${line.product.sku}: missing ${remaining} units`,
            409,
            { productId: line.productId, missing: remaining },
          );
        }
      }

      // ── 3. Crear la WarehouseTask de picking con pasos ordenados ─────────
      // Los pasos se ordenan por location.code para que el operario recorra
      // el almacén en orden sin dar vueltas (optimización de recorrido simple)
      const sortedPlan = allocationPlan.sort((a, b) =>
        a.locationCode.localeCompare(b.locationCode),
      );

      const task = await tx.warehouseTask.create({
        data: {
          tenantId,
          orderId,
          type: "PICKING",
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

      // ── 4. Actualizar estado del pedido ──────────────────────────────────
      await tx.salesOrder.update({
        where: { id: orderId },
        data: { status: "ALLOCATED" },
      });

      return task.id;
    },
    {
      timeout: 15_000,
      isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel,
    },
  );
}
