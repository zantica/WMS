// apps/api/src/routes/receipts.ts
// Flujo de Recepción (Paso 1 del ciclo operativo):
// El operario escanea productos que llegan del proveedor → van a RECEIVING

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@wms/db";
import { confirmReceiptLine } from "../use-cases/tasks/confirm-receipt-line.js";
import { WmsError } from "../plugins/error-handler.js";

const CreateReceiptSchema = z.object({
  warehouseId: z.string().cuid(),
  supplierName: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(
    z.object({
      productId: z.string().cuid(),
      expectedQty: z.number().positive(),
    }),
  ).min(1),
});

const ConfirmReceiptLineSchema = z.object({
  productId: z.string().cuid(),
  scannedQty: z.number().positive(),
  barcode: z.string().optional(), // Para validación extra por cámara
});

export const receiptRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/v1/receipts — Crear aviso de recepción (ASN)
  app.post(
    "/",
    {
      schema: {
        tags: ["Receipts"],
        summary: "Crear aviso de recepción de mercancía (Inbound ASN)",
      },
    },
    async (request, reply) => {
    const body = CreateReceiptSchema.parse(request.body);

    // Verificar warehouse del tenant
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: body.warehouseId, tenantId: request.tenantId },
    });
    if (!warehouse) {
      throw new WmsError("LOCATION_NOT_FOUND", "Warehouse not found", 404);
    }

    // Verificar que todos los productos pertenecen al tenant
    const productIds = body.lines.map((l) => l.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: request.tenantId },
    });
    if (products.length !== productIds.length) {
      throw new WmsError("PRODUCT_NOT_FOUND", "One or more products not found", 404);
    }

    // Crear task de recepción con un TaskStep por línea
    // Primero necesitamos la ubicación RECEIVING del warehouse
    const receivingLocation = await prisma.location.findFirst({
      where: {
        tenantId: request.tenantId,
        warehouseId: body.warehouseId,
        type: "RECEIVING",
        isActive: true,
      },
    });
    if (!receivingLocation) {
      throw new WmsError(
        "LOCATION_NOT_FOUND",
        "No RECEIVING location configured for this warehouse. Create one first.",
        409,
      );
    }

    // Crear un SalesOrder temporal para agrupar la tarea (reutilizamos el modelo de Task)
    // En producción esto podría ser un modelo Receipt separado (Fase 2)
    const task = await prisma.warehouseTask.create({
      data: {
        tenantId: request.tenantId,
        // orderId es null para tareas de recepción (no tienen pedido de venta)
        receiptRef: `receipt-${Date.now()}`,
        type: "RECEIVING",
        status: "PENDING",
        steps: {
          create: body.lines.map((line, index) => ({
            sequence: index + 1,
            locationId: receivingLocation.id,
            productId: line.productId,
            expectedQty: line.expectedQty,
            scannedQty: 0,
            status: "PENDING",
          })),
        },
      },
      include: { steps: true },
    });

    return reply.status(201).send({
      success: true,
      data: {
        taskId: task.id,
        receivingLocationCode: receivingLocation.code,
        steps: task.steps.length,
      },
    });
  });

  // POST /api/v1/receipts/:taskId/confirm-line — Confirmar escaneo de un producto recibido
  app.post<{ Params: { taskId: string } }>(
    "/:taskId/confirm-line",
    {
      schema: {
        tags: ["Receipts"],
        summary: "Confirmar escaneo de un producto recibido en muelle",
      },
    },
    async (request, reply) => {
      const body = ConfirmReceiptLineSchema.parse(request.body);
      const { taskId } = request.params;

      const result = await confirmReceiptLine({
        taskId,
        tenantId: request.tenantId,
        productId: body.productId,
        scannedQty: body.scannedQty,
        barcode: body.barcode,
        userId: request.userId,
      });

      return reply.send({
        success: true,
        data: result,
      });
    },
  );
};
