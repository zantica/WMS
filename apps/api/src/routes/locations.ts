// apps/api/src/routes/locations.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@wms/db";
import { WmsError } from "../plugins/error-handler.js";
import type {
  AisleLayoutDetailDTO,
  ApiResponse,
  DeleteLocationBatchResultDTO,
  GenerateLocationBlockResultDTO,
  LocationDTO,
  LocationStatus,
  StorageType,
  WarehouseLayoutSummaryDTO,
} from "@wms/shared-types";
import { ManageLocationsUseCase } from "../use-cases/topology/manage-locations.js";

const CreateLocationSchema = z.object({
  warehouseId: z.string().min(1),
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9\-_]+$/, {
      message: "Location code must be alphanumeric with hyphens/underscores",
    })
    .optional(),
  type: z.enum(["RECEIVING", "STORAGE", "PACKING", "DISPATCH"]),
  storageType: z.enum(["RACK", "SHELVING", "FLOOR"]).optional(),
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  zone: z.string().max(50).optional(),
  aisle: z.string().max(50).nullable().optional(),
  rack: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  position: z.string().max(50).optional(),
  description: z.string().max(255).nullable().optional(),
});

const UpdateLocationSchema = z.object({
  status: z.enum(["ACTIVE", "BLOCKED"]).optional(),
  storageType: z.enum(["RACK", "SHELVING", "FLOOR"]).optional(),
  description: z.string().max(255).nullable().optional(),
  zone: z.string().max(50).optional(),
  aisle: z.string().max(50).nullable().optional(),
  rack: z.string().max(50).optional(),
  level: z.string().max(50).optional(),
  position: z.string().max(50).optional(),
});

const GenerateBlockSchema = z.object({
  warehouseId: z.string().min(1),
  type: z.enum(["RECEIVING", "STORAGE", "PACKING", "DISPATCH"]),
  storageType: z.enum(["RACK", "SHELVING", "FLOOR"]),
  zone: z.string().min(1).max(50),
  aisle: z.string().max(50).nullable().optional(),
  rackStart: z.number().int().min(1).max(999),
  rackEnd: z.number().int().min(1).max(999),
  levelStart: z.number().int().min(1).max(999),
  levelEnd: z.number().int().min(1).max(999),
  positionsPerLevel: z.number().int().min(1).max(500),
  dryRun: z.boolean().optional(),
});

