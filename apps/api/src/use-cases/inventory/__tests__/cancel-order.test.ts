// apps/api/src/use-cases/inventory/__tests__/cancel-order.test.ts
// Suite de tests unitarios para cancelOrder (F3.1):
// Verifica liberación atómica de reservas (ALLOCATION_CANCEL), bloqueo pesimista,
// aislamiento multi-tenant, cancelación de tareas PICKING y rechazo en estados terminales.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { cancelOrder } from "../cancel-order.js";

// ── Mock de Prisma ────────────────────────────────────────────────────────────
const mockTx = {
  salesOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  inventoryBalance: {
    update: vi.fn(),
  },
  inventoryTransaction: {
    create: vi.fn(),
  },
  taskStep: {
    update: vi.fn(),
  },
  warehouseTask: {
    update: vi.fn(),
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
  externalRef: "#1001",
  status: "ALLOCATED" as const,
  notes: null as string | null,
  tasks: [
    {
      id: "task-pick-1",
      tenantId: "tenant-1",
      orderId: "order-1",
      type: "PICKING" as const,
      status: "PENDING" as const,
      steps: [
        {
          id: "step-1",
          taskId: "task-pick-1",
          sequence: 1,
          locationId: "loc-A01",
          productId: "prod-1",
          expectedQty: 4,
          scannedQty: 0,
          status: "PENDING" as const,
        },
      ],
    },
  ],
};

describe("cancelOrder — Cancelación de Pedidos y Liberación de Reservas (ALLOCATION_CANCEL)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.salesOrder.update.mockResolvedValue({});
    mockTx.inventoryBalance.update.mockResolvedValue({});
    mockTx.inventoryTransaction.create.mockResolvedValue({});
    mockTx.taskStep.update.mockResolvedValue({});
    mockTx.warehouseTask.update.mockResolvedValue({});
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Validaciones de existencia, multi-tenancy y estados del pedido", () => {
    it("lanza ORDER_NOT_FOUND (404) si el pedido no existe", async () => {
      mockTx.salesOrder.findFirst.mockResolvedValue(null);

      await expect(
        cancelOrder({ orderId: "order-missing", tenantId: "tenant-1" }),
      ).rejects.toMatchObject({
        code: "ORDER_NOT_FOUND",
        statusCode: 404,
      });

      expect(mockTx.salesOrder.update).not.toHaveBeenCalled();
      expect(mockTx.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it("lanza ORDER_NOT_FOUND (404) si el pedido pertenece a otro tenant", async () => {
      mockTx.salesOrder.findFirst.mockResolvedValue({
        ...BASE_ORDER,
        tenantId: "tenant-otro",
      });

      await expect(
        cancelOrder({ orderId: "order-1", tenantId: "tenant-1" }),
      ).rejects.toMatchObject({
        code: "ORDER_NOT_FOUND",
        statusCode: 404,
      });

      expect(mockTx.salesOrder.update).not.toHaveBeenCalled();
      expect(mockTx.inventoryBalance.update).not.toHaveBeenCalled();
    });

    it.each(["PACKED", "SHIPPED", "CANCELLED"] as const)(
      "lanza VALIDATION_ERROR (409) si el pedido está en estado terminal %s",
      async (invalidStatus) => {
        mockTx.salesOrder.findFirst.mockResolvedValue({
          ...BASE_ORDER,
          status: invalidStatus,
        });

        await expect(
          cancelOrder({ orderId: "order-1", tenantId: "tenant-1" }),
        ).rejects.toMatchObject({
          code: "VALIDATION_ERROR",
          statusCode: 409,
          details: expect.objectContaining({ currentStatus: invalidStatus }),
        });

        expect(mockTx.inventoryBalance.update).not.toHaveBeenCalled();
        expect(mockTx.inventoryTransaction.create).not.toHaveBeenCalled();
        expect(mockTx.salesOrder.update).not.toHaveBeenCalled();
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Cancelación en estados previos a reserva (PENDING / ON_HOLD)", () => {
    it("cancela un pedido PENDING sin reservas ni tareas activas y registra el motivo", async () => {
      mockTx.salesOrder.findFirst.mockResolvedValue({
        ...BASE_ORDER,
        status: "PENDING",
        notes: null,
        tasks: [],
      });

      const result = await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        userId: "user-1",
        reason: "Cliente solicitó cancelación",
      });

      expect(result).toEqual({
        orderId: "order-1",
        status: "CANCELLED",
        cancelledTaskIds: [],
        releasedAllocations: [],
      });

      expect(mockTx.$queryRaw).not.toHaveBeenCalled();
      expect(mockTx.inventoryBalance.update).not.toHaveBeenCalled();
      expect(mockTx.inventoryTransaction.create).not.toHaveBeenCalled();
      expect(mockTx.salesOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: {
          status: "CANCELLED",
          notes: "Cancelled: Cliente solicitó cancelación",
        },
      });
    });

    it("cancela un pedido ON_HOLD concatenando el motivo a las notas previas", async () => {
      mockTx.salesOrder.findFirst.mockResolvedValue({
        ...BASE_ORDER,
        status: "ON_HOLD",
        notes: "Retenido por falta de stock",
        tasks: [],
      });

      await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        reason: "Sin reposición prevista",
      });

      expect(mockTx.salesOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: {
          status: "CANCELLED",
          notes: "Retenido por falta de stock | Cancelled: Sin reposición prevista",
        },
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Liberación atómica de reservas (ALLOCATED / PICKING)", () => {
    it("libera el total reservado, registra ALLOCATION_CANCEL y cancela la tarea cuando el pedido está ALLOCATED", async () => {
      mockTx.salesOrder.findFirst.mockResolvedValue(BASE_ORDER);
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: "bal-1",
          on_hand_qty: 10,
          allocated_qty: 4,
        },
      ]);

      const result = await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
        userId: "sup-1",
        reason: " Fraude detectado ",
      });

      expect(result).toEqual({
        orderId: "order-1",
        status: "CANCELLED",
        cancelledTaskIds: ["task-pick-1"],
        releasedAllocations: [
          {
            productId: "prod-1",
            locationId: "loc-A01",
            quantity: 4,
          },
        ],
      });

      // Debe decrementar allocatedQty en 4 unidades
      expect(mockTx.inventoryBalance.update).toHaveBeenCalledWith({
        where: { id: "bal-1" },
        data: { allocatedQty: { decrement: 4 } },
      });

      // Debe insertar el asiento inmutable ALLOCATION_CANCEL en el Ledger
      expect(mockTx.inventoryTransaction.create).toHaveBeenCalledWith({
        data: {
          tenantId: "tenant-1",
          productId: "prod-1",
          fromLocationId: "loc-A01",
          quantity: 4,
          reason: "ALLOCATION_CANCEL",
          referenceId: "order-1",
          userId: "sup-1",
          notes: "Order cancelled (#1001):  Fraude detectado ",
        },
      });

      // El paso pendiente debe quedar como SKIPPED y la tarea como CANCELLED
      expect(mockTx.taskStep.update).toHaveBeenCalledWith({
        where: { id: "step-1" },
        data: { status: "SKIPPED" },
      });
      expect(mockTx.warehouseTask.update).toHaveBeenCalledWith({
        where: { id: "task-pick-1" },
        data: {
          status: "CANCELLED",
          completedAt: expect.any(Date),
        },
      });
    });

    it("en un pedido en PICKING parcial, solo libera la cantidad pendiente (expectedQty - scannedQty) e ignora pasos COMPLETED", async () => {
      mockTx.salesOrder.findFirst.mockResolvedValue({
        ...BASE_ORDER,
        externalRef: null,
        status: "PICKING",
        tasks: [
          {
            id: "task-pick-partial",
            tenantId: "tenant-1",
            orderId: "order-1",
            type: "PICKING",
            status: "IN_PROGRESS",
            steps: [
              {
                id: "step-done",
                taskId: "task-pick-partial",
                sequence: 1,
                locationId: "loc-A01",
                productId: "prod-1",
                expectedQty: 3,
                scannedQty: 3,
                status: "COMPLETED",
              },
              {
                id: "step-partial",
                taskId: "task-pick-partial",
                sequence: 2,
                locationId: "loc-B02",
                productId: "prod-2",
                expectedQty: 5,
                scannedQty: 2,
                status: "PENDING",
              },
              {
                id: "step-exc",
                taskId: "task-pick-partial",
                sequence: 3,
                locationId: "loc-C03",
                productId: "prod-3",
                expectedQty: 2,
                scannedQty: 0,
                status: "EXCEPTION",
              },
            ],
          },
        ],
      });

      mockTx.$queryRaw
        .mockResolvedValueOnce([
          { id: "bal-B02", on_hand_qty: 8, allocated_qty: 3 },
        ])
        .mockResolvedValueOnce([
          { id: "bal-C03", on_hand_qty: 5, allocated_qty: 2 },
        ]);

      const result = await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
      });

      expect(result.releasedAllocations).toEqual([
        { productId: "prod-2", locationId: "loc-B02", quantity: 3 },
        { productId: "prod-3", locationId: "loc-C03", quantity: 2 },
      ]);

      // Solo 2 pasos no completados deben consultarse y marcarse como SKIPPED
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(2);
      expect(mockTx.inventoryBalance.update).toHaveBeenCalledTimes(2);
      expect(mockTx.inventoryTransaction.create).toHaveBeenCalledTimes(2);
      expect(mockTx.taskStep.update).toHaveBeenCalledTimes(2);

      expect(mockTx.inventoryTransaction.create).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            productId: "prod-2",
            fromLocationId: "loc-B02",
            quantity: 3,
            reason: "ALLOCATION_CANCEL",
            userId: null,
            notes: "Allocation cancelled for order order-1",
          }),
        }),
      );
    });

    it("🔒 Regla de No-Negatividad: nunca decrementa más que el allocated_qty actual ni deja allocatedQty < 0", async () => {
      mockTx.salesOrder.findFirst.mockResolvedValue({
        ...BASE_ORDER,
        tasks: [
          {
            id: "task-pick-1",
            tenantId: "tenant-1",
            orderId: "order-1",
            type: "PICKING",
            status: "PENDING",
            steps: [
              {
                id: "step-capped",
                taskId: "task-pick-1",
                sequence: 1,
                locationId: "loc-A01",
                productId: "prod-1",
                expectedQty: 5,
                scannedQty: 0,
                status: "PENDING",
              },
              {
                id: "step-no-balance",
                taskId: "task-pick-1",
                sequence: 2,
                locationId: "loc-Z99",
                productId: "prod-2",
                expectedQty: 2,
                scannedQty: 0,
                status: "PENDING",
              },
            ],
          },
        ],
      });

      // Primer paso solo tiene allocated_qty = 2 (menor a 5); segundo no tiene fila de balance
      mockTx.$queryRaw
        .mockResolvedValueOnce([
          { id: "bal-1", on_hand_qty: 10, allocated_qty: 2 },
        ])
        .mockResolvedValueOnce([]);

      const result = await cancelOrder({
        orderId: "order-1",
        tenantId: "tenant-1",
      });

      expect(result.releasedAllocations).toEqual([
        { productId: "prod-1", locationId: "loc-A01", quantity: 2 },
      ]);

      expect(mockTx.inventoryBalance.update).toHaveBeenCalledTimes(1);
      expect(mockTx.inventoryBalance.update).toHaveBeenCalledWith({
        where: { id: "bal-1" },
        data: { allocatedQty: { decrement: 2 } },
      });
      expect(mockTx.inventoryTransaction.create).toHaveBeenCalledTimes(1);
      expect(mockTx.taskStep.update).toHaveBeenCalledTimes(2);
    });
  });
});
