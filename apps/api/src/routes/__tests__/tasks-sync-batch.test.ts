// apps/api/src/routes/__tests__/tasks-sync-batch.test.ts
// Tests de integración HTTP (Fastify inject) para:
// 1. POST /api/v1/tasks/sync-batch (F6.1)
// 2. POST /api/v1/tasks/:id/steps/:stepId/confirm con Idempotency-Key
// Verifica autenticación JWT, orden FIFO, idempotencia ALREADY_APPLIED, conflictos y aislamiento multi-tenant.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const mockPrisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn(), findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
  warehouseTask: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  taskStep: {
    update: vi.fn(),
    findMany: vi.fn(),
  },
  salesOrder: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  location: {
    findFirst: vi.fn(),
  },
  inventoryBalance: {
    updateMany: vi.fn(),
  },
  orderLine: {
    updateMany: vi.fn(),
  },
  idempotencyRecord: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock("@wms/db", () => ({ prisma: mockPrisma }));

const mockMoveStock = vi.fn();
vi.mock("../../use-cases/inventory/move-stock.js", () => ({
  moveStock: (...args: unknown[]) => mockMoveStock(...args),
}));

import { authPlugin, createJwtToken } from "../../plugins/auth.js";
import { errorHandler } from "../../plugins/error-handler.js";
import { taskRoutes } from "../tasks.js";
import { InMemoryIdempotencyStore } from "../../adapters/in-memory-idempotency-store.js";
import * as syncModule from "../../use-cases/tasks/sync-task-batch.js";

const JWT_SECRET = "test-sync-batch-secret";

