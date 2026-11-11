// apps/api/src/ports/inventory-repository.ts
// Puerto hexagonal para operaciones de persistencia del Ledger e InventoryBalance.
// Trabaja con agregados de @wms/domain y preserva bloqueo pesimista y filtro tenantId.

import type { InventoryBalance, TxReason } from "@wms/domain";

export interface RecordTransactionInput {
  tenantId: string;
  productId: string;
  fromLocationId?: string | null | undefined;
  toLocationId?: string | null | undefined;
  quantity: number;
  reason: TxReason;
  referenceId?: string | null | undefined;
  userId?: string | null | undefined;
  notes?: string | null | undefined;
}

export interface StorageBalanceCandidate {
  balance: InventoryBalance;
  locationCode: string;
}

export interface LocationInfo {
  id: string;
  warehouseId: string;
  code: string;
  type: string;
  isActive: boolean;
}

export interface FindStorageBalancesOptions {
  warehouseId?: string | undefined;
  excludeLocationId?: string | undefined;
}

export interface InventoryRepository {
  /**
   * Carga el aggregate InventoryBalance para una ubicación y producto aplicando
   * bloqueo pesimista (SELECT ... FOR UPDATE) acotado por tenantId.
   */
  findBalanceForUpdate(
    tenantId: string,
    locationId: string,
    productId: string,
  ): Promise<InventoryBalance | null>;

  /**
   * Busca ubicaciones tipo STORAGE con ATP > 0 para un producto, ordenadas por
   * location.code ASC y bloqueadas con FOR UPDATE para allocation / re-asignación.
   */
  findStorageBalancesForUpdate(
    tenantId: string,
    productId: string,
    options?: FindStorageBalancesOptions,
  ): Promise<StorageBalanceCandidate[]>;

  /**
   * Persiste el estado actualizado del AggregateRoot InventoryBalance.
   */
  saveBalance(balance: InventoryBalance): Promise<void>;

  /**
   * Inserta un asiento inmutable en el Ledger (InventoryTransaction).
   * Nunca realiza update ni delete sobre esta tabla (CP-1).
   */
  recordTransaction(entry: RecordTransactionInput): Promise<void>;

  /**
   * Obtiene una ubicación por su id y valida su pertenencia a tenantId.
   */
  findLocation(tenantId: string, locationId: string): Promise<LocationInfo | null>;

  /**
   * Busca una ubicación activa por tipo (ej. PACKING, RECEIVING) dentro de un almacén.
   */
  findLocationByType(
    tenantId: string,
    warehouseId: string,
    type: string,
  ): Promise<LocationInfo | null>;
}
