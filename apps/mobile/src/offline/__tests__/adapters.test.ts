// apps/mobile/src/offline/__tests__/adapters.test.ts
import { describe, expect, it, vi } from "vitest";
import { InMemoryOfflineQueueStorage } from "../adapters/in-memory-queue-storage.js";
import {
  SerializableStorageAdapter,
  type KeyValueStore,
} from "../adapters/serializable-storage-adapter.js";
import { HttpSyncTransport } from "../adapters/http-sync-transport.js";
import { EventConnectivityMonitor } from "../adapters/event-connectivity-monitor.js";
import type { WmsApiClient } from "../../api/client.js";
import type { OfflineQueueItem } from "../types.js";

describe("Offline Adapters", () => {
  const sampleItem: OfflineQueueItem = {
    idempotencyKey: "item-1",
    action: "CONFIRM_STEP",
    occurredAt: "2026-11-10T12:00:00Z",
    payload: { taskId: "t1", stepId: "s1", scannedCode: "LOC-01" },
    status: "PENDING",
    retryCount: 0,
  };

  describe("InMemoryOfflineQueueStorage", () => {
    it("saves, loads and clears items deep-cloned", async () => {
      const storage = new InMemoryOfflineQueueStorage([sampleItem]);
      const loaded = await storage.load();
      expect(loaded).toHaveLength(1);
      expect(loaded[0]?.idempotencyKey).toBe("item-1");

      loaded[0]!.status = "SYNCING";
      const loadedAgain = await storage.load();
      expect(loadedAgain[0]?.status).toBe("PENDING"); // not mutated by reference

      await storage.clear();
      expect(await storage.load()).toHaveLength(0);
    });
  });

  describe("SerializableStorageAdapter", () => {
    it("serializes and deserializes items through KeyValueStore interface", async () => {
      const memoryStore: Record<string, string> = {};
      const mockKv: KeyValueStore = {
        getItem: vi.fn((k: string) => memoryStore[k] ?? null),
        setItem: vi.fn((k: string, v: string) => {
          memoryStore[k] = v;
        }),
        removeItem: vi.fn((k: string) => {
          delete memoryStore[k];
        }),
      };

      const adapter = new SerializableStorageAdapter(mockKv, "custom_key");

      expect(await adapter.load()).toEqual([]);

      await adapter.save([sampleItem]);
      expect(mockKv.setItem).toHaveBeenCalledWith(
        "custom_key",
        expect.stringContaining("item-1"),
      );

      const reloaded = await adapter.load();
      expect(reloaded).toHaveLength(1);
      expect(reloaded[0]?.idempotencyKey).toBe("item-1");

      await adapter.clear();
      expect(mockKv.removeItem).toHaveBeenCalledWith("custom_key");
      expect(await adapter.load()).toEqual([]);
    });

    it("gracefully handles invalid JSON in KeyValueStore", async () => {
      const mockKv: KeyValueStore = {
        getItem: () => "invalid-json{",
        setItem: () => {},
        removeItem: () => {},
      };
      const adapter = new SerializableStorageAdapter(mockKv);
      expect(await adapter.load()).toEqual([]);
    });
  });

  describe("HttpSyncTransport", () => {
    it("delegates to WmsApiClient.syncTaskBatch", async () => {
      const mockClient = {
        syncTaskBatch: vi.fn().mockResolvedValue({
          total: 1,
          appliedCount: 1,
          alreadyAppliedCount: 0,
          conflictCount: 0,
          rejectedCount: 0,
          processedAt: new Date().toISOString(),
          items: [],
        }),
      } as unknown as WmsApiClient;

      const transport = new HttpSyncTransport(mockClient);
      const res = await transport.sendBatch([
        {
          idempotencyKey: "idem-1",
          action: "CONFIRM_STEP",
          occurredAt: "2026-11-10T12:00:00Z",
          payload: { taskId: "t1", stepId: "s1", scannedCode: "c1" },
        },
      ]);

      expect(res.appliedCount).toBe(1);
      expect(mockClient.syncTaskBatch).toHaveBeenCalledWith({
        items: expect.any(Array),
      });
    });
  });

  describe("EventConnectivityMonitor", () => {
    it("notifies subscribers when connectivity status changes", () => {
      const monitor = new EventConnectivityMonitor(true);
      expect(monitor.isOnline()).toBe(true);

      const listener = vi.fn();
      const unsubscribe = monitor.subscribe(listener);

      monitor.setOnline(false);
      expect(listener).toHaveBeenCalledWith(false);
      expect(monitor.isOnline()).toBe(false);

      // No redundant call if status does not change
      monitor.setOnline(false);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      monitor.setOnline(true);
      expect(listener).toHaveBeenCalledTimes(1);
      monitor.dispose();
    });
  });
});
