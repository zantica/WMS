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
  IngestExternalOrderResult,
  OrderStatus,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import { allocateOrder } from "../inventory/allocate-order.js";

export type { ExternalOrderLineInput, IngestExternalOrderResult };

export interface IngestExternalOrderParams {
  tenantId: string;
  warehouseId: string;
  externalId: string;
  externalRef?: string | undefined;
  customerName?: string | undefined;
  customerEmail?: string | undefined;
  priority?: number | undefined;
  notes?: string | undefined;
  autoAllocate?: boolean | undefined;
  lines: ExternalOrderLineInput[];
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

  // ── 4. Crear el SalesOrder en estado PENDING ─────────────────────────────
  const created = await prisma.salesOrder.create({
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

  // ── 5. Reserva automática opcional (autoAllocate) ────────────────────────
  if (params.autoAllocate === true) {
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
  }

  return {
    orderId: created.id,
    externalId,
    status: created.status as OrderStatus,
    idempotentReplay: false,
    allocatedTaskId: null,
  };
}
