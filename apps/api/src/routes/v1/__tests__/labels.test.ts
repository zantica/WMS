// apps/api/src/routes/v1/__tests__/labels.test.ts
// Tests de integración para rutas HTTP de generación de etiquetas logísticas (F5.2) vía Fastify inject.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ApiResponse, LabelBatchResponseDTO } from "@wms/shared-types";

const mockPrisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn(), findFirst: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
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

import { InMemoryCatalogRepository } from "../../../adapters/in-memory-catalog-repository.js";
import { InMemoryLocationRepository } from "../../../adapters/in-memory-location-repository.js";
import { SvgLabelRendererAdapter } from "../../../adapters/svg-label-renderer.js";
import { createJwtToken } from "../../../plugins/auth.js";
import { buildServer } from "../../../server.js";

const JWT_SECRET = "test-label-routes-secret-key-123";

describe("Rutas HTTP de Etiquetas (POST /api/v1/labels/locations y /products)", () => {
  const originalEnv = { ...process.env };
  let app: FastifyInstance;
  let catalogRepo: InMemoryCatalogRepository;
  let locationRepo: InMemoryLocationRepository;

  const tenantA = "tenant_labels_a";
  const tenantB = "tenant_labels_b";
  let tokenA: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env["JWT_SECRET"] = JWT_SECRET;
    vi.clearAllMocks();

    catalogRepo = new InMemoryCatalogRepository();
    locationRepo = new InMemoryLocationRepository();

    mockPrisma.tenant.findUnique.mockResolvedValue({ id: tenantA });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-sup-id",
      tenantId: tenantA,
      clerkId: "clerk-sup",
      name: "Supervisor Labels",
      role: "SUPERVISOR",
      isActive: true,
    });

    tokenA = createJwtToken(
      {
        sub: "clerk-sup",
        tenantId: tenantA,
        role: "SUPERVISOR",
      },
      JWT_SECRET,
    );

    // Sembrar datos
    locationRepo.seed([
      {
        id: "loc-01",
        tenantId: tenantA,
        warehouseId: "wh-01",
        code: "A-01-01",
        type: "STORAGE",
        description: "Pasillo A Rack 1 Nivel 1",
        isActive: true,
      },
      {
        id: "loc-02",
        tenantId: tenantA,
        warehouseId: "wh-01",
        code: "B-02-01",
        type: "RECEIVING",
        isActive: true,
      },
      {
        id: "loc-b",
        tenantId: tenantB,
        warehouseId: "wh-02",
        code: "Z-99-99",
        type: "STORAGE",
        isActive: true,
      },
    ]);

    await catalogRepo.createProduct(tenantA, {
      sku: "PROD-ABC",
      name: "Producto Alfa",
      barcode: "8412345678901",
    });

    await catalogRepo.createProduct(tenantB, {
      sku: "PROD-BETA",
      name: "Producto de Tenant B",
    });

    app = await buildServer({
      catalogRepository: catalogRepo,
      locationRepository: locationRepo,
      labelRenderer: new SvgLabelRendererAdapter(),
      enableLogger: false,
    });
  });

  describe("POST /api/v1/labels/locations", () => {
    it("genera etiquetas QR para ubicaciones con status 200 y formato ApiResponse<LabelBatchResponseDTO>", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/labels/locations",
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          locationCodes: ["A-01-01", "B-02-01"],
          symbology: "QR",
          widthMm: 70,
          heightMm: 35,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ApiResponse<LabelBatchResponseDTO>>();
      expect(body.success).toBe(true);
      expect(body.data.count).toBe(2);
      expect(body.data.symbology).toBe("QR");
      expect(body.data.dimensions).toEqual({ widthMm: 70, heightMm: 35 });
      expect(body.data.labels[0]?.code).toBe("A-01-01");
      expect(body.data.labels[0]?.barcodePayload).toBe("A-01-01");
      expect(body.data.labels[0]?.humanReadableText).toBe("A-01-01");
      expect(body.data.labels[0]?.svg).toContain("<svg");
      expect(body.data.labels[0]?.svg).toContain('width="70mm"');
      expect(body.data.labels[0]?.svg).not.toContain("LOC:");
    });

    it("devuelve 422 VALIDATION_ERROR si el body no contiene locationIds ni locationCodes", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/labels/locations",
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          symbology: "QR",
        },
      });

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("devuelve 404 LOCATION_NOT_FOUND si el código de ubicación no existe para ese tenant", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/labels/locations",
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          locationCodes: ["Z-99-99"], // Pertenece a Tenant B
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("LOCATION_NOT_FOUND");
    });
  });

  describe("POST /api/v1/labels/products", () => {
    it("genera etiquetas CODE128 para productos con status 200", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/labels/products",
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          skus: ["PROD-ABC"],
          symbology: "CODE128",
          widthMm: 80,
          heightMm: 40,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ApiResponse<LabelBatchResponseDTO>>();
      expect(body.success).toBe(true);
      expect(body.data.count).toBe(1);
      expect(body.data.symbology).toBe("CODE128");
      expect(body.data.labels[0]?.code).toBe("PROD-ABC");
      expect(body.data.labels[0]?.barcodePayload).toBe("PROD-ABC");
      expect(body.data.labels[0]?.humanReadableText).toBe("PROD-ABC");
      expect(body.data.labels[0]?.svg).toContain("<svg");
      expect(body.data.labels[0]?.svg).toContain('width="80mm"');
      expect(body.data.labels[0]?.svg).not.toContain("SKU:");
    });

    it("utiliza el barcode limpio sin prefijo EAN: como payload cuando useBarcodeAsPayload es true", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/labels/products",
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          skus: ["PROD-ABC"],
          useBarcodeAsPayload: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<ApiResponse<LabelBatchResponseDTO>>();
      expect(body.data.labels[0]?.barcodePayload).toBe("8412345678901");
      expect(body.data.labels[0]?.humanReadableText).toBe("8412345678901");
    });

    it("devuelve 422 VALIDATION_ERROR si el body no contiene ni productIds ni skus", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/labels/products",
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {},
      });

      expect(response.statusCode).toBe(422);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("devuelve 404 PRODUCT_NOT_FOUND si el SKU es de otro tenant", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/labels/products",
        headers: {
          authorization: `Bearer ${tokenA}`,
        },
        payload: {
          skus: ["PROD-BETA"], // Pertenece a Tenant B
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("PRODUCT_NOT_FOUND");
    });
  });
});
