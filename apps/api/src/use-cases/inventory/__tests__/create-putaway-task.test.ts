// apps/api/src/use-cases/inventory/__tests__/create-putaway-task.test.ts
// Tests unitarios para el caso de uso createPutawayTask (F2.1).
// Verifica validaciones de dominio, aislamiento multi-tenant, asignación de ubicaciones STORAGE
// ordenadas por code ASC y atomicidad ante errores.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { WmsError } from "../../../plugins/error-handler.js";
import { createPutawayTask } from "../create-putaway-task.js";

// ── Mock de Prisma ────────────────────────────────────────────────────────────
const mockTx = {
  warehouseTask: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  location: {
    findMany: vi.fn(),
  },
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

const BASE_RECEIVING_TASK = {
  id: "task-rec-1",
  tenantId: "tenant-1",
  orderId: null,
  receiptRef: "receipt-1001",
  type: "RECEIVING" as const,
  status: "COMPLETED" as const,
  steps: [
    {
      id: "step-rec-1",
      taskId: "task-rec-1",
      sequence: 1,
      locationId: "loc-receiving-1",
      productId: "product-1",
      expectedQty: 10,
      scannedQty: 10,
      status: "COMPLETED" as const,
      location: {
        id: "loc-receiving-1",
        tenantId: "tenant-1",
        warehouseId: "warehouse-1",
        code: "REC-01",
        type: "RECEIVING" as const,
        isActive: true,
      },
    },
  ],
};

describe("createPutawayTask — Generación automática de tarea PUTAWAY", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.warehouseTask.create.mockResolvedValue({ id: "task-putaway-1" });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Validaciones de entrada y estado de dominio", () => {
    it("lanza TASK_NOT_FOUND (404) si la tarea RECEIVING no existe o pertenece a otro tenant", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue(null);

      await expect(
        createPutawayTask({
          receivingTaskId: "task-inexistente",
          tenantId: "tenant-1",
        }),
      ).rejects.toThrow(WmsError);

      await expect(
        createPutawayTask({
          receivingTaskId: "task-inexistente",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "TASK_NOT_FOUND",
        statusCode: 404,
      });

      expect(mockTx.warehouseTask.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-inexistente", tenantId: "tenant-1" },
        }),
      );
      expect(mockTx.warehouseTask.create).not.toHaveBeenCalled();
    });

    it("lanza VALIDATION_ERROR (422) si la tarea no es de tipo RECEIVING", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_RECEIVING_TASK,
        type: "PICKING",
      });

      await expect(
        createPutawayTask({
          receivingTaskId: "task-rec-1",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 422,
      });

      expect(mockTx.warehouseTask.create).not.toHaveBeenCalled();
    });

    it("lanza VALIDATION_ERROR (409) si la tarea RECEIVING aún no está COMPLETED", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_RECEIVING_TASK,
        status: "IN_PROGRESS",
      });

      await expect(
        createPutawayTask({
          receivingTaskId: "task-rec-1",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 409,
      });

      expect(mockTx.warehouseTask.create).not.toHaveBeenCalled();
    });

    it("lanza VALIDATION_ERROR (422) si no hay pasos con scannedQty > 0", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_RECEIVING_TASK,
        steps: [
          {
            ...BASE_RECEIVING_TASK.steps[0],
            scannedQty: 0,
          },
        ],
      });

      await expect(
        createPutawayTask({
          receivingTaskId: "task-rec-1",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 422,
      });

      expect(mockTx.warehouseTask.create).not.toHaveBeenCalled();
    });

    it("lanza LOCATION_NOT_FOUND (409) si el almacén no tiene ubicaciones STORAGE activas", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue(BASE_RECEIVING_TASK);
      mockTx.location.findMany.mockResolvedValue([]);

      await expect(
        createPutawayTask({
          receivingTaskId: "task-rec-1",
          tenantId: "tenant-1",
        }),
      ).rejects.toMatchObject({
        code: "LOCATION_NOT_FOUND",
        statusCode: 409,
      });

      expect(mockTx.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: "tenant-1",
            warehouseId: "warehouse-1",
            type: "STORAGE",
            isActive: true,
          },
        }),
      );
      expect(mockTx.warehouseTask.create).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Creación exitosa de tarea PUTAWAY", () => {
    it("crea una WarehouseTask de tipo PUTAWAY con expectedQty igual al scannedQty recibido", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue(BASE_RECEIVING_TASK);
      mockTx.location.findMany.mockResolvedValue([
        {
          id: "loc-storage-a01",
          tenantId: "tenant-1",
          warehouseId: "warehouse-1",
          code: "A-01-01",
          type: "STORAGE",
          isActive: true,
        },
      ]);

      const putawayTaskId = await createPutawayTask({
        receivingTaskId: "task-rec-1",
        tenantId: "tenant-1",
      });

      expect(putawayTaskId).toBe("task-putaway-1");
      expect(mockTx.warehouseTask.create).toHaveBeenCalledTimes(1);
      expect(mockTx.warehouseTask.create).toHaveBeenCalledWith({
        data: {
          tenantId: "tenant-1",
          orderId: null,
          receiptRef: "receipt-1001",
          type: "PUTAWAY",
          status: "PENDING",
          assignedTo: null,
          steps: {
            create: [
              {
                sequence: 1,
                locationId: "loc-storage-a01",
                productId: "product-1",
                expectedQty: 10,
                scannedQty: 0,
                status: "PENDING",
              },
            ],
          },
        },
      });
    });

    it("asigna ubicaciones STORAGE y ordena los TaskSteps por location.code ASC con secuencia 1..N", async () => {
      mockTx.warehouseTask.findFirst.mockResolvedValue({
        ...BASE_RECEIVING_TASK,
        steps: [
          {
            id: "step-rec-1",
            taskId: "task-rec-1",
            sequence: 1,
            locationId: "loc-receiving-1",
            productId: "product-1",
            expectedQty: 8,
            scannedQty: 8,
            status: "COMPLETED" as const,
            location: BASE_RECEIVING_TASK.steps[0]!.location,
          },
          {
            id: "step-rec-2",
            taskId: "task-rec-1",
            sequence: 2,
            locationId: "loc-receiving-1",
            productId: "product-2",
            expectedQty: 5,
            scannedQty: 6, // Sobrerecepción: debe usar scannedQty (6)
            status: "COMPLETED" as const,
            location: BASE_RECEIVING_TASK.steps[0]!.location,
          },
          {
            id: "step-rec-3",
            taskId: "task-rec-1",
            sequence: 3,
            locationId: "loc-receiving-1",
            productId: "product-3",
            expectedQty: 4,
            scannedQty: 0, // Línea sin unidades recibidas: se ignora
            status: "SKIPPED" as const,
            location: BASE_RECEIVING_TASK.steps[0]!.location,
          },
        ],
      });

      // Ubicaciones devueltas en orden inverso para verificar ordenamiento determinista por code ASC
      mockTx.location.findMany.mockResolvedValue([
        {
          id: "loc-storage-b02",
          tenantId: "tenant-1",
          warehouseId: "warehouse-1",
          code: "B-02-01",
          type: "STORAGE",
          isActive: true,
        },
        {
          id: "loc-storage-a01",
          tenantId: "tenant-1",
          warehouseId: "warehouse-1",
          code: "A-01-01",
          type: "STORAGE",
          isActive: true,
        },
      ]);

      await createPutawayTask({
        receivingTaskId: "task-rec-1",
        tenantId: "tenant-1",
      });

      const createCall = mockTx.warehouseTask.create.mock.calls[0]?.[0];
      const createdSteps = createCall?.data?.steps?.create;

      expect(createdSteps).toHaveLength(2);
      expect(createdSteps[0]).toEqual({
        sequence: 1,
        locationId: "loc-storage-a01",
        productId: "product-1",
        expectedQty: 8,
        scannedQty: 0,
        status: "PENDING",
      });
      expect(createdSteps[1]).toEqual({
        sequence: 2,
        locationId: "loc-storage-b02",
        productId: "product-2",
        expectedQty: 6,
        scannedQty: 0,
        status: "PENDING",
      });
    });
  });
});
