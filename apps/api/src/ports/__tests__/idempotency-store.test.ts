// apps/api/src/ports/__tests__/idempotency-store.test.ts
// Tests unitarios para InMemoryIdempotencyStore y PrismaIdempotencyStore.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../adapters/in-memory-idempotency-store.js";
import { PrismaIdempotencyStore } from "../../adapters/prisma-idempotency-store.js";

describe("InMemoryIdempotencyStore", () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
  });

  it("devuelve null cuando la clave no existe para el tenant", async () => {
    const res = await store.find("tenant-1", "key-non-existent");
    expect(res).toBeNull();
  });

  it("guarda y recupera un registro de idempotencia correctamente", async () => {
    const occurredAt = new Date("2026-11-10T02:00:00Z");
    const payload = { stepId: "step-1", scannedQty: 5 };

    const saved = await store.save({
      tenantId: "tenant-1",
      idempotencyKey: "key-123",
      action: "CONFIRM_TASK_STEP",
      responseStatus: 200,
      responseBody: payload,
      occurredAt,
    });

    expect(saved.id).toBeDefined();
    expect(saved.tenantId).toBe("tenant-1");
    expect(saved.idempotencyKey).toBe("key-123");
    expect(saved.responseBody).toEqual(payload);
    expect(saved.occurredAt).toEqual(occurredAt);

    const found = await store.find<typeof payload>("tenant-1", "key-123");
    expect(found).not.toBeNull();
    expect(found?.responseBody).toEqual(payload);
  });

  it("garantiza aislamiento entre distintos tenants con la misma clave", async () => {
    await store.save({
      tenantId: "tenant-1",
      idempotencyKey: "shared-key",
      action: "CONFIRM_TASK_STEP",
      responseBody: { source: "tenant-1" },
    });

    const tenant2Record = await store.find("tenant-2", "shared-key");
    expect(tenant2Record).toBeNull();

    await store.save({
      tenantId: "tenant-2",
      idempotencyKey: "shared-key",
      action: "CONFIRM_TASK_STEP",
      responseBody: { source: "tenant-2" },
    });

    const found1 = await store.find<{ source: string }>("tenant-1", "shared-key");
    const found2 = await store.find<{ source: string }>("tenant-2", "shared-key");

    expect(found1?.responseBody.source).toBe("tenant-1");
    expect(found2?.responseBody.source).toBe("tenant-2");
  });

  it("rechaza registros duplicados para el mismo (tenantId, idempotencyKey)", async () => {
    await store.save({
      tenantId: "tenant-1",
      idempotencyKey: "unique-key",
      action: "CONFIRM_TASK_STEP",
      responseBody: { original: true },
    });

    await expect(
      store.save({
        tenantId: "tenant-1",
        idempotencyKey: "unique-key",
        action: "CONFIRM_TASK_STEP",
        responseBody: { duplicate: true },
      }),
    ).rejects.toThrow("Unique constraint failed");
  });
});

describe("PrismaIdempotencyStore", () => {
  it("utiliza el TransactionClient provisto para find y save", async () => {
    const mockTx = {
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue({
          id: "rec-1",
          tenantId: "tenant-1",
          idempotencyKey: "key-tx",
          action: "CONFIRM_STEP",
          requestHash: null,
          responseStatus: 200,
          responseBody: { done: true },
          occurredAt: new Date(),
          createdAt: new Date(),
        }),
        create: vi.fn().mockResolvedValue({
          id: "rec-2",
          tenantId: "tenant-1",
          idempotencyKey: "key-create",
          action: "CONFIRM_STEP",
          requestHash: null,
          responseStatus: 200,
          responseBody: { created: true },
          occurredAt: null,
          createdAt: new Date(),
        }),
      },
    };

    const store = new PrismaIdempotencyStore();

    const found = await store.find("tenant-1", "key-tx", mockTx as never);
    expect(mockTx.idempotencyRecord.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_idempotencyKey: {
          tenantId: "tenant-1",
          idempotencyKey: "key-tx",
        },
      },
    });
    expect(found?.id).toBe("rec-1");

    const saved = await store.save(
      {
        tenantId: "tenant-1",
        idempotencyKey: "key-create",
        action: "CONFIRM_STEP",
        responseBody: { created: true },
      },
      mockTx as never,
    );
    expect(mockTx.idempotencyRecord.create).toHaveBeenCalled();
    expect(saved.id).toBe("rec-2");
  });
});
