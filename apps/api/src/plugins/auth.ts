// apps/api/src/plugins/auth.ts
// Auth plugin: valida JWT (Clerk / HS256) o API Key para llamadas máquina-a-máquina.
// Decora `request.tenantId`, `request.userId` y `request.userRole` para uso en rutas.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { prisma } from "@wms/db";
import type { UserRole } from "@wms/shared-types";
import { WmsError } from "./error-handler.js";

declare module "fastify" {
  interface FastifyRequest {
    tenantId: string;
    userId?: string | undefined;
    userRole?: UserRole | undefined;
  }
}

const VALID_ROLES: ReadonlySet<UserRole> = new Set([
  "ADMIN",
  "SUPERVISOR",
  "OPERATOR",
]);

export interface JwtTokenPayload {
  sub?: string | undefined;
  clerkId?: string | undefined;
  userId?: string | undefined;
  tenantId?: string | undefined;
  tenant_id?: string | undefined;
  org_id?: string | undefined;
  role?: UserRole | undefined;
  iat?: number | undefined;
  exp?: number | undefined;
  expiresInSeconds?: number | undefined;
}

export interface VerifiedJwtClaims {
  sub?: string | undefined;
  tenantId?: string | undefined;
  role?: UserRole | undefined;
  iat: number;
  exp: number;
}

function resolveJwtSecret(explicitSecret?: string): string {
  return (
    explicitSecret ??
    process.env["JWT_SECRET"] ??
    process.env["CLERK_JWT_KEY"] ??
    "wms-dev-jwt-secret"
  );
}

function isValidRole(value: unknown): value is UserRole {
  return typeof value === "string" && VALID_ROLES.has(value as UserRole);
}

/**
 * Emite un token JWT firmado con HMAC-SHA256 (HS256).
 * Útil para sesiones locales, desarrollo y suites de tests automatizados.
 */
