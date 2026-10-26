// apps/api/src/use-cases/integrations/__tests__/webhooks.test.ts
// Tests unitarios de integraciones externas (F4.2):
// - ingestExternalOrder: alta por SKU/productId, idempotencia por externalId, autoAllocate y aislamiento por tenant
// - signWebhookPayload / verifyWebhookSignature: firma HMAC-SHA256
// - notifyOrderShipped: entrega exitosa, omisión sin URL y tolerancia a fallos HTTP/red

import { describe, it, expect, beforeEach, vi } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  salesOrder: { findFirst: vi.fn(), create: vi.fn() },
  warehouse: { findFirst: vi.fn() },
  product: { findFirst: vi.fn() },
}));

vi.mock("@wms/db", () => ({ prisma: mockPrisma }));

const mockAllocateOrder = vi.fn();
vi.mock("../../inventory/allocate-order.js", () => ({
  allocateOrder: (...args: unknown[]) => mockAllocateOrder(...args),
}));

import { ingestExternalOrder } from "../ingest-external-order.js";
import {
  notifyOrderShipped,
  signWebhookPayload,
  verifyWebhookSignature,
} from "../notify-order-shipped.js";

const BASE_INPUT = {
  tenantId: "tenant-1",
  warehouseId: "warehouse-demo",
  externalId: "shopify-1001",
  externalRef: "#1001",
  lines: [{ sku: "PROD-001", requestedQty: 2 }],
};

