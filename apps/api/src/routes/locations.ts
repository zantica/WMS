// apps/api/src/routes/locations.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@wms/db";
import { WmsError } from "../plugins/error-handler.js";
import type { ApiResponse, LocationDTO } from "@wms/shared-types";

const CreateLocationSchema = z.object({
  warehouseId: z.string().cuid(),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9\-_]+$/, {
    message: "Location code must be uppercase alphanumeric with hyphens/underscores",
  }),
  type: z.enum(["RECEIVING", "STORAGE", "PACKING", "DISPATCH"]),
  description: z.string().max(255).optional(),
});

export const locationRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/locations
  app.get<{ Querystring: { warehouseId?: string; type?: string } }>(
    "/",
    {
      schema: {
        tags: ["Locations"],
        summary: "Listar ubicaciones del almacén",
      },
    },
    async (request): Promise<ApiResponse<LocationDTO[]>> => {
      const { warehouseId, type } = request.query;

      const locations = await prisma.location.findMany({
        where: {
          tenantId: request.tenantId,
          isActive: true,
          ...(warehouseId ? { warehouseId } : {}),
          ...(type ? { type: type as "RECEIVING" | "STORAGE" | "PACKING" | "DISPATCH" } : {}),
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
          description: l.description,
        })),
      };
    },
  );

  // POST /api/v1/locations
  app.post(
    "/",
    {
      schema: {
        tags: ["Locations"],
        summary: "Crear una nueva ubicación",
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

    const location = await prisma.location.create({
      data: { ...body, tenantId: request.tenantId },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: location.id,
        warehouseId: location.warehouseId,
        code: location.code,
        type: location.type,
        description: location.description,
      },
    });
  });

  // POST /api/v1/locations/bulk — Crear múltiples ubicaciones de una vez
  // Útil para generar A-01 a A-50 de golpe
  app.post<{ Body: { warehouseId: string; prefix: string; type: string; count: number } }>(
    "/bulk",
    {
      schema: {
        tags: ["Locations"],
        summary: "Crear múltiples ubicaciones en bloque",
      },
    },
    async (request, reply) => {
      const { warehouseId, prefix, type, count } = z
        .object({
          warehouseId: z.string().cuid(),
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

      // Ignorar duplicados silenciosamente (skipDuplicates)
      await prisma.location.createMany({
        data: codes.map((code) => ({
          tenantId: request.tenantId,
          warehouseId,
          code,
          type: type as "RECEIVING" | "STORAGE" | "PACKING" | "DISPATCH",
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
