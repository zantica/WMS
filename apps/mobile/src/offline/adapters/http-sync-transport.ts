// apps/mobile/src/offline/adapters/http-sync-transport.ts
// Adaptador de transporte que conecta el puerto SyncTransport con WmsApiClient.

import type { SyncTransport } from "../ports/sync-transport.js";
import type { WmsApiClient } from "../../api/client.js";
import type {
  SyncTaskBatchItem,
  SyncTaskBatchResult,
} from "@wms/shared-types";

export class HttpSyncTransport implements SyncTransport {
  private readonly client: WmsApiClient;

  constructor(client: WmsApiClient) {
    this.client = client;
  }

  public async sendBatch(
    items: SyncTaskBatchItem[],
  ): Promise<SyncTaskBatchResult> {
    return this.client.syncTaskBatch({ items });
  }
}
