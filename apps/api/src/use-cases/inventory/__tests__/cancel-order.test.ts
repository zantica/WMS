// apps/api/src/use-cases/inventory/__tests__/cancel-order.test.ts
// Suite de tests unitarios para cancelOrder usando InMemoryUnitOfWork + @wms/domain:
// Suites: Happy Path y "Romper a propósito" (releaseUpTo clamp a 0, estados terminales,
// pasos resueltos no PENDING, aislamiento multi-tenant y rollback).

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryUnitOfWork } from "../../../adapters/in-memory-unit-of-work.js";
import { cancelOrder } from "../cancel-order.js";

describe("cancelOrder — Cancelación de Pedidos y Liberación de Reservas (InMemoryUnitOfWork + @wms/domain)", () => {
  let uow: InMemoryUnitOfWork;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork({
      products: [
        { id: "prod-1", tenantId: "tenant-1", sku: "SKU-1", name: "Producto 1" },
        { id: "prod-2", tenantId: "tenant-1", sku: "SKU-2", name: "Producto 2" },
        { id: "prod-3", tenantId: "tenant-1", sku: "SKU-3", name: "Producto 3" },
      ],
      balances: [
        { id: "bal-A01", tenantId: "tenant-1", locationId: "loc-A01", productId: "prod-1", onHandQty: 10, allocatedQty: 4 },
        { id: "bal-B02", tenantId: "tenant-1", locationId: "loc-B02", productId: "prod-2", onHandQty: 8, allocatedQty: 3 },
        { id: "bal-C03", tenantId: "tenant-1", locationId: "loc-C03", productId: "prod-3", onHandQty: 5, allocatedQty: 0 },
        { id: "bal-t2", tenantId: "tenant-2", locationId: "loc-A01", productId: "prod-1", onHandQty: 10, allocatedQty: 4 },
      ],
      orders: [
        {
          id: "order-1",
          tenantId: "tenant-1",
          warehouseId: "wh-1",
          status: "ALLOCATED",
          externalRef: "#1001",
          notes: null,
          lines: [{ id: "line-1", productId: "prod-1", requestedQty: 4, pickedQty: 0 }],
        },
        {
          id: "order-t2",
          tenantId: "tenant-2",
          warehouseId: "wh-2",
          status: "ALLOCATED",
          externalRef: "#2001",
          notes: null,
          lines: [{ id: "line-t2", productId: "prod-1", requestedQty: 4, pickedQty: 0 }],
        },
      ],
      tasks: [
        {
          id: "task-pick-1",
          tenantId: "tenant-1",
          orderId: "order-1",
          receiptRef: null,
          type: "PICKING",
          status: "PENDING",
          assignedTo: null,
          steps: [
            {
              id: "step-1",
              taskId: "task-pick-1",
              sequence: 1,
              locationId: "loc-A01",
              productId: "prod-1",
              expectedQty: 4,
              scannedQty: 0,
              status: "PENDING",
            },
          ],
        },
      ],
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Happy Path", () => {
    it("cancela un pedido PENDING sin reservas ni tareas activas y registra el motivo", async () => {
      uow.state.orders[0]!.status = "PENDING";
      uow.state.tasks = [];

      const result = await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        userId: "user-1",
        reason: "Cliente solicitó cancelación",
        unitOfWork: uow,
      });

      expect(result).toEqual({
        orderId: "order-1",
        status: "CANCELLED",
        cancelledTaskIds: [],
        releasedAllocations: [],
      });

      expect(uow.state.orders[0]?.status).toBe("CANCELLED");
      expect(uow.state.orders[0]?.notes).toBe("Cancelled: Cliente solicitó cancelación");
      expect(uow.state.transactions).toHaveLength(0);
    });

    it("cancela un pedido ON_HOLD concatenando el motivo a las notas previas", async () => {
      uow.state.orders[0]!.status = "ON_HOLD";
      uow.state.orders[0]!.notes = "Retenido por falta de stock";
      uow.state.tasks = [];

      await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        reason: "Sin reposición prevista",
        unitOfWork: uow,
      });

      expect(uow.state.orders[0]?.status).toBe("CANCELLED");
      expect(uow.state.orders[0]?.notes).toBe(
        "Retenido por falta de stock | Cancelled: Sin reposición prevista",
      );
    });

    it("libera el total reservado, registra ALLOCATION_CANCEL y cancela la tarea cuando está ALLOCATED", async () => {
      const result = await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        userId: "sup-1",
        reason: "Fraude detectado",
        unitOfWork: uow,
      });

      expect(result).toEqual({
        orderId: "order-1",
        status: "CANCELLED",
        cancelledTaskIds: ["task-pick-1"],
        releasedAllocations: [
          { productId: "prod-1", locationId: "loc-A01", quantity: 4 },
        ],
      });

      expect(uow.state.balances.find((b) => b.id === "bal-A01")?.allocatedQty).toBe(0);
      expect(uow.state.transactions).toHaveLength(1);
      expect(uow.state.transactions[0]).toMatchObject({
        tenantId: "tenant-1",
        productId: "prod-1",
        fromLocationId: "loc-A01",
        quantity: 4,
        reason: "ALLOCATION_CANCEL",
        referenceId: "order-1",
        userId: "sup-1",
        notes: "Order cancelled (#1001): Fraude detectado",
      });

      const task = uow.state.tasks[0]!;
      expect(task.status).toBe("CANCELLED");
      expect(task.steps[0]?.status).toBe("SKIPPED");
      expect(uow.state.orders[0]?.status).toBe("CANCELLED");
    });

    it("en PICKING parcial solo libera pasos PENDING (resuelto = no PENDING) y omite COMPLETED/EXCEPTION", async () => {
      uow.state.orders[0]!.status = "PICKING";
      uow.state.orders[0]!.externalRef = null;
      uow.state.tasks = [
        {
          id: "task-pick-partial",
          tenantId: "tenant-1",
          orderId: "order-1",
          receiptRef: null,
          type: "PICKING",
          status: "IN_PROGRESS",
          assignedTo: null,
          steps: [
            { id: "step-done", taskId: "task-pick-partial", sequence: 1, locationId: "loc-A01", productId: "prod-1", expectedQty: 3, scannedQty: 3, status: "COMPLETED" },
            { id: "step-partial", taskId: "task-pick-partial", sequence: 2, locationId: "loc-B02", productId: "prod-2", expectedQty: 5, scannedQty: 2, status: "PENDING" },
            { id: "step-exc", taskId: "task-pick-partial", sequence: 3, locationId: "loc-C03", productId: "prod-3", expectedQty: 2, scannedQty: 0, status: "EXCEPTION" },
          ],
        },
      ];

      const result = await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        unitOfWork: uow,
      });

      expect(result.releasedAllocations).toEqual([
        { productId: "prod-2", locationId: "loc-B02", quantity: 3 },
      ]);
      expect(uow.state.balances.find((b) => b.id === "bal-B02")?.allocatedQty).toBe(0);
      expect(uow.state.tasks[0]?.steps.map((s) => s.status)).toEqual([
        "COMPLETED",
        "SKIPPED",
        "EXCEPTION",
      ]);
      expect(uow.state.transactions[0]?.notes).toBe(
        "Allocation cancelled for order order-1",
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Romper a propósito — Estados terminales, Clamping y Multi-Tenant", () => {
    it("lanza ORDER_NOT_FOUND (404) si el pedido no existe", async () => {
      await expect(
        cancelOrder({ orderId: "order-missing", tenantId: "tenant-1", unitOfWork: uow }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 404 });
    });

    it("lanza ORDER_NOT_FOUND (404) si el pedido pertenece a otro tenant", async () => {
      await expect(
        cancelOrder({ orderId: "order-t2", tenantId: "tenant-1", unitOfWork: uow }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 404 });

      expect(uow.state.balances.find((b) => b.id === "bal-t2")?.allocatedQty).toBe(4);
    });

    it.each(["PACKED", "SHIPPED", "CANCELLED"] as const)(
      "lanza VALIDATION_ERROR (409) si el pedido está en estado %s",
      async (invalidStatus) => {
        uow.state.orders[0]!.status = invalidStatus;

        await expect(
          cancelOrder({ orderId: "order-1", tenantId: "tenant-1", unitOfWork: uow }),
        ).rejects.toMatchObject({
          code: "VALIDATION_ERROR",
          statusCode: 409,
          details: expect.objectContaining({ currentStatus: invalidStatus }),
        });

        expect(uow.state.transactions).toHaveLength(0);
        expect(uow.state.balances.find((b) => b.id === "bal-A01")?.allocatedQty).toBe(4);
      },
    );

    it("usa releaseUpTo (clamp a 0): nunca deja allocatedQty negativo ni falla si falta balance", async () => {
      // Balance tiene solo allocated=2, pero el step esperaba 5
      uow.state.balances[0]!.allocatedQty = 2;
      uow.state.tasks[0]!.steps = [
        { id: "step-capped", taskId: "task-pick-1", sequence: 1, locationId: "loc-A01", productId: "prod-1", expectedQty: 5, scannedQty: 0, status: "PENDING" },
        { id: "step-missing-bal", taskId: "task-pick-1", sequence: 2, locationId: "loc-Z99", productId: "prod-2", expectedQty: 2, scannedQty: 0, status: "PENDING" },
      ];

      const result = await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        unitOfWork: uow,
      });

      expect(result.releasedAllocations).toEqual([
        { productId: "prod-1", locationId: "loc-A01", quantity: 2 },
      ]);
      expect(uow.state.balances[0]?.allocatedQty).toBe(0);
      expect(uow.state.transactions).toHaveLength(1);
    });
  });
});
