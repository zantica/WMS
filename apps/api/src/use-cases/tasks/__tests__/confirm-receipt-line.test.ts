// apps/api/src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts
// Tests unitarios para confirmReceiptLine (F2.2).
// Cubre validaciones de recursos multi-tenant, validación de código de barras (INVALID_SCAN),
// pasos ya completados/secuencia inválida, recepciones parciales y totales,
// invocación a moveStock (INBOUND_RECEIPT) y disparo automático de createPutawayTask.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { WmsError } from "../../../plugins/error-handler.js";
import { confirmReceiptLine } from "../confirm-receipt-line.js";
import { moveStock } from "../../inventory/move-stock.js";
import { createPutawayTask } from "../../inventory/create-putaway-task.js";

const mockPrisma = {
  warehouseTask: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  product: {
    findFirst: vi.fn(),
  },
  taskStep: {
    update: vi.fn(),
  },
};

vi.mock("@wms/db", () => ({
  prisma: {
    warehouseTask: {
      findFirst: (...args: unknown[]) => mockPrisma.warehouseTask.findFirst(...args),
      update: (...args: unknown[]) => mockPrisma.warehouseTask.update(...args),
    },
    product: {
      findFirst: (...args: unknown[]) => mockPrisma.product.findFirst(...args),
    },
    taskStep: {
      update: (...args: unknown[]) => mockPrisma.taskStep.update(...args),
    },
  },
}));

vi.mock("../../inventory/move-stock.js", () => ({
  moveStock: vi.fn(),
}));

vi.mock("../../inventory/create-putaway-task.js", () => ({
  createPutawayTask: vi.fn(),
}));

const BASE_RECEIVING_TASK = {
  id: "task-rec-1",
  tenantId: "tenant-1",
  orderId: null,
  receiptRef: "receipt-1001",
  type: "RECEIVING" as const,
  status: "PENDING" as const,
  steps: [
    {
      id: "step-rec-1",
      taskId: "task-rec-1",
      sequence: 1,
      locationId: "loc-receiving-1",
      productId: "product-1",
      expectedQty: 10,
      scannedQty: 0,
      status: "PENDING" as const,
      location: {
        id: "loc-receiving-1",
        tenantId: "tenant-1",
        warehouseId: "warehouse-1",
        code: "REC-01",
        type: "RECEIVING" as const,
        isActive: true,
      },
      product: {
        id: "product-1",
        tenantId: "tenant-1",
        sku: "SKU-001",
        name: "Teclado Mecánico",
        barcode: "7501234567890",
      },
    },
  ],
};

