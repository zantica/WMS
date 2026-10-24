// apps/api/src/routes/inventory.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@wms/db";
import { moveStock } from "../use-cases/inventory/move-stock.js";
import { WmsError } from "../plugins/error-handler.js";
import type { ApiResponse, InventoryBalanceDTO } from "@wms/shared-types";

export const inventoryRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/inventory/balances — Stock en vivo por producto/ubicación
  app.get<{ Querystring: { productId?: string; locationId?: string } }>(
    "/balances",
    {
      schema: {
        tags: ["Inventory"],
        summary: "Consultar saldos en vivo por producto y ubicación",
      },
    },
    async (request): Promise<ApiResponse<InventoryBalanceDTO[]>> => {
      const { productId, locationId } = request.query;

      const balances = await prisma.inventoryBalance.findMany({
        where: {
          tenantId: request.tenantId,
          ...(productId ? { productId } : {}),
          ...(locationId ? { locationId } : {}),
          onHandQty: { gt: 0 },
        },
        include: {
          location: true,
          product: true,
        },
        orderBy: [{ location: { code: "asc" } }, { product: { sku: "asc" } }],
      });

      return {
        success: true,
        data: balances.map((b) => ({
          locationId: b.locationId,
          locationCode: b.location.code,
          productId: b.productId,
          productSku: b.product.sku,
          productName: b.product.name,
          onHandQty: Number(b.onHandQty),
          allocatedQty: Number(b.allocatedQty),
          atpQty: Number(b.onHandQty) - Number(b.allocatedQty),
        })),
      };
    },
  );

  // GET /api/v1/inventory/transactions — Ledger completo (paginado)
  app.get<{
    Querystring: { page?: string; limit?: string; productId?: string; reason?: string };
  }>(
    "/transactions",
    {
      schema: {
        tags: ["Inventory"],
        summary: "Consultar historial de transacciones (Ledger inmutable)",
      },
    },
    async (request) => {
      const page = Math.max(1, Number(request.query.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(request.query.limit ?? 50)));
      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        prisma.inventoryTransaction.findMany({
          where: {
            tenantId: request.tenantId,
            ...(request.query.productId ? { productId: request.query.productId } : {}),
            ...(request.query.reason ? { reason: request.query.reason as never } : {}),
          },
          include: {
            product: { select: { sku: true, name: true } },
            fromLocation: { select: { code: true } },
            toLocation: { select: { code: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
        }),
        prisma.inventoryTransaction.count({
          where: { tenantId: request.tenantId },
        }),
      ]);

      return {
        success: true,
        data: transactions.map((t) => ({
          id: t.id,
          productSku: t.product.sku,
          productName: t.product.name,
          fromLocation: t.fromLocation?.code ?? null,
          toLocation: t.toLocation?.code ?? null,
          quantity: Number(t.quantity),
          reason: t.reason,
          referenceId: t.referenceId,
          userId: t.userId,
          notes: t.notes,
          createdAt: t.createdAt.toISOString(),
        })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    },
  );

  // POST /api/v1/inventory/adjustments — Corrección manual
  app.post(
    "/adjustments",
    {
      schema: {
        tags: ["Inventory"],
        summary: "Registrar corrección manual de stock en el ledger",
      },
    },
    async (request, reply) => {
      const body = z
        .object({
          locationId: z.string().cuid(),
          productId: z.string().cuid(),
          quantityDelta: z.number().refine((n) => n !== 0, "Delta cannot be zero"),
          notes: z.string().min(5, "Adjustment reason must be at least 5 characters"),
        })
        .parse(request.body);

      // Verificar que la ubicación y el producto pertenecen al tenant
      const [location, product] = await Promise.all([
        prisma.location.findFirst({
          where: { id: body.locationId, tenantId: request.tenantId },
        }),
        prisma.product.findFirst({
          where: { id: body.productId, tenantId: request.tenantId },
        }),
      ]);

      if (!location) throw new WmsError("LOCATION_NOT_FOUND", "Location not found", 404);
      if (!product) throw new WmsError("PRODUCT_NOT_FOUND", "Product not found", 404);

      const isAddition = body.quantityDelta > 0;
      const absQty = Math.abs(body.quantityDelta);

      await moveStock({
        tenantId: request.tenantId,
        productId: body.productId,
        fromLocationId: isAddition ? undefined : body.locationId,
        toLocationId: isAddition ? body.locationId : undefined,
        quantity: absQty,
        reason: "ADJUSTMENT",
        userId: request.userId,
        notes: body.notes,
      });

      return reply.status(201).send({
        success: true,
        data: { message: "Adjustment recorded in ledger" },
      });
    },
  );
};
