// apps/api/src/plugins/auth.ts
// Auth plugin: valida JWT (Clerk / HS256) o API Key para llamadas máquina-a-máquina.
// Decora `request.tenantId`, `request.userId` y `request.userRole` para uso en rutas.

import { createHmac, createVerify, timingSafeEqual } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { prisma } from "@wms/db";
import {
  AUTH_CLERK_LOOKUP_GUC,
  SESSION_COOKIE_NAME,
  type UserRole,
} from "@wms/shared-types";
import { WmsError } from "./error-handler.js";

/**
 * Extrae una cookie por nombre de la cabecera `Cookie` sin usar expresiones regulares vulnerables a ReDoS.
 */
export function extractCookieToken(
  cookieHeader: string | undefined,
  cookieName: string = SESSION_COOKIE_NAME,
): string | null {
  if (!cookieHeader || cookieHeader.trim().length === 0) {
    return null;
  }

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = pair.slice(0, eqIndex).trim();
    if (key !== cookieName) continue;
    const rawValue = pair.slice(eqIndex + 1).trim();
    if (!rawValue) return null;
    try {
      const decoded = decodeURIComponent(rawValue).trim();
      return decoded.length > 0 ? decoded : null;
    } catch {
      return rawValue;
    }
  }

  return null;
}

/**
 * Resuelve de forma controlada un usuario por `clerkId` durante el handshake inicial de autenticación.
 * Cuando `prisma.$transaction` y `$queryRaw` están disponibles (ejecución contra PostgreSQL con FORCE RLS),
 * fija `SET LOCAL app.auth_clerk_id = <clerkId>` dentro de una transacción acotada para que la política RLS
 * de `users` permita únicamente leer la fila cuyo `clerkId` coincide exactamente con el token verificado.
 */
export async function lookupUserByClerkIdForAuth(clerkId: string): Promise<{
  id: string;
  tenantId: string;
  role: UserRole;
  isActive: boolean;
} | null> {
  const client = prisma as unknown as {
    $transaction?: <T>(
      fn: (tx: {
        $queryRaw?: (
          strings: TemplateStringsArray,
          ...values: unknown[]
        ) => Promise<unknown>;
        user?: {
          findUnique: (args: {
            where: { clerkId: string };
          }) => Promise<{
            id: string;
            tenantId: string;
            role: UserRole;
            isActive: boolean;
          } | null>;
        };
      }) => Promise<T>,
    ) => Promise<T>;
    user: {
      findUnique: (args: {
        where: { clerkId: string };
      }) => Promise<{
        id: string;
        tenantId: string;
        role: UserRole;
        isActive: boolean;
      } | null>;
    };
  };

  if (typeof client.$transaction === "function") {
    return await client.$transaction(async (tx) => {
      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw`SELECT set_config(${AUTH_CLERK_LOOKUP_GUC}, ${clerkId}, true)`;
      }
      const userDelegate = tx.user ?? client.user;
      return await userDelegate.findUnique({
        where: { clerkId },
      });
    });
  }

  return await client.user.findUnique({
    where: { clerkId },
  });
}

declare module "fastify" {
  interface FastifyRequest {
    tenantId: string;
    userId?: string | undefined;
    userRole?: UserRole | undefined;
  }
}

