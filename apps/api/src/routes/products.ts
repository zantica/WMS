// apps/api/src/routes/products.ts
// Rutas de Fastify para el maestro de productos del catálogo WMS.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ApiResponse, PaginationMetaDTO, ProductDTO } from "@wms/shared-types";
import {
  createProduct,
  getProductById,
  searchProducts,
  updateProduct,
} from "../use-cases/catalog/manage-products.js";

const ListProductsQuerySchema = z.object({
  sku: z.string().optional(),
  q: z.string().optional(),
  barcode: z.string().optional(),
  categoryId: z.string().optional(),
  includeInactive: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

const CreateProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  barcode: z.string().max(50).optional(),
  description: z.string().max(1000).optional(),
  categoryId: z.string().nullable().optional(),
  weightGrams: z.number().int().positive().optional(),
  widthCm: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  depthCm: z.number().positive().optional(),
  imageUrl: z.string().max(1000).optional(),
});

const UpdateProductSchema = z.object({
  sku: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(255).optional(),
  barcode: z.string().max(50).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  weightGrams: z.number().int().positive().nullable().optional(),
  widthCm: z.number().positive().nullable().optional(),
  heightCm: z.number().positive().nullable().optional(),
  depthCm: z.number().positive().nullable().optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
  isActive: z.boolean().optional(),
});

interface ProductsListResponse extends ApiResponse<ProductDTO[]> {
  pagination?: PaginationMetaDTO;
}

export const productRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/products — Buscar y listar productos del catálogo
  app.get(
    "/",
    {
      schema: {
        tags: ["Products"],
        summary: "Buscar y listar productos del catálogo con filtros y paginación",
      },
    },
    async (request): Promise<ProductsListResponse> => {
      const filters = ListProductsQuerySchema.parse(request.query);
      const result = await searchProducts(
        app.catalogRepository,
        request.tenantId,
        filters,
      );

      return {
        success: true,
        data: result.items,
        pagination: result.pagination,
      };
    },
  );

  // GET /api/v1/products/:id — Obtener detalle de un producto
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        tags: ["Products"],
        summary: "Obtener detalle de un producto por ID",
      },
    },
    async (request): Promise<ApiResponse<ProductDTO>> => {
      const product = await getProductById(
        app.catalogRepository,
        request.tenantId,
        request.params.id,
      );

      return {
        success: true,
        data: product,
      };
    },
  );

  // POST /api/v1/products — Crear nuevo producto en el catálogo
  app.post(
    "/",
    {
      schema: {
        tags: ["Products"],
        summary: "Crear un nuevo producto en el catálogo",
      },
    },
    async (request, reply): Promise<ApiResponse<ProductDTO>> => {
      const body = CreateProductSchema.parse(request.body);
      const created = await createProduct(
        app.catalogRepository,
        request.tenantId,
        body,
      );

      return reply.status(201).send({
        success: true,
        data: created,
      });
    },
  );

  // PATCH /api/v1/products/:id — Actualización parcial de producto
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        tags: ["Products"],
        summary: "Actualizar parcialmente un producto",
      },
    },
    async (request): Promise<ApiResponse<ProductDTO>> => {
      const body = UpdateProductSchema.parse(request.body);
      const updated = await updateProduct(
        app.catalogRepository,
        request.tenantId,
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
