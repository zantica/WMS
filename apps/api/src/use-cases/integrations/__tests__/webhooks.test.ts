// apps/api/src/use-cases/integrations/__tests__/webhooks.test.ts
// Tests unitarios y de ruta de integraciones externas (F4.2):
// - ingestExternalOrder: alta por SKU/productId, idempotencia por externalId, captura de P2002 por colisión concurrente,
//   gestión de fallo en allocateOrder (status PENDING + allocationError) y validaciones de dominio.
// - signWebhookPayload / verifyWebhookSignature: firma HMAC-SHA256, ramas de secretos por env/default y validación.
// - notifyOrderShipped: entrega exitosa con timeout AbortSignal, omisión sin URL, manejo de Date/string/fallback de shippedAt,
//   y resiliencia ante errores HTTP y de red.
// - POST /api/v1/webhooks/orders: test de integración Fastify (401 firma inválida, 400 Zod, 403 OPERATOR, 201 alta y 200 replay).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const mockPrisma = vi.hoisted(() => ({
  salesOrder: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  warehouse: { findFirst: vi.fn() },
  product: { findFirst: vi.fn() },
  tenant: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
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
import { authPlugin, createJwtToken } from "../../../plugins/auth.js";
import { errorHandler } from "../../../plugins/error-handler.js";
import { webhookRoutes } from "../../../routes/webhooks.js";

const BASE_INPUT = {
  tenantId: "tenant-1",
  warehouseId: "warehouse-demo",
  externalId: "shopify-1001",
  externalRef: "#1001",
  lines: [{ sku: "PROD-001", requestedQty: 2 }],
};

