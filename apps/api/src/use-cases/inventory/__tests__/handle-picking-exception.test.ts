// apps/api/src/use-cases/inventory/__tests__/handle-picking-exception.test.ts
// Suite de tests unitarios para handlePickingException (F3.2):
// Verifica liberación atómica de reserva en ubicación fallida (ALLOCATION_CANCEL),
// re-asignación en ubicaciones STORAGE alternativas (ALLOCATION + nuevos TaskStep),
// transición a ON_HOLD con liberación total de pasos pendientes cuando no hay ATP suficiente,
// protección de no-negatividad en allocatedQty y aislamiento multi-tenant.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handlePickingException } from "../handle-picking-exception.js";

// ── Mock de Prisma ────────────────────────────────────────────────────────────
const mockTx = {
  warehouseTask: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  taskStep: {
    update: vi.fn(),
    create: vi.fn(),
  },
  inventoryBalance: {
    update: vi.fn(),
  },
  inventoryTransaction: {
    create: vi.fn(),
  },
  salesOrder: {
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

const BASE_PICKING_TASK = {
  id: "task-pick-1",
  tenantId: "tenant-1",
  orderId: "order-1",
  type: "PICKING" as const,
  status: "IN_PROGRESS" as const,
  order: {
    id: "order-1",
    tenantId: "tenant-1",
    warehouseId: "warehouse-1",
    externalRef: "#ORD-500",
    status: "PICKING" as const,
  },
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
      location: {
        id: "loc-A01",
        tenantId: "tenant-1",
        warehouseId: "warehouse-1",
        code: "A-01-01",
        type: "STORAGE" as const,
        isActive: true,
      },
      product: {
        id: "prod-1",
        tenantId: "tenant-1",
        sku: "SKU-001",
        name: "Teclado Mecánico",
      },
    },
  ],
};

