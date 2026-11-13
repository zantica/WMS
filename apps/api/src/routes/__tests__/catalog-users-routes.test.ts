// apps/api/src/routes/__tests__/catalog-users-routes.test.ts
// Tests de integración para rutas de Categories, Products y Users (F9.1) vía Fastify inject.

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
import { InMemoryCatalogRepository } from "../../adapters/in-memory-catalog-repository.js";
import { InMemoryUserRepository } from "../../adapters/in-memory-user-repository.js";

const JWT_SECRET = "test-catalog-routes-secret-key-123";

describe("Rutas HTTP de Catálogo, Categorías y Usuarios (F9.1)", () => {
  const originalEnv = { ...process.env };
  let app: FastifyInstance;
  let catalogRepo: InMemoryCatalogRepository;
  let userRepo: InMemoryUserRepository;

  const tenantId = "tenant-test-routes";
  let adminToken: string;
  let supervisorToken: string;
  let operatorToken: string;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env["JWT_SECRET"] = JWT_SECRET;
    vi.clearAllMocks();

    catalogRepo = new InMemoryCatalogRepository();
    userRepo = new InMemoryUserRepository();

    mockPrisma.tenant.findUnique.mockResolvedValue({ id: tenantId });
    mockPrisma.user.findUnique.mockImplementation(
      async ({ where }: { where: { clerkId: string } }) => {
        if (where.clerkId === "clerk-admin") {
          return {
            id: "user-admin-id",
            tenantId,
            clerkId: "clerk-admin",
            role: "ADMIN",
            isActive: true,
          };
        }
        if (where.clerkId === "clerk-supervisor") {
          return {
            id: "user-sup-id",
            tenantId,
            clerkId: "clerk-supervisor",
            role: "SUPERVISOR",
            isActive: true,
          };
        }
        if (where.clerkId === "clerk-operator") {
          return {
            id: "user-op-id",
            tenantId,
            clerkId: "clerk-operator",
            role: "OPERATOR",
            isActive: true,
          };
        }
        return null;
      },
    );

    adminToken = createJwtToken({
      clerkId: "clerk-admin",
      tenantId,
      role: "ADMIN",
    });
    supervisorToken = createJwtToken({
      clerkId: "clerk-supervisor",
      tenantId,
      role: "SUPERVISOR",
    });
    operatorToken = createJwtToken({
      clerkId: "clerk-operator",
      tenantId,
      role: "OPERATOR",
    });

    app = await buildServer({
      catalogRepository: catalogRepo,
      userRepository: userRepo,
      enableLogger: false,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...originalEnv };
  });

  // ── 1. Categorías ──────────────────────────────────────────
  describe("Rutas de Categorías (/api/v1/categories)", () => {
    it("POST /api/v1/categories — crea categoría con rol ADMIN", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/categories",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          code: "calzado",
          name: "Calzado Deportivo",
          description: "Zapatos y zapatillas",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.code).toBe("CALZADO");
      expect(json.data.name).toBe("Calzado Deportivo");
    });

    it("POST /api/v1/categories — deniega a rol OPERATOR (403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/categories",
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
        payload: {
          code: "ROPA",
          name: "Ropa",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("GET /api/v1/categories — lista categorías activas", async () => {
      await catalogRepo.createCategory(tenantId, {
        code: "CAT-A",
        name: "Categoría A",
      });
      const catB = await catalogRepo.createCategory(tenantId, {
        code: "CAT-B",
        name: "Categoría B",
      });
      await catalogRepo.updateCategory(tenantId, catB.id, { isActive: false });

      // Sin includeInactive
      const resActive = await app.inject({
        method: "GET",
        url: "/api/v1/categories",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
      });
      expect(resActive.statusCode).toBe(200);
      expect(resActive.json().data).toHaveLength(1);
      expect(resActive.json().data[0].code).toBe("CAT-A");

      // Con includeInactive = true
      const resAll = await app.inject({
        method: "GET",
        url: "/api/v1/categories?includeInactive=true",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
      });
      expect(resAll.statusCode).toBe(200);
      expect(resAll.json().data).toHaveLength(2);
    });

    it("PATCH /api/v1/categories/:id — actualiza una categoría existente", async () => {
      const cat = await catalogRepo.createCategory(tenantId, {
        code: "OLD",
        name: "Old Name",
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/categories/${cat.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: "New Name",
          isActive: false,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.name).toBe("New Name");
      expect(res.json().data.isActive).toBe(false);
    });
  });

  // ── 2. Productos ───────────────────────────────────────────
  describe("Rutas de Productos (/api/v1/products)", () => {
    it("POST /api/v1/products — crea un producto con categoría", async () => {
      const cat = await catalogRepo.createCategory(tenantId, {
        code: "TEXTIL",
        name: "Textiles",
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/v1/products",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          sku: "POLO-BLU-L",
          name: "Polo Azul Talla L",
          barcode: "7701234567890",
          categoryId: cat.id,
          weightGrams: 220,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.sku).toBe("POLO-BLU-L");
      expect(json.data.categoryCode).toBe("TEXTIL");
      expect(json.data.weightGrams).toBe(220);
    });

    it("GET /api/v1/products — devuelve lista con paginación y filtros", async () => {
      const cat = await catalogRepo.createCategory(tenantId, {
        code: "ELEC",
        name: "Electrónica",
      });

      await catalogRepo.createProduct(tenantId, {
        sku: "PROD-1",
        name: "Teclado Mecánico",
        categoryId: cat.id,
      });
      await catalogRepo.createProduct(tenantId, {
        sku: "PROD-2",
        name: "Monitor 27 pulg",
        categoryId: cat.id,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/products?q=Teclado&page=1&limit=10",
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].sku).toBe("PROD-1");
      expect(json.pagination).toBeDefined();
      expect(json.pagination.total).toBe(1);
      expect(json.pagination.page).toBe(1);
    });

    it("GET /api/v1/products/:id — obtiene detalle de producto", async () => {
      const prod = await catalogRepo.createProduct(tenantId, {
        sku: "DETALLE-01",
        name: "Detalle Producto",
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/v1/products/${prod.id}`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.sku).toBe("DETALLE-01");
    });

    it("GET /api/v1/products/:id — devuelve 404 si no existe", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/v1/products/no_existe",
        headers: {
          authorization: `Bearer ${operatorToken}`,
        },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("PRODUCT_NOT_FOUND");
    });

    it("PATCH /api/v1/products/:id — actualiza producto parcialmente", async () => {
      const prod = await catalogRepo.createProduct(tenantId, {
        sku: "UPDATEME",
        name: "Nombre Viejo",
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/products/${prod.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: "Nombre Nuevo",
          weightGrams: 340,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.name).toBe("Nombre Nuevo");
      expect(res.json().data.weightGrams).toBe(340);
    });
  });

  // ── 3. Usuarios ────────────────────────────────────────────
  describe("Rutas de Usuarios (/api/v1/users)", () => {
    it("POST /api/v1/users — crea un usuario con rol (solo ADMIN)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: "María Operadora",
          email: "maria.op@test.com",
          role: "OPERATOR",
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data.name).toBe("María Operadora");
      expect(json.data.email).toBe("maria.op@test.com");
      expect(json.data.role).toBe("OPERATOR");
      expect(json.data.isActive).toBe(true);
    });

    it("POST /api/v1/users — deniega a SUPERVISOR (403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/v1/users",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
        payload: {
          name: "Intruso",
          email: "intruso@test.com",
          role: "OPERATOR",
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it("GET /api/v1/users — lista usuarios del inquilino (ADMIN o SUPERVISOR)", async () => {
      await userRepo.createUser(tenantId, {
        name: "User Sup",
        email: "sup@test.com",
        role: "SUPERVISOR",
      });
      await userRepo.createUser(tenantId, {
        name: "User Op",
        email: "op@test.com",
        role: "OPERATOR",
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/users?role=OPERATOR",
        headers: {
          authorization: `Bearer ${supervisorToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.data[0].email).toBe("op@test.com");
    });

    it("PATCH /api/v1/users/:id — actualiza rol de un usuario", async () => {
      const user = await userRepo.createUser(tenantId, {
        name: "Promovible",
        email: "promo@test.com",
        role: "OPERATOR",
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/v1/users/${user.id}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          role: "SUPERVISOR",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.role).toBe("SUPERVISOR");
    });

    it("PATCH /api/v1/users/:id — impide que el ADMIN actor se desactive a sí mismo (409)", async () => {
      userRepo.seedUser({
        id: "user-admin-id",
        tenantId,
        clerkId: "clerk-admin",
        name: "Admin User",
        email: "admin@test.com",
        role: "ADMIN",
        isActive: true,
      });

      const res = await app.inject({
        method: "PATCH",
        url: "/api/v1/users/user-admin-id",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          isActive: false,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });
  });
});