describe("ingestExternalOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.salesOrder.findFirst.mockResolvedValue(null);
    mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "warehouse-demo" });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockPrisma.salesOrder.create.mockResolvedValue({
      id: "order-new",
      status: "PENDING",
      lines: [],
    });
  });

  it("crea un pedido nuevo resolviendo productos por SKU dentro del tenant", async () => {
    const result = await ingestExternalOrder(BASE_INPUT);

    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { sku: "PROD-001", tenantId: "tenant-1", isActive: true },
    });
    expect(mockPrisma.salesOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          externalId: "shopify-1001",
          status: "PENDING",
          lines: { create: [{ productId: "prod-1", requestedQty: 2 }] },
        }),
      }),
    );
    expect(result).toEqual({
      orderId: "order-new",
      externalId: "shopify-1001",
      status: "PENDING",
      idempotentReplay: false,
      allocatedTaskId: null,
    });
    expect(mockAllocateOrder).not.toHaveBeenCalled();
  });

  it("resuelve productos por productId e incluye unitPrice si se envía", async () => {
    await ingestExternalOrder({
      ...BASE_INPUT,
      lines: [{ productId: "prod-1", requestedQty: 1, unitPrice: 9.99 }],
    });

    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: "prod-1", tenantId: "tenant-1", isActive: true },
    });
    expect(mockPrisma.salesOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lines: {
            create: [{ productId: "prod-1", requestedQty: 1, unitPrice: 9.99 }],
          },
        }),
      }),
    );
  });

  it("es idempotente: un reintento con el mismo externalId devuelve el pedido existente sin crear nada", async () => {
    mockPrisma.salesOrder.findFirst.mockResolvedValue({
      id: "order-existing",
      status: "ALLOCATED",
      lines: [],
    });

    const result = await ingestExternalOrder({ ...BASE_INPUT, autoAllocate: true });

    expect(mockPrisma.salesOrder.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", externalId: "shopify-1001" },
      }),
    );
    expect(result).toEqual({
      orderId: "order-existing",
      externalId: "shopify-1001",
      status: "ALLOCATED",
      idempotentReplay: true,
      allocatedTaskId: null,
    });
    expect(mockPrisma.salesOrder.create).not.toHaveBeenCalled();
    expect(mockAllocateOrder).not.toHaveBeenCalled();
  });

  it("ejecuta allocateOrder cuando autoAllocate es true", async () => {
    mockAllocateOrder.mockResolvedValue("task-pick-1");

    const result = await ingestExternalOrder({ ...BASE_INPUT, autoAllocate: true });

    expect(mockAllocateOrder).toHaveBeenCalledWith({
      orderId: "order-new",
      tenantId: "tenant-1",
    });
    expect(result.status).toBe("ALLOCATED");
    expect(result.allocatedTaskId).toBe("task-pick-1");
  });

  it("lanza LOCATION_NOT_FOUND si el almacén no pertenece al tenant", async () => {
    mockPrisma.warehouse.findFirst.mockResolvedValue(null);
    await expect(ingestExternalOrder(BASE_INPUT)).rejects.toMatchObject({
      code: "LOCATION_NOT_FOUND",
      statusCode: 404,
    });
    expect(mockPrisma.salesOrder.create).not.toHaveBeenCalled();
  });

  it("lanza PRODUCT_NOT_FOUND si un SKU no existe en el tenant", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    await expect(ingestExternalOrder(BASE_INPUT)).rejects.toMatchObject({
      code: "PRODUCT_NOT_FOUND",
    });
    expect(mockPrisma.salesOrder.create).not.toHaveBeenCalled();
  });

  it("valida externalId, líneas vacías, cantidades y referencia de producto", async () => {
    await expect(
      ingestExternalOrder({ ...BASE_INPUT, externalId: "  " }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      ingestExternalOrder({ ...BASE_INPUT, lines: [] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      ingestExternalOrder({ ...BASE_INPUT, lines: [{ sku: "PROD-001", requestedQty: 0 }] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      ingestExternalOrder({ ...BASE_INPUT, lines: [{ requestedQty: 1 }] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("signWebhookPayload / verifyWebhookSignature", () => {
  const body = JSON.stringify({ hello: "world" });

  it("genera firmas deterministas en formato sha256=<hex>", () => {
    const sig = signWebhookPayload(body, "s3cret");
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(signWebhookPayload(body, "s3cret")).toBe(sig);
  });

  it("verifica firmas válidas con y sin prefijo sha256=", () => {
    const sig = signWebhookPayload(body, "s3cret");
    expect(verifyWebhookSignature(body, sig, "s3cret")).toBe(true);
    expect(verifyWebhookSignature(body, sig.replace("sha256=", ""), "s3cret")).toBe(true);
  });

  it("rechaza firmas ausentes, alteradas o con otro secreto", () => {
    const sig = signWebhookPayload(body, "s3cret");
    expect(verifyWebhookSignature(body, undefined, "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, "   ", "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=abc", "s3cret")).toBe(false);
    expect(verifyWebhookSignature(body, sig, "otro")).toBe(false);
    expect(verifyWebhookSignature(`${body} `, sig, "s3cret")).toBe(false);
  });
});

describe("notifyOrderShipped", () => {
  const PARAMS = {
    orderId: "order-1",
    tenantId: "tenant-1",
    warehouseId: "warehouse-demo",
    externalId: "shopify-1001",
    externalRef: "#1001",
    shippedAt: new Date("2026-10-26T00:00:00.000Z"),
    lines: [{ productId: "prod-1", sku: "PROD-001", requestedQty: 2, pickedQty: 2 }],
    secret: "s3cret",
  };

  beforeEach(() => {
    delete process.env["WEBHOOK_OUTBOUND_URL"];
  });

  it("omite el envío (skipped) si no hay URL configurada, pero devuelve payload firmado", async () => {
    const result = await notifyOrderShipped(PARAMS);

    expect(result.skipped).toBe(true);
    expect(result.delivered).toBe(false);
    expect(result.payload).toMatchObject({
      event: "order.shipped",
      orderId: "order-1",
      externalId: "shopify-1001",
      shippedAt: "2026-10-26T00:00:00.000Z",
    });
    expect(
      verifyWebhookSignature(JSON.stringify(result.payload), result.signature, "s3cret"),
    ).toBe(true);
  });

  it("envía POST con cabeceras x-wms-event y x-wms-signature cuando hay URL", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const result = await notifyOrderShipped({
      ...PARAMS,
      webhookUrl: "https://shop.example.com/hooks/wms",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://shop.example.com/hooks/wms",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-wms-event": "order.shipped",
          "x-wms-signature": result.signature,
        }),
      }),
    );
    expect(result).toMatchObject({ delivered: true, skipped: false, statusCode: 200 });
  });

  it("usa WEBHOOK_OUTBOUND_URL si no se pasa webhookUrl explícita", async () => {
    process.env["WEBHOOK_OUTBOUND_URL"] = "https://erp.example.com/in";
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 202 });

    const result = await notifyOrderShipped({
      ...PARAMS,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://erp.example.com/in");
    expect(result.statusCode).toBe(202);
  });

  it("no lanza ante respuestas no-2xx y reporta el error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await notifyOrderShipped({
      ...PARAMS,
      webhookUrl: "https://shop.example.com/hooks/wms",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({ delivered: false, statusCode: 500 });
    expect(result.error).toContain("HTTP 500");
  });

  it("no lanza ante fallos de red y reporta el mensaje", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await notifyOrderShipped({
      ...PARAMS,
      webhookUrl: "https://shop.example.com/hooks/wms",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      delivered: false,
      statusCode: null,
      error: "ECONNREFUSED",
    });
  });
});
