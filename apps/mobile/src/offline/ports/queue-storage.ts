// apps/mobile/src/offline/ports/queue-storage.ts
// Puerto hexagonal para la persistencia desacoplada de la cola offline.
// Permite alternar entre almacenamiento en memoria (tests) o AsyncStorage / SQLite en producción.

import type { OfflineQueueItem } from "../types.js";

export interface OfflineQueueStorage {
  load(): Promise<OfflineQueueItem[]>;
  save(items: OfflineQueueItem[]): Promise<void>;
  clear(): Promise<void>;
}
