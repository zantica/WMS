// apps/api/src/adapters/in-memory-topology-repository.ts
// Adaptador en memoria para pruebas unitarias de topología y casos de uso sin tocar base de datos.

import { randomUUID } from "node:crypto";
import type {
  AisleLayoutDetailDTO,
  AisleLayoutSummaryDTO,
  LocationCellDTO,
  LocationDTO,
  RackLayoutGroupDTO,
  UpdateLocationInput,
  WarehouseLayoutSummaryDTO,
  ZoneLayoutNodeDTO,
} from "@wms/shared-types";
import {
  calculateAtp,
  SPECIAL_FLOOR_AISLE,
} from "@wms/shared-types";
import type {
  BatchUsageCheckResult,
  CreateTopologyLocationParams,
  TopologyRepositoryPort,
} from "../ports/topology-repository.js";

export interface StoredLocationRecord extends LocationDTO {
  tenantId: string;
}

export interface StoredBalanceRecord {
  tenantId: string;
  warehouseId: string;
  locationId: string;
  productId: string;
  onHandQty: number;
  allocatedQty: number;
}

export interface StoredTxRecord {
  tenantId: string;
  locationId: string;
}

export interface StoredTaskStepRecord {
  tenantId: string;
  locationId: string;
}

export class InMemoryTopologyRepository implements TopologyRepositoryPort {
  private locations: StoredLocationRecord[] = [];
  private balances: StoredBalanceRecord[] = [];
  private transactions: StoredTxRecord[] = [];
  private taskSteps: StoredTaskStepRecord[] = [];

  // ── Métodos auxiliares para alimentar tests ──────────────────
  public seedLocations(records: StoredLocationRecord[]): void {
    this.locations.push(...records);
  }

  public seedBalances(records: StoredBalanceRecord[]): void {
    this.balances.push(...records);
  }

  public seedTransactions(records: StoredTxRecord[]): void {
    this.transactions.push(...records);
  }

  public seedTaskSteps(records: StoredTaskStepRecord[]): void {
    this.taskSteps.push(...records);
  }

  public clear(): void {
    this.locations = [];
    this.balances = [];
    this.transactions = [];
    this.taskSteps = [];
  }

  // ── Implementación de TopologyRepositoryPort ────────────────

