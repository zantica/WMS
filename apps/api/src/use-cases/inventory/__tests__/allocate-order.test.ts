// apps/api/src/use-cases/inventory/__tests__/allocate-order.test.ts
// Tests de concurrencia y correctitud del algoritmo de allocation.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { WmsError } from "../../../plugins/error-handler.js";
import { allocateOrder } from "../allocate-order.js";

// ── Mock de Prisma ────────────────────────────────────────────────────────────
const mockTx = {
  salesOrder: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  inventoryBalance: {
    update: vi.fn(),
  },
  inventoryTransaction: {
    create: vi.fn(),
  },
  warehouseTask: {
    create: vi.fn(),
  },
  $queryRaw: vi.fn(),
};

vi.mock("@wms/db", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: typeof mockTx) => Promise<unknown>) =>
      callback(mockTx),
    ),
  },
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

const BASE_ORDER = {
  id: "order-1",
  tenantId: "tenant-1",
  warehouseId: "warehouse-1",
  status: "PENDING" as const,
  externalRef: "#1001",
  lines: [
    {
      id: "line-1",
      productId: "product-1",
      requestedQty: 3,
      product: { id: "product-1", sku: "SKU-001", name: "Producto Test" },
    },
  ],
};

describe("allocateOrder — Reserva de Stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.salesOrder.update.mockResolvedValue({});
    mockTx.inventoryBalance.update.mockResolvedValue({});
    mockTx.inventoryTransaction.create.mockResolvedValue({});
    mockTx.warehouseTask.create.mockResolvedValue({ id: "task-1" });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Validaciones previas", () => {
    it("lanza ORDER_NOT_FOUND si el pedido no existe", async () => {
      mockTx.salesOrder.findUnique.mockResolvedValue(null);

      await expect(
        allocateOrder({ orderId: "order-x", tenantId: "tenant-1" }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    });

    it("lanza ORDER_NOT_FOUND si el pedido es de otro tenant", async () => {
      mockTx.salesOrder.findUnique.mockResolvedValue({
        ...BASE_ORDER,
        tenantId: "tenant-otro",
      });

      await expect(
        allocateOrder({ orderId: "order-1", tenantId: "tenant-1" }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
    });

    it("lanza ORDER_ALREADY_ALLOCATED si el pedido ya está ALLOCATED", async () => {
      mockTx.salesOrder.findUnique.mockResolvedValue({
        ...BASE_ORDER,
        status: "ALLOCATED",
      });

      await expect(
        allocateOrder({ orderId: "order-1", tenantId: "tenant-1" }),
      ).rejects.toMatchObject({ code: "ORDER_ALREADY_ALLOCATED" });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Reserva exitosa", () => {
    it("reserva stock de una sola ubicación si hay suficiente", async () => {
      mockTx.salesOrder.findUnique.mockResolvedValue(BASE_ORDER);
      // Única ubicación con 10 unidades disponibles
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: "bal-1",
          location_id: "loc-A01",
          location_code: "A-01-01",
          on_hand_qty: 10,
          allocated_qty: 0,
        },
      ]);

      const taskId = await allocateOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
      });

      expect(taskId).toBe("task-1");

      // Debe reservar exactamente 3 unidades
      expect(mockTx.inventoryBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { allocatedQty: { increment: 3 } },
        }),
      );

      // Debe cambiar el estado del pedido a ALLOCATED
      expect(mockTx.salesOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: "ALLOCATED" },
        }),
      );
    });

    it("reserva stock de múltiples ubicaciones cuando una no alcanza", async () => {
      mockTx.salesOrder.findUnique.mockResolvedValue({
        ...BASE_ORDER,
        lines: [
          {
            id: "line-1",
            productId: "product-1",
            requestedQty: 5,
            product: { id: "product-1", sku: "SKU-001", name: "Producto Test" },
          },
        ],
      });

      // Dos ubicaciones: 3 en A-01 y 4 en B-02
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: "bal-1",
          location_id: "loc-A01",
          location_code: "A-01-01",
          on_hand_qty: 3,
          allocated_qty: 0,
        },
        {
          id: "bal-2",
          location_id: "loc-B02",
          location_code: "B-02-01",
          on_hand_qty: 4,
          allocated_qty: 0,
        },
      ]);

      await allocateOrder({ orderId: "order-1", tenantId: "tenant-1" });

      // Debe hacer 2 updates de balance (uno por ubicación)
      expect(mockTx.inventoryBalance.update).toHaveBeenCalledTimes(2);

      // Primera ubicación: 3 unidades
      expect(mockTx.inventoryBalance.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: "bal-1" },
          data: { allocatedQty: { increment: 3 } },
        }),
      );

      // Segunda ubicación: 2 unidades (las restantes)
      expect(mockTx.inventoryBalance.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: "bal-2" },
          data: { allocatedQty: { increment: 2 } },
        }),
      );
    });

    it("los TaskSteps se crean ordenados por location.code", async () => {
      mockTx.salesOrder.findUnique.mockResolvedValue({
        ...BASE_ORDER,
        lines: [
          {
            id: "line-1",
            productId: "product-1",
            requestedQty: 6,
            product: { id: "product-1", sku: "SKU-001", name: "P1" },
          },
        ],
      });

      // Dos ubicaciones en orden invertido — el algoritmo debe reordenarlas
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: "bal-2",
          location_id: "loc-B",
          location_code: "B-01-01",
          on_hand_qty: 4,
          allocated_qty: 0,
        },
        {
          id: "bal-1",
          location_id: "loc-A",
          location_code: "A-01-01",
          on_hand_qty: 4,
          allocated_qty: 0,
        },
      ]);

      await allocateOrder({ orderId: "order-1", tenantId: "tenant-1" });

      // Verificar que la task se crea con steps ordenados por code
      const createCall = mockTx.warehouseTask.create.mock.calls[0]?.[0];
      const steps = createCall?.data?.steps?.create;
      expect(steps).toBeDefined();
      expect(steps[0].locationId).toBe("loc-A"); // A-01 primero
      expect(steps[0].sequence).toBe(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("🔒 Anti race condition: Stock insuficiente", () => {
    it("lanza INSUFFICIENT_STOCK y no modifica nada si no hay balances", async () => {
      mockTx.salesOrder.findUnique.mockResolvedValue(BASE_ORDER);
      mockTx.$queryRaw.mockResolvedValue([]); // Sin stock

      await expect(
        allocateOrder({ orderId: "order-1", tenantId: "tenant-1" }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });

      expect(mockTx.inventoryBalance.update).not.toHaveBeenCalled();
      expect(mockTx.inventoryTransaction.create).not.toHaveBeenCalled();
      expect(mockTx.salesOrder.update).not.toHaveBeenCalled();
    });

    it("lanza INSUFFICIENT_STOCK si el stock existente no cubre la cantidad pedida", async () => {
      mockTx.salesOrder.findUnique.mockResolvedValue(BASE_ORDER); // requestedQty: 3
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: "bal-1",
          location_id: "loc-A",
          location_code: "A-01-01",
          on_hand_qty: 2,  // Solo 2 disponibles
          allocated_qty: 0,
        },
      ]);

      await expect(
        allocateOrder({ orderId: "order-1", tenantId: "tenant-1" }),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK",
        details: expect.objectContaining({ missing: 1 }),
      });
    });
  });
});
