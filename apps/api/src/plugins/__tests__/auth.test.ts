// apps/api/src/plugins/__tests__/auth.test.ts
// Tests unitarios de autenticación (F4.2):
// - Emisión y verificación de JWT HS256 y RS256 (Clerk)
// - Exigencia de `exp`, rechazo de tokens sin exp o expirados
// - Prevención de confusión de algoritmos (alg confusion HS256 vs RS256)
// - Secreto obligatorio en NODE_ENV=production
// - Hook global de autenticación (x-api-key, Bearer JWT, usuario inactivo, tenant mismatch)
// - Rechazo de escalada de privilegios cuando el usuario no existe en BD (rol forzado a OPERATOR)
// - Bypass x-dev-tenant-id estrictamente condicionado a opt-in explícito (ignorado en producción y sin NODE_ENV)
// - Guard de autorización por rol (requireRole)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { generateKeyPairSync, createSign, createHmac } from "node:crypto";

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
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env["JWT_SECRET"] = SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

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

  // Hallazgo 5: Rechazar tokens sin exp numérico
  it("rechaza tokens sin expiración (exp ausente)", () => {
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payloadB64 = Buffer.from(
      JSON.stringify({ sub: "u", tenantId: "t", iat: 1000 }),
    ).toString("base64url");
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = createHmac("sha256", SECRET)
      .update(signingInput)
      .digest("base64url");
    const token = `${signingInput}.${sig}`;

    expect(() => verifyJwtToken(token, SECRET)).toThrow(
      "JWT token missing expiration (exp)",
    );
  });

  // Hallazgo 5: Rechazar tokens not-before en el futuro
  it("rechaza tokens con claim nbf en el futuro", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payloadB64 = Buffer.from(
      JSON.stringify({ sub: "u", tenantId: "t", exp: future + 3600, nbf: future }),
    ).toString("base64url");
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = createHmac("sha256", SECRET)
      .update(signingInput)
      .digest("base64url");
    const token = `${signingInput}.${sig}`;

    expect(() => verifyJwtToken(token, SECRET)).toThrow(
      "JWT token not yet valid (nbf)",
    );
  });

  // Hallazgo 12: Headers o payloads base64 corruptos
  it("rechaza tokens con header o payload JSON corrupto", () => {
    expect(() => verifyJwtToken("not_json.eyJzdWIiOiIxIn0.sig", SECRET)).toThrow(
      "Invalid JWT header encoding",
    );
    const validHeaderB64 = Buffer.from(
      JSON.stringify({ alg: "HS256" }),
    ).toString("base64url");
    const corruptPayload = "corrupt_not_json";
    const sig = createHmac("sha256", SECRET)
      .update(`${validHeaderB64}.${corruptPayload}`)
      .digest("base64url");
    expect(() =>
      verifyJwtToken(`${validHeaderB64}.${corruptPayload}.${sig}`, SECRET),
    ).toThrow("Invalid JWT payload encoding");
  });

  it("rechaza tokens malformados, algoritmos no soportados y roles inválidos", () => {
    expect(() => verifyJwtToken("abc.def", SECRET)).toThrow("Malformed JWT token");
    expect(() => verifyJwtToken("a.b.c.d", SECRET)).toThrow("Malformed JWT token");

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

  // Hallazgo 1: En producción falla si no hay JWT_SECRET configurado
  it("lanza CONFIGURATION_ERROR en producción si no existe secreto JWT configurado", () => {
    delete process.env["JWT_SECRET"];
    delete process.env["CLERK_JWT_KEY"];
    process.env["NODE_ENV"] = "production";

    expect(() =>
      createJwtToken({ sub: "u", tenantId: "t" }),
    ).toThrow("JWT_SECRET environment variable is mandatory in production");
  });

  // Hallazgo 2: Soporte RS256 de Clerk y protección contra algoritmo confusion
  it("verifica tokens RS256 con clave pública Clerk y previene confusión de algoritmo", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const pubPem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const privPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

    const now = Math.floor(Date.now() / 1000);
    const headerB64 = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payloadB64 = Buffer.from(
      JSON.stringify({
        sub: "clerk_rsa_user",
        tenantId: "tenant-clerk",
        iat: now,
        exp: now + 3600,
      }),
    ).toString("base64url");
    const signingInput = `${headerB64}.${payloadB64}`;

    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    const rsaSig = signer.sign(privPem, "base64url");
    const rsaToken = `${signingInput}.${rsaSig}`;

    // Verificación exitosa con clave pública explícita
    const claims = verifyJwtToken(rsaToken, { clerkPublicKey: pubPem });
    expect(claims.sub).toBe("clerk_rsa_user");
    expect(claims.tenantId).toBe("tenant-clerk");

    // Falla si la clave pública Clerk no está configurada
    expect(() => verifyJwtToken(rsaToken, {})).toThrow(
      "Clerk public key is not configured for RS256 verification",
    );

    // Prevención de Algorithm Confusion: intentar verificar token RS256 usando secreto HMAC debe fallar
    expect(() => verifyJwtToken(rsaToken, pubPem)).toThrow(
      "Clerk public key is not configured for RS256 verification",
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
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    process.env["JWT_SECRET"] = SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
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

  // Hallazgo 3: Usuario no existente en BD -> tenant validado en BD y rol forzado a OPERATOR (no escala)
  it("fuerza rol OPERATOR y valida tenant en BD cuando el usuario no existe en BD", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: "tenant-9" });
    const app = await buildTestApp();
    const token = createJwtToken(
      { sub: "ext_1", tenantId: "tenant-9", role: "ADMIN" },
      SECRET,
    );

    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      tenantId: "tenant-9",
      userId: "ext_1",
      userRole: "OPERATOR",
    });

    // Demostrar que NO escala a ADMIN (acceso denegado en admin-only)
    const adminCheck = await app.inject({
      method: "GET",
      url: "/admin-only",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(adminCheck.statusCode).toBe(403);
  });

  // Hallazgo 3: Rechaza token con tenant que no existe en la BD
  it("rechaza token cuando el tenant especificado no existe en BD", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    const app = await buildTestApp();
    const token = createJwtToken(
      { sub: "ext_1", tenantId: "non-existent-tenant" },
      SECRET,
    );

    const res = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toBe("Tenant specified in token does not exist");
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

  // Hallazgo 4: Bypass x-dev-tenant-id ignorado en producción y sin NODE_ENV
  it("ignora x-dev-tenant-id en NODE_ENV=production y cuando NODE_ENV está ausente", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const app = await buildTestApp();
    const tokenWithoutTenant = createJwtToken({ sub: "u1" }, SECRET);

    // 1. En producción
    process.env["NODE_ENV"] = "production";
    const prodRes = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: {
        authorization: `Bearer ${tokenWithoutTenant}`,
        "x-dev-tenant-id": "dev-tenant",
      },
    });
    expect(prodRes.statusCode).toBe(401);

    // 2. Sin NODE_ENV
    delete process.env["NODE_ENV"];
    delete process.env["ALLOW_DEV_TENANT_HEADER"];
    const noEnvRes = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: {
        authorization: `Bearer ${tokenWithoutTenant}`,
        "x-dev-tenant-id": "dev-tenant",
      },
    });
    expect(noEnvRes.statusCode).toBe(401);

    // 3. Con opt-in explícito (ALLOW_DEV_TENANT_HEADER=true) sí lo acepta si el tenant existe
    process.env["ALLOW_DEV_TENANT_HEADER"] = "true";
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: "dev-tenant" });
    const allowedRes = await app.inject({
      method: "GET",
      url: "/whoami",
      headers: {
        authorization: `Bearer ${tokenWithoutTenant}`,
        "x-dev-tenant-id": "dev-tenant",
      },
    });
    expect(allowedRes.statusCode).toBe(200);
    expect(allowedRes.json().tenantId).toBe("dev-tenant");
  });

  it("aplica requireRole sobre el rol resuelto desde la base de datos", async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ id: "t" });
    mockPrisma.user.findUnique.mockImplementation(async ({ where }) => {
      if (where.clerkId === "ad") {
        return { id: "user-ad", tenantId: "t", role: "ADMIN", isActive: true };
      }
      return { id: "user-op", tenantId: "t", role: "OPERATOR", isActive: true };
    });
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