  public async getWarehouseLayoutSummary(
    tenantId: string,
    warehouseId: string,
  ): Promise<WarehouseLayoutSummaryDTO> {
    const locs = this.locations.filter(
      (l) => l.tenantId === tenantId && l.warehouseId === warehouseId,
    );

    // Mapear saldos por locationId
    const balancesByLoc = this.getBalancesByLocationMap(tenantId, warehouseId);

    // Agrupar por zona
    const zoneMap = new Map<string, StoredLocationRecord[]>();
    for (const loc of locs) {
      const z = loc.zone || "MAIN";
      if (!zoneMap.has(z)) zoneMap.set(z, []);
      zoneMap.get(z)!.push(loc);
    }

    const zoneNodes: ZoneLayoutNodeDTO[] = [];
    let whTotalLocations = 0;
    let whActiveLocations = 0;
    let whOccupiedLocations = 0;
    let whBlockedLocations = 0;
    let whTotalOnHand = 0;
    let whTotalAllocated = 0;

    for (const [zoneName, zoneLocs] of zoneMap.entries()) {
      // Agrupar por pasillo dentro de la zona
      const aisleMap = new Map<string, StoredLocationRecord[]>();
      for (const loc of zoneLocs) {
        const aisleKey =
          loc.storageType === "FLOOR" && !loc.aisle
            ? SPECIAL_FLOOR_AISLE
            : loc.aisle || "01";
        if (!aisleMap.has(aisleKey)) aisleMap.set(aisleKey, []);
        aisleMap.get(aisleKey)!.push(loc);
      }

      const aisleSummaries: AisleLayoutSummaryDTO[] = [];
      let zoneTotalLocations = 0;
      let zoneActiveLocations = 0;
      let zoneOccupiedLocations = 0;
      let zoneBlockedLocations = 0;
      let zoneTotalOnHand = 0;
      let zoneTotalAllocated = 0;

      for (const [aisleKey, aisleLocs] of aisleMap.entries()) {
        const total = aisleLocs.length;
        const active = aisleLocs.filter((l) => l.status === "ACTIVE").length;
        const blocked = aisleLocs.filter((l) => l.status === "BLOCKED").length;

        let onHand = 0;
        let allocated = 0;
        let occupied = 0;

        for (const loc of aisleLocs) {
          const bal = balancesByLoc.get(loc.id) ?? { onHand: 0, allocated: 0 };
          onHand += bal.onHand;
          allocated += bal.allocated;
          if (bal.onHand > 0) occupied++;
        }

        const occupancyRate =
          active === 0 ? 0 : Math.round((occupied / active) * 100);
        const atp = calculateAtp(onHand, allocated);

        aisleSummaries.push({
          zone: zoneName,
          aisle: aisleKey,
          storageType: aisleLocs[0]?.storageType ?? "RACK",
          totalLocations: total,
          activeLocations: active,
          occupiedLocations: occupied,
          blockedLocations: blocked,
          occupancyRate,
          totalOnHand: onHand,
          totalAllocated: allocated,
          totalAtp: atp,
        });

        zoneTotalLocations += total;
        zoneActiveLocations += active;
        zoneOccupiedLocations += occupied;
        zoneBlockedLocations += blocked;
        zoneTotalOnHand += onHand;
        zoneTotalAllocated += allocated;
      }

      // Ordenar pasillos alfabéticamente
      aisleSummaries.sort((a, b) => a.aisle.localeCompare(b.aisle));

      const zoneOccupancyRate =
        zoneActiveLocations === 0
          ? 0
          : Math.round((zoneOccupiedLocations / zoneActiveLocations) * 100);
      const zoneAtp = calculateAtp(zoneTotalOnHand, zoneTotalAllocated);

      zoneNodes.push({
        zone: zoneName,
        totalLocations: zoneTotalLocations,
        activeLocations: zoneActiveLocations,
        occupiedLocations: zoneOccupiedLocations,
        blockedLocations: zoneBlockedLocations,
        occupancyRate: zoneOccupancyRate,
        totalOnHand: zoneTotalOnHand,
        totalAllocated: zoneTotalAllocated,
        totalAtp: zoneAtp,
        aisles: aisleSummaries,
      });

      whTotalLocations += zoneTotalLocations;
      whActiveLocations += zoneActiveLocations;
      whOccupiedLocations += zoneOccupiedLocations;
      whBlockedLocations += zoneBlockedLocations;
      whTotalOnHand += zoneTotalOnHand;
      whTotalAllocated += zoneTotalAllocated;
    }

    zoneNodes.sort((a, b) => a.zone.localeCompare(b.zone));

    const whOccupancyRate =
      whActiveLocations === 0
        ? 0
        : Math.round((whOccupiedLocations / whActiveLocations) * 100);
    const whTotalAtp = calculateAtp(whTotalOnHand, whTotalAllocated);

    return {
      warehouseId,
      totalLocations: whTotalLocations,
      activeLocations: whActiveLocations,
      occupiedLocations: whOccupiedLocations,
      blockedLocations: whBlockedLocations,
      occupancyRate: whOccupancyRate,
      totalOnHand: whTotalOnHand,
      totalAllocated: whTotalAllocated,
      totalAtp: whTotalAtp,
      zones: zoneNodes,
    };
  }

