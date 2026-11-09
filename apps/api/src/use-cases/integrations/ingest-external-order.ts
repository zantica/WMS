// apps/api/src/use-cases/integrations/ingest-external-order.ts
// Caso de uso: Ingesta idempotente de pedidos desde canales externos (Shopify, WooCommerce, ERP).
//
// Garantías de dominio:
// 1. Idempotencia estricta por `(tenantId, externalId)`: si el pedido externo ya fue registrado,
//    retorna el pedido existente (`idempotentReplay: true`) sin duplicar líneas ni tareas.
// 2. Aislamiento multi-tenant: valida pertenencia de `warehouseId` y de cada producto (`productId` o `sku`)
//    al `tenantId` autenticado.
// 3. Opcionalmente ejecuta `allocateOrder` (`autoAllocate: true`) una vez creado el pedido.

import { prisma } from "@wms/db";
import type {
  ExternalOrderLineInput,
  IngestExternalOrderInput,
  IngestExternalOrderResult,
  OrderStatus,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import { allocateOrder } from "../inventory/allocate-order.js";

export interface IngestExternalOrderParams extends IngestExternalOrderInput {
  tenantId: string;
}

interface ResolvedOrderLine {
  productId: string;
  requestedQty: number;
  unitPrice?: number | undefined;
}

export async function ingestExternalOrder(
  params: IngestExternalOrderParams,
): Promise<IngestExternalOrderResult> {
  const { tenantId, warehouseId } = params;
  const externalId = params.externalId.trim();

  if (!externalId) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "externalId is required for external order ingestion",
      400,
    );
  }

  if (params.lines.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "At least one order line is required",
      400,
    );
  }

  // ── 1. Idempotencia por (tenantId, externalId) ───────────────────────────
  const existing = await prisma.salesOrder.findFirst({
    where: { tenantId, externalId },
    include: {
      lines: { include: { product: { select: { sku: true, name: true } } } },
    },
  });

  if (existing) {
    return {
      orderId: existing.id,
      externalId,
      status: existing.status as OrderStatus,
      idempotentReplay: true,
      allocatedTaskId: null,
    };
  }

  // ── 2. Verificar que el almacén pertenece al tenant ──────────────────────
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, tenantId },
  });

  if (!warehouse) {
    throw new WmsError(
      "LOCATION_NOT_FOUND",
      `Warehouse ${warehouseId} not found`,
      404,
      { warehouseId },
    );
  }

  // ── 3. Resolver cada línea por productId o sku dentro del tenant ─────────
  const resolvedLines: ResolvedOrderLine[] = [];

  for (const line of params.lines) {
    if (!Number.isFinite(line.requestedQty) || line.requestedQty <= 0) {
      throw new WmsError(
        "VALIDATION_ERROR",
        "Each order line must have requestedQty > 0",
        400,
      );
    }

    const trimmedProductId = line.productId?.trim();
    const trimmedSku = line.sku?.trim();

    if (!trimmedProductId && !trimmedSku) {
      throw new WmsError(
        "VALIDATION_ERROR",
        "Each order line must include either productId or sku",
        400,
      );
    }

    const product = trimmedProductId
      ? await prisma.product.findFirst({
          where: { id: trimmedProductId, tenantId, isActive: true },
        })
      : await prisma.product.findFirst({
          where: { sku: trimmedSku!, tenantId, isActive: true },
        });

    if (!product) {
      throw new WmsError(
        "PRODUCT_NOT_FOUND",
        `Product ${trimmedProductId ?? trimmedSku} not found`,
        404,
        {
          productId: trimmedProductId ?? null,
          sku: trimmedSku ?? null,
        },
      );
    }

    resolvedLines.push({
      productId: product.id,
      requestedQty: line.requestedQty,
      unitPrice: line.unitPrice,
    });
  }

  // ── 4. Crear el SalesOrder en estado PENDING con captura de P2002 (concurrencia TOCTOU) ──
  let created;
  try {
    created = await prisma.salesOrder.create({
      data: {
        tenantId,
        warehouseId,
        externalId,
        externalRef: params.externalRef ?? null,
        customerName: params.customerName ?? null,
        customerEmail: params.customerEmail ?? null,
        priority: params.priority ?? 0,
        notes: params.notes ?? null,
        status: "PENDING",
        lines: {
          create: resolvedLines.map((line) => ({
            productId: line.productId,
            requestedQty: line.requestedQty,
            ...(line.unitPrice !== undefined ? { unitPrice: line.unitPrice } : {}),
          })),
        },
      },
      include: {
        lines: { include: { product: { select: { sku: true, name: true } } } },
      },
    });
  } catch (error: unknown) {
    // Si dos llamadas concurrentes intentaron registrar el mismo externalId simultáneamente
    const prismaError = error as { code?: string };
    if (prismaError?.code === "P2002") {
      const existingAfterRace = await prisma.salesOrder.findFirst({
        where: { tenantId, externalId },
      });
      if (existingAfterRace) {
        return {
          orderId: existingAfterRace.id,
          externalId,
          status: existingAfterRace.status as OrderStatus,
          idempotentReplay: true,
          allocatedTaskId: null,
        };
      }
    }
    throw error;
  }

  // ── 5. Reserva automática opcional (autoAllocate) ────────────────────────
  // Si la reserva falla (p.ej. stock insuficiente), el pedido se conserva en PENDING
  // y se reporta `allocationError` para que el sistema externo o supervisor intervenga.
  if (params.autoAllocate === true) {
    try {
      const allocatedTaskId = await allocateOrder({
        orderId: created.id,
        tenantId,
      });

      return {
        orderId: created.id,
        externalId,
        status: "ALLOCATED",
        idempotentReplay: false,
        allocatedTaskId,
      };
    } catch (allocError: unknown) {
      const message =
        allocError instanceof Error ? allocError.message : String(allocError);

      return {
        orderId: created.id,
        externalId,
        status: "PENDING",
        idempotentReplay: false,
        allocatedTaskId: null,
        allocationError: message,
      };
    }
  }

  return {
    orderId: created.id,
    externalId,
    status: created.status as OrderStatus,
    idempotentReplay: false,
    allocatedTaskId: null,
  };
}
