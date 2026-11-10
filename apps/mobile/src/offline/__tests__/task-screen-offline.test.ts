// apps/mobile/src/offline/__tests__/task-screen-offline.test.ts
import { describe, expect, it, vi } from "vitest";
import type { WarehouseTaskDTO } from "@wms/shared-types";
import { LocalTaskCache } from "../local-task-cache.js";
import {
  handleOfflineReceiptLineConfirmation,
  handleOfflineStepConfirmation,
  handleOfflineTaskLoad,
} from "../task-screen-offline.js";

function createMockTask(overrides: Partial<WarehouseTaskDTO> = {}): WarehouseTaskDTO {
  return {
    id: "task-100",
    orderId: null,
    type: "PUTAWAY",
    status: "IN_PROGRESS",
    assignedTo: "user-1",
    steps: [
      {
        id: "step-100-1",
        sequence: 1,
        locationId: "loc-1",
        locationCode: "A-01-01",
        productId: "prod-1",
        productSku: "SKU-TEST-1",
        productName: "Test Item 1",
        productBarcode: "750000001",
        expectedQty: 5,
        scannedQty: 0,
        status: "PENDING",
      },
    ],
    ...overrides,
  };
}

describe("task-screen-offline helpers", () => {
  describe("handleOfflineTaskLoad", () => {
    it("returns cached task if present", () => {
      const task = createMockTask();
      const cache = new LocalTaskCache([task]);

      const result = handleOfflineTaskLoad("task-100", cache);
      expect(result.task).toBeDefined();
      expect(result.task?.id).toBe("task-100");
      expect(result.domainError).toBeNull();
    });

    it("returns error banner when task is not in cache", () => {
      const cache = new LocalTaskCache();

      const result = handleOfflineTaskLoad("missing-id", cache);
      expect(result.task).toBeNull();
      expect(result.domainError).toBeDefined();
      expect(result.domainError?.code).toBe("OFFLINE_CACHE_MISS");
    });
  });

  describe("handleOfflineStepConfirmation", () => {
    it("successfully validates, enqueues and applies optimistic step", async () => {
      const task = createMockTask();
      const cache = new LocalTaskCache([task]);
      const enqueueMock = vi.fn().mockResolvedValue({ idempotencyKey: "idem-1" });

      const res = await handleOfflineStepConfirmation({
        cache,
        enqueueStepConfirmation: enqueueMock,
        taskId: "task-100",
        stepId: "step-100-1",
        scannedCode: "A-01-01",
        quantity: 2,
      });

      expect(res.success).toBe(true);
      expect(enqueueMock).toHaveBeenCalledWith({
        taskId: "task-100",
        stepId: "step-100-1",
        scannedCode: "A-01-01",
        quantity: 2,
      });
      expect(res.updatedTask?.steps[0]?.scannedQty).toBe(2);
    });

    it("returns validation error if scan code does not match step", async () => {
      const task = createMockTask();
      const cache = new LocalTaskCache([task]);
      const enqueueMock = vi.fn();

      const res = await handleOfflineStepConfirmation({
        cache,
        enqueueStepConfirmation: enqueueMock,
        taskId: "task-100",
        stepId: "step-100-1",
        scannedCode: "WRONG-LOCATION",
        quantity: 2,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe("INVALID_SCAN");
      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("handles enqueue failure gracefully", async () => {
      const task = createMockTask();
      const cache = new LocalTaskCache([task]);
      const enqueueMock = vi.fn().mockRejectedValue(new Error("Disk Full"));

      const res = await handleOfflineStepConfirmation({
        cache,
        enqueueStepConfirmation: enqueueMock,
        taskId: "task-100",
        stepId: "step-100-1",
        scannedCode: "A-01-01",
        quantity: 1,
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("OFFLINE_QUEUE_ERROR");
    });
  });

  describe("handleOfflineReceiptLineConfirmation", () => {
    it("successfully validates receipt, enqueues and applies optimistic step", async () => {
      const task = createMockTask({
        type: "RECEIVING",
        steps: [
          {
            id: "step-rec-1",
            sequence: 1,
            locationId: "loc-dock-1",
            locationCode: "DOCK-01",
            productId: "prod-1",
            productSku: "SKU-TEST-1",
            productName: "Test Item 1",
            productBarcode: "750000001",
            expectedQty: 10,
            scannedQty: 0,
            status: "PENDING",
          },
        ],
      });
      const cache = new LocalTaskCache([task]);
      const enqueueMock = vi.fn().mockResolvedValue({ idempotencyKey: "idem-rec-1" });

      const res = await handleOfflineReceiptLineConfirmation({
        cache,
        enqueueReceiptLineConfirmation: enqueueMock,
        taskId: "task-100",
        productId: "prod-1",
        scannedCode: "750000001",
        quantity: 4,
      });

      expect(res.success).toBe(true);
      expect(enqueueMock).toHaveBeenCalledWith({
        taskId: "task-100",
        productId: "prod-1",
        scannedQty: 4,
        barcode: "750000001",
      });
      expect(res.updatedTask?.steps[0]?.scannedQty).toBe(4);
    });

    it("returns error if scanned barcode is invalid for receipt line", async () => {
      const task = createMockTask({
        type: "RECEIVING",
        steps: [
          {
            id: "step-rec-1",
            sequence: 1,
            locationId: "loc-dock-1",
            locationCode: "DOCK-01",
            productId: "prod-1",
            productSku: "SKU-TEST-1",
            productName: "Test Item 1",
            productBarcode: "750000001",
            expectedQty: 10,
            scannedQty: 0,
            status: "PENDING",
          },
        ],
      });
      const cache = new LocalTaskCache([task]);
      const enqueueMock = vi.fn();

      const res = await handleOfflineReceiptLineConfirmation({
        cache,
        enqueueReceiptLineConfirmation: enqueueMock,
        taskId: "task-100",
        productId: "prod-1",
        scannedCode: "INVALID-BARCODE",
        quantity: 2,
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe("INVALID_SCAN");
      expect(enqueueMock).not.toHaveBeenCalled();
    });

    it("handles receipt line enqueue failure gracefully", async () => {
      const task = createMockTask({
        type: "RECEIVING",
        steps: [
          {
            id: "step-rec-1",
            sequence: 1,
            locationId: "loc-dock-1",
            locationCode: "DOCK-01",
            productId: "prod-1",
            productSku: "SKU-TEST-1",
            productName: "Test Item 1",
            productBarcode: "750000001",
            expectedQty: 10,
            scannedQty: 0,
            status: "PENDING",
          },
        ],
      });
      const cache = new LocalTaskCache([task]);
      const enqueueMock = vi.fn().mockRejectedValue(new Error("Queue error"));

      const res = await handleOfflineReceiptLineConfirmation({
        cache,
        enqueueReceiptLineConfirmation: enqueueMock,
        taskId: "task-100",
        productId: "prod-1",
        scannedCode: "750000001",
        quantity: 2,
      });

      expect(res.success).toBe(false);
      expect(res.error?.code).toBe("OFFLINE_QUEUE_ERROR");
    });
  });
});