  public async getAisleLayoutDetail(
    tenantId: string,
    warehouseId: string,
    aisle: string,
    zone?: string,
  ): Promise<AisleLayoutDetailDTO> {
    const isSpecialFloor = aisle === SPECIAL_FLOOR_AISLE;

    const locs = this.locations.filter((l) => {
      if (l.tenantId !== tenantId || l.warehouseId !== warehouseId) return false;
      if (zone && l.zone !== zone) return false;
      if (isSpecialFloor) {
        return l.storageType === "FLOOR" && (!l.aisle || l.aisle === SPECIAL_FLOOR_AISLE);
      }
      return l.aisle === aisle;
    });

    const balancesByLoc = this.getBalancesByLocationMap(tenantId, warehouseId);

    // Agrupar por rack
    const rackMap = new Map<string, StoredLocationRecord[]>();
    for (const loc of locs) {
      const r = loc.rack || "01";
      if (!rackMap.has(r)) rackMap.set(r, []);
      rackMap.get(r)!.push(loc);
    }

    const rackGroups: RackLayoutGroupDTO[] = [];
    let aisleTotalLocations = 0;
    let aisleActiveLocations = 0;
    let aisleOccupiedLocations = 0;
    let aisleBlockedLocations = 0;
    let aisleTotalOnHand = 0;
    let aisleTotalAllocated = 0;

    for (const [rackKey, rackLocs] of rackMap.entries()) {
      const storageType = rackLocs[0]?.storageType ?? "RACK";
      const total = rackLocs.length;
      const occupied = rackLocs.filter((l) => {
        const bal = balancesByLoc.get(l.id);
        return bal && bal.onHand > 0;
      }).length;
      const blocked = rackLocs.filter((l) => l.status === "BLOCKED").length;

      let rackOnHand = 0;
      let rackAllocated = 0;

      // Agrupar por nivel
      const levelMap = new Map<string, LocationCellDTO[]>();
      for (const loc of rackLocs) {
        const bal = balancesByLoc.get(loc.id) ?? { onHand: 0, allocated: 0, skuCount: 0 };
        rackOnHand += bal.onHand;
        rackAllocated += bal.allocated;

        const cell: LocationCellDTO = {
          id: loc.id,
          code: loc.code,
          zone: loc.zone ?? "MAIN",
          aisle: loc.aisle ?? null,
          rack: loc.rack ?? "01",
          level: loc.level ?? "01",
          position: loc.position ?? "01",
          storageType: loc.storageType ?? "RACK",
          type: loc.type,
          status: loc.status ?? "ACTIVE",
          onHandQty: bal.onHand,
          allocatedQty: bal.allocated,
          atpQty: calculateAtp(bal.onHand, bal.allocated),
          skuCount: bal.skuCount ?? (bal.onHand > 0 ? 1 : 0),
        };

        const lvlKey = loc.level || "01";
        if (!levelMap.has(lvlKey)) levelMap.set(lvlKey, []);
        levelMap.get(lvlKey)!.push(cell);
      }

      // Ordenar niveles:
      // Para RACK y SHELVING: de mayor a menor (alzado frontal: nivel más alto arriba)
      // Para FLOOR: nivel '01'
      const levelsArray = Array.from(levelMap.entries()).map(([lvl, positions]) => {
        // Ordenar posiciones de menor a mayor
        positions.sort((a, b) => a.position.localeCompare(b.position));
        return { level: lvl, positions };
      });

      if (storageType === "FLOOR") {
        levelsArray.sort((a, b) => a.level.localeCompare(b.level));
      } else {
        // Invertido: nivel 4 arriba, nivel 1 abajo
        levelsArray.sort((a, b) => b.level.localeCompare(a.level));
      }

      const activeInRack = rackLocs.filter((l) => l.status === "ACTIVE").length;
      const occupancyRate =
        activeInRack === 0 ? 0 : Math.round((occupied / activeInRack) * 100);

      rackGroups.push({
        rack: rackKey,
        storageType,
        totalLocations: total,
        occupiedLocations: occupied,
        blockedLocations: blocked,
        occupancyRate,
        totalOnHand: rackOnHand,
        totalAllocated: rackAllocated,
        totalAtp: calculateAtp(rackOnHand, rackAllocated),
        levels: levelsArray,
      });

      aisleTotalLocations += total;
      aisleActiveLocations += activeInRack;
      aisleOccupiedLocations += occupied;
      aisleBlockedLocations += blocked;
      aisleTotalOnHand += rackOnHand;
      aisleTotalAllocated += rackAllocated;
    }

    rackGroups.sort((a, b) => a.rack.localeCompare(b.rack));

    const aisleOccupancyRate =
      aisleActiveLocations === 0
        ? 0
        : Math.round((aisleOccupiedLocations / aisleActiveLocations) * 100);

    return {
      warehouseId,
      zone: zone ?? (locs[0]?.zone || "MAIN"),
      aisle,
      totalLocations: aisleTotalLocations,
      activeLocations: aisleActiveLocations,
      occupiedLocations: aisleOccupiedLocations,
      blockedLocations: aisleBlockedLocations,
      occupancyRate: aisleOccupancyRate,
      totalOnHand: aisleTotalOnHand,
      totalAllocated: aisleTotalAllocated,
      totalAtp: calculateAtp(aisleTotalOnHand, aisleTotalAllocated),
      racks: rackGroups,
    };
  }

