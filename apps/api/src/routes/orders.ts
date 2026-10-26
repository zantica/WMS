// apps/api/src/routes/orders.ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@wms/db";
import { allocateOrder } from "../use-cases/inventory/allocate-order.js";
import {
  cancelOrder,
  type CancelOrderResult,
} from "../use-cases/inventory/cancel-order.js";
import { notifyOrderShipped } from "../use-cases/integrations/notify-order-shipped.js";
import { WmsError } from "../plugins/error-handler.js";
import type { ApiResponse, SalesOrderDTO } from "@wms/shared-types";

const CancelOrderSchema = z
  .object({
    reason: z.string().trim().min(1).optional(),
  })
  .optional();

const CreateOrderSchema = z.object({
  warehouseId: z.string().min(1),
  externalId: z.string().optional(),
  externalRef: z.string().optional(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  priority: z.number().int().min(0).max(100).default(0),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        productId: z.string().min(1),
        requestedQty: z.number().positive(),
        unitPrice: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
});

export const orderRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/orders — Listar pedidos (filtrable por status)
  app.get<{ Querystring: { status?: string } }>(
    "/",
    {
      schema: {
        tags: ["Orders"],
        summary: "Listar pedidos de venta con filtro opcional de estado",
      },
    },
    async (request) => {
      const orders = await prisma.salesOrder.findMany({
        where: {
          tenantId: request.tenantId,
          ...(request.query.status
            ? { status: request.query.status as never }
            : {}),
        },
        include: {
          lines: { include: { product: { select: { sku: true, name: true } } } },
        },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
        take: 100,
      });

      return {
        success: true,
        data: orders.map(orderToDTO),
      };
    },
  );

  // GET /api/v1/orders/:id
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        tags: ["Orders"],
        summary: "Obtener detalle de un pedido por ID",
      },
    },
    async (request): Promise<ApiResponse<SalesOrderDTO>> => {
      const order = await prisma.salesOrder.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
        include: {
          lines: { include: { product: { select: { sku: true, name: true } } } },
        },
      });

      if (!order) {
        throw new WmsError("ORDER_NOT_FOUND", `Order ${request.params.id} not found`, 404);
      }

      return { success: true, data: orderToDTO(order) };
    },
  );

  // POST /api/v1/orders — Crear pedido (manual o vía integración externa)
  app.post(
    "/",
    {
      schema: {
        tags: ["Orders"],
        summary: "Crear un nuevo pedido de venta",
      },
    },
    async (request, reply) => {
    const body = CreateOrderSchema.parse(request.body);

    const warehouse = await prisma.warehouse.findFirst({
      where: { id: body.warehouseId, tenantId: request.tenantId },
    });
    if (!warehouse) {
      throw new WmsError("LOCATION_NOT_FOUND", "Warehouse not found", 404);
    }

    const order = await prisma.salesOrder.create({
      data: {
        tenantId: request.tenantId,
        warehouseId: body.warehouseId,
        externalId: body.externalId,
        externalRef: body.externalRef,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        priority: body.priority,
        notes: body.notes,
        status: "PENDING",
        lines: {
          create: body.lines.map((line) => ({
            productId: line.productId,
            requestedQty: line.requestedQty,
            unitPrice: line.unitPrice,
          })),
        },
      },
      include: {
        lines: { include: { product: { select: { sku: true, name: true } } } },
      },
    });

    return reply.status(201).send({ success: true, data: orderToDTO(order) });
  });

  // POST /api/v1/orders/:id/allocate — Lanzar reserva de stock
  app.post<{ Params: { id: string } }>(
    "/:id/allocate",
    {
      schema: {
        tags: ["Orders"],
        summary: "Asignar stock a un pedido y generar tarea de picking",
      },
    },
    async (request) => {
      const taskId = await allocateOrder({
        orderId: request.params.id,
        tenantId: request.tenantId,
        userId: request.userId,
      });

      return {
        success: true,
        data: { taskId, message: "Order allocated. Picking task created." },
      };
    },
  );

  // POST /api/v1/orders/:id/dispatch — Despacho final
  app.post<{ Params: { id: string } }>(
    "/:id/dispatch",
    {
      schema: {
        tags: ["Orders"],
        summary: "Despachar un pedido empaquetado (marcar como SHIPPED)",
      },
    },
    async (request) => {
      const order = await prisma.salesOrder.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
        include: { lines: true },
      });

      if (!order) {
        throw new WmsError("ORDER_NOT_FOUND", `Order ${request.params.id} not found`, 404);
      }

      if (order.status !== "PACKED") {
        throw new WmsError(
          "VALIDATION_ERROR",
          `Only PACKED orders can be dispatched. Current status: ${order.status}`,
          409,
        );
      }

      await prisma.salesOrder.update({
        where: { id: order.id },
        data: { status: "SHIPPED" },
      });

      const webhookResult = await notifyOrderShipped({
        orderId: order.id,
        tenantId: request.tenantId,
        warehouseId: order.warehouseId,
        externalId: order.externalId,
        externalRef: order.externalRef,
        lines: order.lines.map((line) => ({
          productId: line.productId,
          requestedQty: Number(line.requestedQty),
          pickedQty: Number(line.pickedQty),
        })),
      });

      return {
        success: true,
        data: {
          orderId: order.id,
          status: "SHIPPED",
          webhookDelivered: webhookResult.delivered,
        },
      };
    },
  );

  // POST /api/v1/orders/:id/cancel — Cancelación de pedido y liberación atómica de reservas
  app.post<{ Params: { id: string } }>(
    "/:id/cancel",
    {
      schema: {
        tags: ["Orders"],
        summary:
          "Cancelar un pedido de venta y liberar atómicamente sus reservas pendientes (ALLOCATION_CANCEL)",
      },
    },
    async (request): Promise<ApiResponse<CancelOrderResult>> => {
      const parsedBody = CancelOrderSchema.parse(request.body);

      const result = await cancelOrder({
        orderId: request.params.id,
        tenantId: request.tenantId,
        userId: request.userId,
        reason: parsedBody?.reason,
      });

      return {
        success: true,
        data: result,
      };
    },
  );
};

// ── Helper ───────────────────────────────────────────────────────────────────
type OrderWithLines = Awaited<ReturnType<typeof prisma.salesOrder.findFirst>> & {
  lines: Array<{
    id: string;
    productId: string;
    requestedQty: import("@prisma/client").Prisma.Decimal;
    pickedQty: import("@prisma/client").Prisma.Decimal;
    product: { sku: string; name: string };
  }>;
};

function orderToDTO(order: NonNullable<OrderWithLines>): SalesOrderDTO {
  return {
    id: order.id,
    externalId: order.externalId,
    externalRef: order.externalRef,
    status: order.status as SalesOrderDTO["status"],
    customerName: order.customerName,
    priority: order.priority,
    createdAt: order.createdAt.toISOString(),
    lines: order.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productSku: l.product.sku,
      productName: l.product.name,
      requestedQty: Number(l.requestedQty),
      pickedQty: Number(l.pickedQty),
    })),
  };
}