describe("handlePickingException — Gestión de Excepciones de Picking y Re-asignación de Stock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.warehouseTask.update.mockResolvedValue({});
    mockTx.taskStep.update.mockResolvedValue({});
    mockTx.inventoryBalance.update.mockResolvedValue({});
    mockTx.inventoryTransaction.create.mockResolvedValue({});
    mockTx.salesOrder.update.mockResolvedValue({});
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Validaciones de existencia, multi-tenancy y estados previos", () => {
    it("lanza TASK_NOT_FOUND (404) si la tarea no existe o pertenece a otro tenant", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue(null);

      await expect(
        handlePickingException({
          taskId: "task-missing",
          stepId: "step-1",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND",
        statusCode: 404,
      });

      expect(mockTx.taskStep.update).not.toHaveBeenCalled();
      expect(mockTx.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it("lanza TASK_NOT_FOUND (404) si la tarea devuelta tiene un tenantId distinto", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_PICKING_TASK,
        tenantId: "tenant-otro",
      });

      await expect(
        handlePickingException({
          taskId: "task-pick-1",
          stepId: "step-1",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND",
        statusCode: 404,
      });

      expect(mockTx.inventoryBalance.update).not.toHaveBeenCalled();
    });

    it("lanza VALIDATION_ERROR (422) si la tarea no es de tipo PICKING", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_PICKING_TASK,
        type: "PUTAWAY",
      });

      await expect(
        handlePickingException({
          taskId: "task-pick-1",
          stepId: "step-1",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 422,
      });

      expect(mockTx.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it.each(["COMPLETED", "CANCELLED"] as const)(
      "lanza VALIDATION_ERROR (409) si la tarea ya está en estado terminal %s",
      async (terminalStatus) => {
        mockTx.warehouseTask.findFirst.mockResolvedValue({
          ...BASE_PICKING_TASK,
          status: terminalStatus,
        });

        await expect(
          handlePickingException({
            taskId: "task-pick-1",
            stepId: "step-1",
            tenantId: "tenant-1",
          }),
        ).rejects.toMatchObject({
          code: "VALIDATION_ERROR",
          statusCode: 409,
        });

        expect(mockTx.inventoryTransaction.create).not.toHaveBeenCalled();
      },
    );

    it("lanza ORDER_NOT_FOUND (404) si la tarea PICKING no tiene pedido válido del mismo tenant", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_PICKING_TASK,
        orderId: null,
        order: null,
      });

      await expect(
        handlePickingException({
          taskId: "task-pick-1",
          stepId: "step-1",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "ORDER_NOT_FOUND",
        statusCode: 404,
      });
    });

    it("lanza TASK_NOT_FOUND (404) si el stepId no pertenece a la tarea", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue(BASE_PICKING_TASK);

      await expect(
        handlePickingException({
          taskId: "task-pick-1",
          stepId: "step-inexistente",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND",
        statusCode: 404,
      });
    });

    it.each(["COMPLETED", "EXCEPTION", "SKIPPED"] as const)(
      "lanza VALIDATION_ERROR (409) si el paso ya está en estado %s",
      async (stepStatus) => {
        mockTx.warehouseTask.findFirst.mockResolvedValue({
          ...BASE_PICKING_TASK,
          steps: [
            {
              ...BASE_PICKING_TASK.steps[0]!,
              status: stepStatus,
            },
          ],
        });

        await expect(
          handlePickingException({
            taskId: "task-pick-1",
            stepId: "step-1",
            tenantId: "tenant-1",
          }),
        ).rejects.toMatchObject({
          code: "VALIDATION_ERROR",
          statusCode: 409,
        });
      },
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Caso A: Stock alternativo suficiente en otras ubicaciones STORAGE (Re-alocación exitosa)", () => {
    it("libera reserva original (ALLOCATION_CANCEL), reserva en 1 ubicación alternativa (ALLOCATION) y crea nuevo TaskStep", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue(BASE_PICKING_TASK);

      // 1ª consulta raw: bloqueo de balance en ubicación original loc-A01
      // 2ª consulta raw: ubicaciones STORAGE alternativas con ATP > 0
      mockTx.$queryRaw
        .mockResolvedValueOnce([
          { id: "bal-A01", on_hand_qty: 4, allocated_qty: 4 },
        ])
        .mockResolvedValueOnce([
          {
            id: "bal-B01",
            location_id: "loc-B01",
            location_code: "B-01-01",
            on_hand_qty: 10,
            allocated_qty: 2,
          },
        ]);

      mockTx.taskStep.create.mockResolvedValue({
        id: "step-replacement-1",
        taskId: "task-pick-1",
        sequence: 2,
        locationId: "loc-B01",
        productId: "prod-1",
        expectedQty: 4,
        scannedQty: 0,
        status: "PENDING",
      });

      const result = await handlePickingException({
        taskId: "task-pick-1",
        stepId: "step-1",
        tenantId: "tenant-1",
        exceptionNote: "Estantería A-01-01 vacía",
        userId: "op-1",
      });

      expect(result).toEqual({
        stepId: "step-1",
        taskId: "task-pick-1",
        orderId: "order-1",
        stepStatus: "EXCEPTION",
        taskStatus: "IN_PROGRESS",
        orderStatus: "PICKING",
        reallocated: true,
        releasedOriginalQty: 4,
        replacementSteps: [
          {
            id: "step-replacement-1",
            sequence: 2,
            locationId: "loc-B01",
            locationCode: "B-01-01",
            expectedQty: 4,
          },
        ],
        note: "Estantería A-01-01 vacía",
      });

      // Paso original marcado como EXCEPTION
      expect(mockTx.taskStep.update).toHaveBeenCalledWith({
        where: { id: "step-1" },
        data: {
          status: "EXCEPTION",
          exceptionNote: "Estantería A-01-01 vacía",
        },
      });

      // Liberación en ubicación original + reserva en ubicación alternativa
      expect(mockTx.inventoryBalance.update).toHaveBeenNthCalledWith(1, {
        where: { id: "bal-A01" },
        data: { allocatedQty: { decrement: 4 } },
      });
      expect(mockTx.inventoryBalance.update).toHaveBeenNthCalledWith(2, {
        where: { id: "bal-B01" },
        data: { allocatedQty: { increment: 4 } },
      });

      // Asientos contables inmutables: ALLOCATION_CANCEL y ALLOCATION
      expect(mockTx.inventoryTransaction.create).toHaveBeenNthCalledWith(1, {
        data: {
          tenantId: "tenant-1",
          productId: "prod-1",
          fromLocationId: "loc-A01",
          quantity: 4,
          reason: "ALLOCATION_CANCEL",
          referenceId: "order-1",
          userId: "op-1",
          notes: "Picking exception at A-01-01: Estantería A-01-01 vacía",
        },
      });
      expect(mockTx.inventoryTransaction.create).toHaveBeenNthCalledWith(2, {
        data: {
          tenantId: "tenant-1",
          productId: "prod-1",
          fromLocationId: "loc-B01",
          quantity: 4,
          reason: "ALLOCATION",
          referenceId: "order-1",
          userId: "op-1",
          notes:
            "Re-allocated after picking exception at A-01-01 for order #ORD-500",
        },
      });

      // Tarea permanece en IN_PROGRESS y pedido no pasa a ON_HOLD
      expect(mockTx.warehouseTask.update).toHaveBeenCalledWith({
        where: { id: "task-pick-1" },
        data: { status: "IN_PROGRESS" },
      });
      expect(mockTx.salesOrder.update).not.toHaveBeenCalled();
    });

    it("tras escaneo parcial previo (expected=5, scanned=2), solo re-aloca missingQty=3 repartido entre 2 ubicaciones alternativas", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_PICKING_TASK,
        steps: [
          {
            ...BASE_PICKING_TASK.steps[0]!,
            expectedQty: 5,
            scannedQty: 2, // Ya se habían recogido 2 unidades antes de encontrar el resto dañado
          },
        ],
      });

      mockTx.$queryRaw
        .mockResolvedValueOnce([
          { id: "bal-A01", on_hand_qty: 3, allocated_qty: 3 },
        ])
        .mockResolvedValueOnce([
          {
            id: "bal-B01",
            location_id: "loc-B01",
            location_code: "B-01-01",
            on_hand_qty: 2,
            allocated_qty: 0, // ATP = 2
          },
          {
            id: "bal-C01",
            location_id: "loc-C01",
            location_code: "C-01-01",
            on_hand_qty: 5,
            allocated_qty: 1, // ATP = 4
          },
        ]);

      mockTx.taskStep.create
        .mockResolvedValueOnce({
          id: "step-rep-1",
          taskId: "task-pick-1",
          sequence: 2,
          locationId: "loc-B01",
          productId: "prod-1",
          expectedQty: 2,
          scannedQty: 0,
          status: "PENDING",
        })
        .mockResolvedValueOnce({
          id: "step-rep-2",
          taskId: "task-pick-1",
          sequence: 3,
          locationId: "loc-C01",
          productId: "prod-1",
          expectedQty: 1,
          scannedQty: 0,
          status: "PENDING",
        });

      const result = await handlePickingException({
        taskId: "task-pick-1",
        stepId: "step-1",
        tenantId: "tenant-1",
        exceptionNote: "3 unidades restantes dañadas",
      });

      expect(result.reallocated).toBe(true);
      expect(result.releasedOriginalQty).toBe(3);
      expect(result.replacementSteps).toEqual([
        {
          id: "step-rep-1",
          sequence: 2,
          locationId: "loc-B01",
          locationCode: "B-01-01",
          expectedQty: 2,
        },
        {
          id: "step-rep-2",
          sequence: 3,
          locationId: "loc-C01",
          locationCode: "C-01-01",
          expectedQty: 1,
        },
      ]);

      expect(mockTx.inventoryBalance.update).toHaveBeenCalledTimes(3);
      expect(mockTx.inventoryTransaction.create).toHaveBeenCalledTimes(3);
      expect(mockTx.taskStep.create).toHaveBeenCalledTimes(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Caso B: Stock alternativo insuficiente (Transición a ON_HOLD y limpieza de reservas)", () => {
    it("cuando no hay stock alternativo suficiente, libera la ubicación original y otros pasos PENDING, marca tarea EXCEPTION y pedido ON_HOLD", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_PICKING_TASK,
        steps: [
          {
            ...BASE_PICKING_TASK.steps[0]!,
            id: "step-1",
            sequence: 1,
            expectedQty: 4,
            scannedQty: 0,
            status: "PENDING" as const,
          },
          {
            id: "step-2-pending",
            taskId: "task-pick-1",
            sequence: 2,
            locationId: "loc-D01",
            productId: "prod-2",
            expectedQty: 2,
            scannedQty: 0,
            status: "PENDING" as const,
            location: {
              id: "loc-D01",
              tenantId: "tenant-1",
              warehouseId: "warehouse-1",
              code: "D-01-01",
              type: "STORAGE" as const,
              isActive: true,
            },
            product: {
              id: "prod-2",
              tenantId: "tenant-1",
              sku: "SKU-002",
              name: "Mouse Inalámbrico",
            },
          },
          {
            id: "step-3-completed",
            taskId: "task-pick-1",
            sequence: 3,
            locationId: "loc-E01",
            productId: "prod-3",
            expectedQty: 1,
            scannedQty: 1,
            status: "COMPLETED" as const,
            location: {
              id: "loc-E01",
              tenantId: "tenant-1",
              warehouseId: "warehouse-1",
              code: "E-01-01",
              type: "STORAGE" as const,
              isActive: true,
            },
            product: {
              id: "prod-3",
              tenantId: "tenant-1",
              sku: "SKU-003",
              name: "Alfombrilla",
            },
          },
        ],
      });

      // 1ª consulta raw: balance original de step-1 (loc-A01)
      // 2ª consulta raw: ubicaciones alternativas para prod-1 -> solo hay 1 unidad disponible (insuficiente para cubrir 4)
      // 3ª consulta raw: balance de step-2-pending (loc-D01) para liberarlo al pasar el pedido a ON_HOLD
      mockTx.$queryRaw
        .mockResolvedValueOnce([
          { id: "bal-A01", on_hand_qty: 4, allocated_qty: 4 },
        ])
        .mockResolvedValueOnce([
          {
            id: "bal-B01",
            location_id: "loc-B01",
            location_code: "B-01-01",
            on_hand_qty: 1,
            allocated_qty: 0, // ATP = 1 < 4
          },
        ])
        .mockResolvedValueOnce([
          { id: "bal-D01", on_hand_qty: 5, allocated_qty: 2 },
        ]);

      const result = await handlePickingException({
        taskId: "task-pick-1",
        stepId: "step-1",
        tenantId: "tenant-1",
        exceptionNote: "Sin stock físico en A-01-01",
        userId: "op-2",
      });

      expect(result).toEqual({
        stepId: "step-1",
        taskId: "task-pick-1",
        orderId: "order-1",
        stepStatus: "EXCEPTION",
        taskStatus: "EXCEPTION",
        orderStatus: "ON_HOLD",
        reallocated: false,
        releasedOriginalQty: 4,
        replacementSteps: [],
        note: "Sin stock físico en A-01-01",
      });

      // No debe crear pasos de reemplazo ni reservar en bal-B01
      expect(mockTx.taskStep.create).not.toHaveBeenCalled();

      // Debe haber liberado bal-A01 (4 uds) y bal-D01 (2 uds)
      expect(mockTx.inventoryBalance.update).toHaveBeenCalledTimes(2);
      expect(mockTx.inventoryBalance.update).toHaveBeenNthCalledWith(1, {
        where: { id: "bal-A01" },
        data: { allocatedQty: { decrement: 4 } },
      });
      expect(mockTx.inventoryBalance.update).toHaveBeenNthCalledWith(2, {
        where: { id: "bal-D01" },
        data: { allocatedQty: { decrement: 2 } },
      });

      // Dos asientos ALLOCATION_CANCEL en el Ledger
      expect(mockTx.inventoryTransaction.create).toHaveBeenCalledTimes(2);
      expect(mockTx.inventoryTransaction.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-1",
            productId: "prod-2",
            fromLocationId: "loc-D01",
            quantity: 2,
            reason: "ALLOCATION_CANCEL",
            referenceId: "order-1",
          }),
        }),
      );

      // El otro paso PENDING se marca como SKIPPED, y el pedido pasa a ON_HOLD
      expect(mockTx.taskStep.update).toHaveBeenCalledWith({
        where: { id: "step-2-pending" },
        data: { status: "SKIPPED" },
      });
      expect(mockTx.warehouseTask.update).toHaveBeenCalledWith({
        where: { id: "task-pick-1" },
        data: { status: "EXCEPTION" },
      });
      expect(mockTx.salesOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { status: "ON_HOLD" },
      });
    });

    it("🔒 Regla de No-Negatividad: nunca decrementa más que el allocated_qty actual en la ubicación con excepción", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue(BASE_PICKING_TASK);

      // Ubicación original tiene allocated_qty = 1 aunque expectedQty = 4; sin stock alternativo
      mockTx.$queryRaw
        .mockResolvedValueOnce([
          { id: "bal-A01", on_hand_qty: 1, allocated_qty: 1 },
        ])
        .mockResolvedValueOnce([]);

      const result = await handlePickingException({
        taskId: "task-pick-1",
        stepId: "step-1",
        tenantId: "tenant-1",
      });

      expect(result.releasedOriginalQty).toBe(1);
      expect(result.reallocated).toBe(false);
      expect(result.orderStatus).toBe("ON_HOLD");
      expect(result.note).toBe("Operator reported exception");

      expect(mockTx.inventoryBalance.update).toHaveBeenCalledTimes(1);
      expect(mockTx.inventoryBalance.update).toHaveBeenCalledWith({
        where: { id: "bal-A01" },
        data: { allocatedQty: { decrement: 1 } },
      });
    });
  });
});
