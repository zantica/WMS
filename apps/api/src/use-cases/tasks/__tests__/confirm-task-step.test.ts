// apps/api/src/use-cases/tasks/__tests__/confirm-task-step.test.ts
// Tests unitarios para confirmTaskStep usando InMemoryUnitOfWork + @wms/domain.
// Suites: Happy Path (PUTAWAY, PICKING parcial y total, IN_PROGRESS al primer escaneo,
// paso resuelto = no PENDING, excepciones, idempotencia) y "Romper a propósito"
// (sobre-escaneo SCAN_EXCEEDS_EXPECTED, re-escaneo en EXCEPTION/SKIPPED,
// EXCEEDS_ALLOCATED en consume, rollback y aislamiento multi-tenant).

import { describe, it, expect, beforeEach } from "vitest";
import { WmsError } from "../../../plugins/error-handler.js";
import { InMemoryIdempotencyStore } from "../../../adapters/in-memory-idempotency-store.js";
import { InMemoryUnitOfWork } from "../../../adapters/in-memory-unit-of-work.js";
import { confirmTaskStep } from "../confirm-task-step.js";

describe("confirmTaskStep — Confirmación de pasos PUTAWAY y PICKING (InMemoryUnitOfWork + @wms/domain)", () => {
  let uow: InMemoryUnitOfWork;
  let idempotencyStore: InMemoryIdempotencyStore;

  beforeEach(() => {
    idempotencyStore = new InMemoryIdempotencyStore();
    uow = new InMemoryUnitOfWork({
      products: [
        {
          id: "product-1",
          tenantId: "tenant-1",
          sku: "SKU-001",
          name: "Monitor 27\"",
          barcode: "7509998887776",
        },
        {
          id: "product-1",
          tenantId: "tenant-2",
          sku: "SKU-001",
          name: "Monitor 27\"",
          barcode: "7509998887776",
        },
      ],
      locations: [
        { id: "loc-rec-1", tenantId: "tenant-1", warehouseId: "warehouse-1", code: "REC-01", type: "RECEIVING", isActive: true },
        { id: "loc-storage-a01", tenantId: "tenant-1", warehouseId: "warehouse-1", code: "A-01-01", type: "STORAGE", isActive: true },
        { id: "loc-storage-b02", tenantId: "tenant-1", warehouseId: "warehouse-1", code: "B-02-01", type: "STORAGE", isActive: true },
        { id: "loc-packing-1", tenantId: "tenant-1", warehouseId: "warehouse-1", code: "PACK-01", type: "PACKING", isActive: true },
        { id: "loc-t2", tenantId: "tenant-2", warehouseId: "wh-t2", code: "A-01-01", type: "STORAGE", isActive: true },
      ],
      balances: [
        { id: "bal-rec-1", tenantId: "tenant-1", locationId: "loc-rec-1", productId: "product-1", onHandQty: 10, allocatedQty: 0 },
        { id: "bal-stor-a01", tenantId: "tenant-1", locationId: "loc-storage-a01", productId: "product-1", onHandQty: 5, allocatedQty: 3 },
        { id: "bal-stor-b02", tenantId: "tenant-1", locationId: "loc-storage-b02", productId: "product-1", onHandQty: 10, allocatedQty: 0 },
      ],
      orders: [
        {
          id: "order-1",
          tenantId: "tenant-1",
          warehouseId: "warehouse-1",
          status: "ALLOCATED",
          externalRef: "#1001",
          lines: [{ id: "line-1", productId: "product-1", requestedQty: 3, pickedQty: 0 }],
        },
      ],
      tasks: [
        {
          id: "task-put-1",
          tenantId: "tenant-1",
          orderId: null,
          receiptRef: "receipt-1001",
          type: "PUTAWAY",
          status: "PENDING",
          assignedTo: null,
          steps: [
            {
              id: "step-put-1",
              taskId: "task-put-1",
              sequence: 1,
              locationId: "loc-storage-a01",
              productId: "product-1",
              expectedQty: 5,
              scannedQty: 0,
              status: "PENDING",
            },
          ],
        },
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
              id: "step-pick-1",
              taskId: "task-pick-1",
              sequence: 1,
              locationId: "loc-storage-a01",
              productId: "product-1",
              expectedQty: 3,
              scannedQty: 0,
              status: "PENDING",
            },
          ],
        },
        {
          id: "task-t2",
          tenantId: "tenant-2",
          orderId: null,
          receiptRef: "rec-t2",
          type: "PUTAWAY",
          status: "PENDING",
          assignedTo: null,
          steps: [
            {
              id: "step-t2",
              taskId: "task-t2",
              sequence: 1,
              locationId: "loc-t2",
              productId: "product-1",
              expectedQty: 5,
              scannedQty: 0,
              status: "PENDING",
            },
          ],
        },
      ],
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Happy Path — PUTAWAY, PICKING, Transiciones e Idempotencia", () => {
    it("PUTAWAY parcial: pasa tarea PENDING → IN_PROGRESS al primer escaneo y mueve stock RECEIVING → STORAGE", async () => {
      const result = await confirmTaskStep({
        taskId: "task-put-1",
        stepId: "step-put-1",
        tenantId: "tenant-1",
        scannedCode: "7509998887776",
        quantity: 2,
        userId: "user-op-1",
        unitOfWork: uow,
      });

      expect(result).toEqual({
        stepId: "step-put-1",
        scannedQty: 2,
        expectedQty: 5,
        remainingQty: 3,
        stepStatus: "PENDING",
        taskStatus: "IN_PROGRESS",
        taskComplete: false,
      });

      // Persistido en el repo (antes no se persistía IN_PROGRESS)
      const task = uow.state.tasks.find((t) => t.id === "task-put-1")!;
      expect(task.status).toBe("IN_PROGRESS");
      expect(task.steps[0]?.scannedQty).toBe(2);

      // Stock movido
      expect(uow.state.balances.find((b) => b.id === "bal-rec-1")?.onHandQty).toBe(8);
      expect(uow.state.balances.find((b) => b.id === "bal-stor-a01")?.onHandQty).toBe(7);
      expect(uow.state.transactions[0]).toMatchObject({
        reason: "PUTAWAY",
        fromLocationId: "loc-rec-1",
        toLocationId: "loc-storage-a01",
        quantity: 2,
      });
    });

    it("PICKING parcial: pasa tarea a IN_PROGRESS, usa consume() en origen, recibe en PACKING e incrementa pickedQty", async () => {
      const result = await confirmTaskStep({
        taskId: "task-pick-1",
        stepId: "step-pick-1",
        tenantId: "tenant-1",
        scannedCode: "A-01-01",
        quantity: 1,
        unitOfWork: uow,
      });

      expect(result).toEqual({
        stepId: "step-pick-1",
        scannedQty: 1,
        expectedQty: 3,
        remainingQty: 2,
        stepStatus: "PENDING",
        taskStatus: "IN_PROGRESS",
        taskComplete: false,
      });

      const srcBal = uow.state.balances.find((b) => b.id === "bal-stor-a01")!;
      expect(srcBal.onHandQty).toBe(4);
      expect(srcBal.allocatedQty).toBe(2);

      const packBal = uow.state.balances.find((b) => b.locationId === "loc-packing-1")!;
      expect(packBal.onHandQty).toBe(1);
      expect(packBal.allocatedQty).toBe(0);

      const order = uow.state.orders[0]!;
      expect(order.lines[0]?.pickedQty).toBe(1);
      // Pedido se mantiene ALLOCATED (no se escribe PICKING)
      expect(order.status).toBe("ALLOCATED");
    });

    it("PICKING total: completa la tarea y transiciona SalesOrder directamente de ALLOCATED → PACKED", async () => {
      const result = await confirmTaskStep({
        taskId: "task-pick-1",
        stepId: "step-pick-1",
        tenantId: "tenant-1",
        scannedCode: "SKU-001",
        quantity: 3,
        userId: "user-op-2",
        unitOfWork: uow,
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

      expect(uow.state.tasks.find((t) => t.id === "task-pick-1")?.status).toBe("COMPLETED");
      expect(uow.state.orders[0]?.status).toBe("PACKED");
      expect(uow.state.balances.find((b) => b.id === "bal-stor-a01")?.allocatedQty).toBe(0);
      expect(uow.state.balances.find((b) => b.id === "bal-stor-a01")?.onHandQty).toBe(2);
    });

    it("paso resuelto = no PENDING: completa la tarea si el otro paso está en SKIPPED o EXCEPTION", async () => {
      uow.state.tasks[0]!.steps.push({
        id: "step-put-skipped",
        taskId: "task-put-1",
        sequence: 2,
        locationId: "loc-storage-b02",
        productId: "product-1",
        expectedQty: 2,
        scannedQty: 0,
        status: "SKIPPED",
      });

      const result = await confirmTaskStep({
        taskId: "task-put-1",
        stepId: "step-put-1",
        tenantId: "tenant-1",
        scannedCode: "SKU-001",
        quantity: 5,
        unitOfWork: uow,
      });

      expect(result.taskStatus).toBe("COMPLETED");
      expect(result.taskComplete).toBe(true);
    });

    it("en tareas PICKING reportException delega en handlePickingException y re-aloca stock", async () => {
      const result = await confirmTaskStep({
        taskId: "task-pick-1",
        stepId: "step-pick-1",
        tenantId: "tenant-1",
        scannedCode: "A-01-01",
        reportException: true,
        exceptionNote: "Producto dañado en estantería",
        userId: "user-op-1",
        unitOfWork: uow,
      });

      expect(result).toMatchObject({
        stepId: "step-pick-1",
        stepStatus: "EXCEPTION",
        taskStatus: "IN_PROGRESS",
        taskComplete: false,
        note: "Producto dañado en estantería",
        reallocated: true,
      });
      expect(result.replacementSteps).toHaveLength(1);
      expect(result.replacementSteps?.[0]?.locationCode).toBe("B-02-01");
      expect(uow.state.balances.find((b) => b.id === "bal-stor-b02")?.allocatedQty).toBe(3);
    });

    it("en tareas PUTAWAY reportException marca paso y tarea como EXCEPTION sin mover stock", async () => {
      const result = await confirmTaskStep({
        taskId: "task-put-1",
        stepId: "step-put-1",
        tenantId: "tenant-1",
        scannedCode: "A-01-01",
        reportException: true,
        unitOfWork: uow,
      });

      expect(result.stepStatus).toBe("EXCEPTION");
      expect(result.taskStatus).toBe("EXCEPTION");
      expect(result.note).toBe("Operator reported exception");
      expect(uow.state.transactions).toHaveLength(0);
    });

    it("idempotencia: devuelve ALREADY_APPLIED en reintentos sin duplicar movimientos ni Ledger", async () => {
      const firstResult = await confirmTaskStep({
        taskId: "task-put-1",
        stepId: "step-put-1",
        tenantId: "tenant-1",
        scannedCode: "7509998887776",
        quantity: 5,
        idempotencyKey: "idemp-key-step-001",
        idempotencyStore,
        unitOfWork: uow,
      });

      expect(firstResult.idempotencyStatus).toBe("APPLIED");
      expect(firstResult.stepStatus).toBe("COMPLETED");
      expect(uow.state.transactions).toHaveLength(1);

      const secondResult = await confirmTaskStep({
        taskId: "task-put-1",
        stepId: "step-put-1",
        tenantId: "tenant-1",
        scannedCode: "7509998887776",
        quantity: 5,
        idempotencyKey: "idemp-key-step-001",
        idempotencyStore,
        unitOfWork: uow,
      });

      expect(secondResult.idempotencyStatus).toBe("ALREADY_APPLIED");
      expect(secondResult.stepStatus).toBe("COMPLETED");
      expect(secondResult.scannedQty).toBe(5);
      expect(uow.state.transactions).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Romper a propósito — Validaciones, Invariantes, Rollback y Multi-Tenant", () => {
    it("lanza TASK_NOT_FOUND (404) si la tarea no existe o pertenece a otro tenant", async () => {
      await expect(
        confirmTaskStep({
          taskId: "task-inexistente",
          stepId: "step-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
          unitOfWork: uow,
        }),
      ).rejects.toThrow(WmsError);

      await expect(
        confirmTaskStep({
          taskId: "task-t2",
          stepId: "step-t2",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND", statusCode: 404 });
    });

    it("lanza TASK_NOT_FOUND (404) si el stepId no existe dentro de la tarea", async () => {
      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-inexistente",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND", statusCode: 404 });
    });

    it.each(["COMPLETED", "CANCELLED"] as const)(
      "lanza VALIDATION_ERROR (409) si la tarea ya está en estado terminal %s",
      async (status) => {
        uow.state.tasks[0]!.status = status;

        await expect(
          confirmTaskStep({
            taskId: "task-put-1",
            stepId: "step-put-1",
            tenantId: "tenant-1",
            scannedCode: "SKU-001",
            unitOfWork: uow,
          }),
        ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 409 });
      },
    );

    it.each(["COMPLETED", "EXCEPTION", "SKIPPED"] as const)(
      "rechaza re-escaneo sobre paso ya resuelto (%s) con VALIDATION_ERROR (409)",
      async (stepStatus) => {
        uow.state.tasks[0]!.steps[0]!.status = stepStatus;

        await expect(
          confirmTaskStep({
            taskId: "task-put-1",
            stepId: "step-put-1",
            tenantId: "tenant-1",
            scannedCode: "SKU-001",
            unitOfWork: uow,
          }),
        ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 409 });

        expect(uow.state.transactions).toHaveLength(0);
      },
    );

    it("rechaza sobre-escaneo (SCAN_EXCEEDS_EXPECTED → VALIDATION_ERROR 422) sin mutar stock ni tarea", async () => {
      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-put-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
          quantity: 6, // expected es 5
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 422 });

      expect(uow.state.tasks[0]?.status).toBe("PENDING");
      expect(uow.state.tasks[0]?.steps[0]?.scannedQty).toBe(0);
      expect(uow.state.transactions).toHaveLength(0);
    });

    it("en PICKING rechaza si allocatedQty es menor al escaneo (EXCEEDS_ALLOCATED → VALIDATION_ERROR 409) y hace rollback", async () => {
      uow.state.balances.find((b) => b.id === "bal-stor-a01")!.allocatedQty = 1; // step espera 3

      await expect(
        confirmTaskStep({
          taskId: "task-pick-1",
          stepId: "step-pick-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
          quantity: 2,
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 409 });

      // Rollback completo: la tarea sigue PENDING y el saldo intacto
      expect(uow.state.tasks[1]?.status).toBe("PENDING");
      expect(uow.state.tasks[1]?.steps[0]?.scannedQty).toBe(0);
      expect(uow.state.balances.find((b) => b.id === "bal-stor-a01")?.onHandQty).toBe(5);
      expect(uow.state.transactions).toHaveLength(0);
    });

    it("lanza VALIDATION_ERROR (422) si quantity <= 0", async () => {
      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-put-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
          quantity: 0,
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 422 });
    });

    it("lanza INVALID_SCAN (422) si scannedCode no coincide con barcode, SKU ni ubicación", async () => {
      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-put-1",
          tenantId: "tenant-1",
          scannedCode: "CODIGO-ERRONEO-999",
          quantity: 1,
          unitOfWork: uow,
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
    });

    it("lanza LOCATION_NOT_FOUND (409) si falta RECEIVING en PUTAWAY o PACKING en PICKING y revierte tarea", async () => {
      uow.state.locations = uow.state.locations.filter(
        (l) => l.type !== "RECEIVING" && l.type !== "PACKING",
      );

      await expect(
        confirmTaskStep({
          taskId: "task-put-1",
          stepId: "step-put-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
          quantity: 5,
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND", statusCode: 409 });

      expect(uow.state.tasks[0]?.status).toBe("PENDING");

      await expect(
        confirmTaskStep({
          taskId: "task-pick-1",
          stepId: "step-pick-1",
          tenantId: "tenant-1",
          scannedCode: "SKU-001",
          quantity: 3,
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND", statusCode: 409 });

      expect(uow.state.tasks[1]?.status).toBe("PENDING");
    });
  });
});
