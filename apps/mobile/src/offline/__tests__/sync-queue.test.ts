// apps/mobile/src/offline/__tests__/sync-queue.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SyncTaskBatchItem, SyncTaskBatchResult } from "@wms/shared-types";
import { OfflineSyncQueue } from "../sync-queue.js";
import { InMemoryOfflineQueueStorage } from "../adapters/in-memory-queue-storage.js";
import { EventConnectivityMonitor } from "../adapters/event-connectivity-monitor.js";
import type { SyncTransport } from "../ports/sync-transport.js";

class MockSyncTransport implements SyncTransport {
  public sendBatch = vi.fn<
    (items: SyncTaskBatchItem[]) => Promise<SyncTaskBatchResult>
  >();
}

describe("OfflineSyncQueue", () => {
  let storage: InMemoryOfflineQueueStorage;
  let connectivity: EventConnectivityMonitor;
  let transport: MockSyncTransport;
  let idSeq = 0;
  const mockIdGenerator = () => `mock-uuid-${++idSeq}`;

  beforeEach(() => {
    idSeq = 0;
    storage = new InMemoryOfflineQueueStorage();
    connectivity = new EventConnectivityMonitor(true);
    transport = new MockSyncTransport();
  });

  it("enqueues an action with cryptographic idempotencyKey and persists it as PENDING", async () => {
    connectivity.setOnline(false); // keep offline to inspect enqueued state
    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
      idGenerator: mockIdGenerator,
      nowProvider: () => new Date("2026-11-10T12:00:00.000Z"),
    });
    await queue.init();

    const enqueued = await queue.enqueue("CONFIRM_STEP", {
      taskId: "task-1",
      stepId: "step-1",
      scannedCode: "LOC-01",
      quantity: 1,
    });

    expect(enqueued.idempotencyKey).toBe("mock-uuid-1");
    expect(enqueued.action).toBe("CONFIRM_STEP");
    expect(enqueued.occurredAt).toBe("2026-11-10T12:00:00.000Z");
    expect(enqueued.status).toBe("PENDING");
    expect(enqueued.retryCount).toBe(0);

    const snapshot = queue.getSnapshot();
    expect(snapshot.pendingCount).toBe(1);
    expect(snapshot.networkStatus).toBe("OFFLINE");

    const inStorage = await storage.load();
    expect(inStorage).toHaveLength(1);
    expect(inStorage[0]?.idempotencyKey).toBe("mock-uuid-1");
  });

  it("happy path: syncs pending batch and removes APPLIED items", async () => {
    connectivity.setOnline(false);
    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
      idGenerator: mockIdGenerator,
    });
    await queue.init();

    await queue.enqueue("CONFIRM_STEP", {
      taskId: "task-1",
      stepId: "step-1",
      scannedCode: "LOC-01",
    });

    transport.sendBatch.mockResolvedValueOnce({
      total: 1,
      appliedCount: 1,
      alreadyAppliedCount: 0,
      conflictCount: 0,
      rejectedCount: 0,
      processedAt: new Date().toISOString(),
      items: [
        {
          idempotencyKey: "mock-uuid-1",
          action: "CONFIRM_STEP",
          status: "APPLIED",
          occurredAt: "2026-11-10T10:00:00.000Z",
          receivedAt: "2026-11-10T10:00:01.000Z",
        },
      ],
    });

    connectivity.setOnline(true);
    const result = await queue.sync();

    expect(result.processed).toBe(1);
    expect(result.applied).toBe(1);
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getSnapshot().items).toHaveLength(0);

    const stored = await storage.load();
    expect(stored).toHaveLength(0);
  });

  it("handles duplicate retries when server responds ALREADY_APPLIED (clears from queue cleanly)", async () => {
    connectivity.setOnline(false);
    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
      idGenerator: mockIdGenerator,
    });
    await queue.init();

    await queue.enqueue("CONFIRM_STEP", {
      taskId: "task-1",
      stepId: "step-1",
      scannedCode: "LOC-01",
    });

    transport.sendBatch.mockResolvedValueOnce({
      total: 1,
      appliedCount: 0,
      alreadyAppliedCount: 1,
      conflictCount: 0,
      rejectedCount: 0,
      processedAt: new Date().toISOString(),
      items: [
        {
          idempotencyKey: "mock-uuid-1",
          action: "CONFIRM_STEP",
          status: "ALREADY_APPLIED",
          occurredAt: "2026-11-10T10:00:00.000Z",
          receivedAt: "2026-11-10T10:00:01.000Z",
        },
      ],
    });

    connectivity.setOnline(true);
    const result = await queue.sync();

    expect(result.alreadyApplied).toBe(1);
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getSnapshot().items).toHaveLength(0);
  });

  it("quarantines items when server responds CONFLICT or REJECTED and does not re-sync them in subsequent runs", async () => {
    connectivity.setOnline(false);
    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
      idGenerator: mockIdGenerator,
      nowProvider: () => new Date("2026-11-10T12:30:00.000Z"),
    });
    await queue.init();

    await queue.enqueue("CONFIRM_STEP", {
      taskId: "task-conflict",
      stepId: "step-conflict",
      scannedCode: "LOC-01",
    });

    transport.sendBatch.mockResolvedValueOnce({
      total: 1,
      appliedCount: 0,
      alreadyAppliedCount: 0,
      conflictCount: 1,
      rejectedCount: 0,
      processedAt: new Date().toISOString(),
      items: [
        {
          idempotencyKey: "mock-uuid-1",
          action: "CONFIRM_STEP",
          status: "CONFLICT",
          occurredAt: "2026-11-10T10:00:00.000Z",
          receivedAt: "2026-11-10T10:00:01.000Z",
          error: {
            code: "CONFLICT",
            message: "Task has already been completed by supervisor",
          },
        },
      ],
    });

    connectivity.setOnline(true);
    const result = await queue.sync();

    expect(result.quarantined).toBe(1);
    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getQuarantinedCount()).toBe(1);

    const quarantined = queue.getQuarantinedItems();
    expect(quarantined).toHaveLength(1);
    expect(quarantined[0]?.status).toBe("QUARANTINED");
    expect(quarantined[0]?.quarantineReason?.code).toBe("CONFLICT");
    expect(quarantined[0]?.quarantinedAt).toBe("2026-11-10T12:30:00.000Z");

    // In next regular sync, quarantined item is NOT sent to server
    transport.sendBatch.mockClear();
    const secondSync = await queue.sync();
    expect(secondSync.processed).toBe(0);
    expect(transport.sendBatch).not.toHaveBeenCalled();
  });

  it("allows retrying and discarding quarantined items", async () => {
    connectivity.setOnline(false);
    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
      idGenerator: mockIdGenerator,
    });
    await queue.init();

    await queue.enqueue("CONFIRM_STEP", {
      taskId: "task-1",
      stepId: "step-1",
      scannedCode: "LOC-01",
    });

    transport.sendBatch.mockResolvedValueOnce({
      total: 1,
      appliedCount: 0,
      alreadyAppliedCount: 0,
      conflictCount: 1,
      rejectedCount: 0,
      processedAt: new Date().toISOString(),
      items: [
        {
          idempotencyKey: "mock-uuid-1",
          action: "CONFIRM_STEP",
          status: "CONFLICT",
          occurredAt: "2026-11-10T10:00:00.000Z",
          receivedAt: "2026-11-10T10:00:01.000Z",
          error: { code: "CONFLICT", message: "Step completed elsewhere" },
        },
      ],
    });

    connectivity.setOnline(true);
    await queue.sync();
    expect(queue.getQuarantinedCount()).toBe(1);

    // Retry quarantined
    connectivity.setOnline(false); // stay offline during retry reactivating
    const retried = await queue.retryQuarantined("mock-uuid-1");
    expect(retried).toBe(true);
    expect(queue.getQuarantinedCount()).toBe(0);
    expect(queue.getPendingCount()).toBe(1);

    // Now test discarding
    // Force back to quarantine for testing discard
    const snapshotItem = queue.getSnapshot().items[0]!;
    snapshotItem.status = "QUARANTINED";
    const discarded = await queue.discardQuarantined("mock-uuid-1");
    expect(discarded).toBe(true);
    expect(queue.getSnapshot().items).toHaveLength(0);
  });

  it("handles mid-batch splits: 1 applied, 1 duplicate, 1 conflict, 1 rejected", async () => {
    connectivity.setOnline(false);
    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
      idGenerator: mockIdGenerator,
    });
    await queue.init();

    await queue.enqueue("CONFIRM_STEP", { taskId: "t1", stepId: "s1", scannedCode: "c1" });
    await queue.enqueue("CONFIRM_STEP", { taskId: "t2", stepId: "s2", scannedCode: "c2" });
    await queue.enqueue("CONFIRM_STEP", { taskId: "t3", stepId: "s3", scannedCode: "c3" });
    await queue.enqueue("CONFIRM_STEP", { taskId: "t4", stepId: "s4", scannedCode: "c4" });

    transport.sendBatch.mockResolvedValueOnce({
      total: 4,
      appliedCount: 1,
      alreadyAppliedCount: 1,
      conflictCount: 1,
      rejectedCount: 1,
      processedAt: new Date().toISOString(),
      items: [
        {
          idempotencyKey: "mock-uuid-1",
          action: "CONFIRM_STEP",
          status: "APPLIED",
          occurredAt: "2026-11-10T10:00:00Z",
          receivedAt: "2026-11-10T10:00:01Z",
        },
        {
          idempotencyKey: "mock-uuid-2",
          action: "CONFIRM_STEP",
          status: "ALREADY_APPLIED",
          occurredAt: "2026-11-10T10:00:00Z",
          receivedAt: "2026-11-10T10:00:01Z",
        },
        {
          idempotencyKey: "mock-uuid-3",
          action: "CONFIRM_STEP",
          status: "CONFLICT",
          occurredAt: "2026-11-10T10:00:00Z",
          receivedAt: "2026-11-10T10:00:01Z",
          error: { code: "CONFLICT", message: "Conflict detected" },
        },
        {
          idempotencyKey: "mock-uuid-4",
          action: "CONFIRM_STEP",
          status: "REJECTED",
          occurredAt: "2026-11-10T10:00:00Z",
          receivedAt: "2026-11-10T10:00:01Z",
          error: { code: "VALIDATION_ERROR", message: "Invalid payload" },
        },
      ],
    });

    connectivity.setOnline(true);
    const res = await queue.sync();

    expect(res.processed).toBe(4);
    expect(res.applied).toBe(1);
    expect(res.alreadyApplied).toBe(1);
    expect(res.quarantined).toBe(2);

    expect(queue.getPendingCount()).toBe(0);
    expect(queue.getQuarantinedCount()).toBe(2);
  });

  it("handles transient network exceptions with exponential backoff without quarantining items", async () => {
    connectivity.setOnline(false);
    const scheduledTimeouts: { fn: () => void; ms: number }[] = [];
    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
      idGenerator: mockIdGenerator,
      initialBackoffMs: 1000,
      maxBackoffMs: 8000,
      backoffMultiplier: 2,
      scheduleTimeout: (fn, ms) => {
        scheduledTimeouts.push({ fn, ms });
        return scheduledTimeouts.length;
      },
      clearScheduledTimeout: () => {},
    });
    await queue.init();

    await queue.enqueue("CONFIRM_STEP", { taskId: "t1", stepId: "s1", scannedCode: "c1" });

    // First attempt fails due to timeout
    transport.sendBatch.mockRejectedValueOnce(new Error("Network timeout"));
    connectivity.setOnline(true);
    const result1 = await queue.sync();

    expect(result1.error).toBe("Network timeout");
    expect(queue.getPendingCount()).toBe(1);
    expect(queue.getQuarantinedCount()).toBe(0); // Not quarantined!

    const itemAfterFail1 = queue.getSnapshot().items[0]!;
    expect(itemAfterFail1.status).toBe("PENDING");
    expect(itemAfterFail1.retryCount).toBe(1);

    // Backoff scheduled: delay = 1000ms * (2^0) = 1000ms
    expect(scheduledTimeouts).toHaveLength(1);
    expect(scheduledTimeouts[0]?.ms).toBe(1000);

    // Second failure: delay = 1000ms * (2^1) = 2000ms
    transport.sendBatch.mockRejectedValueOnce(new Error("503 Service Unavailable"));
    await queue.sync();
    expect(queue.getSnapshot().items[0]?.retryCount).toBe(2);
    expect(scheduledTimeouts[1]?.ms).toBe(2000);
  });

  it("auto-syncs when connectivity monitor transitions to online", async () => {
    connectivity.setOnline(false);
    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
      idGenerator: mockIdGenerator,
      autoSyncOnOnline: true,
    });
    await queue.init();

    await queue.enqueue("CONFIRM_STEP", { taskId: "t1", stepId: "s1", scannedCode: "c1" });
    expect(transport.sendBatch).not.toHaveBeenCalled();

    transport.sendBatch.mockResolvedValueOnce({
      total: 1,
      appliedCount: 1,
      alreadyAppliedCount: 0,
      conflictCount: 0,
      rejectedCount: 0,
      processedAt: new Date().toISOString(),
      items: [
        {
          idempotencyKey: "mock-uuid-1",
          action: "CONFIRM_STEP",
          status: "APPLIED",
          occurredAt: "2026-11-10T10:00:00Z",
          receivedAt: "2026-11-10T10:00:01Z",
        },
      ],
    });

    connectivity.setOnline(true);
    // Wait for the async sync triggered by listener
    await new Promise((r) => setTimeout(r, 10));

    expect(transport.sendBatch).toHaveBeenCalledTimes(1);
    expect(queue.getPendingCount()).toBe(0);
  });

  it("resets SYNCING items to PENDING on init after simulated app crash", async () => {
    const crashedItem = {
      idempotencyKey: "crash-1",
      action: "CONFIRM_STEP" as const,
      occurredAt: "2026-11-10T10:00:00Z",
      payload: { taskId: "t1", stepId: "s1", scannedCode: "c1" },
      status: "SYNCING" as const,
      retryCount: 0,
    };
    await storage.save([crashedItem]);

    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
      idGenerator: mockIdGenerator,
    });
    await queue.init();

    const snapshot = queue.getSnapshot();
    expect(snapshot.pendingCount).toBe(1);
    expect(snapshot.syncingCount).toBe(0);
    expect(snapshot.items[0]?.status).toBe("PENDING");
  });

  it("clears all quarantined items in bulk and disposes cleanly", async () => {
    const queue = new OfflineSyncQueue({
      storage,
      transport,
      connectivity,
    });
    await queue.init();

    // Default UUID generator should work in node environment
    const item = await queue.enqueue("CONFIRM_STEP", {
      taskId: "t-default",
      stepId: "s-default",
      scannedCode: "LOC-DEF",
    });
    expect(typeof item.idempotencyKey).toBe("string");
    expect(item.idempotencyKey.length).toBeGreaterThan(10);

    // Force item into quarantine
    item.status = "QUARANTINED";
    await storage.save([item]);

    expect(queue.getQuarantinedCount()).toBe(1);
    const cleared = await queue.clearQuarantined();
    expect(cleared).toBe(1);
    expect(queue.getQuarantinedCount()).toBe(0);

    // Second clear returns 0
    expect(await queue.clearQuarantined()).toBe(0);

    // Dispose cleans up timers and listeners
    queue.dispose();
  });
});
