// apps/api/src/routes/products.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@wms/db";
import { WmsError } from "../plugins/error-handler.js";
import type { ApiResponse, ProductDTO } from "@wms/shared-types";

const CreateProductSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  barcode: z.string().max(50).optional(),
  description: z.string().max(1000).optional(),
  weightGrams: z.number().int().positive().optional(),
  widthCm: z.number().positive().optional(),
  heightCm: z.number().positive().optional(),
  depthCm: z.number().positive().optional(),
});

export const productRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/products — Listar todos los productos del tenant
  app.get(
    "/",
    {
      schema: {
        tags: ["Products"],
        summary: "Listar todos los productos del catálogo",
      },
    },
    async (request): Promise<ApiResponse<ProductDTO[]>> => {
    const products = await prisma.product.findMany({
      where: { tenantId: request.tenantId, isActive: true },
      orderBy: { sku: "asc" },
    });

    return {
      success: true,
      data: products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        barcode: p.barcode,
        description: p.description,
        weightGrams: p.weightGrams,
        imageUrl: p.imageUrl,
        isActive: p.isActive,
      })),
    };
  });

  // GET /api/v1/products/:id
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        tags: ["Products"],
        summary: "Obtener detalle de un producto por ID",
      },
    },
    async (request): Promise<ApiResponse<ProductDTO>> => {
      const product = await prisma.product.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
      });

      if (!product) {
        throw new WmsError("PRODUCT_NOT_FOUND", `Product ${request.params.id} not found`, 404);
      }

      return {
        success: true,
        data: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          barcode: product.barcode,
          description: product.description,
          weightGrams: product.weightGrams,
          imageUrl: product.imageUrl,
          isActive: product.isActive,
        },
      };
    },
  );

  // POST /api/v1/products — Crear producto
  app.post(
    "/",
    {
      schema: {
        tags: ["Products"],
        summary: "Crear un nuevo producto",
      },
    },
    async (request, reply): Promise<ApiResponse<ProductDTO>> => {
    const body = CreateProductSchema.parse(request.body);

    const existing = await prisma.product.findFirst({
      where: {
        tenantId: request.tenantId,
        OR: [
          { sku: body.sku },
          ...(body.barcode ? [{ barcode: body.barcode }] : []),
        ],
      },
    });

    if (existing) {
      throw new WmsError(
        "VALIDATION_ERROR",
        `A product with SKU "${body.sku}"${body.barcode ? ` or barcode "${body.barcode}"` : ""} already exists`,
        409,
      );
    }

    const product = await prisma.product.create({
      data: { ...body, tenantId: request.tenantId },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        barcode: product.barcode,
        description: product.description,
        weightGrams: product.weightGrams,
        imageUrl: product.imageUrl,
        isActive: product.isActive,
      },
    });
  });

  // PATCH /api/v1/products/:id — Actualización parcial
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        tags: ["Products"],
        summary: "Actualizar parcialmente un producto",
      },
    },
    async (request): Promise<ApiResponse<ProductDTO>> => {
      const body = CreateProductSchema.partial().parse(request.body);

      const product = await prisma.product.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
      });

      if (!product) {
        throw new WmsError("PRODUCT_NOT_FOUND", `Product ${request.params.id} not found`, 404);
      }

      const updated = await prisma.product.update({
        where: { id: product.id },
        data: body,
      });

      return {
        success: true,
        data: {
          id: updated.id,
          sku: updated.sku,
          name: updated.name,
          barcode: updated.barcode,
          description: updated.description,
          weightGrams: updated.weightGrams,
          imageUrl: updated.imageUrl,
          isActive: updated.isActive,
        },
      };
    },
  );
};
