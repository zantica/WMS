// apps/mobile/src/offline/ports/sync-transport.ts
// Puerto hexagonal para la transmisión de lotes de sincronización.
// Desacopla la lógica de la cola respecto a HTTP, Fastify y Axios.

import type {
  SyncTaskBatchItem,
  SyncTaskBatchResult,
} from "@wms/shared-types";

export interface SyncTransport {
  sendBatch(items: SyncTaskBatchItem[]): Promise<SyncTaskBatchResult>;
}
