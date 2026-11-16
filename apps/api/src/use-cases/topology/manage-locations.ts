// apps/api/src/use-cases/topology/manage-locations.ts
// Casos de uso de Dominio para Topología Física, Generador en Bloque y Layout Visual.
// Respeta estrictamente los 6 Invariantes Arquitectónicos de F9.2.

import { randomUUID } from "node:crypto";
import type {
  AisleLayoutDetailDTO,
  CreateLocationInput,
  DeleteLocationBatchResultDTO,
  GenerateLocationBlockInput,
  GenerateLocationBlockResultDTO,
  LocationDTO,
  LocationStatus,
  StorageType,
  UpdateLocationInput,
  WarehouseLayoutSummaryDTO,
} from "@wms/shared-types";
import {
  formatStructuredLocationCode,
  normalizeLocationCode,
  padSegment,
  validateStorageTypeMetadata,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type {
  CreateTopologyLocationParams,
  TopologyRepositoryPort,
} from "../../ports/topology-repository.js";

export class ManageLocationsUseCase {
  constructor(private readonly topologyRepo: TopologyRepositoryPort) {}

  /**
   * Obtiene el árbol macro agregado del almacén (Zonas -> Pasillos con telemetría).
   */
  public async getWarehouseLayoutSummary(
    tenantId: string,
    warehouseId: string,
  ): Promise<WarehouseLayoutSummaryDTO> {
    if (!warehouseId || warehouseId.trim().length === 0) {
      throw new WmsError("VALIDATION_ERROR", "warehouseId es requerido", 400);
    }
    return this.topologyRepo.getWarehouseLayoutSummary(tenantId, warehouseId);
  }

  /**
   * Obtiene la matriz de celdas agrupadas por rack y nivel para un pasillo específico.
   */
  public async getAisleLayoutDetail(
    tenantId: string,
    warehouseId: string,
    aisle: string,
    zone?: string,
  ): Promise<AisleLayoutDetailDTO> {
    if (!warehouseId || warehouseId.trim().length === 0) {
      throw new WmsError("VALIDATION_ERROR", "warehouseId es requerido", 400);
    }
    if (!aisle || aisle.trim().length === 0) {
      throw new WmsError("VALIDATION_ERROR", "aisle es requerido", 400);
    }
    return this.topologyRepo.getAisleLayoutDetail(tenantId, warehouseId, aisle, zone);
  }

  /**
   * Alta individual de una ubicación con normalización obligatoria y matriz de validación por StorageType.
   */
  public async createSingleLocation(
    tenantId: string,
    input: CreateLocationInput,
  ): Promise<LocationDTO> {
    const storageType: StorageType = input.storageType ?? "RACK";
    const status: LocationStatus = input.status ?? "ACTIVE";
    const zone = input.zone && input.zone.trim().length > 0 ? input.zone.trim().toUpperCase() : "MAIN";
    const rack = input.rack && input.rack.trim().length > 0 ? padSegment(input.rack, 2) : "01";
    const level = input.level && input.level.trim().length > 0 ? padSegment(input.level, 2) : "01";
    const position = input.position && input.position.trim().length > 0 ? padSegment(input.position, 2) : "01";
    const aisle = input.aisle && input.aisle.trim().length > 0 ? input.aisle.trim().toUpperCase() : null;

    // Validación según matriz de almacenamiento (Invariante 2)
    const validation = validateStorageTypeMetadata({
      storageType,
      zone,
      aisle,
      rack,
      level,
      position,
    });

    if (!validation.valid) {
      throw new WmsError(
        "INVALID_STORAGE_TOPOLOGY",
        validation.error ?? "Configuración de coordenadas inválida para el tipo de almacenamiento",
        422,
      );
    }

    // Normalización de código (Invariante 1)
    let finalCode: string;
    if (input.code && input.code.trim().length > 0) {
      try {
        finalCode = normalizeLocationCode(input.code);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Código de ubicación inválido";
        throw new WmsError("INVALID_LOCATION_CODE", msg, 400);
      }
    } else {
      finalCode = formatStructuredLocationCode({
        storageType,
        zone,
        aisle,
        rack,
        level,
        position,
      });
    }

    // Verificar colisión
    const existing = await this.topologyRepo.findExistingCodes(tenantId, input.warehouseId, [finalCode]);
    if (existing.length > 0) {
      throw new WmsError(
        "CONFLICT",
        `La ubicación con código '${finalCode}' ya existe en este almacén`,
        409,
      );
    }

    const createParams: CreateTopologyLocationParams = {
      warehouseId: input.warehouseId,
      code: finalCode,
      type: input.type,
      storageType,
      status,
      zone,
      aisle,
      rack,
      level,
      position,
      description: input.description ?? null,
    };

    return this.topologyRepo.createLocation(tenantId, createParams);
  }

  /**
   * Generador estructurado en bloque con dryRun, detección de colisiones, idempotencia y batchId.
   */
  public async generateBlock(
    tenantId: string,
    input: GenerateLocationBlockInput,
  ): Promise<GenerateLocationBlockResultDTO> {
    const {
      warehouseId,
      type,
      storageType,
      zone,
      aisle,
      rackStart,
      rackEnd,
      levelStart,
      levelEnd,
      positionsPerLevel,
      dryRun = false,
    } = input;

    if (!warehouseId || warehouseId.trim().length === 0) {
      throw new WmsError("VALIDATION_ERROR", "warehouseId es requerido", 400);
    }
    if (rackStart < 1 || rackEnd < rackStart) {
      throw new WmsError("VALIDATION_ERROR", "Rango de racks inválido (rackStart debe ser >= 1 y <= rackEnd)", 400);
    }
    if (levelStart < 1 || levelEnd < levelStart) {
      throw new WmsError("VALIDATION_ERROR", "Rango de niveles inválido (levelStart debe ser >= 1 y <= levelEnd)", 400);
    }
    if (positionsPerLevel < 1 || positionsPerLevel > 500) {
      throw new WmsError("VALIDATION_ERROR", "positionsPerLevel debe estar entre 1 y 500", 400);
    }

    // Invariante 2: Validación por StorageType
    if (storageType === "FLOOR") {
      if (levelStart !== 1 || levelEnd !== 1) {
        throw new WmsError(
          "INVALID_STORAGE_TOPOLOGY",
          `El tipo de almacenamiento FLOOR solo admite nivel '01' (se solicitó nivel ${levelStart}..${levelEnd})`,
          422,
        );
      }
    } else {
      // RACK y SHELVING exigen pasillo
      if (!aisle || aisle.trim().length === 0) {
        throw new WmsError(
          "INVALID_STORAGE_TOPOLOGY",
          `El tipo de almacenamiento ${storageType} requiere indicar el pasillo ('aisle')`,
          422,
        );
      }
    }

    const cleanZone = zone && zone.trim().length > 0 ? zone.trim().toUpperCase() : "MAIN";
    const cleanAisle = aisle && aisle.trim().length > 0 ? aisle.trim().toUpperCase() : null;

    // Generar todas las combinaciones con zero-padding (Invariante 1)
    const generatedItems: Array<{
      code: string;
      rack: string;
      level: string;
      position: string;
    }> = [];

    for (let r = rackStart; r <= rackEnd; r++) {
      const rackStr = padSegment(r, 2);
      for (let l = levelStart; l <= levelEnd; l++) {
        const levelStr = padSegment(l, 2);
        for (let p = 1; p <= positionsPerLevel; p++) {
          const posStr = padSegment(p, 2);
          const code = formatStructuredLocationCode({
            storageType,
            zone: cleanZone,
            aisle: cleanAisle,
            rack: rackStr,
            level: levelStr,
            position: posStr,
          });
          generatedItems.push({
            code,
            rack: rackStr,
            level: levelStr,
            position: posStr,
          });
        }
      }
    }

    const allCodes = generatedItems.map((g) => g.code);
    const collisions = await this.topologyRepo.findExistingCodes(tenantId, warehouseId, allCodes);
    const collisionSet = new Set(collisions);
    const nonColliding = generatedItems.filter((g) => !collisionSet.has(g.code));

    if (dryRun) {
      // Modo dryRun: NO escribe en BD
      const previewLocations: LocationDTO[] = generatedItems.map((g) => ({
        id: `dry_${g.code}`,
        warehouseId,
        code: g.code,
        type,
        storageType,
        status: "ACTIVE",
        zone: cleanZone,
        aisle: cleanAisle,
        rack: g.rack,
        level: g.level,
        position: g.position,
        generationBatchId: null,
        description: `Autogenerada ${cleanZone} ${cleanAisle ?? ""} R${g.rack}-L${g.level}-P${g.position}`.trim(),
        isActive: true,
      }));

      return {
        dryRun: true,
        batchId: null,
        totalGenerated: allCodes.length,
        createdCount: nonColliding.length,
        skippedCollisionsCount: collisions.length,
        collisions,
        creatableCount: nonColliding.length,
        locations: previewLocations,
      };
    }

    // Modo commit: Crear en lote con generationBatchId
    const batchId = `batch_${Date.now()}_${randomUUID().replace(/-/g, "").substring(0, 8)}`;
    const createPayload: CreateTopologyLocationParams[] = nonColliding.map((item) => ({
      warehouseId,
      code: item.code,
      type,
      storageType,
      status: "ACTIVE",
      zone: cleanZone,
      aisle: cleanAisle,
      rack: item.rack,
      level: item.level,
      position: item.position,
      generationBatchId: batchId,
      description: `Lote ${batchId} — ${cleanZone} ${cleanAisle ?? ""} R${item.rack}-L${item.level}-P${item.position}`.trim(),
    }));

    const created = await this.topologyRepo.createLocationBlock(tenantId, createPayload);

    return {
      dryRun: false,
      batchId,
      totalGenerated: allCodes.length,
      createdCount: created.length,
      skippedCollisionsCount: collisions.length,
      collisions,
      creatableCount: nonColliding.length,
      locations: created,
    };
  }

  /**
   * Deshace/elimina un lote de generación completo siempre que ninguna ubicación tenga stock ni movimientos.
   */
  public async deleteBatch(
    tenantId: string,
    batchId: string,
  ): Promise<DeleteLocationBatchResultDTO> {
    if (!batchId || batchId.trim().length === 0) {
      throw new WmsError("VALIDATION_ERROR", "batchId es requerido", 400);
    }

    const batchLocations = await this.topologyRepo.findLocationsByBatchId(tenantId, batchId);
    if (batchLocations.length === 0) {
      throw new WmsError(
        "LOCATION_NOT_FOUND",
        `No se encontraron ubicaciones pertenecientes al lote '${batchId}'`,
        404,
      );
    }

    const usage = await this.topologyRepo.checkBatchUsage(tenantId, batchId);
    if (usage.inUse) {
      throw new WmsError(
        "LOCATION_BATCH_IN_USE",
        usage.reason ?? "No se puede eliminar el lote porque contiene ubicaciones con stock o movimientos históricos en el Ledger",
        409,
      );
    }

    const deletedCount = await this.topologyRepo.deleteLocationsByBatchId(tenantId, batchId);

    return {
      batchId,
      deletedCount,
    };
  }

  /**
   * Actualiza el estado o atributos de una ubicación.
   */
  public async updateLocation(
    tenantId: string,
    id: string,
    data: UpdateLocationInput,
  ): Promise<LocationDTO> {
    const existing = await this.topologyRepo.findLocationById(tenantId, id);
    if (!existing) {
      throw new WmsError("LOCATION_NOT_FOUND", `Ubicación con ID '${id}' no encontrada`, 404);
    }

    // Validar cambio a FLOOR si se envía nivel > 1
    const targetStorage = data.storageType ?? existing.storageType;
    const targetLevel = data.level ?? existing.level;
    if (targetStorage === "FLOOR" && targetLevel !== "01") {
      throw new WmsError(
        "INVALID_STORAGE_TOPOLOGY",
        `Las ubicaciones de tipo FLOOR solo admiten nivel '01' (se especificó '${targetLevel}')`,
        422,
      );
    }

    return this.topologyRepo.updateLocation(tenantId, id, data);
  }
}