const TEST_SECRET = "webhook-test-secret-123";

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

  // Hallazgo 6: Idempotencia bajo concurrencia (TOCTOU) mediante captura de error P2002
  it("captura colisión concurrente P2002 en create y retorna replay idempotente del pedido existente", async () => {
    mockPrisma.salesOrder.findFirst
      .mockResolvedValueOnce(null) // Primera comprobación (aún no insertado)
      .mockResolvedValueOnce({
        id: "order-winner",
        status: "PENDING",
        lines: [],
      }); // Segunda comprobación tras race condition

    const p2002Error = new Error("Unique constraint failed");
    (p2002Error as unknown as { code: string }).code = "P2002";
    mockPrisma.salesOrder.create.mockRejectedValue(p2002Error);

    const result = await ingestExternalOrder(BASE_INPUT);

    expect(result).toEqual({
      orderId: "order-winner",
      externalId: "shopify-1001",
      status: "PENDING",
      idempotentReplay: true,
      allocatedTaskId: null,
    });
  });

  it("relanza otros errores de base de datos no relacionados con P2002", async () => {
    mockPrisma.salesOrder.create.mockRejectedValue(new Error("Connection reset"));
    await expect(ingestExternalOrder(BASE_INPUT)).rejects.toThrow("Connection reset");
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

  // Hallazgo 7: Fallo en allocateOrder (p.ej. falta de stock) tras creación exitosa del pedido
  it("mantiene el pedido en PENDING y devuelve allocationError si allocateOrder falla", async () => {
    mockAllocateOrder.mockRejectedValue(new Error("INSUFFICIENT_STOCK: Stock agotado"));

    const result = await ingestExternalOrder({ ...BASE_INPUT, autoAllocate: true });

    expect(result).toEqual({
      orderId: "order-new",
      externalId: "shopify-1001",
      status: "PENDING",
      idempotentReplay: false,
      allocatedTaskId: null,
      allocationError: "INSUFFICIENT_STOCK: Stock agotado",
    });
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

  // Hallazgo 11 + CP-7: Ramas de secreto mediante parámetros inyectados (sin process.env en use-cases)
  it("resuelve secreto explícito, fallback en desarrollo (isProduction=false) y lanza error si falta en producción (isProduction=true)", () => {
    const sigExplicit = signWebhookPayload(body, "  injected-secret  ", false);
    expect(
      verifyWebhookSignature(body, sigExplicit, "injected-secret", false),
    ).toBe(true);

    const sigFallback = signWebhookPayload(body, undefined, false);
    expect(
      verifyWebhookSignature(body, sigFallback, "wms-dev-webhook-secret", false),
    ).toBe(true);

    expect(() => signWebhookPayload(body, undefined, true)).toThrow(
      "WEBHOOK_SHARED_SECRET environment variable is mandatory in production",
    );
    expect(() => signWebhookPayload(body, "   ", true)).toThrow(
      "WEBHOOK_SHARED_SECRET environment variable is mandatory in production",
    );
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

  // Hallazgo 11: Ramas de shippedAt (string, Date, undefined)
  it("soporta shippedAt como string ISO o generado por defecto si es undefined", async () => {
    const resultString = await notifyOrderShipped({
      ...PARAMS,
      shippedAt: "2026-11-09T20:00:00.000Z",
    });
    expect(resultString.payload.shippedAt).toBe("2026-11-09T20:00:00.000Z");

    const resultDefault = await notifyOrderShipped({
      ...PARAMS,
      shippedAt: undefined,
    });
    expect(typeof resultDefault.payload.shippedAt).toBe("string");
    expect(new Date(resultDefault.payload.shippedAt).getTime()).toBeGreaterThan(0);
  });

  it("omite el envío (skipped) si no se inyecta webhookUrl o está en blanco, pero devuelve payload firmado", async () => {
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

    const blankUrlResult = await notifyOrderShipped({
      ...PARAMS,
      webhookUrl: "   ",
    });
    expect(blankUrlResult.skipped).toBe(true);
  });

  it("falla si isProduction=true y no se inyecta secret, o usa fallback de desarrollo si isProduction=false", async () => {
    await expect(
      notifyOrderShipped({
        ...PARAMS,
        secret: undefined,
        isProduction: true,
      }),
    ).rejects.toThrow(
      "WEBHOOK_SHARED_SECRET environment variable is mandatory in production",
    );

    const devResult = await notifyOrderShipped({
      ...PARAMS,
      secret: undefined,
      isProduction: false,
    });
    expect(
      verifyWebhookSignature(
        JSON.stringify(devResult.payload),
        devResult.signature,
        "wms-dev-webhook-secret",
      ),
    ).toBe(true);
  });

  // Hallazgo 9: Incluye timeout y headers esperados en fetch saliente
  it("envía POST con cabeceras x-wms-event, x-wms-signature y signal de timeout cuando se inyecta webhookUrl", async () => {
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
        signal: expect.any(Object),
      }),
    );
    expect(result).toMatchObject({ delivered: true, skipped: false, statusCode: 200 });
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

  it("no lanza ante fallos de red o timeout y reporta el mensaje", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("The operation was aborted due to timeout"));

    const result = await notifyOrderShipped({
      ...PARAMS,
      webhookUrl: "https://shop.example.com/hooks/wms",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toMatchObject({
      delivered: false,
      statusCode: null,
      error: "The operation was aborted due to timeout",
    });
  });
});

// Hallazgo 13: Tests de ruta (app.inject) para POST /api/v1/webhooks/orders
describe("POST /api/v1/webhooks/orders (HTTP route integration)", () => {
  const originalEnv = { ...process.env };
  let app: FastifyInstance;

  async function buildWebhookApp(): Promise<FastifyInstance> {
    const fastify = Fastify();
    await fastify.register(errorHandler);
    await fastify.register(authPlugin);
    await fastify.register(webhookRoutes, { prefix: "/api/v1/webhooks" });
    await fastify.ready();
    return fastify;
  }

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env["JWT_SECRET"] = "route-jwt-secret";
    process.env["WEBHOOK_SHARED_SECRET"] = TEST_SECRET;
    vi.clearAllMocks();

    mockPrisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });
    mockPrisma.warehouse.findFirst.mockResolvedValue({ id: "wh-1" });
    mockPrisma.product.findFirst.mockResolvedValue({ id: "prod-1" });
    mockPrisma.salesOrder.findFirst.mockResolvedValue(null);
    mockPrisma.salesOrder.create.mockResolvedValue({
      id: "order-routed-1",
      status: "PENDING",
      lines: [],
    });

    mockPrisma.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.clerkId === "user-admin") {
        return { id: "u-admin", tenantId: "tenant-1", role: "ADMIN", isActive: true };
      }
      if (where.clerkId === "user-op") {
        return { id: "u-op", tenantId: "tenant-1", role: "OPERATOR", isActive: true };
      }
      return null;
    });

    app = await buildWebhookApp();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await app.close();
  });

  const validBody = {
    warehouseId: "wh-1",
    externalId: "ext-order-42",
    lines: [{ sku: "PROD-001", requestedQty: 3 }],
  };

  it("devuelve 403 FORBIDDEN si el usuario autenticado tiene rol OPERATOR", async () => {
    const token = createJwtToken(
      { sub: "user-op", tenantId: "tenant-1" },
      "route-jwt-secret",
    );
    const bodyStr = JSON.stringify(validBody);
    const sig = signWebhookPayload(bodyStr, TEST_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/orders",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-webhook-signature": sig,
      },
      payload: bodyStr,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("devuelve 401 UNAUTHORIZED si la firma HMAC es inválida o falta", async () => {
    const token = createJwtToken(
      { sub: "user-admin", tenantId: "tenant-1" },
      "route-jwt-secret",
    );
    const bodyStr = JSON.stringify(validBody);

    // Sin cabecera de firma
    const noSigRes = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/orders",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: bodyStr,
    });
    expect(noSigRes.statusCode).toBe(401);
    expect(noSigRes.json().error.message).toBe("Missing webhook signature header");

    // Con firma inválida
    const badSigRes = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/orders",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-webhook-signature": "sha256=invalid000000000000000000000000000000000000000000000000000000000000",
      },
      payload: bodyStr,
    });
    expect(badSigRes.statusCode).toBe(401);
    expect(badSigRes.json().error.message).toBe("Invalid webhook signature");
  });

  it("devuelve 422 VALIDATION_ERROR si el body no cumple el esquema Zod", async () => {
    const token = createJwtToken(
      { sub: "user-admin", tenantId: "tenant-1" },
      "route-jwt-secret",
    );
    const invalidBody = { warehouseId: "wh-1", externalId: "ext-1", lines: [] };
    const bodyStr = JSON.stringify(invalidBody);
    const sig = signWebhookPayload(bodyStr, TEST_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/orders",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-webhook-signature": sig,
      },
      payload: bodyStr,
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("devuelve 201 Created cuando se ingesta un nuevo pedido exitosamente", async () => {
    const token = createJwtToken(
      { sub: "user-admin", tenantId: "tenant-1" },
      "route-jwt-secret",
    );
    const bodyStr = JSON.stringify(validBody);
    const sig = signWebhookPayload(bodyStr, TEST_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/orders",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-webhook-signature": sig,
      },
      payload: bodyStr,
    });

    expect(res.statusCode).toBe(201);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual({
      orderId: "order-routed-1",
      externalId: "ext-order-42",
      status: "PENDING",
      idempotentReplay: false,
      allocatedTaskId: null,
    });
  });

  it("devuelve 200 OK cuando es un replay idempotente de un pedido previamente registrado", async () => {
    mockPrisma.salesOrder.findFirst.mockResolvedValue({
      id: "order-existing-99",
      status: "ALLOCATED",
      lines: [],
    });

    const token = createJwtToken(
      { sub: "user-admin", tenantId: "tenant-1" },
      "route-jwt-secret",
    );
    const bodyStr = JSON.stringify(validBody);
    const sig = signWebhookPayload(bodyStr, TEST_SECRET);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/webhooks/orders",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-webhook-signature": sig,
      },
      payload: bodyStr,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.success).toBe(true);
    expect(json.data.idempotentReplay).toBe(true);
    expect(json.data.orderId).toBe("order-existing-99");
  });
});
