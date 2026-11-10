// apps/mobile/src/offline/__tests__/local-task-cache.test.ts
import { describe, expect, it } from "vitest";
import type { WarehouseTaskDTO } from "@wms/shared-types";
import { LocalTaskCache } from "../local-task-cache.js";

function createSampleTask(overrides: Partial<WarehouseTaskDTO> = {}): WarehouseTaskDTO {
  return {
    id: "task-putaway-1",
    orderId: null,
    type: "PUTAWAY",
    status: "IN_PROGRESS",
    assignedTo: "user-1",
    steps: [
      {
        id: "step-1",
        sequence: 1,
        locationId: "loc-a1",
        locationCode: "A-01-01",
        productId: "prod-1",
        productSku: "SKU-MONITOR",
        productName: "Monitor 27 inch",
        productBarcode: "75010001",
        expectedQty: 5,
        scannedQty: 0,
        status: "PENDING",
      },
      {
        id: "step-2",
        sequence: 2,
        locationId: "loc-a2",
        locationCode: "A-01-02",
        productId: "prod-2",
        productSku: "SKU-KEYBOARD",
        productName: "Keyboard RGB",
        productBarcode: "75010002",
        expectedQty: 10,
        scannedQty: 0,
        status: "PENDING",
      },
    ],
    ...overrides,
  };
}

