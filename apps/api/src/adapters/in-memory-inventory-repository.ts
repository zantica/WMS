// apps/api/src/adapters/in-memory-inventory-repository.ts
// Adaptador en memoria para InventoryRepository.
// Respeta el contrato del puerto (LSP): aislamiento por tenantId, ordenación por code ASC,
// invariantes de InventoryBalance y Ledger append-only.

import { InventoryBalance } from "@wms/domain";
import type {
  FindStorageBalancesOptions,
  InventoryRepository,
  LocationInfo,
  RecordTransactionInput,
  StorageBalanceCandidate,
} from "../ports/inventory-repository.js";

export interface InMemoryBalanceRecord {
  id: string;
  tenantId: string;
  locationId: string;
  productId: string;
  onHandQty: number;
  allocatedQty: number;
}

export interface InMemoryLocationRecord extends LocationInfo {
  tenantId: string;
}

export interface InMemoryTransactionRecord extends RecordTransactionInput {
  id: string;
  createdAt: Date;
}

export interface InMemoryInventoryState {
  balances: InMemoryBalanceRecord[];
  locations: InMemoryLocationRecord[];
  transactions: InMemoryTransactionRecord[];
}

export class InMemoryInventoryRepository implements InventoryRepository {
  private txCounter = 0;
  private balCounter = 0;

  constructor(private readonly state: InMemoryInventoryState) {}

  async findBalanceForUpdate(
    tenantId: string,
    locationId: string,
    productId: string,
  ): Promise<InventoryBalance | null> {
    const row = this.state.balances.find(
      (b) =>
        b.tenantId === tenantId &&
        b.locationId === locationId &&
        b.productId === productId,
    );
    if (!row) return null;

    return new InventoryBalance({
      id: row.id,
      tenantId: row.tenantId,
      locationId: row.locationId,
      productId: row.productId,
      onHand: row.onHandQty,
      allocated: row.allocatedQty,
    });
  }

  async findStorageBalancesForUpdate(
    tenantId: string,
    productId: string,
    options?: FindStorageBalancesOptions,
  ): Promise<StorageBalanceCandidate[]> {
    const candidates: StorageBalanceCandidate[] = [];

    for (const bal of this.state.balances) {
      if (bal.tenantId !== tenantId || bal.productId !== productId) continue;
      const atp = bal.onHandQty - bal.allocatedQty;
      if (atp <= 0) continue;

      const loc = this.state.locations.find(
        (l) => l.id === bal.locationId && l.tenantId === tenantId,
      );
      if (!loc || loc.type !== "STORAGE") continue;
      if (options?.warehouseId && (loc.warehouseId !== options.warehouseId || !loc.isActive)) {
        continue;
      }
      if (options?.excludeLocationId && loc.id === options.excludeLocationId) {
        continue;
      }

      candidates.push({
        locationCode: loc.code,
        balance: new InventoryBalance({
          id: bal.id,
          tenantId: bal.tenantId,
          locationId: bal.locationId,
          productId: bal.productId,
          onHand: bal.onHandQty,
          allocated: bal.allocatedQty,
        }),
      });
    }

    return candidates.sort((a, b) => a.locationCode.localeCompare(b.locationCode));
  }

  async saveBalance(balance: InventoryBalance): Promise<void> {
    const existing = this.state.balances.find(
      (b) =>
        b.tenantId === balance.tenantId &&
        b.locationId === balance.locationId &&
        b.productId === balance.productId,
    );

    if (existing) {
      existing.onHandQty = balance.onHand;
      existing.allocatedQty = balance.allocated;
      return;
    }

    this.balCounter += 1;
    this.state.balances.push({
      id: balance.id || `bal-mem-${this.balCounter}`,
      tenantId: balance.tenantId,
      locationId: balance.locationId,
      productId: balance.productId,
      onHandQty: balance.onHand,
      allocatedQty: balance.allocated,
    });
  }

  async recordTransaction(entry: RecordTransactionInput): Promise<void> {
    this.txCounter += 1;
    this.state.transactions.push({
      ...entry,
      id: `tx-mem-${this.txCounter}`,
      createdAt: new Date(),
    });
  }

  async findLocation(tenantId: string, locationId: string): Promise<LocationInfo | null> {
    const loc = this.state.locations.find(
      (l) => l.id === locationId && l.tenantId === tenantId,
    );
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
    const loc = this.state.locations.find(
      (l) =>
        l.tenantId === tenantId &&
        l.warehouseId === warehouseId &&
        l.type === type &&
        l.isActive,
    );
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
