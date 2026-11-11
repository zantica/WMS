// apps/api/src/use-cases/inventory/__tests__/allocate-order.test.ts
// Tests de reserva de stock para pedidos usando InMemoryUnitOfWork + @wms/domain.
// Suites: Happy Path y "Romper a propósito" (stock insuficiente, rollback multi-línea,
// estados inválidos, aislamiento multi-tenant).

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryUnitOfWork } from "../../../adapters/in-memory-unit-of-work.js";
import { allocateOrder } from "../allocate-order.js";

describe("allocateOrder — Reserva de Stock (InMemoryUnitOfWork + @wms/domain)", () => {
  let uow: InMemoryUnitOfWork;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork({
      products: [
        { id: "product-1", tenantId: "tenant-1", sku: "SKU-001", name: "Producto 1" },
        { id: "product-2", tenantId: "tenant-1", sku: "SKU-002", name: "Producto 2" },
      ],
      locations: [
        { id: "loc-B", tenantId: "tenant-1", warehouseId: "wh-1", code: "B-02-01", type: "STORAGE", isActive: true },
        { id: "loc-A", tenantId: "tenant-1", warehouseId: "wh-1", code: "A-01-01", type: "STORAGE", isActive: true },
        { id: "loc-REC", tenantId: "tenant-1", warehouseId: "wh-1", code: "REC-01", type: "RECEIVING", isActive: true },
        { id: "loc-other-tenant", tenantId: "tenant-2", warehouseId: "wh-2", code: "A-01-01", type: "STORAGE", isActive: true },
      ],
      balances: [
        { id: "bal-B", tenantId: "tenant-1", locationId: "loc-B", productId: "product-1", onHandQty: 4, allocatedQty: 0 },
        { id: "bal-A", tenantId: "tenant-1", locationId: "loc-A", productId: "product-1", onHandQty: 4, allocatedQty: 0 },
        { id: "bal-REC", tenantId: "tenant-1", locationId: "loc-REC", productId: "product-1", onHandQty: 100, allocatedQty: 0 },
        { id: "bal-t2", tenantId: "tenant-2", locationId: "loc-other-tenant", productId: "product-1", onHandQty: 50, allocatedQty: 0 },
      ],
      orders: [
        {
          id: "order-1",
          tenantId: "tenant-1",
          warehouseId: "wh-1",
          status: "PENDING",
          externalRef: "#1001",
          lines: [{ id: "line-1", productId: "product-1", requestedQty: 3, pickedQty: 0 }],
        },
        {
          id: "order-t2",
          tenantId: "tenant-2",
          warehouseId: "wh-2",
          status: "PENDING",
          externalRef: "#2001",
          lines: [{ id: "line-t2", productId: "product-1", requestedQty: 2, pickedQty: 0 }],
        },
      ],
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Happy Path", () => {
    it("reserva stock de una sola ubicación y crea WarehouseTask PICKING", async () => {
      const taskId = await allocateOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        userId: "user-1",
        unitOfWork: uow,
      });

      expect(taskId).toBeTruthy();

      // Ordenado lexicográficamente: toma primero loc-A (A-01-01)
      const balA = uow.state.balances.find((b) => b.id === "bal-A");
      expect(balA?.allocatedQty).toBe(3);

      const order = uow.state.orders.find((o) => o.id === "order-1");
      expect(order?.status).toBe("ALLOCATED");

      const task = uow.state.tasks.find((t) => t.id === taskId);
      expect(task?.type).toBe("PICKING");
      expect(task?.status).toBe("PENDING");
      expect(task?.steps).toHaveLength(1);
      expect(task?.steps[0]?.locationId).toBe("loc-A");

      expect(uow.state.transactions).toHaveLength(1);
      expect(uow.state.transactions[0]).toMatchObject({
        reason: "ALLOCATION",
        quantity: 3,
        fromLocationId: "loc-A",
        referenceId: "order-1",
      });
    });

    it("reserva stock de múltiples ubicaciones y ordena los TaskSteps por location.code", async () => {
      uow.state.orders[0]!.lines[0]!.requestedQty = 6;

      const taskId = await allocateOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        unitOfWork: uow,
      });

      expect(uow.state.balances.find((b) => b.id === "bal-A")?.allocatedQty).toBe(4);
      expect(uow.state.balances.find((b) => b.id === "bal-B")?.allocatedQty).toBe(2);

      const task = uow.state.tasks.find((t) => t.id === taskId);
      expect(task?.steps.map((s) => ({ loc: s.locationId, seq: s.sequence, qty: s.expectedQty }))).toEqual([
        { loc: "loc-A", seq: 1, qty: 4 },
        { loc: "loc-B", seq: 2, qty: 2 },
      ]);
    });

    it("permite re-alocar un pedido que está en estado ON_HOLD", async () => {
      uow.state.orders[0]!.status = "ON_HOLD";

      const taskId = await allocateOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        unitOfWork: uow,
      });

      expect(taskId).toBeTruthy();
      expect(uow.state.orders[0]?.status).toBe("ALLOCATED");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Romper a propósito — Estados inválidos, Stock insuficiente, Rollback y Multi-Tenant", () => {
    it("lanza ORDER_NOT_FOUND (404) si el pedido no existe", async () => {
      await expect(
        allocateOrder({ orderId: "order-x", tenantId: "tenant-1", unitOfWork: uow }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 404 });
    });

    it("lanza ORDER_NOT_FOUND (404) si el pedido pertenece a otro tenant", async () => {
      await expect(
        allocateOrder({ orderId: "order-t2", tenantId: "tenant-1", unitOfWork: uow }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 404 });

      // No toca el stock ni estado de tenant-2
      expect(uow.state.balances.find((b) => b.id === "bal-t2")?.allocatedQty).toBe(0);
    });

    it.each(["ALLOCATED", "PICKING", "PACKED", "SHIPPED", "CANCELLED"] as const)(
      "lanza ORDER_ALREADY_ALLOCATED (409) si el pedido está en estado %s",
      async (status) => {
        uow.state.orders[0]!.status = status;

        await expect(
          allocateOrder({ orderId: "order-1", tenantId: "tenant-1", unitOfWork: uow }),
        ).rejects.toMatchObject({ code: "ORDER_ALREADY_ALLOCATED", statusCode: 409 });

        expect(uow.state.tasks).toHaveLength(0);
      },
    );

    it("ignora ubicaciones RECEIVING y falla con INSUFFICIENT_STOCK si no hay STORAGE", async () => {
      uow.state.balances = uow.state.balances.filter((b) => b.locationId === "loc-REC");

      await expect(
        allocateOrder({ orderId: "order-1", tenantId: "tenant-1", unitOfWork: uow }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", statusCode: 409 });

      expect(uow.state.transactions).toHaveLength(0);
    });

    it("hace rollback completo de reservas previas cuando una segunda línea no tiene stock suficiente", async () => {
      uow.state.orders[0]!.lines.push({
        id: "line-2",
        productId: "product-2",
        requestedQty: 5, // product-2 no tiene stock
        pickedQty: 0,
      });

      await expect(
        allocateOrder({ orderId: "order-1", tenantId: "tenant-1", unitOfWork: uow }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", statusCode: 409 });

      // La línea 1 NO debe haber dejado stock reservado ni transacciones en Ledger
      expect(uow.state.balances.find((b) => b.id === "bal-A")?.allocatedQty).toBe(0);
      expect(uow.state.balances.find((b) => b.id === "bal-B")?.allocatedQty).toBe(0);
      expect(uow.state.transactions).toHaveLength(0);
      expect(uow.state.tasks).toHaveLength(0);
      expect(uow.state.orders[0]?.status).toBe("PENDING");
    });

    it("rechaza con INSUFFICIENT_STOCK reportando las unidades faltantes", async () => {
      uow.state.orders[0]!.lines[0]!.requestedQty = 10; // solo hay 8 en STORAGE

      await expect(
        allocateOrder({ orderId: "order-1", tenantId: "tenant-1", unitOfWork: uow }),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK",
        statusCode: 409,
        details: expect.objectContaining({ missing: 2 }),
      });

      expect(uow.state.balances.find((b) => b.id === "bal-A")?.allocatedQty).toBe(0);
      expect(uow.state.balances.find((b) => b.id === "bal-B")?.allocatedQty).toBe(0);
    });
  });
});
