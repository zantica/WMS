// apps/api/src/use-cases/tasks/__tests__/confirm-task-step.test.ts
// Tests unitarios para confirmTaskStep (F2.2).
// Verifica aislamiento multi-tenant, validación de código escaneado (INVALID_SCAN),
// pasos ya completados (VALIDATION_ERROR), reporte de excepciones (EXCEPTION),
// ejecución de PUTAWAY (RECEIVING -> STORAGE) y PICKING (STORAGE -> PACKING,
// liberación de allocatedQty, incremento de pickedQty y transición de SalesOrder a PACKED).

import { describe, it, expect, beforeEach, vi } from "vitest";
import { WmsError } from "../../../plugins/error-handler.js";
import { confirmTaskStep } from "../confirm-task-step.js";
import { moveStock } from "../../inventory/move-stock.js";

const mockPrisma = {
  warehouseTask: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  taskStep: {
    update: vi.fn(),
    findMany: vi.fn(),
  },
  salesOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  location: {
    findFirst: vi.fn(),
  },
  inventoryBalance: {
    updateMany: vi.fn(),
  },
  orderLine: {
    updateMany: vi.fn(),
  },
};

vi.mock("@wms/db", () => ({
  prisma: {
    warehouseTask: {
      findFirst: (...args: unknown[]) => mockPrisma.warehouseTask.findFirst(...args),
      update: (...args: unknown[]) => mockPrisma.warehouseTask.update(...args),
    },
    taskStep: {
      update: (...args: unknown[]) => mockPrisma.taskStep.update(...args),
      findMany: (...args: unknown[]) => mockPrisma.taskStep.findMany(...args),
    },
    salesOrder: {
      findFirst: (...args: unknown[]) => mockPrisma.salesOrder.findFirst(...args),
      update: (...args: unknown[]) => mockPrisma.salesOrder.update(...args),
    },
    location: {
      findFirst: (...args: unknown[]) => mockPrisma.location.findFirst(...args),
    },
    inventoryBalance: {
      updateMany: (...args: unknown[]) => mockPrisma.inventoryBalance.updateMany(...args),
    },
    orderLine: {
      updateMany: (...args: unknown[]) => mockPrisma.orderLine.updateMany(...args),
    },
  },
}));

vi.mock("../../inventory/move-stock.js", () => ({
  moveStock: vi.fn(),
}));

const BASE_PUTAWAY_TASK = {
  id: "task-put-1",
  tenantId: "tenant-1",
  orderId: null,
  receiptRef: "receipt-1001",
  type: "PUTAWAY" as const,
  status: "IN_PROGRESS" as const,
  steps: [
    {
      id: "step-put-1",
      taskId: "task-put-1",
      sequence: 1,
      locationId: "loc-storage-a01",
      productId: "product-1",
      expectedQty: 5,
      scannedQty: 0,
      status: "PENDING" as const,
      location: {
        id: "loc-storage-a01",
        tenantId: "tenant-1",
        warehouseId: "warehouse-1",
        code: "A-01-01",
        type: "STORAGE" as const,
        isActive: true,
      },
      product: {
        id: "product-1",
        tenantId: "tenant-1",
        sku: "SKU-001",
        name: "Monitor 27\"",
        barcode: "7509998887776",
      },
    },
  ],
};

const BASE_PICKING_TASK = {
  id: "task-pick-1",
  tenantId: "tenant-1",
  orderId: "order-1",
  receiptRef: null,
  type: "PICKING" as const,
  status: "IN_PROGRESS" as const,
  steps: [
    {
      id: "step-pick-1",
      taskId: "task-pick-1",
      sequence: 1,
      locationId: "loc-storage-a01",
      productId: "product-1",
      expectedQty: 3,
      scannedQty: 0,
      status: "PENDING" as const,
      location: {
        id: "loc-storage-a01",
        tenantId: "tenant-1",
        warehouseId: "warehouse-1",
        code: "A-01-01",
        type: "STORAGE" as const,
        isActive: true,
      },
      product: {
        id: "product-1",
        tenantId: "tenant-1",
        sku: "SKU-001",
        name: "Monitor 27\"",
        barcode: "7509998887776",
      },
    },
  ],
};

