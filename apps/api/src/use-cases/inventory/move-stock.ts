// apps/api/src/use-cases/inventory/move-stock.ts
// Caso de uso más importante del sistema.
// Registra un movimiento de stock en el Ledger y actualiza el Snapshot (InventoryBalance)
// en la MISMA transacción SQL — garantiza consistencia total.
//
// Principios de seguridad:
// 1. SELECT FOR UPDATE en filas de InventoryBalance para evitar race conditions
// 2. Chequeo de saldo negativo ANTES de descontar
// 3. Ledger inmutable — nunca UPDATE/DELETE en inventory_transactions

import { prisma, type Prisma, type TxReason } from "@wms/db";
import { WmsError } from "../../plugins/error-handler.js";

export interface MoveStockParams {
  tenantId: string;
  productId: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity: number;
  reason: TxReason;
  referenceId?: string;
  userId?: string;
  notes?: string;
}

/**
 * Ejecuta un movimiento de stock atómico:
 * 1. Inserta InventoryTransaction (inmutable)
 * 2. Descuenta de fromLocation (si aplica)
 * 3. Añade a toLocation (si aplica)
 * Todo en un único BEGIN...COMMIT con bloqueos FOR UPDATE.
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

  if (quantity <= 0) {
    throw new WmsError("VALIDATION_ERROR", "Quantity must be positive", 422);
  }

  await prisma.$transaction(
    async (tx) => {
      // ── 1. Descontar de origen (si tiene ubicación de origen) ───────────
      if (fromLocationId) {
        // SELECT FOR UPDATE — bloquea la fila para evitar doble gasto concurrente
        const fromBalance = await tx.$queryRaw<
          Array<{ id: string; on_hand_qty: number; allocated_qty: number }>
        >`
          SELECT id, on_hand_qty, allocated_qty
          FROM inventory_balances
          WHERE location_id = ${fromLocationId}
            AND product_id = ${productId}
            AND tenant_id = ${tenantId}
          FOR UPDATE
        `;

        const balance = fromBalance[0];
        if (!balance) {
          throw new WmsError(
            "INSUFFICIENT_STOCK",
            `No stock found for product ${productId} in location ${fromLocationId}`,
            409,
          );
        }

        const currentQty = Number(balance.on_hand_qty);
        if (currentQty < quantity) {
          throw new WmsError(
            "INSUFFICIENT_STOCK",
            `Insufficient stock: available ${currentQty}, requested ${quantity}`,
            409,
          );
        }

        await tx.inventoryBalance.update({
          where: { id: balance.id },
          data: { onHandQty: { decrement: quantity } },
        });
      }

      // ── 2. Añadir a destino (si tiene ubicación de destino) ─────────────
      if (toLocationId) {
        await tx.inventoryBalance.upsert({
          where: {
            locationId_productId: {
              locationId: toLocationId,
              productId,
            },
          },
          update: {
            onHandQty: { increment: quantity },
          },
          create: {
            tenantId,
            locationId: toLocationId,
            productId,
            onHandQty: quantity,
            allocatedQty: 0,
          },
        });
      }

      // ── 3. Registrar en el Ledger (inmutable) ───────────────────────────
      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          productId,
          fromLocationId,
          toLocationId,
          quantity,
          reason,
          referenceId,
          userId,
          notes,
        },
      });
    },
    {
      // Timeout generoso para operaciones con múltiples pasos
      timeout: 10_000,
      // Isolation level por defecto en PostgreSQL es READ COMMITTED
      // El FOR UPDATE eleva al nivel necesario por fila
      isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel,
    },
  );
}
