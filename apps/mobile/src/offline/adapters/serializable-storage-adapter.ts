// apps/mobile/src/offline/adapters/serializable-storage-adapter.ts
// Adaptador desacoplado para almacenar la cola en cualquier almacenamiento clave-valor serializable
// (compatible con AsyncStorage, localStorage o SQLite en JSON).

import type { OfflineQueueStorage } from "../ports/queue-storage.js";
import type { OfflineQueueItem } from "../types.js";

export interface KeyValueStore {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export class SerializableStorageAdapter implements OfflineQueueStorage {
  private readonly store: KeyValueStore;
  private readonly storageKey: string;

  constructor(store: KeyValueStore, storageKey = "wms_offline_queue_v1") {
    this.store = store;
    this.storageKey = storageKey;
  }

  public async load(): Promise<OfflineQueueItem[]> {
    try {
      const raw = await this.store.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as OfflineQueueItem[];
      }
      return [];
    } catch {
      return [];
    }
  }

  public async save(items: OfflineQueueItem[]): Promise<void> {
    await this.store.setItem(this.storageKey, JSON.stringify(items));
  }

  public async clear(): Promise<void> {
    await this.store.removeItem(this.storageKey);
  }
}
