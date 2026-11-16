// apps/api/src/routes/__tests__/locations-topology-routes.test.ts
// Tests de integración para rutas HTTP de Topología Física y Layout (F9.2) vía Fastify inject.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";

const mockPrisma = vi.hoisted(() => ({
  tenant: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  warehouse: {
    findFirst: vi.fn(),
  },
  location: {
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@wms/db", () => ({
  prisma: mockPrisma,
  getActiveTenantStore: () => undefined,
  withTenantContext: async (
    _client: unknown,
    _tenantId: string,
    fn: (tx: typeof mockPrisma) => Promise<unknown>,
  ) => fn(mockPrisma),
}));

import { createJwtToken } from "../../plugins/auth.js";
import { buildServer } from "../../server.js";
import { InMemoryTopologyRepository } from "../../adapters/in-memory-topology-repository.js";

const JWT_SECRET = "test-topology-routes-secret-key-123";

describe("Rutas HTTP de Topología Física y Layout (F9.2)", () => {
  const originalEnv = { ...process.env };
  let app: FastifyInstance;
  let topologyRepo: InMemoryTopologyRepository;

  const tenantId = "tenant-topo-test";
  const warehouseId = "wh-demo-01";
  let supervisorToken: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env["JWT_SECRET"] = JWT_SECRET;
    vi.clearAllMocks();

    mockPrisma.tenant.findUnique.mockResolvedValue({ id: tenantId, apiKey: "api-key" });
    mockPrisma.tenant.findFirst.mockResolvedValue({ id: tenantId, apiKey: "api-key" });
    mockPrisma.user.findUnique.mockImplementation(async () => ({
      id: "u-sup",
      tenantId,
      clerkId: "clerk-supervisor",
      role: "SUPERVISOR",
      email: "sup@demo.com",
      isActive: true,
    }));
    mockPrisma.warehouse.findFirst.mockResolvedValue({
      id: warehouseId,
      tenantId,
      name: "Almacén Central",
    });

    topologyRepo = new InMemoryTopologyRepository();

    app = await buildServer({
      topologyRepository: topologyRepo,
      enableLogger: false,
    });

    supervisorToken = createJwtToken({
      clerkId: "clerk-supervisor",
      tenantId,
      role: "SUPERVISOR",
    });
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await app.close();
  });

  describe("POST /api/v1/locations (Alta individual estructurada)", () => {
    it("crea una ubicación RACK normalizando el código con zero-padding", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/locations",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
        payload: {
          warehouseId,
          code: "a-1-1",
          type: "STORAGE",
          storageType: "RACK",
          zone: "MAIN",
          aisle: "A",
          rack: "1",
          level: "1",
          position: "1",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.code).toBe("A-01-01");
      expect(json.data.storageType).toBe("RACK");
      expect(json.data.status).toBe("ACTIVE");
    });

    it("rechaza FLOOR con nivel > 1 con 422 INVALID_STORAGE_TOPOLOGY", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/locations",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
        payload: {
          warehouseId,
          type: "STORAGE",
          storageType: "FLOOR",
          zone: "MAIN",
          rack: "BAHIA_01",
          level: "02",
          position: "01",
        },
      });

      expect(res.statusCode).toBe(422);
      const json = res.json();
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("INVALID_STORAGE_TOPOLOGY");
    });

    it("rechaza RACK sin pasillo con 422 INVALID_STORAGE_TOPOLOGY", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/locations",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
        payload: {
          warehouseId,
          type: "STORAGE",
          storageType: "RACK",
          zone: "MAIN",
          rack: "01",
          level: "01",
          position: "01",
        },
      });

      expect(res.statusCode).toBe(422);
      const json = res.json();
      expect(json.error.code).toBe("INVALID_STORAGE_TOPOLOGY");
    });
  });

  describe("POST /api/v1/locations/generate-block", () => {
    it("devuelve preview en dryRun: true sin escribir en el repositorio", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/locations/generate-block",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
        payload: {
          warehouseId,
          type: "STORAGE",
          storageType: "RACK",
          zone: "MAIN",
          aisle: "A",
          rackStart: 1,
          rackEnd: 2,
          levelStart: 1,
          levelEnd: 2,
          positionsPerLevel: 3,
          dryRun: true,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.dryRun).toBe(true);
      expect(json.data.totalGenerated).toBe(12);
      expect(json.data.collisions).toEqual([]);
      expect(json.data.creatableCount).toBe(12);

      // No se persiste nada
      const summary = await topologyRepo.getWarehouseLayoutSummary(tenantId, warehouseId);
      expect(summary.totalLocations).toBe(0);
    });

    it("crea las ubicaciones y devuelve batchId en dryRun: false", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/locations/generate-block",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
        payload: {
          warehouseId,
          type: "STORAGE",
          storageType: "RACK",
          zone: "MAIN",
          aisle: "A",
          rackStart: 1,
          rackEnd: 1,
          levelStart: 1,
          levelEnd: 2,
          positionsPerLevel: 2,
          dryRun: false,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.dryRun).toBe(false);
      expect(json.data.batchId).toBeTruthy();
      expect(json.data.createdCount).toBe(4);

      // Verificamos que se persistan en el repositorio
      const summary = await topologyRepo.getWarehouseLayoutSummary(tenantId, warehouseId);
      expect(summary.totalLocations).toBe(4);
    });
  });

  describe("DELETE /api/v1/locations/batches/:batchId (Rollback)", () => {
    it("elimina un lote vacío exitosamente", async () => {
      // Primero generar un lote
      const genRes = await app.inject({
        method: "POST",
        url: "/api/v1/locations/generate-block",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
        payload: {
          warehouseId,
          type: "STORAGE",
          storageType: "RACK",
          zone: "MAIN",
          aisle: "B",
          rackStart: 1,
          rackEnd: 1,
          levelStart: 1,
          levelEnd: 1,
          positionsPerLevel: 2,
          dryRun: false,
        },
      });

      const batchId = genRes.json().data.batchId;

      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/locations/batches/${batchId}`,
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
      });

      expect(delRes.statusCode).toBe(200);
      const json = delRes.json();
      expect(json.success).toBe(true);
      expect(json.data.deletedCount).toBe(2);
    });

    it("rechaza eliminar si el lote tiene stock activo (409 LOCATION_BATCH_IN_USE)", async () => {
      // Generar lote
      const genRes = await app.inject({
        method: "POST",
        url: "/api/v1/locations/generate-block",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
        payload: {
          warehouseId,
          type: "STORAGE",
          storageType: "RACK",
          zone: "MAIN",
          aisle: "C",
          rackStart: 1,
          rackEnd: 1,
          levelStart: 1,
          levelEnd: 1,
          positionsPerLevel: 2,
          dryRun: false,
        },
      });

      const genData = genRes.json().data;
      const batchId = genData.batchId;
      const locId = genData.locations[0].id;

      // Sembrar stock
      topologyRepo.seedBalances([
        {
          tenantId,
          warehouseId,
          locationId: locId,
          productId: "prod-x",
          onHandQty: 5,
          allocatedQty: 0,
        },
      ]);

      const delRes = await app.inject({
        method: "DELETE",
        url: `/api/v1/locations/batches/${batchId}`,
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
      });

      expect(delRes.statusCode).toBe(409);
      expect(delRes.json().error.code).toBe("LOCATION_BATCH_IN_USE");
    });
  });

  describe("Endpoints de Layout", () => {
    it("GET /api/v1/locations/layout/:warehouseId devuelve el árbol macro agregado", async () => {
      // Sembrar ubicaciones y saldos
      await topologyRepo.createLocationBlock(tenantId, [
        {
          warehouseId,
          code: "01-01-01-01",
          type: "STORAGE",
          storageType: "RACK",
          status: "ACTIVE",
          zone: "MAIN",
          aisle: "01",
          rack: "01",
          level: "01",
          position: "01",
        },
        {
          warehouseId,
          code: "01-01-01-02",
          type: "STORAGE",
          storageType: "RACK",
          status: "BLOCKED",
          zone: "MAIN",
          aisle: "01",
          rack: "01",
          level: "01",
          position: "02",
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/locations/layout/${warehouseId}`,
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.totalLocations).toBe(2);
      expect(json.data.activeLocations).toBe(1);
      expect(json.data.blockedLocations).toBe(1);
      expect(json.data.zones.length).toBe(1);
      expect(json.data.zones[0].aisles.length).toBe(1);
      expect(json.data.zones[0].aisles[0].aisle).toBe("01");
    });

    it("GET /api/v1/locations/layout/:warehouseId/aisles/:aisle devuelve la matriz detallada", async () => {
      await topologyRepo.createLocationBlock(tenantId, [
        {
          warehouseId,
          code: "A-01-01-01",
          type: "STORAGE",
          storageType: "RACK",
          status: "ACTIVE",
          zone: "MAIN",
          aisle: "A",
          rack: "01",
          level: "01",
          position: "01",
        },
      ]);

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/locations/layout/${warehouseId}/aisles/A`,
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.aisle).toBe("A");
      expect(json.data.racks.length).toBe(1);
      expect(json.data.racks[0].levels.length).toBe(1);
      expect(json.data.racks[0].levels[0].positions[0].code).toBe("A-01-01-01");
    });
  });

  describe("PATCH /api/v1/locations/:id", () => {
    it("actualiza el estado de una ubicación a BLOCKED", async () => {
      const created = await topologyRepo.createLocation(tenantId, {
        warehouseId,
        code: "LOC-TEST-01",
        type: "STORAGE",
        storageType: "RACK",
        status: "ACTIVE",
        zone: "MAIN",
        aisle: "A",
        rack: "01",
        level: "01",
        position: "01",
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/locations/${created.id}`,
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
        payload: {
          status: "BLOCKED",
          description: "Mantenimiento estantería dañada",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("BLOCKED");
      expect(json.data.isActive).toBe(false);
      expect(json.data.description).toBe("Mantenimiento estantería dañada");
    });
  });
});
