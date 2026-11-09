// apps/api/src/routes/__tests__/orders-dispatch.test.ts
// Tests de integración para POST /api/v1/orders/:id/dispatch (F4.2 / Hallazgo 10):
// - Validación de params con Zod
// - Transición atómica a SHIPPED filtrando por { id, tenantId, status: "PACKED" }
// - Bloqueo de doble dispatch (concurrencia / 409 si no está PACKED)
// - Disparo de webhook order.shipped con aislamiento multi-tenant

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const mockPrisma = vi.hoisted(() => ({
  salesOrder: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  tenant: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock("@wms/db", () => ({ prisma: mockPrisma }));

const mockNotifyOrderShipped = vi.fn();
vi.mock("../../use-cases/integrations/notify-order-shipped.js", () => ({
  notifyOrderShipped: (...args: unknown[]) => mockNotifyOrderShipped(...args),
}));

import { authPlugin, createJwtToken } from "../../plugins/auth.js";
import { errorHandler } from "../../plugins/error-handler.js";
import { orderRoutes } from "../orders.js";

const JWT_SECRET = "test-orders-dispatch-secret";

describe("POST /api/v1/orders/:id/dispatch", () => {
  const originalEnv = { ...process.env };
  let app: FastifyInstance;

  async function buildOrderApp(): Promise<FastifyInstance> {
    const fastify = Fastify();
    await fastify.register(errorHandler);
    await fastify.register(authPlugin);
    await fastify.register(orderRoutes, { prefix: "/api/v1/orders" });
    await fastify.ready();
    return fastify;
  }

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env["JWT_SECRET"] = JWT_SECRET;
    vi.clearAllMocks();

    mockPrisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u-1",
      clerkId: "clerk-admin",
      tenantId: "tenant-1",
      role: "ADMIN",
      isActive: true,
    });

    mockNotifyOrderShipped.mockResolvedValue({
      delivered: true,
      skipped: false,
      statusCode: 200,
      signature: "sha256=abc",
    });

    app = await buildOrderApp();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await app.close();
  });

  it("despacha exitosamente un pedido en estado PACKED con actualización atómica", async () => {
    const token = createJwtToken(
      { sub: "clerk-admin", tenantId: "tenant-1" },
      JWT_SECRET,
    );

    mockPrisma.salesOrder.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.salesOrder.findFirst.mockResolvedValue({
      id: "order-packed-1",
      tenantId: "tenant-1",
      warehouseId: "wh-1",
      externalId: "ext-1",
      externalRef: "#1001",
      status: "SHIPPED",
      lines: [
        { productId: "p-1", requestedQty: 2, pickedQty: 2 },
      ],
    });

    process.env["WEBHOOK_OUTBOUND_URL"] = "https://erp.example.com/webhook";
    process.env["WEBHOOK_SHARED_SECRET"] = "prod-dispatch-secret";
    process.env["NODE_ENV"] = "production";

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/orders/order-packed-1/dispatch",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(mockPrisma.salesOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-packed-1", tenantId: "tenant-1", status: "PACKED" },
      data: { status: "SHIPPED" },
    });
    expect(mockNotifyOrderShipped).toHaveBeenCalledWith({
      orderId: "order-packed-1",
      tenantId: "tenant-1",
      warehouseId: "wh-1",
      externalId: "ext-1",
      externalRef: "#1001",
      webhookUrl: "https://erp.example.com/webhook",
      secret: "prod-dispatch-secret",
      isProduction: true,
      lines: [{ productId: "p-1", requestedQty: 2, pickedQty: 2 }],
    });
    expect(res.json()).toEqual({
      success: true,
      data: {
        orderId: "order-packed-1",
        status: "SHIPPED",
        webhookDelivered: true,
      },
    });
  });

  it("inyecta isProduction=false y valores undefined si no hay variables de entorno de webhook configuradas", async () => {
    const token = createJwtToken(
      { sub: "clerk-admin", tenantId: "tenant-1" },
      JWT_SECRET,
    );

    delete process.env["WEBHOOK_OUTBOUND_URL"];
    delete process.env["WEBHOOK_SHARED_SECRET"];
    process.env["NODE_ENV"] = "test";

    mockPrisma.salesOrder.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.salesOrder.findFirst.mockResolvedValue({
      id: "order-packed-2",
      tenantId: "tenant-1",
      warehouseId: "wh-1",
      externalId: null,
      externalRef: null,
      status: "SHIPPED",
      lines: [{ productId: "p-1", requestedQty: 1, pickedQty: 1 }],
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/orders/order-packed-2/dispatch",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(mockNotifyOrderShipped).toHaveBeenCalledWith({
      orderId: "order-packed-2",
      tenantId: "tenant-1",
      warehouseId: "wh-1",
      externalId: null,
      externalRef: null,
      webhookUrl: undefined,
      secret: undefined,
      isProduction: false,
      lines: [{ productId: "p-1", requestedQty: 1, pickedQty: 1 }],
    });
  });

  it("devuelve 409 VALIDATION_ERROR si el pedido no está en estado PACKED", async () => {
    const token = createJwtToken(
      { sub: "clerk-admin", tenantId: "tenant-1" },
      JWT_SECRET,
    );

    // updateMany no actualiza porque status no es PACKED
    mockPrisma.salesOrder.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.salesOrder.findFirst.mockResolvedValue({
      id: "order-pending-1",
      tenantId: "tenant-1",
      status: "PENDING",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/orders/order-pending-1/dispatch",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(res.json().error.message).toContain("Only PACKED orders can be dispatched");
    expect(mockNotifyOrderShipped).not.toHaveBeenCalled();
  });

  it("devuelve 404 ORDER_NOT_FOUND si el pedido no existe en el tenant", async () => {
    const token = createJwtToken(
      { sub: "clerk-admin", tenantId: "tenant-1" },
      JWT_SECRET,
    );

    mockPrisma.salesOrder.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.salesOrder.findFirst.mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/orders/non-existent/dispatch",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("ORDER_NOT_FOUND");
    expect(mockNotifyOrderShipped).not.toHaveBeenCalled();
  });
});
