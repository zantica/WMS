// apps/api/src/routes/categories.ts
// Rutas de Fastify para la gestión de categorías del catálogo.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ApiResponse, CategoryDTO } from "@wms/shared-types";
import {
  createCategory,
  listCategories,
  updateCategory,
} from "../use-cases/catalog/manage-categories.js";

const ListCategoriesQuerySchema = z.object({
  includeInactive: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
});

const CreateCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const UpdateCategorySchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/categories — Listar categorías del inquilino
  app.get(
    "/",
    {
      schema: {
        tags: ["Categories"],
        summary: "Listar categorías de producto del tenant",
      },
    },
    async (request): Promise<ApiResponse<CategoryDTO[]>> => {
      const query = ListCategoriesQuerySchema.parse(request.query);
      const categories = await listCategories(
        app.catalogRepository,
        request.tenantId,
        query,
      );

      return {
        success: true,
        data: categories,
      };
    },
  );

  // POST /api/v1/categories — Crear nueva categoría
  app.post(
    "/",
    {
      schema: {
        tags: ["Categories"],
        summary: "Crear una nueva categoría de producto (ADMIN o SUPERVISOR)",
      },
    },
    async (request, reply): Promise<ApiResponse<CategoryDTO>> => {
      const body = CreateCategorySchema.parse(request.body);
      const actorRole = request.userRole ?? "ADMIN";

      const created = await createCategory(
        app.catalogRepository,
        request.tenantId,
        actorRole,
        body,
      );

      return reply.status(201).send({
        success: true,
        data: created,
      });
    },
  );

  // PATCH /api/v1/categories/:id — Modificar categoría existente
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        tags: ["Categories"],
        summary: "Actualizar una categoría (ADMIN o SUPERVISOR)",
      },
    },
    async (request): Promise<ApiResponse<CategoryDTO>> => {
      const body = UpdateCategorySchema.parse(request.body);
      const actorRole = request.userRole ?? "ADMIN";

      const updated = await updateCategory(
        app.catalogRepository,
        request.tenantId,
        actorRole,
        request.params.id,
        body,
      );

      return {
        success: true,
        data: updated,
      };
    },
  );
};
