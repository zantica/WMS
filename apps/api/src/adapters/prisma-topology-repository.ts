// apps/api/src/adapters/prisma-topology-repository.ts
// Adaptador de producción con Prisma ORM e índices optimizados para Layout y Topología.

import { prisma } from "@wms/db";
import type {
  AisleLayoutDetailDTO,
  AisleLayoutSummaryDTO,
  LocationCellDTO,
  LocationDTO,
  RackLayoutGroupDTO,
  StorageType,
  LocationStatus,
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

function toLocationDTO(loc: {
  id: string;
  warehouseId: string;
  code: string;
  type: string;
  storageType: string;
  status: string;
  zone: string;
  aisle: string | null;
  rack: string;
  level: string;
  position: string;
  generationBatchId: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
}): LocationDTO {
  return {
    id: loc.id,
    warehouseId: loc.warehouseId,
    code: loc.code,
    type: loc.type as LocationDTO["type"],
    storageType: loc.storageType as StorageType,
    status: loc.status as LocationStatus,
    zone: loc.zone,
    aisle: loc.aisle,
    rack: loc.rack,
    level: loc.level,
    position: loc.position,
    generationBatchId: loc.generationBatchId,
    description: loc.description,
    isActive: loc.isActive,
    createdAt: loc.createdAt.toISOString(),
  };
}

export class PrismaTopologyRepository implements TopologyRepositoryPort {
  public async getWarehouseLayoutSummary(
    tenantId: string,
    warehouseId: string,
  ): Promise<WarehouseLayoutSummaryDTO> {
    const locations = await prisma.location.findMany({
      where: {
        tenantId,
        warehouseId,
      },
      include: {
        balances: true,
      },
      orderBy: { code: "asc" },
    });

    // Agrupar por zona
    const zoneMap = new Map<string, typeof locations>();
    for (const loc of locations) {
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
      const aisleMap = new Map<string, typeof zoneLocs>();
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
          const locOnHand = loc.balances.reduce((sum, b) => sum + Number(b.onHandQty), 0);
          const locAllocated = loc.balances.reduce((sum, b) => sum + Number(b.allocatedQty), 0);
          onHand += locOnHand;
          allocated += locAllocated;
          if (locOnHand > 0) occupied++;
        }

        const occupancyRate =
          active === 0 ? 0 : Math.round((occupied / active) * 100);
        const atp = calculateAtp(onHand, allocated);

        aisleSummaries.push({
          zone: zoneName,
          aisle: aisleKey,
          storageType: (aisleLocs[0]?.storageType as StorageType) ?? "RACK",
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

    const locations = await prisma.location.findMany({
      where: {
        tenantId,
        warehouseId,
        ...(zone ? { zone } : {}),
        ...(isSpecialFloor
          ? { storageType: "FLOOR", OR: [{ aisle: null }, { aisle: SPECIAL_FLOOR_AISLE }] }
          : { aisle }),
      },
      include: {
        balances: true,
      },
      orderBy: { code: "asc" },
    });

    // Agrupar por rack
    const rackMap = new Map<string, typeof locations>();
    for (const loc of locations) {
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
      const storageType = (rackLocs[0]?.storageType as StorageType) ?? "RACK";
      const total = rackLocs.length;
      let occupied = 0;
      let blocked = 0;
      let rackOnHand = 0;
      let rackAllocated = 0;

      const levelMap = new Map<string, LocationCellDTO[]>();

      for (const loc of rackLocs) {
        if (loc.status === "BLOCKED") blocked++;
        const locOnHand = loc.balances.reduce((sum, b) => sum + Number(b.onHandQty), 0);
        const locAllocated = loc.balances.reduce((sum, b) => sum + Number(b.allocatedQty), 0);
        if (locOnHand > 0) occupied++;

        rackOnHand += locOnHand;
        rackAllocated += locAllocated;

        const cell: LocationCellDTO = {
          id: loc.id,
          code: loc.code,
          zone: loc.zone,
          aisle: loc.aisle,
          rack: loc.rack,
          level: loc.level,
          position: loc.position,
          storageType: loc.storageType as StorageType,
          type: loc.type as LocationCellDTO["type"],
          status: loc.status as LocationStatus,
          onHandQty: locOnHand,
          allocatedQty: locAllocated,
          atpQty: calculateAtp(locOnHand, locAllocated),
          skuCount: loc.balances.filter((b) => Number(b.onHandQty) > 0).length,
        };

        const lvlKey = loc.level || "01";
        if (!levelMap.has(lvlKey)) levelMap.set(lvlKey, []);
        levelMap.get(lvlKey)!.push(cell);
      }

      // Ordenar niveles: RACK/SHELVING de mayor a menor (alzado frontal), FLOOR de menor a mayor
      const levelsArray = Array.from(levelMap.entries()).map(([lvl, positions]) => {
        positions.sort((a, b) => a.position.localeCompare(b.position));
        return { level: lvl, positions };
      });

      if (storageType === "FLOOR") {
        levelsArray.sort((a, b) => a.level.localeCompare(b.level));
      } else {
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
      zone: zone ?? (locations[0]?.zone || "MAIN"),
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
    if (codes.length === 0) return [];

    const existing = await prisma.location.findMany({
      where: {
        tenantId,
        warehouseId,
        code: { in: codes },
      },
      select: { code: true },
    });

    return existing.map((e) => e.code);
  }

  public async createLocationBlock(
    tenantId: string,
    locations: CreateTopologyLocationParams[],
  ): Promise<LocationDTO[]> {
    if (locations.length === 0) return [];

    return prisma.$transaction(async (tx) => {
      // Usar skipDuplicates para garantizar idempotencia estricta
      await tx.location.createMany({
        data: locations.map((loc) => ({
          tenantId,
          warehouseId: loc.warehouseId,
          code: loc.code,
          type: loc.type,
          storageType: loc.storageType,
          status: loc.status,
          zone: loc.zone,
          aisle: loc.aisle,
          rack: loc.rack,
          level: loc.level,
          position: loc.position,
          generationBatchId: loc.generationBatchId,
          description: loc.description,
          isActive: loc.status === "ACTIVE",
        })),
        skipDuplicates: true,
      });

      const warehouseId = locations[0]!.warehouseId;
      const codes = locations.map((l) => l.code);

      const created = await tx.location.findMany({
        where: {
          tenantId,
          warehouseId,
          code: { in: codes },
        },
      });

      return created.map(toLocationDTO);
    });
  }

  public async createLocation(
    tenantId: string,
    params: CreateTopologyLocationParams,
  ): Promise<LocationDTO> {
    const loc = await prisma.location.create({
      data: {
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
        generationBatchId: params.generationBatchId,
        description: params.description,
        isActive: params.status === "ACTIVE",
      },
    });

    return toLocationDTO(loc);
  }

  public async updateLocation(
    tenantId: string,
    id: string,
    data: UpdateLocationInput,
  ): Promise<LocationDTO> {
    const existing = await prisma.location.findFirst({
      where: { id, tenantId },
    });
    if (!existing) {
      throw new Error(`Location not found: ${id}`);
    }

    const updatedStatus = data.status ?? existing.status;
    const updated = await prisma.location.update({
      where: { id },
      data: {
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
      },
    });

    return toLocationDTO(updated);
  }

  public async findLocationById(
    tenantId: string,
    id: string,
  ): Promise<LocationDTO | null> {
    const loc = await prisma.location.findFirst({
      where: { id, tenantId },
    });
    return loc ? toLocationDTO(loc) : null;
  }

  public async findLocationsByBatchId(
    tenantId: string,
    batchId: string,
  ): Promise<LocationDTO[]> {
    const locs = await prisma.location.findMany({
      where: {
        tenantId,
        generationBatchId: batchId,
      },
      orderBy: { code: "asc" },
    });
    return locs.map(toLocationDTO);
  }

  public async checkBatchUsage(
    tenantId: string,
    batchId: string,
  ): Promise<BatchUsageCheckResult> {
    const [occupiedBalances, txs, steps] = await Promise.all([
      prisma.inventoryBalance.count({
        where: {
          tenantId,
          location: { generationBatchId: batchId },
          OR: [{ onHandQty: { gt: 0 } }, { allocatedQty: { gt: 0 } }],
        },
      }),
      prisma.inventoryTransaction.count({
        where: {
          tenantId,
          OR: [
            { fromLocation: { generationBatchId: batchId } },
            { toLocation: { generationBatchId: batchId } },
          ],
        },
      }),
      prisma.taskStep.count({
        where: {
          task: { tenantId },
          location: { generationBatchId: batchId },
        },
      }),
    ]);

    if (occupiedBalances > 0) {
      return {
        inUse: true,
        reason: `Existen ${occupiedBalances} ubicaciones en el lote con stock activo o reservado`,
        occupiedCount: occupiedBalances,
      };
    }

    if (txs > 0) {
      return {
        inUse: true,
        reason: `Existen ${txs} transacciones del Ledger asociadas a ubicaciones de este lote`,
        transactionCount: txs,
      };
    }

    if (steps > 0) {
      return {
        inUse: true,
        reason: `Existen ${steps} pasos de tarea asignados a ubicaciones de este lote`,
        taskStepCount: steps,
      };
    }

    return { inUse: false };
  }

  public async deleteLocationsByBatchId(
    tenantId: string,
    batchId: string,
  ): Promise<number> {
    const result = await prisma.location.deleteMany({
      where: {
        tenantId,
        generationBatchId: batchId,
      },
    });
    return result.count;
  }
}
