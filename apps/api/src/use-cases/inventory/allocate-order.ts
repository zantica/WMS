// apps/api/src/use-cases/inventory/allocate-order.ts
// Caso de uso: Reservar stock para un pedido.
// Orquesta los agregados InventoryBalance y la máquina de estados SalesOrder
// dentro de un UnitOfWork Serializable con SELECT ... FOR UPDATE.

import { canTransitionOrder } from "@wms/domain";
import { WmsError } from "../../plugins/error-handler.js";
import type { UnitOfWork } from "../../ports/unit-of-work.js";
import { PrismaUnitOfWork } from "../../adapters/prisma-unit-of-work.js";
import { rethrowDomainErrorAsWmsError } from "../../shared/domain-error-mapper.js";

export interface AllocateOrderParams {
  orderId: string;
  tenantId: string;
  userId?: string | undefined;
  unitOfWork?: UnitOfWork | undefined;
  tx?: unknown;
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
  const uow = params.unitOfWork ?? new PrismaUnitOfWork(undefined, params.tx);

  try {
    return await uow.execute(
      tenantId,
      async (repos) => {
        // ── 1. Cargar el pedido y validar transición de estado ─────────────
        const order = await repos.orders.findById(tenantId, orderId);

        if (!order || order.tenantId !== tenantId) {
          throw new WmsError("ORDER_NOT_FOUND", `Order ${orderId} not found`, 404);
        }

        if (!canTransitionOrder(order.status, "ALLOCATED")) {
          throw new WmsError(
            "ORDER_ALREADY_ALLOCATED",
            `Order ${orderId} is already in status ${order.status}`,
            409,
          );
        }

        // ── 2. Por cada línea del pedido, buscar stock disponible (ATP) ────
        const allocationPlan: AllocationPlan[] = [];

        for (const line of order.lines) {
          let remaining = Number(line.requestedQty);

          const balances = await repos.inventory.findStorageBalancesForUpdate(
            tenantId,
            line.productId,
          );

          if (balances.length === 0) {
            throw new WmsError(
              "INSUFFICIENT_STOCK",
              `No available stock for product ${line.product.sku} (${line.productId})`,
              409,
              { productId: line.productId, sku: line.product.sku },
            );
          }

          for (const candidate of balances) {
            if (remaining <= 0) break;

            const atp = candidate.balance.available;
            if (atp <= 0) continue;

            const toAllocate = Math.min(atp, remaining);

            candidate.balance.allocate(toAllocate);
            await repos.inventory.saveBalance(candidate.balance);

            await repos.inventory.recordTransaction({
              tenantId,
              productId: line.productId,
              fromLocationId: candidate.balance.locationId,
              quantity: toAllocate,
              reason: "ALLOCATION",
              referenceId: orderId,
              userId: userId ?? null,
              notes: `Allocated for order ${order.externalRef ?? orderId}`,
            });

            allocationPlan.push({
              productId: line.productId,
              locationId: candidate.balance.locationId,
              locationCode: candidate.locationCode,
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

        // ── 3. Crear la WarehouseTask de picking con pasos ordenados ───────
        const sortedPlan = allocationPlan.sort((a, b) =>
          a.locationCode.localeCompare(b.locationCode),
        );

        const task = await repos.tasks.create({
          tenantId,
          orderId,
          type: "PICKING",
          status: "PENDING",
          assignedTo: null,
          steps: sortedPlan.map((step, index) => ({
            sequence: index + 1,
            locationId: step.locationId,
            productId: step.productId,
            expectedQty: step.quantity,
          })),
        });

        // ── 4. Actualizar estado del pedido ────────────────────────────────
        await repos.orders.updateStatus(tenantId, orderId, "ALLOCATED");

        return task.id;
      },
      { isolationLevel: "Serializable", timeoutMs: 15_000 },
    );
  } catch (err) {
    rethrowDomainErrorAsWmsError(err);
  }
}