describe("LocalTaskCache", () => {
  it("initializes with tasks and allows querying and cloning", () => {
    const task = createSampleTask();
    const cache = new LocalTaskCache([task]);

    const retrieved = cache.getTask("task-putaway-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("task-putaway-1");

    // Must be a clone, modifying retrieved object does not mutate cache
    if (retrieved) {
      retrieved.status = "COMPLETED";
    }
    expect(cache.getTask("task-putaway-1")?.status).toBe("IN_PROGRESS");
    expect(cache.getAllTasks()).toHaveLength(1);
  });

  it("validates scan successfully when barcode, SKU or location match", () => {
    const task = createSampleTask();
    const cache = new LocalTaskCache([task]);

    // Match by barcode
    const res1 = cache.validateScan("task-putaway-1", "step-1", "75010001", 2);
    expect(res1.isValid).toBe(true);

    // Match by SKU
    const res2 = cache.validateScan("task-putaway-1", "step-1", "SKU-MONITOR", 1);
    expect(res2.isValid).toBe(true);

    // Match by location code
    const res3 = cache.validateScan("task-putaway-1", "step-1", "A-01-01", 5);
    expect(res3.isValid).toBe(true);
  });

  it("rejects invalid barcode or unknown location with INVALID_SCAN", () => {
    const task = createSampleTask();
    const cache = new LocalTaskCache([task]);

    const res = cache.validateScan("task-putaway-1", "step-1", "UNKNOWN-CODE", 1);
    expect(res.isValid).toBe(false);
    expect(res.code).toBe("INVALID_SCAN");
  });

  it("enforces strict step sequence (WRONG_STEP_SEQUENCE when previous step is PENDING)", () => {
    const task = createSampleTask();
    const cache = new LocalTaskCache([task]);

    // Step 2 cannot be scanned while step 1 is still PENDING
    const res = cache.validateScan("task-putaway-1", "step-2", "75010002", 1);
    expect(res.isValid).toBe(false);
    expect(res.code).toBe("WRONG_STEP_SEQUENCE");
  });

  it("rejects scans when quantity exceeds remaining or is non-positive", () => {
    const task = createSampleTask();
    const cache = new LocalTaskCache([task]);

    // Quantity exceeds expected (5)
    const res1 = cache.validateScan("task-putaway-1", "step-1", "75010001", 6);
    expect(res1.isValid).toBe(false);
    expect(res1.code).toBe("INVALID_SCAN");

    // Non-positive quantity
    const res2 = cache.validateScan("task-putaway-1", "step-1", "75010001", 0);
    expect(res2.isValid).toBe(false);
    expect(res2.code).toBe("INVALID_SCAN");
  });

  it("rejects scans when task is already completed or step already finished", () => {
    const task = createSampleTask({
      steps: [
        {
          id: "step-1",
          sequence: 1,
          locationId: "loc-a1",
          locationCode: "A-01-01",
          productId: "prod-1",
          productSku: "SKU-MONITOR",
          productName: "Monitor",
          productBarcode: "75010001",
          expectedQty: 5,
          scannedQty: 5,
          status: "COMPLETED",
        },
      ],
    });
    const cache = new LocalTaskCache([task]);

    const res = cache.validateScan("task-putaway-1", "step-1", "75010001", 1);
    expect(res.isValid).toBe(false);
    expect(res.code).toBe("CONFLICT");
  });

  it("applies optimistic step confirmation and completes task when all steps finish", () => {
    const task = createSampleTask({
      steps: [
        {
          id: "step-1",
          sequence: 1,
          locationId: "loc-a1",
          locationCode: "A-01-01",
          productId: "prod-1",
          productSku: "SKU-MONITOR",
          productName: "Monitor",
          productBarcode: "75010001",
          expectedQty: 5,
          scannedQty: 0,
          status: "PENDING",
        },
      ],
    });
    const cache = new LocalTaskCache([task]);

    // Partial step
    const partial = cache.applyOptimisticStep("task-putaway-1", "step-1", 3);
    expect(partial.steps[0]?.scannedQty).toBe(3);
    expect(partial.steps[0]?.status).toBe("PENDING");

    // Completing step
    const complete = cache.applyOptimisticStep("task-putaway-1", "step-1", 2);
    expect(complete.steps[0]?.scannedQty).toBe(5);
    expect(complete.steps[0]?.status).toBe("COMPLETED");
    expect(complete.status).toBe("COMPLETED");
  });

  it("handles exception reporting optimistically", () => {
    const task = createSampleTask();
    const cache = new LocalTaskCache([task]);

    const result = cache.applyOptimisticStep("task-putaway-1", "step-1", 0, true);
    expect(result.steps[0]?.status).toBe("EXCEPTION");
    expect(result.status).toBe("EXCEPTION");
  });

  it("validates receiving line items offline", () => {
    const receivingTask: WarehouseTaskDTO = {
      id: "task-rec-1",
      orderId: null,
      type: "RECEIVING",
      status: "IN_PROGRESS",
      assignedTo: "user-1",
      steps: [
        {
          id: "rec-step-1",
          sequence: 1,
          locationId: "loc-dock",
          locationCode: "DOCK-01",
          productId: "prod-apple",
          productSku: "SKU-APPLE",
          productName: "Apple iPhone",
          productBarcode: "88812345",
          expectedQty: 20,
          scannedQty: 0,
          status: "PENDING",
        },
      ],
    };
    const cache = new LocalTaskCache([receivingTask]);

    const valid = cache.validateReceiptLine("task-rec-1", "prod-apple", "88812345", 5);
    expect(valid.isValid).toBe(true);

    const invalidBarcode = cache.validateReceiptLine("task-rec-1", "prod-apple", "WRONG-BARCODE", 5);
    expect(invalidBarcode.isValid).toBe(false);
    expect(invalidBarcode.code).toBe("INVALID_SCAN");

    const unknownProduct = cache.validateReceiptLine("task-rec-1", "prod-non-existent", "88812345", 5);
    expect(unknownProduct.isValid).toBe(false);
    expect(unknownProduct.code).toBe("PRODUCT_NOT_FOUND");

    const invalidQty = cache.validateReceiptLine("task-rec-1", "prod-apple", "88812345", -1);
    expect(invalidQty.isValid).toBe(false);
    expect(invalidQty.code).toBe("INVALID_SCAN");

    const notFoundTask = cache.validateReceiptLine("task-missing", "prod-apple");
    expect(notFoundTask.isValid).toBe(false);
    expect(notFoundTask.code).toBe("TASK_NOT_FOUND");
  });

  it("applies optimistic receipt confirmation to local cache", () => {
    const receivingTask: WarehouseTaskDTO = {
      id: "task-rec-2",
      orderId: null,
      type: "RECEIVING",
      status: "PENDING",
      assignedTo: "user-1",
      steps: [
        {
          id: "rec-step-1",
          sequence: 1,
          locationId: "loc-dock",
          locationCode: "DOCK-01",
          productId: "prod-apple",
          productSku: "SKU-APPLE",
          productName: "Apple iPhone",
          productBarcode: "88812345",
          expectedQty: 10,
          scannedQty: 0,
          status: "PENDING",
        },
      ],
    };
    const cache = new LocalTaskCache([receivingTask]);

    const partial = cache.applyOptimisticReceiptLine("task-rec-2", "prod-apple", 5);
    expect(partial.steps[0]?.scannedQty).toBe(5);
    expect(partial.status).toBe("IN_PROGRESS");

    const complete = cache.applyOptimisticReceiptLine("task-rec-2", "prod-apple", 5);
    expect(complete.steps[0]?.scannedQty).toBe(10);
    expect(complete.steps[0]?.status).toBe("COMPLETED");
    expect(complete.status).toBe("COMPLETED");
  });

  it("handles removeTask, clear, and missing task validations cleanly", () => {
    const task = createSampleTask();
    const cache = new LocalTaskCache([task]);

    expect(cache.validateScan("task-unknown", "step-1", "A-01-01").code).toBe("TASK_NOT_FOUND");
    expect(cache.validateScan("task-putaway-1", "step-unknown", "A-01-01").code).toBe("TASK_NOT_FOUND");

    cache.removeTask("task-putaway-1");
    expect(cache.getTask("task-putaway-1")).toBeUndefined();

    cache.setTasks([task]);
    expect(cache.getAllTasks()).toHaveLength(1);
    cache.clear();
    expect(cache.getAllTasks()).toHaveLength(0);
  });
});