  public async findExistingCodes(
    tenantId: string,
    warehouseId: string,
    codes: string[],
  ): Promise<string[]> {
    const codeSet = new Set(codes);
    return this.locations
      .filter(
        (l) =>
          l.tenantId === tenantId &&
          l.warehouseId === warehouseId &&
          codeSet.has(l.code),
      )
      .map((l) => l.code);
  }

  public async createLocationBlock(
    tenantId: string,
    locations: CreateTopologyLocationParams[],
  ): Promise<LocationDTO[]> {
    const created: LocationDTO[] = [];
    for (const params of locations) {
      // Upsert idempotente: si ya existe para ese warehouseId y code, ignorar
      const exists = this.locations.some(
        (l) =>
          l.tenantId === tenantId &&
          l.warehouseId === params.warehouseId &&
          l.code === params.code,
      );
      if (!exists) {
        const record: StoredLocationRecord = {
          id: `loc_${Date.now()}_${randomUUID().replace(/-/g, "").substring(0, 8)}`,
          tenantId,
          warehouseId: params.warehouseId,
          code: params.code,
          type: params.type,
          storageType: params.storageType,
          status: params.status,
          zone: params.zone,
          aisle: params.aisle,
          rack: params.rack,
          level: params.level,
          position: params.position,
          generationBatchId: params.generationBatchId ?? null,
          description: params.description ?? null,
          isActive: params.status === "ACTIVE",
          createdAt: new Date().toISOString(),
        };
        this.locations.push(record);
        created.push({ ...record });
      }
    }
    return created;
  }

  public async createLocation(
    tenantId: string,
    params: CreateTopologyLocationParams,
  ): Promise<LocationDTO> {
    const record: StoredLocationRecord = {
      id: `loc_${Date.now()}_${randomUUID().replace(/-/g, "").substring(0, 8)}`,
      tenantId,
      warehouseId: params.warehouseId,
      code: params.code,
      type: params.type,
      storageType: params.storageType,
      status: params.status,
      zone: params.zone,
      aisle: params.aisle,
      rack: params.rack,
      level: params.level,
      position: params.position,
      generationBatchId: params.generationBatchId ?? null,
      description: params.description ?? null,
      isActive: params.status === "ACTIVE",
      createdAt: new Date().toISOString(),
    };
    this.locations.push(record);
    return { ...record };
  }

  public async updateLocation(
    tenantId: string,
    id: string,
    data: UpdateLocationInput,
  ): Promise<LocationDTO> {
    const idx = this.locations.findIndex(
      (l) => l.tenantId === tenantId && l.id === id,
    );
    if (idx === -1) {
      throw new Error(`Location not found: ${id}`);
    }

    const current = this.locations[idx]!;
    const updatedStatus = data.status ?? current.status;
    const updated: StoredLocationRecord = {
      ...current,
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.storageType !== undefined ? { storageType: data.storageType } : {}),
      ...(data.status !== undefined
        ? { status: updatedStatus, isActive: updatedStatus === "ACTIVE" }
        : {}),
      ...(data.zone !== undefined ? { zone: data.zone } : {}),
      ...(data.aisle !== undefined ? { aisle: data.aisle } : {}),
      ...(data.rack !== undefined ? { rack: data.rack } : {}),
      ...(data.level !== undefined ? { level: data.level } : {}),
      ...(data.position !== undefined ? { position: data.position } : {}),
    };