describe("confirmReceiptLine — Confirmación de línea de recepción (RECEIVING)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(moveStock).mockResolvedValue(undefined);
    vi.mocked(createPutawayTask).mockResolvedValue("task-putaway-1");
    mockPrisma.taskStep.update.mockResolvedValue({});
    mockPrisma.warehouseTask.update.mockResolvedValue({});
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Validaciones de entrada, recursos multi-tenant y código escaneado", () => {
    it("lanza VALIDATION_ERROR (422) si scannedQty es 0 o negativa", async () => {
      await expect(
        confirmReceiptLine({
          taskId: "task-rec-1",
          tenantId: "tenant-1",
          productId: "product-1",
          scannedQty: 0,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 422,
      });

      expect(mockPrisma.warehouseTask.findFirst).not.toHaveBeenCalled();
    });

    it("lanza TASK_NOT_FOUND (404) si la tarea RECEIVING no existe o pertenece a otro tenant", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(null);

      await expect(
        confirmReceiptLine({
          taskId: "task-inexistente",
          tenantId: "tenant-1",
          productId: "product-1",
          scannedQty: 5,
        }),
      ).rejects.toThrow(WmsError);

      await expect(
        confirmReceiptLine({
          taskId: "task-inexistente",
          tenantId: "tenant-1",
          productId: "product-1",
          scannedQty: 5,
        }),
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND",
        statusCode: 404,
      });

      expect(mockPrisma.warehouseTask.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-inexistente", tenantId: "tenant-1", type: "RECEIVING" },
        }),
      );
      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza VALIDATION_ERROR (409) si la tarea RECEIVING ya está COMPLETED", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_RECEIVING_TASK,
        status: "COMPLETED",
      });

      await expect(
        confirmReceiptLine({
          taskId: "task-rec-1",
          tenantId: "tenant-1",
          productId: "product-1",
          scannedQty: 5,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 409,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza PRODUCT_NOT_FOUND (404) cuando se envía barcode pero el producto no existe en el tenant", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_RECEIVING_TASK);
      mockPrisma.product.findFirst.mockResolvedValue(null);

      await expect(
        confirmReceiptLine({
          taskId: "task-rec-1",
          tenantId: "tenant-1",
          productId: "product-1",
          scannedQty: 5,
          barcode: "7501234567890",
        }),
      ).rejects.toMatchObject({
        code: "PRODUCT_NOT_FOUND",
        statusCode: 404,
      });

      expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
        where: { id: "product-1", tenantId: "tenant-1" },
      });
      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza INVALID_SCAN (422) cuando el barcode escaneado no coincide con el producto", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_RECEIVING_TASK);
      mockPrisma.product.findFirst.mockResolvedValue(
        BASE_RECEIVING_TASK.steps[0]!.product,
      );

      await expect(
        confirmReceiptLine({
          taskId: "task-rec-1",
          tenantId: "tenant-1",
          productId: "product-1",
          scannedQty: 5,
          barcode: "BARCODE-INCORRECTO",
        }),
      ).rejects.toMatchObject({
        code: "INVALID_SCAN",
        statusCode: 422,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza VALIDATION_ERROR (409) si el paso para el producto ya está COMPLETED", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_RECEIVING_TASK,
        steps: [
          {
            ...BASE_RECEIVING_TASK.steps[0]!,
            scannedQty: 10,
            status: "COMPLETED",
          },
        ],
      });

      await expect(
        confirmReceiptLine({
          taskId: "task-rec-1",
          tenantId: "tenant-1",
          productId: "product-1",
          scannedQty: 2,
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 409,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });

    it("lanza WRONG_STEP_SEQUENCE (409) si el producto no pertenece a ningún paso pendiente de la tarea", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_RECEIVING_TASK);

      await expect(
        confirmReceiptLine({
          taskId: "task-rec-1",
          tenantId: "tenant-1",
          productId: "product-ajeno",
          scannedQty: 2,
        }),
      ).rejects.toMatchObject({
        code: "WRONG_STEP_SEQUENCE",
        statusCode: 409,
      });

      expect(moveStock).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Confirmación parcial y total en RECEIVING", () => {
    it("registra recepción parcial, invoca moveStock (INBOUND_RECEIPT) y mantiene el paso en PENDING sin crear PUTAWAY", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(BASE_RECEIVING_TASK);
      mockPrisma.product.findFirst.mockResolvedValue(
        BASE_RECEIVING_TASK.steps[0]!.product,
      );

      const result = await confirmReceiptLine({
        taskId: "task-rec-1",
        tenantId: "tenant-1",
        productId: "product-1",
        scannedQty: 4,
        barcode: "7501234567890",
        userId: "user-op-1",
      });

      expect(moveStock).toHaveBeenCalledTimes(1);
      expect(moveStock).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        productId: "product-1",
        toLocationId: "loc-receiving-1",
        quantity: 4,
        reason: "INBOUND_RECEIPT",
        referenceId: "task-rec-1",
        userId: "user-op-1",
        notes: "Received 4 units at REC-01",
      });

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: "step-rec-1" },
        data: {
          scannedQty: 4,
          status: "PENDING",
          completedAt: null,
        },
      });

      expect(mockPrisma.warehouseTask.update).not.toHaveBeenCalled();
      expect(createPutawayTask).not.toHaveBeenCalled();

      expect(result).toEqual({
        stepId: "step-rec-1",
        scannedQty: 4,
        expectedQty: 10,
        stepStatus: "PENDING",
        taskStatus: "IN_PROGRESS",
        putawayTaskId: null,
        remainingQty: 6,
      });
    });

    it("completa un paso en tarea multi-línea pero no dispara createPutawayTask si quedan otros pasos PENDING", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_RECEIVING_TASK,
        steps: [
          BASE_RECEIVING_TASK.steps[0]!,
          {
            ...BASE_RECEIVING_TASK.steps[0]!,
            id: "step-rec-2",
            sequence: 2,
            productId: "product-2",
            expectedQty: 5,
            scannedQty: 0,
            status: "PENDING" as const,
          },
        ],
      });

      const result = await confirmReceiptLine({
        taskId: "task-rec-1",
        tenantId: "tenant-1",
        productId: "product-1",
        scannedQty: 10,
      });

      expect(result.stepStatus).toBe("COMPLETED");
      expect(result.taskStatus).toBe("IN_PROGRESS");
      expect(result.putawayTaskId).toBeNull();
      expect(createPutawayTask).not.toHaveBeenCalled();
    });

    it("completa el último paso pendiente, marca la tarea RECEIVING como COMPLETED y dispara createPutawayTask", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_RECEIVING_TASK,
        steps: [
          {
            ...BASE_RECEIVING_TASK.steps[0]!,
            scannedQty: 4, // Ya tenía 4 escaneadas de 10
          },
        ],
      });

      const result = await confirmReceiptLine({
        taskId: "task-rec-1",
        tenantId: "tenant-1",
        productId: "product-1",
        scannedQty: 6,
      });

      expect(moveStock).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          productId: "product-1",
          toLocationId: "loc-receiving-1",
          quantity: 6,
          reason: "INBOUND_RECEIPT",
          referenceId: "task-rec-1",
        }),
      );

      expect(mockPrisma.taskStep.update).toHaveBeenCalledWith({
        where: { id: "step-rec-1" },
        data: {
          scannedQty: 10,
          status: "COMPLETED",
          completedAt: expect.any(Date),
        },
      });

      expect(mockPrisma.warehouseTask.update).toHaveBeenCalledWith({
        where: { id: "task-rec-1" },
        data: {
          status: "COMPLETED",
          completedAt: expect.any(Date),
        },
      });

      expect(createPutawayTask).toHaveBeenCalledTimes(1);
      expect(createPutawayTask).toHaveBeenCalledWith({
        receivingTaskId: "task-rec-1",
        tenantId: "tenant-1",
      });

      expect(result).toEqual({
        stepId: "step-rec-1",
        scannedQty: 10,
        expectedQty: 10,
        stepStatus: "COMPLETED",
        taskStatus: "COMPLETED",
        putawayTaskId: "task-putaway-1",
        remainingQty: 0,
      });
    });
  });
});
