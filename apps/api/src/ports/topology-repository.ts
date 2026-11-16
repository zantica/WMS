// apps/api/src/ports/topology-repository.ts
// Puerto hexagonal para la persistencia, agregación de layout y gestión física de topología.
// Totalmente desacoplado de Prisma y Fastify.

import type {
  AisleLayoutDetailDTO,
  CreateLocationInput,
  LocationDTO,
  StorageType,
  LocationStatus,
  UpdateLocationInput,
  WarehouseLayoutSummaryDTO,
} from "@wms/shared-types";

export interface CreateTopologyLocationParams extends CreateLocationInput {
  code: string;
  storageType: StorageType;
  status: LocationStatus;
  zone: string;
  aisle: string | null;
  rack: string;
  level: string;
  position: string;
  generationBatchId?: string | null;
}

export interface BatchUsageCheckResult {
  inUse: boolean;
  reason?: string;
  occupiedCount?: number;
  transactionCount?: number;
  taskStepCount?: number;
}

export interface TopologyRepositoryPort {
  /**
   * Obtiene el árbol agregado macro del almacén (Zonas -> Pasillos con telemetría de ocupación y saldos).
   */
  getWarehouseLayoutSummary(
    tenantId: string,
    warehouseId: string,
  ): Promise<WarehouseLayoutSummaryDTO>;

  /**
   * Obtiene la matriz detallada de celdas agrupadas por rack y niveles para un pasillo específico.
   * Soporta SPECIAL_FLOOR_AISLE ("__FLOOR__") para ubicaciones en suelo sin pasillo.
   */
  getAisleLayoutDetail(
    tenantId: string,
    warehouseId: string,
    aisle: string,
    zone?: string,
  ): Promise<AisleLayoutDetailDTO>;

  /**
   * Retorna la lista de códigos que ya existen en el almacén para detectar colisiones en dryRun.
   */
  findExistingCodes(
    tenantId: string,
    warehouseId: string,
    codes: string[],
  ): Promise<string[]>;

  /**
   * Inserta un bloque de ubicaciones de manera idempotente (ignora colisiones ya existentes).
   */
  createLocationBlock(
    tenantId: string,
    locations: CreateTopologyLocationParams[],
  ): Promise<LocationDTO[]>;

  /**
   * Crea una ubicación individual con coordenadas estructuradas.
   */
  createLocation(
    tenantId: string,
    data: CreateTopologyLocationParams,
  ): Promise<LocationDTO>;

  /**
   * Actualiza parcialmente una ubicación (status, storageType, descripción, etc.).
   */
  updateLocation(
    tenantId: string,
    id: string,
    data: UpdateLocationInput,
  ): Promise<LocationDTO>;

  /**
   * Busca una ubicación por ID dentro del tenant.
   */
  findLocationById(
    tenantId: string,
    id: string,
  ): Promise<LocationDTO | null>;

  /**
   * Busca ubicaciones asociadas a un lote de generación específico.
   */
  findLocationsByBatchId(
    tenantId: string,
    batchId: string,
  ): Promise<LocationDTO[]>;

  /**
   * Comprueba si alguna ubicación del lote tiene stock activo, transacciones en el Ledger o tareas asignadas.
   */
  checkBatchUsage(
    tenantId: string,
    batchId: string,
  ): Promise<BatchUsageCheckResult>;

  /**
   * Elimina todas las ubicaciones asociadas al lote (rollback).
   */
  deleteLocationsByBatchId(
    tenantId: string,
    batchId: string,
  ): Promise<number>;
}