const VALID_ROLES: ReadonlySet<UserRole> = new Set([
  "SUPERUSER",
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

export interface VerifyJwtOptions {
  secret?: string | undefined;
  clerkPublicKey?: string | undefined;
}

function resolveJwtSecret(explicitSecret?: string): string {
  const secret = explicitSecret ?? process.env["JWT_SECRET"];
  if (secret && secret.trim().length > 0) {
    return secret.trim();
  }
  if (process.env["NODE_ENV"] === "production") {
    throw new WmsError(
      "CONFIGURATION_ERROR",
      "JWT_SECRET environment variable is mandatory in production",
      500,
    );
  }
  return "wms-dev-jwt-secret";
}

function formatPublicKeyPem(rawKey: string): string {
  const trimmed = rawKey.trim();
  if (trimmed.includes("-----BEGIN")) {
    return trimmed;
  }
  return `-----BEGIN PUBLIC KEY-----\n${trimmed}\n-----END PUBLIC KEY-----`;
}

function verifyRs256Signature(
  signingInput: string,
  signatureB64: string,
  publicKeyPem: string,
): boolean {
  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(signingInput, "utf8");
    const sigBuf = Buffer.from(signatureB64, "base64url");
    const pem = formatPublicKeyPem(publicKeyPem);
    return verifier.verify(pem, sigBuf);
  } catch {
    return false;
  }
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
 * Verifica criptográficamente un token JWT (HS256 con JWT_SECRET o RS256 con clave pública Clerk),
 * su expiración obligatoria (`exp`) y normaliza los claims de identidad y multi-tenancy (`sub`, `tenantId`, `role`).
 */
export function verifyJwtToken(
  token: string,
  optionsOrSecret?: string | VerifyJwtOptions,
): VerifiedJwtClaims {
  const options: VerifyJwtOptions =
    typeof optionsOrSecret === "string"
      ? { secret: optionsOrSecret }
      : (optionsOrSecret ?? {});

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

  const signingInput = `${headerB64}.${payloadB64}`;

  if (headerJson.alg === "HS256") {
    const resolvedSecret = resolveJwtSecret(options.secret);
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
  } else if (headerJson.alg === "RS256") {
    const publicKey =
      options.clerkPublicKey ?? process.env["CLERK_JWT_KEY"];
    if (!publicKey || !publicKey.trim()) {
      throw new WmsError(
        "UNAUTHORIZED",
        "Clerk public key is not configured for RS256 verification",
        401,
      );
    }

    const isValid = verifyRs256Signature(signingInput, signatureB64, publicKey);
    if (!isValid) {
      throw new WmsError("UNAUTHORIZED", "Invalid JWT signature", 401);
    }
  } else {
    throw new WmsError("UNAUTHORIZED", "Unsupported JWT algorithm", 401);
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

  // Exigir exp numérico válido (no infinito ni ausente)
  if (
    typeof rawClaims["exp"] !== "number" ||
    !Number.isFinite(rawClaims["exp"]) ||
    rawClaims["exp"] <= 0
  ) {
    throw new WmsError("UNAUTHORIZED", "JWT token missing expiration (exp)", 401);
  }

  if (rawClaims["exp"] <= nowSeconds) {
    throw new WmsError("UNAUTHORIZED", "JWT token has expired", 401);
  }

  if (
    typeof rawClaims["nbf"] === "number" &&
    Number.isFinite(rawClaims["nbf"]) &&
    rawClaims["nbf"] > nowSeconds
  ) {
    throw new WmsError("UNAUTHORIZED", "JWT token not yet valid (nbf)", 401);
  }

  const exp = rawClaims["exp"];
  const iat =
    typeof rawClaims["iat"] === "number" && Number.isFinite(rawClaims["iat"])
      ? rawClaims["iat"]
      : nowSeconds;

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
    if (currentRole === "SUPERUSER") {
      return;
    }
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

function isPublicAuthPath(url: string): boolean {
  const pathname = url.split("?")[0] ?? url;
  if (
    pathname === "/health" ||
    pathname === "/docs" ||
    pathname.startsWith("/docs/")
  ) {
    return true;
  }
  return (
    pathname === "/api/v1/auth/login" ||
    pathname === "/api/v1/auth/logout" ||
    pathname === "/api/v1/auth/bootstrap-status" ||
    pathname === "/api/v1/auth/bootstrap-superuser"
  );
}

export interface AuthPluginOptions {
  jwtSecret?: string | undefined;
  clerkPublicKey?: string | undefined;
}

const authPluginImpl: FastifyPluginAsync<AuthPluginOptions> = async (
  app,
  options,
) => {
  app.decorateRequest("tenantId", "");
  app.decorateRequest("userId", undefined);
  app.decorateRequest("userRole", undefined);

  // Hook global onRequest: extrae tenantId, userId y userRole de JWT (Bearer o cookie HttpOnly wms_session) o API Key
  app.addHook("onRequest", async (request) => {
    if (isPublicAuthPath(request.url)) return;

    const apiKey = request.headers["x-api-key"] as string | undefined;
    const authHeader = request.headers["authorization"];
    const cookieToken = extractCookieToken(
      request.headers["cookie"],
      SESSION_COOKIE_NAME,
    );

    const jwtToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : cookieToken;

    if (jwtToken) {
      const claims = verifyJwtToken(jwtToken, {
        secret: options.jwtSecret,
        clerkPublicKey: options.clerkPublicKey,
      });

      if (claims.sub) {
        const user = await lookupUserByClerkIdForAuth(claims.sub);

        if (user) {
          if (!user.isActive) {
            throw new WmsError(
              "UNAUTHORIZED",
              "User account is inactive",
              401,
            );
          }

          if (user.role === "SUPERUSER") {
            const requestedTenantId = (
              request.headers["x-tenant-id"] as string | undefined
            )?.trim();
            if (requestedTenantId && requestedTenantId !== user.tenantId) {
              const targetTenant = await prisma.tenant.findUnique({
                where: { id: requestedTenantId },
              });
              if (!targetTenant) {
                throw new WmsError(
                  "UNAUTHORIZED",
                  "Requested tenant does not exist",
                  401,
                );
              }
              request.tenantId = requestedTenantId;
            } else {
              request.tenantId = user.tenantId;
            }
            request.userId = user.id;
            request.userRole = user.role;
            return;
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
          request.userRole = user.role;
          return;
        }
      }

      // Hallazgo 4: Bypass x-dev-tenant-id solo con opt-in explícito (development o flag explícito)
      const isDevTenantAllowed =
        process.env["NODE_ENV"] === "development" ||
        process.env["ALLOW_DEV_TENANT_HEADER"] === "true";
      const devTenantId = isDevTenantAllowed
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

      // Hallazgo 3: Si el usuario no existe en BD, verificar que el tenant existe y nunca otorgar rol elevado (forzar OPERATOR)
      const tenant = await prisma.tenant.findUnique({
        where: { id: resolvedTenantId },
      });
      if (!tenant) {
        throw new WmsError(
          "UNAUTHORIZED",
          "Tenant specified in token does not exist",
          401,
        );
      }

      request.tenantId = resolvedTenantId;
      request.userId = claims.sub;
      request.userRole = "OPERATOR";
      return;
    }

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

    throw new WmsError("UNAUTHORIZED", "Authentication required", 401);
  });
};

export const authPlugin = fp(authPluginImpl, {
  name: "auth",
});
