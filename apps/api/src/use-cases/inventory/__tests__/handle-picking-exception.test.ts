// apps/api/src/use-cases/inventory/__tests__/handle-picking-exception.test.ts
// Suite de tests unitarios para handlePickingException usando InMemoryUnitOfWork + @wms/domain.
// Suites: Happy Path (re-alocación exitosa en 1 o varias ubicaciones, ON_HOLD sin stock)
// y "Romper a propósito" (clamping releaseUpTo, estados terminales, paso ya resuelto, multi-tenant).

import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryUnitOfWork } from "../../../adapters/in-memory-unit-of-work.js";
import { handlePickingException } from "../handle-picking-exception.js";

describe("handlePickingException — Excepciones de Picking (InMemoryUnitOfWork + @wms/domain)", () => {
  let uow: InMemoryUnitOfWork;

  beforeEach(() => {
    uow = new InMemoryUnitOfWork({
      products: [
        { id: "prod-1", tenantId: "tenant-1", sku: "SKU-001", name: "Teclado" },
        { id: "prod-2", tenantId: "tenant-1", sku: "SKU-002", name: "Mouse" },
      ],
      locations: [
        { id: "loc-A01", tenantId: "tenant-1", warehouseId: "wh-1", code: "A-01-01", type: "STORAGE", isActive: true },
        { id: "loc-B01", tenantId: "tenant-1", warehouseId: "wh-1", code: "B-01-01", type: "STORAGE", isActive: true },
        { id: "loc-C01", tenantId: "tenant-1", warehouseId: "wh-1", code: "C-01-01", type: "STORAGE", isActive: true },
        { id: "loc-D01", tenantId: "tenant-1", warehouseId: "wh-1", code: "D-01-01", type: "STORAGE", isActive: true },
        { id: "loc-other-wh", tenantId: "tenant-1", warehouseId: "wh-2", code: "Z-01-01", type: "STORAGE", isActive: true },
        { id: "loc-t2", tenantId: "tenant-2", warehouseId: "wh-t2", code: "A-01-01", type: "STORAGE", isActive: true },
      ],
      balances: [
        { id: "bal-A01", tenantId: "tenant-1", locationId: "loc-A01", productId: "prod-1", onHandQty: 4, allocatedQty: 4 },
        { id: "bal-B01", tenantId: "tenant-1", locationId: "loc-B01", productId: "prod-1", onHandQty: 10, allocatedQty: 0 },
        { id: "bal-D01", tenantId: "tenant-1", locationId: "loc-D01", productId: "prod-2", onHandQty: 5, allocatedQty: 2 },
        { id: "bal-other-wh", tenantId: "tenant-1", locationId: "loc-other-wh", productId: "prod-1", onHandQty: 50, allocatedQty: 0 },
        { id: "bal-t2", tenantId: "tenant-2", locationId: "loc-t2", productId: "prod-1", onHandQty: 50, allocatedQty: 4 },
      ],
      orders: [
        {
          id: "order-1",
          tenantId: "tenant-1",
          warehouseId: "wh-1",
          status: "ALLOCATED",
          externalRef: "#ORD-500",
          lines: [{ id: "line-1", productId: "prod-1", requestedQty: 4, pickedQty: 0 }],
        },
        {
          id: "order-t2",
          tenantId: "tenant-2",
          warehouseId: "wh-t2",
          status: "ALLOCATED",
          externalRef: "#ORD-T2",
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
          status: "IN_PROGRESS",
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
        {
          id: "task-t2",
          tenantId: "tenant-2",
          orderId: "order-t2",
          receiptRef: null,
          type: "PICKING",
          status: "IN_PROGRESS",
          assignedTo: null,
          steps: [
            {
              id: "step-t2",
              taskId: "task-t2",
              sequence: 1,
              locationId: "loc-t2",
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
    it("libera reserva original (ALLOCATION_CANCEL), re-asigna en ubicación alternativa y crea nuevo TaskStep", async () => {
      const result = await handlePickingException({
        taskId: "task-pick-1",
        stepId: "step-1",
        tenantId: "tenant-1",
        exceptionNote: "Ubicación dañada",
        userId: "op-1",
        unitOfWork: uow,
      });

      expect(result).toMatchObject({
        stepId: "step-1",
        taskId: "task-pick-1",
        orderId: "order-1",
        stepStatus: "EXCEPTION",
        taskStatus: "IN_PROGRESS",
        orderStatus: "ALLOCATED",
        reallocated: true,
        releasedOriginalQty: 4,
        note: "Ubicación dañada",
      });
      expect(result.replacementSteps).toHaveLength(1);
      expect(result.replacementSteps[0]).toMatchObject({
        sequence: 2,
        locationId: "loc-B01",
        locationCode: "B-01-01",
        expectedQty: 4,
      });

      // Balances actualizados
      expect(uow.state.balances.find((b) => b.id === "bal-A01")?.allocatedQty).toBe(0);
      expect(uow.state.balances.find((b) => b.id === "bal-B01")?.allocatedQty).toBe(4);

      // Ledger: 1 ALLOCATION_CANCEL + 1 ALLOCATION
      expect(uow.state.transactions).toHaveLength(2);
      expect(uow.state.transactions[0]?.reason).toBe("ALLOCATION_CANCEL");
      expect(uow.state.transactions[1]?.reason).toBe("ALLOCATION");

      // Paso original en EXCEPTION con nota y nuevo paso PENDING
      const task = uow.state.tasks[0]!;
      expect(task.steps).toHaveLength(2);
      expect(task.steps[0]?.status).toBe("EXCEPTION");
      expect(task.steps[0]?.exceptionNote).toBe("Ubicación dañada");
      expect(task.steps[1]?.status).toBe("PENDING");
    });

    it("divide re-alocación entre múltiples ubicaciones STORAGE si una sola no cubre el faltante", async () => {
      uow.state.balances.find((b) => b.id === "bal-B01")!.onHandQty = 2;
      uow.state.balances.push({
        id: "bal-C01",
        tenantId: "tenant-1",
        locationId: "loc-C01",
        productId: "prod-1",
        onHandQty: 5,
        allocatedQty: 0,
      });

      const result = await handlePickingException({
        taskId: "task-pick-1",
        stepId: "step-1",
        tenantId: "tenant-1",
        unitOfWork: uow,
      });

      expect(result.reallocated).toBe(true);
      expect(result.replacementSteps.map((s) => ({ code: s.locationCode, qty: s.expectedQty, seq: s.sequence }))).toEqual([
        { code: "B-01-01", qty: 2, seq: 2 },
        { code: "C-01-01", qty: 2, seq: 3 },
      ]);
      expect(uow.state.balances.find((b) => b.id === "bal-B01")?.allocatedQty).toBe(2);
      expect(uow.state.balances.find((b) => b.id === "bal-C01")?.allocatedQty).toBe(2);
    });

    it("sin ATP alternativo suficiente en el mismo almacén: libera pasos PENDING, marca tarea EXCEPTION y pedido ON_HOLD", async () => {
      // loc-B01 solo tiene 1 unidad (faltan 4); loc-other-wh está en otro almacén (wh-2)
      uow.state.balances.find((b) => b.id === "bal-B01")!.onHandQty = 1;
      uow.state.tasks[0]!.steps.push(
        { id: "step-2-pending", taskId: "task-pick-1", sequence: 2, locationId: "loc-D01", productId: "prod-2", expectedQty: 2, scannedQty: 0, status: "PENDING" },
        { id: "step-3-done", taskId: "task-pick-1", sequence: 3, locationId: "loc-C01", productId: "prod-1", expectedQty: 1, scannedQty: 1, status: "COMPLETED" },
      );

      const result = await handlePickingException({
        taskId: "task-pick-1",
        stepId: "step-1",
        tenantId: "tenant-1",
        exceptionNote: "Sin stock físico en A-01-01",
        userId: "op-2",
        unitOfWork: uow,
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

      expect(uow.state.balances.find((b) => b.id === "bal-A01")?.allocatedQty).toBe(0);
      expect(uow.state.balances.find((b) => b.id === "bal-D01")?.allocatedQty).toBe(0);
      expect(uow.state.transactions).toHaveLength(2);
      expect(uow.state.transactions.every((t) => t.reason === "ALLOCATION_CANCEL")).toBe(true);

      expect(uow.state.tasks[0]?.status).toBe("EXCEPTION");
      expect(uow.state.tasks[0]?.steps.map((s) => s.status)).toEqual([
        "EXCEPTION",
        "SKIPPED",
        "COMPLETED",
      ]);
      expect(uow.state.orders[0]?.status).toBe("ON_HOLD");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  describe("Romper a propósito — Clamping, Estados Inválidos y Multi-Tenant", () => {
    it("lanza TASK_NOT_FOUND (404) si la tarea no existe o pertenece a otro tenant", async () => {
      await expect(
        handlePickingException({
          taskId: "task-missing",
          stepId: "step-1",
          tenantId: "tenant-1",
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND", statusCode: 404 });

      await expect(
        handlePickingException({
          taskId: "task-t2",
          stepId: "step-t2",
          tenantId: "tenant-1",
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND", statusCode: 404 });

      expect(uow.state.balances.find((b) => b.id === "bal-t2")?.allocatedQty).toBe(4);
    });

    it("lanza VALIDATION_ERROR (422) si la tarea no es de tipo PICKING", async () => {
      uow.state.tasks[0]!.type = "PUTAWAY";

      await expect(
        handlePickingException({
          taskId: "task-pick-1",
          stepId: "step-1",
          tenantId: "tenant-1",
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 422 });
    });

    it.each(["COMPLETED", "CANCELLED"] as const)(
      "lanza VALIDATION_ERROR (409) si la tarea ya está en estado terminal %s",
      async (terminalStatus) => {
        uow.state.tasks[0]!.status = terminalStatus;

        await expect(
          handlePickingException({
            taskId: "task-pick-1",
            stepId: "step-1",
            tenantId: "tenant-1",
            unitOfWork: uow,
          }),
        ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 409 });
      },
    );

    it("lanza ORDER_NOT_FOUND (404) si la tarea PICKING no tiene pedido asociado", async () => {
      uow.state.tasks[0]!.orderId = null;

      await expect(
        handlePickingException({
          taskId: "task-pick-1",
          stepId: "step-1",
          tenantId: "tenant-1",
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "ORDER_NOT_FOUND", statusCode: 404 });
    });

    it("lanza TASK_NOT_FOUND (404) si el stepId no pertenece a la tarea", async () => {
      await expect(
        handlePickingException({
          taskId: "task-pick-1",
          stepId: "step-inexistente",
          tenantId: "tenant-1",
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "TASK_NOT_FOUND", statusCode: 404 });
    });

    it.each(["COMPLETED", "EXCEPTION", "SKIPPED"] as const)(
      "lanza VALIDATION_ERROR (409) si el paso ya está resuelto (%s)",
      async (stepStatus) => {
        uow.state.tasks[0]!.steps[0]!.status = stepStatus;

        await expect(
          handlePickingException({
            taskId: "task-pick-1",
            stepId: "step-1",
            tenantId: "tenant-1",
            unitOfWork: uow,
          }),
        ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 409 });
      },
    );

    it("usa releaseUpTo (clamp a 0): nunca deja allocatedQty negativo si allocated < missingQty", async () => {
      uow.state.balances.find((b) => b.id === "bal-A01")!.allocatedQty = 1;
      uow.state.balances.find((b) => b.id === "bal-B01")!.onHandQty = 0;

      const result = await handlePickingException({
        taskId: "task-pick-1",
        stepId: "step-1",
        tenantId: "tenant-1",
        unitOfWork: uow,
      });

      expect(result.releasedOriginalQty).toBe(1);
      expect(result.reallocated).toBe(false);
      expect(result.orderStatus).toBe("ON_HOLD");
      expect(result.note).toBe("Operator reported exception");
      expect(uow.state.balances.find((b) => b.id === "bal-A01")?.allocatedQty).toBe(0);
    });
  });
});
