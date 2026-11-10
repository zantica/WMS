// apps/mobile/src/offline/adapters/in-memory-queue-storage.ts
// Adaptador en memoria para OfflineQueueStorage.
// Clona profundamente los ítems para garantizar aislamiento y evitar mutaciones por referencia.

import type { OfflineQueueStorage } from "../ports/queue-storage.js";
import type { OfflineQueueItem } from "../types.js";

function cloneItems(items: readonly OfflineQueueItem[]): OfflineQueueItem[] {
  return JSON.parse(JSON.stringify(items)) as OfflineQueueItem[];
}

export class InMemoryOfflineQueueStorage implements OfflineQueueStorage {
  private items: OfflineQueueItem[];

  constructor(initialItems: readonly OfflineQueueItem[] = []) {
    this.items = cloneItems(initialItems);
  }

  public async load(): Promise<OfflineQueueItem[]> {
    return cloneItems(this.items);
  }

  public async save(items: OfflineQueueItem[]): Promise<void> {
    this.items = cloneItems(items);
  }

  public async clear(): Promise<void> {
    this.items = [];
  }
}
