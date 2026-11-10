// apps/api/src/adapters/in-memory-idempotency-store.ts
// Adaptador en memoria para IdempotencyStore.
// Útil para tests unitarios rápidos y entornos de desarrollo sin base de datos.

import { randomUUID } from "node:crypto";
import type {
  IdempotencyStore,
  SaveIdempotencyRecordInput,
  StoredIdempotencyRecord,
} from "../ports/idempotency-store.js";

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, StoredIdempotencyRecord>();

  private makeKey(tenantId: string, idempotencyKey: string): string {
    return `${tenantId}::${idempotencyKey}`;
  }

  async find<T = unknown>(
    tenantId: string,
    idempotencyKey: string,
    _tx?: unknown,
  ): Promise<StoredIdempotencyRecord<T> | null> {
    const key = this.makeKey(tenantId, idempotencyKey);
    const found = this.records.get(key);
    if (!found) {
      return null;
    }
    // Retornar una copia superficial para evitar mutaciones externas
    return {
      ...found,
      responseBody: structuredClone(found.responseBody) as T,
    };
  }

  async save<T = unknown>(
    input: SaveIdempotencyRecordInput<T>,
    _tx?: unknown,
  ): Promise<StoredIdempotencyRecord<T>> {
    const key = this.makeKey(input.tenantId, input.idempotencyKey);
    if (this.records.has(key)) {
      const err = new Error(
        `Unique constraint failed: idempotency record for tenant "${input.tenantId}" and key "${input.idempotencyKey}" already exists`,
      );
      (err as unknown as { code: string }).code = "P2002";
      throw err;
    }

    const occurredAtDate = input.occurredAt
      ? typeof input.occurredAt === "string"
        ? new Date(input.occurredAt)
        : input.occurredAt
      : null;

    const record: StoredIdempotencyRecord<T> = {
      id: input.id ?? randomUUID(),
      tenantId: input.tenantId,
      idempotencyKey: input.idempotencyKey,
      action: input.action,
      requestHash: input.requestHash ?? null,
      responseStatus: input.responseStatus ?? 200,
      responseBody: structuredClone(input.responseBody),
      occurredAt: occurredAtDate,
      createdAt: new Date(),
    };

    this.records.set(key, record as StoredIdempotencyRecord<unknown>);
    return record;
  }

  clear(): void {
    this.records.clear();
  }

  size(): number {
    return this.records.size;
  }
}