    this.locations[idx] = updated;
    return { ...updated };
  }

  public async findLocationById(
    tenantId: string,
    id: string,
  ): Promise<LocationDTO | null> {
    const found = this.locations.find(
      (l) => l.tenantId === tenantId && l.id === id,
    );
    return found ? { ...found } : null;
  }

  public async findLocationsByBatchId(
    tenantId: string,
    batchId: string,
  ): Promise<LocationDTO[]> {
    return this.locations
      .filter((l) => l.tenantId === tenantId && l.generationBatchId === batchId)
      .map((l) => ({ ...l }));
  }

  public async checkBatchUsage(
    tenantId: string,
    batchId: string,
  ): Promise<BatchUsageCheckResult> {
    const batchLocs = this.locations.filter(
      (l) => l.tenantId === tenantId && l.generationBatchId === batchId,
    );
    if (batchLocs.length === 0) {
      return { inUse: false };
    }

    const batchLocIds = new Set(batchLocs.map((l) => l.id));

    // 1. Verificar saldos de inventario
    const occupiedBalances = this.balances.filter(
      (b) =>
        b.tenantId === tenantId &&
        batchLocIds.has(b.locationId) &&
        (b.onHandQty > 0 || b.allocatedQty > 0),
    );
    if (occupiedBalances.length > 0) {
      return {
        inUse: true,
        reason: `Existen ${occupiedBalances.length} ubicaciones en el lote con stock activo o reservado`,
        occupiedCount: occupiedBalances.length,
      };
    }

    // 2. Verificar transacciones de Ledger
    const batchTxs = this.transactions.filter(
      (tx) => tx.tenantId === tenantId && batchLocIds.has(tx.locationId),
    );
    if (batchTxs.length > 0) {
      return {
        inUse: true,
        reason: `Existen ${batchTxs.length} transacciones históricas en el Ledger vinculadas a este lote`,
        transactionCount: batchTxs.length,
      };
    }

    // 3. Verificar pasos de tareas
    const batchSteps = this.taskSteps.filter(
      (step) => step.tenantId === tenantId && batchLocIds.has(step.locationId),
    );
    if (batchSteps.length > 0) {
      return {
        inUse: true,
        reason: `Existen ${batchSteps.length} pasos de tareas asignados a ubicaciones de este lote`,
        taskStepCount: batchSteps.length,
      };
    }

    return { inUse: false };
  }

  public async deleteLocationsByBatchId(
    tenantId: string,
    batchId: string,
  ): Promise<number> {
    const beforeCount = this.locations.length;
    this.locations = this.locations.filter(
      (l) => !(l.tenantId === tenantId && l.generationBatchId === batchId),
    );
    return beforeCount - this.locations.length;
  }

  // ── Helper interno ──────────────────────────────────────────
  private getBalancesByLocationMap(
    tenantId: string,
    warehouseId: string,
  ): Map<string, { onHand: number; allocated: number; skuCount: number }> {
    const map = new Map<string, { onHand: number; allocated: number; skuCount: number }>();
    const filtered = this.balances.filter(
      (b) => b.tenantId === tenantId && b.warehouseId === warehouseId,
    );

    for (const b of filtered) {
      const current = map.get(b.locationId) ?? { onHand: 0, allocated: 0, skuCount: 0 };
      current.onHand += b.onHandQty;
      current.allocated += b.allocatedQty;
      if (b.onHandQty > 0) current.skuCount++;
      map.set(b.locationId, current);
    }
    return map;
  }
}
