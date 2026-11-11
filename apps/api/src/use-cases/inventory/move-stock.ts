// apps/api/src/use-cases/inventory/move-stock.ts
// Caso de uso más importante del sistema.
// Registra un movimiento de stock en el Ledger y actualiza el Snapshot (InventoryBalance)
// en la MISMA transacción SQL — garantiza consistencia total mediante @wms/domain + UnitOfWork.
//
// Principios de seguridad:
// 1. SELECT FOR UPDATE en filas de InventoryBalance vía InventoryRepository
// 2. Chequeo de stock disponible (onHand - allocated >= quantity) vía InventoryBalance.withdraw
// 3. Ledger inmutable — nunca UPDATE/DELETE en inventory_transactions

import { InventoryBalance, Quantity, type TxReason } from "@wms/domain";
import { WmsError } from "../../plugins/error-handler.js";
import type { UnitOfWork } from "../../ports/unit-of-work.js";
import { PrismaUnitOfWork } from "../../adapters/prisma-unit-of-work.js";
import { rethrowDomainErrorAsWmsError } from "../../shared/domain-error-mapper.js";

export interface MoveStockParams {
  tenantId: string;
  productId: string;
  fromLocationId?: string | undefined;
  toLocationId?: string | undefined;
  quantity: number;
  reason: TxReason;
  referenceId?: string | undefined;
  userId?: string | undefined;
  notes?: string | undefined;
  unitOfWork?: UnitOfWork | undefined;
  tx?: unknown;
}

/**
 * Ejecuta un movimiento de stock atómico:
 * 1. Descuenta de fromLocation (respetando available = onHand - allocated)
 * 2. Añade a toLocation (si aplica)
 * 3. Inserta InventoryTransaction (inmutable)
 * Todo en un único UnitOfWork Serializable con bloqueos FOR UPDATE.
 */
export async function moveStock(params: MoveStockParams): Promise<void> {
  const {
    tenantId,
    productId,
    fromLocationId,
    toLocationId,
    quantity,
    reason,
    referenceId,
    userId,
    notes,
  } = params;

  try {
    Quantity.positive(quantity);
  } catch (err) {
    rethrowDomainErrorAsWmsError(err);
  }

  const uow = params.unitOfWork ?? new PrismaUnitOfWork(undefined, params.tx);

  try {
    await uow.execute(
      tenantId,
      async (repos) => {
        // ── 1. Descontar de origen (si tiene ubicación de origen) ─────────
        if (fromLocationId) {
          const fromBalance = await repos.inventory.findBalanceForUpdate(
            tenantId,
            fromLocationId,
            productId,
          );

          if (!fromBalance) {
            throw new WmsError(
              "INSUFFICIENT_STOCK",
              `No stock found for product ${productId} in location ${fromLocationId}`,
              409,
            );
          }

          fromBalance.withdraw(quantity);
          await repos.inventory.saveBalance(fromBalance);
        }

        // ── 2. Añadir a destino (si tiene ubicación de destino) ───────────
        if (toLocationId) {
          let toBalance = await repos.inventory.findBalanceForUpdate(
            tenantId,
            toLocationId,
            productId,
          );

          if (!toBalance) {
            toBalance = new InventoryBalance({
              id: crypto.randomUUID(),
              tenantId,
              locationId: toLocationId,
              productId,
              onHand: 0,
              allocated: 0,
            });
          }

          toBalance.receive(quantity);
          await repos.inventory.saveBalance(toBalance);
        }

        // ── 3. Registrar en el Ledger (inmutable) ─────────────────────────
        await repos.inventory.recordTransaction({
          tenantId,
          productId,
          fromLocationId: fromLocationId ?? null,
          toLocationId: toLocationId ?? null,
          quantity,
          reason,
          referenceId: referenceId ?? null,
          userId: userId ?? null,
          notes: notes ?? null,
        });
      },
      { isolationLevel: "Serializable", timeoutMs: 10_000 },
    );
  } catch (err) {
    rethrowDomainErrorAsWmsError(err);
  }
}