describe("POST /api/v1/tasks/sync-batch y Idempotency-Key en Tasks", () => {
  const originalEnv = { ...process.env };
  let app: FastifyInstance;
  let sharedIdempotencyStore: InMemoryIdempotencyStore;

  async function buildTestApp(): Promise<FastifyInstance> {
    const fastify = Fastify();
    await fastify.register(errorHandler);
    await fastify.register(authPlugin);
    await fastify.register(taskRoutes, { prefix: "/api/v1/tasks" });
    await fastify.ready();
    return fastify;
  }

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env["JWT_SECRET"] = JWT_SECRET;
    vi.clearAllMocks();

    sharedIdempotencyStore = new InMemoryIdempotencyStore();

    mockPrisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u-op-1",
      clerkId: "clerk-operator",
      tenantId: "tenant-1",
      role: "OPERATOR",
      isActive: true,
    });
    mockPrisma.idempotencyRecord.findUnique.mockResolvedValue(null);
    mockPrisma.idempotencyRecord.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: "rec-test-1",
        createdAt: new Date(),
        occurredAt: null,
        requestHash: null,
        responseStatus: 200,
        ...args.data,
      }),
    );

    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    process.env = originalEnv;
  });

  function makeOperatorAuthHeader(tenantId = "tenant-1") {
    const token = createJwtToken(
      {
        sub: "clerk-operator",
        tenantId,
        role: "OPERATOR",
      },
      JWT_SECRET,
    );
    return `Bearer ${token}`;
  }

  // ── 1. POST /api/v1/tasks/sync-batch ───────────────────────────────────────
  describe("POST /api/v1/tasks/sync-batch", () => {
    it("procesa un lote de mutaciones y responde 200 con resultados detallados", async () => {
      // Mock de confirmTaskStep ejecutado a través del use-case real o espía
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        id: "task-100",
        tenantId: "tenant-1",
        type: "PUTAWAY",
        status: "IN_PROGRESS",
        steps: [
          {
            id: "step-100",
            taskId: "task-100",
            locationId: "loc-storage-1",
            productId: "prod-1",
            expectedQty: 2,
            scannedQty: 0,
            status: "PENDING",
            location: { code: "LOC-A1", warehouseId: "wh-1" },
            product: { sku: "SKU-PROD-1", barcode: "BAR-100" },
          },
        ],
      });

      mockPrisma.location.findFirst.mockResolvedValue({
        id: "loc-receiving-1",
        code: "REC-01",
        type: "RECEIVING",
      });
      mockPrisma.taskStep.update.mockResolvedValue({});
      mockPrisma.taskStep.findMany.mockResolvedValue([
        { id: "step-100", status: "COMPLETED" },
      ]);
      mockPrisma.warehouseTask.update.mockResolvedValue({});

      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/sync-batch",
        headers: {
          authorization: makeOperatorAuthHeader(),
          "content-type": "application/json",
        },
        payload: {
          items: [
            {
              idempotencyKey: "client-mut-001",
              action: "CONFIRM_STEP",
              occurredAt: "2026-11-10T02:00:00.000Z",
              payload: {
                taskId: "task-100",
                stepId: "step-100",
                scannedCode: "BAR-100",
                quantity: 2,
              },
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.total).toBe(1);
      expect(body.data.appliedCount).toBe(1);
      expect(body.data.items[0].idempotencyKey).toBe("client-mut-001");
      expect(body.data.items[0].status).toBe("APPLIED");
      expect(body.data.items[0].receivedAt).toBeDefined();
    });

    it("rechaza peticiones con lote vacío devolviendo 400/422", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/sync-batch",
        headers: {
          authorization: makeOperatorAuthHeader(),
          "content-type": "application/json",
        },
        payload: {
          items: [],
        },
      });

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ── 2. POST /api/v1/tasks/:id/steps/:stepId/confirm con Idempotency-Key ────
  describe("POST /api/v1/tasks/:id/steps/:stepId/confirm con cabecera Idempotency-Key", () => {
    it("devuelve ALREADY_APPLIED en reintentos con la misma clave", async () => {
      // Espiar syncModule si fuera necesario o usar directamente confirmTaskStep
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        id: "task-101",
        tenantId: "tenant-1",
        type: "PUTAWAY",
        status: "IN_PROGRESS",
        steps: [
          {
            id: "step-101",
            taskId: "task-101",
            locationId: "loc-storage-1",
            productId: "prod-1",
            expectedQty: 1,
            scannedQty: 0,
            status: "PENDING",
            location: { code: "LOC-A1", warehouseId: "wh-1" },
            product: { sku: "SKU-PROD-1", barcode: "BAR-101" },
          },
        ],
      });

      mockPrisma.location.findFirst.mockResolvedValue({
        id: "loc-receiving-1",
        code: "REC-01",
        type: "RECEIVING",
      });
      mockPrisma.taskStep.update.mockResolvedValue({});
      mockPrisma.taskStep.findMany.mockResolvedValue([
        { id: "step-101", status: "COMPLETED" },
      ]);
      mockPrisma.warehouseTask.update.mockResolvedValue({});

      // Invocación 1: con cabecera idempotency-key
      const res1 = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/task-101/steps/step-101/confirm",
        headers: {
          authorization: makeOperatorAuthHeader(),
          "idempotency-key": "step-http-idemp-001",
          "content-type": "application/json",
        },
        payload: {
          scannedCode: "BAR-101",
          quantity: 1,
        },
      });

      expect(res1.statusCode).toBe(200);
      const body1 = res1.json();
      expect(body1.success).toBe(true);
      expect(body1.data.stepStatus).toBe("COMPLETED");

      // Simulamos que el registro quedó persistido en la BD
      mockPrisma.idempotencyRecord.findUnique.mockResolvedValueOnce({
        id: "rec-test-1",
        tenantId: "tenant-1",
        idempotencyKey: "step-http-idemp-001",
        action: "CONFIRM_TASK_STEP",
        requestHash: null,
        responseStatus: 200,
        responseBody: body1.data,
        occurredAt: null,
        createdAt: new Date(),
      });

      // Invocación 2 (reintento idéntico)
      const res2 = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/task-101/steps/step-101/confirm",
        headers: {
          authorization: makeOperatorAuthHeader(),
          "idempotency-key": "step-http-idemp-001",
          "content-type": "application/json",
        },
        payload: {
          scannedCode: "BAR-101",
          quantity: 1,
        },
      });

      expect(res2.statusCode).toBe(200);
      const body2 = res2.json();
      expect(body2.success).toBe(true);
      expect(body2.data.idempotencyStatus).toBe("ALREADY_APPLIED");
      expect(body2.data.stepStatus).toBe("COMPLETED");

      // moveStock solo se llamó en la primera invocación
      expect(mockMoveStock).toHaveBeenCalledTimes(1);
    });

    it("reporta CONFLICT en sync-batch cuando una tarea ya fue completada concurrentemente", async () => {
      mockPrisma.warehouseTask.findFirst.mockResolvedValue({
        id: "task-completed",
        tenantId: "tenant-1",
        type: "PUTAWAY",
        status: "COMPLETED",
        steps: [
          {
            id: "step-c1",
            taskId: "task-completed",
            locationId: "loc-storage-1",
            productId: "prod-1",
            expectedQty: 1,
            scannedQty: 1,
            status: "COMPLETED",
            location: { code: "LOC-A1", warehouseId: "wh-1" },
            product: { sku: "SKU-PROD-1", barcode: "BAR-C1" },
          },
        ],
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/sync-batch",
        headers: {
          authorization: makeOperatorAuthHeader(),
          "content-type": "application/json",
        },
        payload: {
          items: [
            {
              idempotencyKey: "key-concurrent-conflict",
              action: "CONFIRM_STEP",
              occurredAt: "2026-11-10T02:00:00.000Z",
              payload: {
                taskId: "task-completed",
                stepId: "step-c1",
                scannedCode: "BAR-C1",
                quantity: 1,
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.conflictCount).toBe(1);
      expect(body.data.items[0].status).toBe("CONFLICT");
      expect(body.data.items[0].error.code).toBe("VALIDATION_ERROR");
      expect(body.data.items[0].error.message).toContain("already COMPLETED");
    });

    it("aisla tenants en sync-batch rechazando acceso cruzado a tareas de otro tenant", async () => {
      // Simular que el operario pertenece a tenant-attacker
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: "tenant-attacker" });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "u-attacker",
        clerkId: "clerk-operator",
        tenantId: "tenant-attacker",
        role: "OPERATOR",
        isActive: true,
      });

      // Simular que la tarea no pertenece al tenant atacante (findFirst devuelve null por filtro { tenantId })
      mockPrisma.warehouseTask.findFirst.mockResolvedValue(null);

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/tasks/sync-batch",
        headers: {
          authorization: makeOperatorAuthHeader("tenant-attacker"),
          "content-type": "application/json",
        },
        payload: {
          items: [
            {
              idempotencyKey: "key-cross-tenant-try",
              action: "CONFIRM_STEP",
              occurredAt: "2026-11-10T02:00:00.000Z",
              payload: {
                taskId: "task-victim",
                stepId: "step-victim",
                scannedCode: "BAR-VICTIM",
                quantity: 1,
              },
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      // Al no encontrar la tarea en el tenant atacante, se rechaza como TASK_NOT_FOUND (REJECTED)
      expect(body.data.items[0].status).toBe("REJECTED");
      expect(body.data.items[0].error.code).toBe("TASK_NOT_FOUND");
    });
  });
});