describe("confirmTaskStep — Confirmación de pasos PUTAWAY y PICKING", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(moveStock).mockResolvedValue(undefined);
    mockPrisma.taskStep.update.mockResolvedValue({});
    mockPrisma.warehouseTask.update.mockResolvedValue({});
    mockPrisma.salesOrder.update.mockResolvedValue({});
    mockPrisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.orderLine.updateMany.mockResolvedValue({ count: 1 });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Validaciones de existencia, pertenencia multi-tenant y estados previos", () => {
    it("lanza TASK_NOT_FOUND (404) si la tarea no existe o pertenece a otro tenant", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(null);

      await expect(
        confirmTaskStep({
          taskId: "task-inexistente",
          stepId: "step-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
        }),
      ).rejects.toThrow(WmsError);

      await expect(
        confirmTaskStep({
          taskId: "task-inexistente",
          stepId: "step-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
        }),
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND",
        statusCode: 404,
      });

      expect(mockPrisma.warehouseTask.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-inexistente", tenantId: "tenant-1" },
        }),
      );
      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza TASK_NOT_FOUND (404) si el stepId no existe dentro de la tarea", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_PUTAWAY_TASK,
        steps: [],
      });

      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-inexistente",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
        }),
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND",
        statusCode: 404,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza VALIDATION_ERROR (409) si la tarea ya está COMPLETED o CANCELLED", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_PUTAWAY_TASK,
        status: "COMPLETED",
      });

      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-put-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 409,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza VALIDATION_ERROR (409) si el paso ya fue COMPLETED previamente", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_PUTAWAY_TASK,
        steps: [
          {
            ...BASE_PUTAWAY_TASK.steps[0]!,
            scannedQty: 5,
            status: "COMPLETED",
          },
        ],
      });

      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-put-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 409,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza VALIDATION_ERROR (422) si quantity es menor o igual a 0", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PUTAWAY_TASK);

      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-put-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
          quantity: 0,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 422,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza INVALID_SCAN (422) cuando scannedCode no coincide con barcode, SKU ni código de ubicación", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PUTAWAY_TASK);

      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-put-1",
          tenantId: "tenant-1",
          scannedCode: "CODIGO-ERRONEO-999",
          quantity: 1,
        }),
      ).rejects.toMatchObject({
        code: "INVALID_SCAN",
        statusCode: 422,
        details: {
          expected: "7509998887776",
          expectedLocation: "A-01-01",
          scanned: "CODIGO-ERRONEO-999",
        },
      });

      expect(moveStock).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Reporte de excepciones de operario (reportException / exceptionNote)", () => {
    it("marca el paso y la tarea como EXCEPTION sin mover stock cuando se reporta excepción", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PICKING_TASK);

      const result = await confirmTaskStep({
        taskId: "task-pick-1",
        stepId: "step-pick-1",
        tenantId: "tenant-1",
        scannedCode: "A-01-01",
        reportException: true,
        exceptionNote: "Producto dañado en estantería",
      });

      expect(moveStock).not.toHaveBeenCalled();
      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: "step-pick-1" },
        data: {
          status: "EXCEPTION",
          exceptionNote: "Producto dañado en estantería",
        },
      });
      expect(mockPrisma.warehouseTask.update).toHaveBeenCalledWith({
        where: { id: "task-pick-1" },
        data: { status: "EXCEPTION" },
      });

      expect(result).toEqual({
        stepId: "step-pick-1",
        scannedQty: 0,
        expectedQty: 3,
        remainingQty: 3,
        stepStatus: "EXCEPTION",
        taskStatus: "EXCEPTION",
        taskComplete: false,
        note: "Producto dañado en estantería",
      });
    });

    it("usa nota por defecto cuando reportException es true sin exceptionNote explícito", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PUTAWAY_TASK);

      const result = await confirmTaskStep({
        taskId: "task-put-1",
        stepId: "step-put-1",
        tenantId: "tenant-1",
        scannedCode: "A-01-01",
        reportException: true,
      });

      expect(result.stepStatus).toBe("EXCEPTION");
      expect(result.taskStatus).toBe("EXCEPTION");
      expect(result.note).toBe("Operator reported exception");
      expect(moveStock).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Flujo PUTAWAY (RECEIVING -> STORAGE)", () => {
    it("lanza LOCATION_NOT_FOUND (409) si el almacén no tiene ubicación RECEIVING activa", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PUTAWAY_TASK);
      mockPrisma.location.findFirst.mockResolvedValue(null);

      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-put-1",
          tenantId: "tenant-1",
          scannedCode: "7509998887776",
          quantity: 5,
        }),
      ).rejects.toMatchObject({
        code: "LOCATION_NOT_FOUND",
        statusCode: 409,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("mueve stock de RECEIVING a STORAGE (PUTAWAY) y completa paso y tarea al alcanzar expectedQty", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PUTAWAY_TASK);
      mockPrisma.location.findFirst.mockResolvedValue({
        id: "loc-receiving-1",
        tenantId: "tenant-1",
        warehouseId: "warehouse-1",
        code: "REC-01",
        type: "RECEIVING",
        isActive: true,
      });
      mockPrisma.taskStep.findMany.mockResolvedValue([
        { id: "step-put-1", status: "COMPLETED" },
      ]);

      const result = await confirmTaskStep({
        taskId: "task-put-1",
        stepId: "step-put-1",
        tenantId: "tenant-1",
        scannedCode: "A-01-01", // Escaneo por código QR de ubicación destino
        quantity: 5,
        userId: "user-op-1",
      });

      expect(moveStock).toHaveBeenCalledTimes(1);
      expect(moveStock).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        productId: "product-1",
        fromLocationId: "loc-receiving-1",
        toLocationId: "loc-storage-a01",
        quantity: 5,
        reason: "PUTAWAY",
        referenceId: "task-put-1",
        userId: "user-op-1",
      });

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: "step-put-1" },
        data: {
          scannedQty: 5,
          status: "COMPLETED",
          completedAt: expect.any(Date),
        },
      });

      expect(mockPrisma.warehouseTask.update).toHaveBeenCalledWith({
        where: { id: "task-put-1" },
        data: { status: "COMPLETED", completedAt: expect.any(Date) },
      });

      expect(result).toEqual({
        stepId: "step-put-1",
        scannedQty: 5,
        expectedQty: 5,
        remainingQty: 0,
        stepStatus: "COMPLETED",
        taskStatus: "COMPLETED",
        taskComplete: true,
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Flujo PICKING (STORAGE -> PACKING + liberación de allocatedQty + OrderLine.pickedQty)", () => {
    it("lanza ORDER_NOT_FOUND (404) si la tarea PICKING no tiene orderId asociado", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_PICKING_TASK,
        orderId: null,
      });

      await expect(
        confirmTaskStep({
          taskId: "task-pick-1",
          stepId: "step-pick-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
        }),
      ).rejects.toMatchObject({
        code: "ORDER_NOT_FOUND",
        statusCode: 404,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza ORDER_NOT_FOUND (404) si el pedido asociado no existe en el tenant", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PICKING_TASK);
      mockPrisma.salesOrder.findFirst.mockResolvedValue(null);

      await expect(
        confirmTaskStep({
          taskId: "task-pick-1",
          stepId: "step-pick-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
        }),
      ).rejects.toMatchObject({
        code: "ORDER_NOT_FOUND",
        statusCode: 404,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza LOCATION_NOT_FOUND (409) si el almacén del pedido no tiene ubicación PACKING activa", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PICKING_TASK);
      mockPrisma.salesOrder.findFirst.mockResolvedValue({
        id: "order-1",
        warehouseId: "warehouse-1",
      });
      mockPrisma.location.findFirst.mockResolvedValue(null);

      await expect(
        confirmTaskStep({
          taskId: "task-pick-1",
          stepId: "step-pick-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
        }),
      ).rejects.toMatchObject({
        code: "LOCATION_NOT_FOUND",
        statusCode: 409,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("ejecuta picking parcial: mueve stock a PACKING, decrementa allocatedQty e incrementa pickedQty sin cerrar tarea ni pedido", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PICKING_TASK);
      mockPrisma.salesOrder.findFirst.mockResolvedValue({
        id: "order-1",
        warehouseId: "warehouse-1",
      });
      mockPrisma.location.findFirst.mockResolvedValue({
        id: "loc-packing-1",
        tenantId: "tenant-1",
        warehouseId: "warehouse-1",
        code: "PACK-01",
        type: "PACKING",
        isActive: true,
      });
      mockPrisma.taskStep.findMany.mockResolvedValue([
        { id: "step-pick-1", status: "PENDING" },
      ]);

      const result = await confirmTaskStep({
        taskId: "task-pick-1",
        stepId: "step-pick-1",
        tenantId: "tenant-1",
        scannedCode: "7509998887776",
        quantity: 1, // Parcial: 1 de 3
      });

      expect(moveStock).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        productId: "product-1",
        fromLocationId: "loc-storage-a01",
        toLocationId: "loc-packing-1",
        quantity: 1,
        reason: "PICK",
        referenceId: "order-1",
      });

      expect(mockPrisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: "tenant-1",
          locationId: "loc-storage-a01",
          productId: "product-1",
        },
        data: {
          allocatedQty: { decrement: 1 },
        },
      });

      expect(mockPrisma.orderLine.updateMany).toHaveBeenCalledWith({
        where: {
          orderId: "order-1",
          productId: "product-1",
          order: { tenantId: "tenant-1" },
        },
        data: {
          pickedQty: { increment: 1 },
        },
      });

      expect(mockPrisma.warehouseTask.update).not.toHaveBeenCalled();
      expect(mockPrisma.salesOrder.update).not.toHaveBeenCalled();

      expect(result).toEqual({
        stepId: "step-pick-1",
        scannedQty: 1,
        expectedQty: 3,
        remainingQty: 2,
        stepStatus: "PENDING",
        taskStatus: "IN_PROGRESS",
        taskComplete: false,
      });
    });

    it("completa todos los pasos de PICKING, marca la tarea COMPLETED y avanza SalesOrder a PACKED", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_PICKING_TASK);
      mockPrisma.salesOrder.findFirst.mockResolvedValue({
        id: "order-1",
        warehouseId: "warehouse-1",
      });
      mockPrisma.location.findFirst.mockResolvedValue({
        id: "loc-packing-1",
        tenantId: "tenant-1",
        warehouseId: "warehouse-1",
        code: "PACK-01",
        type: "PACKING",
        isActive: true,
      });
      mockPrisma.taskStep.findMany.mockResolvedValue([
        { id: "step-pick-1", status: "COMPLETED" },
        { id: "step-pick-2", status: "COMPLETED" },
      ]);

      const result = await confirmTaskStep({
        taskId: "task-pick-1",
        stepId: "step-pick-1",
        tenantId: "tenant-1",
        scannedCode: "SKU-001",
        quantity: 3,
        userId: "user-op-2",
      });

      expect(moveStock).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        productId: "product-1",
        fromLocationId: "loc-storage-a01",
        toLocationId: "loc-packing-1",
        quantity: 3,
        reason: "PICK",
        referenceId: "order-1",
        userId: "user-op-2",
      });

      expect(mockPrisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: "tenant-1",
          locationId: "loc-storage-a01",
          productId: "product-1",
        },
        data: {
          allocatedQty: { decrement: 3 },
        },
      });

      expect(mockPrisma.orderLine.updateMany).toHaveBeenCalledWith({
        where: {
          orderId: "order-1",
          productId: "product-1",
          order: { tenantId: "tenant-1" },
        },
        data: {
          pickedQty: { increment: 3 },
        },
      });

      expect(mockPrisma.warehouseTask.update).toHaveBeenCalledWith({
        where: { id: "task-pick-1" },
        data: { status: "COMPLETED", completedAt: expect.any(Date) },
      });

      expect(mockPrisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: "order-1" },
        data: { status: "PACKED" },
      });

      expect(result).toEqual({
        stepId: "step-pick-1",
        scannedQty: 3,
        expectedQty: 3,
        remainingQty: 0,
        stepStatus: "COMPLETED",
        taskStatus: "COMPLETED",
        taskComplete: true,
      });
    });
  });
});