export const locationRoutes: FastifyPluginAsync = async (app) => {
  const topologyUseCase = new ManageLocationsUseCase(app.topologyRepository);

  // ── GET /api/v1/locations/layout/:warehouseId (Layout Macro) ───────
  app.get<{ Params: { warehouseId: string } }>(
    "/layout/:warehouseId",
    {
      schema: {
        tags: ["Locations"],
        summary: "Obtener árbol agregado macro del almacén (Zonas -> Pasillos con telemetría de ocupación)",
      },
    },
    async (request): Promise<ApiResponse<WarehouseLayoutSummaryDTO>> => {
      const { warehouseId } = request.params;
      const data = await topologyUseCase.getWarehouseLayoutSummary(request.tenantId, warehouseId);
      return { success: true, data };
    },
  );

  // ── GET /api/v1/locations/layout/:warehouseId/aisles/:aisle (Detalle de Pasillo) ──
  app.get<{
    Params: { warehouseId: string; aisle: string };
    Querystring: { zone?: string };
  }>(
    "/layout/:warehouseId/aisles/:aisle",
    {
      schema: {
        tags: ["Locations"],
        summary: "Obtener matriz detallada de celdas por rack y niveles para un pasillo",
      },
    },
    async (request): Promise<ApiResponse<AisleLayoutDetailDTO>> => {
      const { warehouseId, aisle } = request.params;
      const { zone } = request.query;
      const data = await topologyUseCase.getAisleLayoutDetail(
        request.tenantId,
        warehouseId,
        aisle,
        zone,
      );
      return { success: true, data };
    },
  );

  // ── POST /api/v1/locations/generate-block (Generador Estructurado) ──
  app.post(
    "/generate-block",
    {
      schema: {
        tags: ["Locations"],
        summary: "Generar bloque de ubicaciones con dryRun, detección de colisiones y rollback por lote",
      },
    },
    async (request, reply): Promise<ApiResponse<GenerateLocationBlockResultDTO>> => {
      const body = GenerateBlockSchema.parse(request.body);

      // Verificar que el almacén pertenece al tenant
      const warehouse = await prisma.warehouse.findFirst({
        where: { id: body.warehouseId, tenantId: request.tenantId },
      });
      if (!warehouse) {
        throw new WmsError("LOCATION_NOT_FOUND", "Warehouse not found", 404);
      }

      const result = await topologyUseCase.generateBlock(request.tenantId, body);
      return reply.status(body.dryRun ? 200 : 201).send({
        success: true,
        data: result,
      });
    },
  );

  // ── DELETE /api/v1/locations/batches/:batchId (Rollback de Lote) ────
  app.delete<{ Params: { batchId: string } }>(
    "/batches/:batchId",
    {
      schema: {
        tags: ["Locations"],
        summary: "Eliminar / deshacer un lote completo de ubicaciones si no tiene stock ni movimientos",
      },
    },
    async (request): Promise<ApiResponse<DeleteLocationBatchResultDTO>> => {
      const { batchId } = request.params;
      const result = await topologyUseCase.deleteBatch(request.tenantId, batchId);
      return {
        success: true,
        data: result,
      };
    },
  );

  // ── PATCH /api/v1/locations/:id (Actualizar Ubicación) ──────────────
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        tags: ["Locations"],
        summary: "Actualizar parcialmente una ubicación (estado, tipo, etc.)",
      },
    },
    async (request): Promise<ApiResponse<LocationDTO>> => {
      const { id } = request.params;
      const body = UpdateLocationSchema.parse(request.body);
      const updated = await topologyUseCase.updateLocation(request.tenantId, id, body);
      return {
        success: true,
        data: updated,
      };
    },
  );

  // ── GET /api/v1/locations (Listado de Ubicaciones) ─────────────────
  app.get<{
    Querystring: {
      warehouseId?: string;
      type?: string;
      zone?: string;
      aisle?: string;
      storageType?: string;
      status?: string;
    };
  }>(
    "/",
    {
      schema: {
        tags: ["Locations"],
        summary: "Listar ubicaciones del almacén",
      },
    },
    async (request): Promise<ApiResponse<LocationDTO[]>> => {
      const { warehouseId, type, zone, aisle, storageType, status } = request.query;

      const locations = await prisma.location.findMany({
        where: {
          tenantId: request.tenantId,
          ...(warehouseId ? { warehouseId } : {}),
          ...(type ? { type: type as LocationDTO["type"] } : {}),
          ...(zone ? { zone } : {}),
          ...(aisle ? { aisle } : {}),
          ...(storageType ? { storageType: storageType as StorageType } : {}),
          ...(status ? { status: status as LocationStatus } : {}),
        },
        orderBy: { code: "asc" },
      });

      return {
        success: true,
        data: locations.map((l) => ({
          id: l.id,
          warehouseId: l.warehouseId,
          code: l.code,
          type: l.type,
          storageType: l.storageType as StorageType,
          status: l.status as LocationStatus,
          zone: l.zone,
          aisle: l.aisle,
          rack: l.rack,
          level: l.level,
          position: l.position,
          generationBatchId: l.generationBatchId,
          description: l.description,
          isActive: l.isActive,
          createdAt: l.createdAt.toISOString(),
        })),
      };
    },
  );

  // ── POST /api/v1/locations (Alta Individual) ───────────────────────
  app.post(
    "/",
    {
      schema: {
        tags: ["Locations"],
        summary: "Crear una nueva ubicación estructurada",
      },
    },
    async (request, reply): Promise<ApiResponse<LocationDTO>> => {
      const body = CreateLocationSchema.parse(request.body);

      // Verificar que el warehouse pertenece al tenant
      const warehouse = await prisma.warehouse.findFirst({
        where: { id: body.warehouseId, tenantId: request.tenantId },
      });
      if (!warehouse) {
        throw new WmsError("LOCATION_NOT_FOUND", "Warehouse not found", 404);
      }

      const location = await topologyUseCase.createSingleLocation(request.tenantId, body);

      return reply.status(201).send({
        success: true,
        data: location,
      });
    },
  );

  // ── POST /api/v1/locations/bulk (Compatibilidad hacia atrás) ──────
  app.post<{ Body: { warehouseId: string; prefix: string; type: string; count: number } }>(
    "/bulk",
    {
      schema: {
        tags: ["Locations"],
        summary: "Crear múltiples ubicaciones en bloque (compatibilidad legacy)",
      },
    },
    async (request, reply) => {
      const { warehouseId, prefix, type, count } = z
        .object({
          warehouseId: z.string().min(1),
          prefix: z.string().min(1).max(10),
          type: z.enum(["RECEIVING", "STORAGE", "PACKING", "DISPATCH"]),
          count: z.number().int().min(1).max(500),
        })
        .parse(request.body);

      const warehouse = await prisma.warehouse.findFirst({
        where: { id: warehouseId, tenantId: request.tenantId },
      });
      if (!warehouse) {
        throw new WmsError("LOCATION_NOT_FOUND", "Warehouse not found", 404);
      }

      const codes = Array.from({ length: count }, (_, i) =>
        `${prefix}-${String(i + 1).padStart(2, "0")}`,
      );

      await prisma.location.createMany({
        data: codes.map((code, idx) => ({
          tenantId: request.tenantId,
          warehouseId,
          code,
          type: type as LocationDTO["type"],
          storageType: "RACK" as StorageType,
          status: "ACTIVE" as LocationStatus,
          zone: "MAIN",
          aisle: prefix.toUpperCase(),
          rack: "01",
          level: "01",
          position: String(idx + 1).padStart(2, "0"),
          isActive: true,
        })),
        skipDuplicates: true,
      });

      return reply.status(201).send({
        success: true,
        data: { created: count, prefix, type },
      });
    },
  );
};
