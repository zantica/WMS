// apps/api/src/adapters/prisma-idempotency-store.ts
// Adaptador Prisma para IdempotencyStore.
// Persiste en la tabla PostgreSQL `idempotency_records` participando en la misma
// transacción del Ledger (tx) y respetando las políticas RLS de tenant_isolation_policy.

import { prisma, type Prisma } from "@wms/db";
import type {
  IdempotencyStore,
  SaveIdempotencyRecordInput,
  StoredIdempotencyRecord,
} from "../ports/idempotency-store.js";
import { getAmbientTenantScope } from "../use-cases/security/tenant-context.js";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly defaultClient: typeof prisma = prisma) {}

  private resolveClient(tx?: unknown): PrismaClientOrTx {
    if (tx && typeof tx === "object" && "idempotencyRecord" in tx) {
      return tx as Prisma.TransactionClient;
    }
    const ambient = getAmbientTenantScope<Prisma.TransactionClient>();
    if (ambient?.scope && "idempotencyRecord" in ambient.scope) {
      return ambient.scope;
    }
    return this.defaultClient;
  }

  async find<T = unknown>(
    tenantId: string,
    idempotencyKey: string,
    tx?: unknown,
  ): Promise<StoredIdempotencyRecord<T> | null> {
    const client = this.resolveClient(tx);
    const row = await client.idempotencyRecord.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      idempotencyKey: row.idempotencyKey,
      action: row.action,
      requestHash: row.requestHash,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody as T,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
    };
  }

  async save<T = unknown>(
    input: SaveIdempotencyRecordInput<T>,
    tx?: unknown,
  ): Promise<StoredIdempotencyRecord<T>> {
    const client = this.resolveClient(tx);
    const occurredAtDate = input.occurredAt
      ? typeof input.occurredAt === "string"
        ? new Date(input.occurredAt)
        : input.occurredAt
      : null;

    const row = await client.idempotencyRecord.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        tenantId: input.tenantId,
        idempotencyKey: input.idempotencyKey,
        action: input.action,
        requestHash: input.requestHash ?? null,
        responseStatus: input.responseStatus ?? 200,
        responseBody: (input.responseBody ?? {}) as Prisma.InputJsonValue,
        occurredAt: occurredAtDate,
      },
    });

    return {
      id: row.id,
      tenantId: row.tenantId,
      idempotencyKey: row.idempotencyKey,
      action: row.action,
      requestHash: row.requestHash,
      responseStatus: row.responseStatus,
      responseBody: row.responseBody as T,
      occurredAt: row.occurredAt,
      createdAt: row.createdAt,
    };
  }
}
