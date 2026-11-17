// apps/api/src/routes/__tests__/auth-routes.test.ts
// Tests HTTP de rutas /api/v1/auth/*, cookie HttpOnly wms_session, SUPERUSER y alta de usuarios con contraseña.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { SESSION_COOKIE_NAME } from "@wms/shared-types";

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

import { InMemoryCatalogRepository } from "../../adapters/in-memory-catalog-repository.js";
import { InMemoryUserRepository } from "../../adapters/in-memory-user-repository.js";
import type { PasswordHasherPort } from "../../ports/password-hasher.js";
import { buildServer } from "../../server.js";

class FastTestPasswordHasher implements PasswordHasherPort {
  async hash(plainText: string): Promise<string> {
    return `hash:${plainText}`;
  }
  async verify(plainText: string, passwordHash: string): Promise<boolean> {
    return passwordHash === `hash:${plainText}`;
  }
}

const JWT_SECRET = "test-f10-auth-routes-secret";

describe("Rutas HTTP de Sesión JWT, Cookie HttpOnly y Superuser (F10.1)", () => {
  const originalEnv = { ...process.env };
  let app: FastifyInstance;
  let userRepo: InMemoryUserRepository;
  let catalogRepo: InMemoryCatalogRepository;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env["JWT_SECRET"] = JWT_SECRET;
    vi.clearAllMocks();

    userRepo = new InMemoryUserRepository();
    userRepo.seedTenant("demo-tenant", true);
    userRepo.seedTenant("tenant-two");
    catalogRepo = new InMemoryCatalogRepository();

    mockPrisma.tenant.findUnique.mockImplementation(
      async ({ where }: { where: { id?: string; apiKey?: string } }) => {
        if (where.id === "demo-tenant" || where.id === "tenant-two") {
          return { id: where.id };
        }
        return null;
      },
    );

    mockPrisma.user.findUnique.mockImplementation(
      async ({ where }: { where: { clerkId?: string; id?: string } }) => {
        if (where.clerkId) {
          const found = await userRepo.findUserByClerkId(where.clerkId);
          return found;
        }
        return null;
      },
    );

    app = await buildServer({
      userRepository: userRepo,
      catalogRepository: catalogRepo,
      passwordHasher: new FastTestPasswordHasher(),
      jwtSecret: JWT_SECRET,
      jwtExpiresInSeconds: 3600,
      enableLogger: false,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    process.env = { ...originalEnv };
  });

  it("flujo completo: bootstrap-status -> bootstrap-superuser -> cookie HttpOnly wms_session -> /me -> logout", async () => {
    // 1. Estado inicial sin superuser
    const statusRes1 = await app.inject({
      method: "GET",
      url: "/api/v1/auth/bootstrap-status",
    });
    expect(statusRes1.statusCode).toBe(200);
    expect(statusRes1.json().data).toEqual({
      hasSuperuser: false,
      requiresSetupSecret: false,
      defaultSuperuserEmail: "admin@navelo.dev",
    });

    // 2. Bootstrap crea admin@navelo.dev y setea cookie HttpOnly
    const bootRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-superuser",
      payload: {
        name: "Navelo Superuser",
        password: "Superuser!2026",
      },
    });
    expect(bootRes.statusCode).toBe(201);
    const bootBody = bootRes.json();
    expect(bootBody.success).toBe(true);
    expect(bootBody.data.user.email).toBe("admin@navelo.dev");
    expect(bootBody.data.user.role).toBe("SUPERUSER");
    expect(bootBody.data.token).toBeDefined();

    const setCookieHeader = bootRes.headers["set-cookie"] as string;
    expect(setCookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookieHeader).toContain("HttpOnly");
    expect(setCookieHeader).toContain("SameSite=Lax");

    const cookiePair = setCookieHeader.split(";")[0]!;

    // 3. /me autentica mediante la cookie HttpOnly sin enviar Authorization header
    const meWithCookie = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: cookiePair,
      },
    });
    expect(meWithCookie.statusCode).toBe(200);
    expect(meWithCookie.json().data).toMatchObject({
      email: "admin@navelo.dev",
      role: "SUPERUSER",
      tenantId: "demo-tenant",
    });

    // 4. SUPERUSER puede cambiar de contexto de tenant con x-tenant-id
    const meSwitched = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: {
        cookie: cookiePair,
        "x-tenant-id": "tenant-two",
      },
    });
    expect(meSwitched.statusCode).toBe(200);
    expect(meSwitched.json().data.tenantId).toBe("tenant-two");

    // 5. Status actualizado
    const statusRes2 = await app.inject({
      method: "GET",
      url: "/api/v1/auth/bootstrap-status",
    });
    expect(statusRes2.json().data.hasSuperuser).toBe(true);

    // 6. Logout limpia la cookie
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
    });
    expect(logoutRes.statusCode).toBe(200);
    expect(logoutRes.headers["set-cookie"]).toContain("Max-Age=0");
  });

  it("POST /api/v1/users crea usuario con contraseña y luego ese usuario puede hacer POST /api/v1/auth/login", async () => {
    const bootRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/bootstrap-superuser",
      payload: {
        name: "Root",
        password: "Superuser!2026",
      },
    });
    const superToken = bootRes.json().data.token as string;

    // SUPERUSER crea un ADMIN con contraseña en demo-tenant
    const createRes = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: {
        authorization: `Bearer ${superToken}`,
      },
      payload: {
        name: "Laura Admin",
        email: "laura@demo.com",
        role: "ADMIN",
        password: "LauraPassword!2026",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const createdUser = createRes.json().data;
    expect(createdUser.role).toBe("ADMIN");
    expect(createdUser.passwordHash).toBeUndefined();

    // Laura hace login por email + password
    const loginRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: {
        email: "laura@demo.com",
        password: "LauraPassword!2026",
      },
    });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.json().data.user.email).toBe("laura@demo.com");
    expect(loginRes.json().data.user.role).toBe("ADMIN");

    const lauraToken = loginRes.json().data.token as string;

    // Laura (ADMIN) NO puede crear un SUPERUSER -> 403 FORBIDDEN
    const forbiddenCreate = await app.inject({
      method: "POST",
      url: "/api/v1/users",
      headers: {
        authorization: `Bearer ${lauraToken}`,
      },
      payload: {
        name: "Fake Root",
        email: "fakeroot@demo.com",
        role: "SUPERUSER",
        password: "Password!123",
      },
    });
    expect(forbiddenCreate.statusCode).toBe(403);

    // Laura (ADMIN) tampoco puede modificar al SUPERUSER -> 403 FORBIDDEN
    const superId = bootRes.json().data.user.id as string;
    const forbiddenPatch = await app.inject({
      method: "PATCH",
      url: `/api/v1/users/${superId}`,
      headers: {
        authorization: `Bearer ${lauraToken}`,
      },
      payload: {
        isActive: false,
      },
    });
    expect(forbiddenPatch.statusCode).toBe(403);
  });

  it("GET /api/v1/auth/me rechaza peticiones sin autenticación (401)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
    });
    expect(res.statusCode).toBe(401);
  });

  it("buildServer({ jwtSecret }) usa el secreto inyectado tanto en authRoutes como en authPlugin aunque difiera de process.env.JWT_SECRET", async () => {
    process.env["JWT_SECRET"] = "env-secret-different";
    const isolatedApp = await buildServer({
      userRepository: userRepo,
      catalogRepository: catalogRepo,
      passwordHasher: new FastTestPasswordHasher(),
      jwtSecret: "injected-isolated-secret",
      jwtExpiresInSeconds: 3600,
      enableLogger: false,
    });
    await isolatedApp.ready();

    try {
      const bootRes = await isolatedApp.inject({
        method: "POST",
        url: "/api/v1/auth/bootstrap-superuser",
        payload: {
          name: "Isolated Root",
          password: "Superuser!2026",
        },
      });
      expect(bootRes.statusCode).toBe(201);
      const token = bootRes.json().data.token as string;

      const meRes = await isolatedApp.inject({
        method: "GET",
        url: "/api/v1/auth/me",
        headers: {
          authorization: `Bearer ${token}`,
        },
      });
      expect(meRes.statusCode).toBe(200);
      expect(meRes.json().data.email).toBe("admin@navelo.dev");
    } finally {
      await isolatedApp.close();
    }
  });
});