export function createJwtToken(
  payload: JwtTokenPayload,
  secret?: string,
): string {
  const resolvedSecret = resolveJwtSecret(secret);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const iat = payload.iat ?? nowSeconds;
  const exp = payload.exp ?? iat + (payload.expiresInSeconds ?? 3600);

  const header = { alg: "HS256", typ: "JWT" };
  const claims: Record<string, unknown> = { iat, exp };

  if (payload.sub !== undefined) claims["sub"] = payload.sub;
  if (payload.clerkId !== undefined) claims["clerkId"] = payload.clerkId;
  if (payload.userId !== undefined) claims["userId"] = payload.userId;
  if (payload.tenantId !== undefined) claims["tenantId"] = payload.tenantId;
  if (payload.tenant_id !== undefined) claims["tenant_id"] = payload.tenant_id;
  if (payload.org_id !== undefined) claims["org_id"] = payload.org_id;
  if (payload.role !== undefined) claims["role"] = payload.role;

  const headerB64 = Buffer.from(JSON.stringify(header), "utf8").toString(
    "base64url",
  );
  const payloadB64 = Buffer.from(JSON.stringify(claims), "utf8").toString(
    "base64url",
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const signatureB64 = createHmac("sha256", resolvedSecret)
    .update(signingInput, "utf8")
    .digest("base64url");

  return `${signingInput}.${signatureB64}`;
}

/**
 * Verifica criptográficamente un token JWT (HS256), su expiración (`exp`)
 * y normaliza los claims de identidad y multi-tenancy (`sub`, `tenantId`, `role`).
 */
export function verifyJwtToken(
  token: string,
  secret?: string,
): VerifiedJwtClaims {
  const resolvedSecret = resolveJwtSecret(secret);
  const normalizedToken = token.startsWith("Bearer ")
    ? token.slice("Bearer ".length).trim()
    : token.trim();

  const parts = normalizedToken.split(".");
  if (parts.length !== 3) {
    throw new WmsError("UNAUTHORIZED", "Malformed JWT token", 401);
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new WmsError("UNAUTHORIZED", "Malformed JWT token segments", 401);
  }

  let headerJson: { alg?: unknown; typ?: unknown };
  try {
    headerJson = JSON.parse(
      Buffer.from(headerB64, "base64url").toString("utf8"),
    ) as { alg?: unknown; typ?: unknown };
  } catch {
    throw new WmsError("UNAUTHORIZED", "Invalid JWT header encoding", 401);
  }

  if (headerJson.alg !== "HS256") {
    throw new WmsError("UNAUTHORIZED", "Unsupported JWT algorithm", 401);
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSignature = createHmac("sha256", resolvedSecret)
    .update(signingInput, "utf8")
    .digest("base64url");

  const actualSigBuf = Buffer.from(signatureB64, "utf8");
  const expectedSigBuf = Buffer.from(expectedSignature, "utf8");

  if (
    actualSigBuf.length !== expectedSigBuf.length ||
    !timingSafeEqual(actualSigBuf, expectedSigBuf)
  ) {
    throw new WmsError("UNAUTHORIZED", "Invalid JWT signature", 401);
  }

  let rawClaims: Record<string, unknown>;
  try {
    rawClaims = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    throw new WmsError("UNAUTHORIZED", "Invalid JWT payload encoding", 401);
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = typeof rawClaims["exp"] === "number" ? rawClaims["exp"] : 0;
  const iat =
    typeof rawClaims["iat"] === "number" ? rawClaims["iat"] : nowSeconds;

  if (typeof rawClaims["exp"] === "number" && rawClaims["exp"] <= nowSeconds) {
    throw new WmsError("UNAUTHORIZED", "JWT token has expired", 401);
  }

  const subCandidate =
    rawClaims["sub"] ?? rawClaims["clerkId"] ?? rawClaims["userId"];
  const sub =
    typeof subCandidate === "string" && subCandidate.trim().length > 0
      ? subCandidate.trim()
      : undefined;

  const tenantCandidate =
    rawClaims["tenantId"] ?? rawClaims["tenant_id"] ?? rawClaims["org_id"];
  const tenantId =
    typeof tenantCandidate === "string" && tenantCandidate.trim().length > 0
      ? tenantCandidate.trim()
      : undefined;

  const rawRole = rawClaims["role"];
  let role: UserRole | undefined;
  if (rawRole !== undefined && rawRole !== null) {
    if (!isValidRole(rawRole)) {
      throw new WmsError("UNAUTHORIZED", "Invalid role claim in JWT", 401);
    }
    role = rawRole;
  }

  return {
    sub,
    tenantId,
    role,
    iat,
    exp,
  };
}

export type RoleGuardHandler = (
  request: Pick<FastifyRequest, "userRole">,
  reply?: FastifyReply,
) => Promise<void>;

/**
 * Guard de autorización por rol para rutas protegidas de Fastify (`preHandler`).
 * Lanza `WmsError("UNAUTHORIZED", "Insufficient role permissions", 403)` cuando el
 * rol actual no está incluido en `allowedRoles`.
 */
export function requireRole(
  ...allowedRolesInput: Array<UserRole | readonly UserRole[]>
): RoleGuardHandler {
  const allowedRoles = allowedRolesInput.flat() as UserRole[];

  return async (request: Pick<FastifyRequest, "userRole">): Promise<void> => {
    const currentRole = request.userRole;
    if (!currentRole || !allowedRoles.includes(currentRole)) {
      throw new WmsError(
        "UNAUTHORIZED",
        "Insufficient role permissions",
        403,
        {
          requiredRoles: allowedRoles,
          currentRole: currentRole ?? null,
        },
      );
    }
  };
}

export const authPlugin = fp(async (app) => {
  app.decorateRequest("tenantId", "");
  app.decorateRequest("userId", undefined);
  app.decorateRequest("userRole", undefined);

  // Hook global: extrae tenantId, userId y userRole de JWT o API Key antes de cada request
  app.addHook("preHandler", async (request) => {
    // Las rutas públicas no necesitan auth
    const PUBLIC_PATHS = ["/health", "/docs", "/docs/"];
    if (PUBLIC_PATHS.some((p) => request.url.startsWith(p))) return;

    const apiKey = request.headers["x-api-key"] as string | undefined;
    const authHeader = request.headers["authorization"];

    if (apiKey) {
      // Autenticación por API Key (integraciones máquina-a-máquina y clientes autorizados)
      const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
      if (!tenant) {
        throw new WmsError("UNAUTHORIZED", "Invalid API key", 401);
      }
      request.tenantId = tenant.id;
      request.userRole = "ADMIN";
      return;
    }

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length).trim();
      const claims = verifyJwtToken(token);

      if (claims.sub) {
        const user = await prisma.user.findUnique({
          where: { clerkId: claims.sub },
        });

        if (user) {
          if (!user.isActive) {
            throw new WmsError(
              "UNAUTHORIZED",
              "User account is inactive",
              401,
            );
          }

          if (claims.tenantId && claims.tenantId !== user.tenantId) {
            throw new WmsError(
              "TENANT_MISMATCH",
              "JWT tenant claim does not match user tenant",
              403,
            );
          }

          request.tenantId = user.tenantId;
          request.userId = user.id;
          request.userRole = user.role as UserRole;
          return;
        }
      }

      const devTenantId =
        process.env["NODE_ENV"] !== "production"
          ? (request.headers["x-dev-tenant-id"] as string | undefined)
          : undefined;
      const resolvedTenantId = claims.tenantId ?? devTenantId;

      if (!resolvedTenantId) {
        throw new WmsError(
          "UNAUTHORIZED",
          "Missing tenant context in verified JWT",
          401,
        );
      }

      request.tenantId = resolvedTenantId;
      request.userId = claims.sub;
      request.userRole = claims.role ?? "OPERATOR";
      return;
    }

    throw new WmsError("UNAUTHORIZED", "Authentication required", 401);
  });
});
