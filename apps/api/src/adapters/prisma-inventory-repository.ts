// apps/api/src/adapters/prisma-inventory-repository.ts
// Adaptador Prisma/PostgreSQL para InventoryRepository.
// Preserva SELECT ... FOR UPDATE, filtro explícito por tenantId y Ledger append-only.

import { InventoryBalance } from "@wms/domain";
import { Prisma, type prisma as prismaClientType } from "@wms/db";
import type {
  FindStorageBalancesOptions,
  InventoryRepository,
  LocationInfo,
  RecordTransactionInput,
  StorageBalanceCandidate,
} from "../ports/inventory-repository.js";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prismaClientType;

interface RawBalanceRow {
  id: string;
  on_hand_qty: number | string;
  allocated_qty: number | string;
}

interface RawStorageBalanceRow extends RawBalanceRow {
  location_id: string;
  location_code: string;
}

export class PrismaInventoryRepository implements InventoryRepository {
  private readonly loadedIds = new Set<string>();

  constructor(private readonly client: PrismaClientOrTx) {}

  async findBalanceForUpdate(
    tenantId: string,
    locationId: string,
    productId: string,
  ): Promise<InventoryBalance | null> {
    const rows = await this.client.$queryRaw<RawBalanceRow[]>`
      SELECT id, "onHandQty" as on_hand_qty, "allocatedQty" as allocated_qty
      FROM inventory_balances
      WHERE "locationId" = ${locationId}
        AND "productId" = ${productId}
        AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;

    const row = rows[0];
    if (!row) {
      return null;
    }

    this.loadedIds.add(row.id);

    return new InventoryBalance({
      id: row.id,
      tenantId,
      locationId,
      productId,
      onHand: Number(row.on_hand_qty),
      allocated: Number(row.allocated_qty),
    });
  }

  async findStorageBalancesForUpdate(
    tenantId: string,
    productId: string,
    options?: FindStorageBalancesOptions,
  ): Promise<StorageBalanceCandidate[]> {
    const warehouseFilter = options?.warehouseId
      ? Prisma.sql`AND l."warehouseId" = ${options.warehouseId} AND l."tenantId" = ${tenantId} AND l."isActive" = true`
      : Prisma.empty;

    const excludeFilter = options?.excludeLocationId
      ? Prisma.sql`AND l.id <> ${options.excludeLocationId}`
      : Prisma.empty;

    const rows = await this.client.$queryRaw<RawStorageBalanceRow[]>`
      SELECT ib.id, ib."locationId" as location_id, l.code as location_code,
             ib."onHandQty" as on_hand_qty, ib."allocatedQty" as allocated_qty
      FROM inventory_balances ib
      JOIN locations l ON l.id = ib."locationId"
      WHERE ib."productId" = ${productId}
        AND ib."tenantId" = ${tenantId}
        AND l.type = 'STORAGE'
        ${warehouseFilter}
        ${excludeFilter}
        AND (ib."onHandQty" - ib."allocatedQty") > 0
      ORDER BY l.code ASC
      FOR UPDATE OF ib
    `;

    return rows.map((row) => {
      this.loadedIds.add(row.id);
      return {
        locationCode: row.location_code,
        balance: new InventoryBalance({
          id: row.id,
          tenantId,
          locationId: row.location_id,
          productId,
          onHand: Number(row.on_hand_qty),
          allocated: Number(row.allocated_qty),
        }),
      };
    });
  }

  async saveBalance(balance: InventoryBalance): Promise<void> {
    if (this.loadedIds.has(balance.id)) {
      await this.client.inventoryBalance.updateMany({
        where: {
          id: balance.id,
          tenantId: balance.tenantId,
        },
        data: {
          onHandQty: balance.onHand,
          allocatedQty: balance.allocated,
        },
      });
      return;
    }

    await this.client.inventoryBalance.upsert({
      where: {
        locationId_productId: {
          locationId: balance.locationId,
          productId: balance.productId,
        },
      },
      update: {
        onHandQty: balance.onHand,
        allocatedQty: balance.allocated,
      },
      create: {
        tenantId: balance.tenantId,
        locationId: balance.locationId,
        productId: balance.productId,
        onHandQty: balance.onHand,
        allocatedQty: balance.allocated,
      },
    });
  }

  async recordTransaction(entry: RecordTransactionInput): Promise<void> {
    await this.client.inventoryTransaction.create({
      data: {
        tenantId: entry.tenantId,
        productId: entry.productId,
        fromLocationId: entry.fromLocationId ?? null,
        toLocationId: entry.toLocationId ?? null,
        quantity: entry.quantity,
        reason: entry.reason,
        referenceId: entry.referenceId ?? null,
        userId: entry.userId ?? null,
        notes: entry.notes ?? null,
      },
    });
  }

  async findLocation(tenantId: string, locationId: string): Promise<LocationInfo | null> {
    const loc = await this.client.location.findFirst({
      where: { id: locationId, tenantId },
    });
    if (!loc) return null;
    return {
      id: loc.id,
      warehouseId: loc.warehouseId,
      code: loc.code,
      type: loc.type,
      isActive: loc.isActive,
    };
  }

  async findLocationByType(
    tenantId: string,
    warehouseId: string,
    type: string,
  ): Promise<LocationInfo | null> {
    const loc = await this.client.location.findFirst({
      where: {
        tenantId,
        warehouseId,
        type: type as Prisma.EnumLocationTypeFilter["equals"],
        isActive: true,
      },
    });
    if (!loc) return null;
    return {
      id: loc.id,
      warehouseId: loc.warehouseId,
      code: loc.code,
      type: loc.type,
      isActive: loc.isActive,
    };
  }
}
