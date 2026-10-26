// apps/api/src/plugins/__tests__/auth.test.ts
// Tests unitarios de autenticación (F4.2):
// - Emisión y verificación de JWT HS256 (firma, expiración, claims y roles)
// - Hook global de autenticación (x-api-key, Bearer JWT, usuario inactivo, tenant mismatch)
// - Guard de autorización por rol (requireRole)

import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

const mockPrisma = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock("@wms/db", () => ({
  prisma: mockPrisma,
}));

import {
  authPlugin,
  createJwtToken,
  requireRole,
  verifyJwtToken,
} from "../auth.js";
import { errorHandler, WmsError } from "../error-handler.js";

const SECRET = "test-secret";

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(errorHandler);
  await app.register(authPlugin);
  app.get("/health", async () => ({ ok: true }));
  app.get("/whoami", async (request) => ({
    tenantId: request.tenantId,
    userId: request.userId ?? null,
    userRole: request.userRole ?? null,
  }));
  app.get(
    "/admin-only",
    { preHandler: requireRole("ADMIN") },
    async () => ({ ok: true }),
  );
  await app.ready();
  return app;
}

describe("createJwtToken / verifyJwtToken", () => {
  it("emite un token HS256 verificable con sus claims normalizados", () => {
    const token = createJwtToken(
      { sub: "user_clerk_1", tenantId: "tenant-1", role: "SUPERVISOR" },
      SECRET,
    );

    expect(token.split(".")).toHaveLength(3);
    const claims = verifyJwtToken(token, SECRET);
    expect(claims.sub).toBe("user_clerk_1");
    expect(claims.tenantId).toBe("tenant-1");
    expect(claims.role).toBe("SUPERVISOR");
    expect(claims.exp).toBeGreaterThan(claims.iat);
  });

  it("acepta el prefijo 'Bearer ' y claims alternativos (tenant_id / org_id / clerkId)", () => {
    const t1 = createJwtToken({ clerkId: "ck_1", tenant_id: "t-a" }, SECRET);
    const t2 = createJwtToken({ userId: "u_2", org_id: "t-b" }, SECRET);

    expect(verifyJwtToken(`Bearer ${t1}`, SECRET)).toMatchObject({
      sub: "ck_1",
      tenantId: "t-a",
    });
    expect(verifyJwtToken(t2, SECRET)).toMatchObject({
      sub: "u_2",
      tenantId: "t-b",
    });
  });

  it("rechaza tokens con firma alterada", () => {
    const token = createJwtToken({ sub: "u", tenantId: "t" }, SECRET);
    expect(() => verifyJwtToken(token, "otro-secreto")).toThrow(
      "Invalid JWT signature",
    );
  });

  it("rechaza tokens expirados", () => {
    const past = Math.floor(Date.now() / 1000) - 120;
    const token = createJwtToken(
      { sub: "u", tenantId: "t", iat: past - 60, exp: past },
      SECRET,
    );
    expect(() => verifyJwtToken(token, SECRET)).toThrow("JWT token has expired");
  });

  it("rechaza tokens malformados, algoritmos no soportados y roles inválidos", () => {
    expect(() => verifyJwtToken("abc.def", SECRET)).toThrow("Malformed JWT token");

    const noneHeader = Buffer.from(JSON.stringify({ alg: "none" })).toString(
      "base64url",
    );
    expect(() => verifyJwtToken(`${noneHeader}.e30.sig`, SECRET)).toThrow(
      "Unsupported JWT algorithm",
    );

    const badRole = createJwtToken(
      { sub: "u", tenantId: "t", role: "ROOT" as never },
      SECRET,
    );
    expect(() => verifyJwtToken(badRole, SECRET)).toThrow(
      "Invalid role claim in JWT",
    );
  });
});

describe("requireRole", () => {
  it("permite el acceso cuando el rol está autorizado", async () => {
    const guard = requireRole("ADMIN", "SUPERVISOR");
    await expect(guard({ userRole: "SUPERVISOR" })).resolves.toBeUndefined();
  });

  it("acepta roles agrupados en arrays", async () => {
    const guard = requireRole(["ADMIN", "OPERATOR"] as const);
    await expect(guard({ userRole: "OPERATOR" })).resolves.toBeUndefined();
  });

  it("lanza 403 cuando el rol no tiene permisos o no existe", async () => {
    const guard = requireRole("ADMIN");

    await expect(guard({ userRole: "OPERATOR" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 403,
    });
    await expect(guard({ userRole: undefined })).rejects.toBeInstanceOf(
      WmsError,
    );
  });
});

describe("authPlugin (hook global preHandler)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["JWT_SECRET"] = SECRET;
  });

  it("no exige autenticación en rutas públicas", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
  });

  it("devuelve 401 si no hay credenciales", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/whoami" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("UNAUTHORIZED");
  });

  it("autentica por x-api-key con rol ADMIN", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });
    const app = await buildTestApp();

    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { "x-api-key": "demo-api-key-12345" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      tenantId: "tenant-1",
      userId: null,
      userRole: "ADMIN",
    });
  });

  it("rechaza x-api-key inexistente", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { "x-api-key": "nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("resuelve usuario activo por clerkId y usa su tenant y rol de BD", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-db-1",
      tenantId: "tenant-1",
      role: "SUPERVISOR",
      isActive: true,
    });
    const app = await buildTestApp();
    const token = createJwtToken({ sub: "clerk_1", role: "OPERATOR" }, SECRET);

    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { clerkId: "clerk_1" },
    });
    expect(res.json()).toEqual({
      tenantId: "tenant-1",
      userId: "user-db-1",
      userRole: "SUPERVISOR",
    });
  });

  it("rechaza usuarios inactivos", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-db-1",
      tenantId: "tenant-1",
      role: "OPERATOR",
      isActive: false,
    });
    const app = await buildTestApp();
    const token = createJwtToken({ sub: "clerk_1" }, SECRET);

    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe("User account is inactive");
  });

  it("rechaza con TENANT_MISMATCH si el claim de tenant no coincide con el usuario", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-db-1",
      tenantId: "tenant-1",
      role: "ADMIN",
      isActive: true,
    });
    const app = await buildTestApp();
    const token = createJwtToken({ sub: "clerk_1", tenantId: "tenant-2" }, SECRET);

    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("TENANT_MISMATCH");
  });

  it("usa los claims del JWT si el usuario no existe en BD (rol por defecto OPERATOR)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const app = await buildTestApp();
    const token = createJwtToken({ sub: "ext_1", tenantId: "tenant-9" }, SECRET);

    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.json()).toEqual({
      tenantId: "tenant-9",
      userId: "ext_1",
      userRole: "OPERATOR",
    });
  });

  it("rechaza JWT válido sin contexto de tenant", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const app = await buildTestApp();
    const token = createJwtToken({ sub: "ext_1" }, SECRET);

    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("aplica requireRole sobre el rol resuelto por el hook", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const app = await buildTestApp();
    const operatorToken = createJwtToken(
      { sub: "op", tenantId: "t", role: "OPERATOR" },
      SECRET,
    );
    const adminToken = createJwtToken(
      { sub: "ad", tenantId: "t", role: "ADMIN" },
      SECRET,
    );

    const denied = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: `Bearer ${operatorToken}` },
    });
    const allowed = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(denied.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
  });
});
