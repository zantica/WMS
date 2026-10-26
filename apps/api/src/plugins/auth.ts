// apps/api/src/plugins/auth.ts
// Auth plugin: valida JWT (Clerk) o API Key para llamadas máquina-a-máquina.
// Decora `request.tenant` y `request.userId` para uso en rutas.

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { prisma } from "@wms/db";
import { WmsError } from "./error-handler.js";

declare module "fastify" {
  interface FastifyRequest {
    tenantId: string;
    userId?: string;
    userRole?: string;
  }
}

export const authPlugin = fp(async (app) => {
  app.decorateRequest("tenantId", "");

  // Hook global: extrae tenantId de JWT o API Key antes de cada request
  app.addHook("preHandler", async (request) => {
    // Las rutas públicas no necesitan auth
    const PUBLIC_PATHS = ["/health", "/docs", "/docs/"];
    if (PUBLIC_PATHS.some((p) => request.url.startsWith(p))) return;

    const apiKey = request.headers["x-api-key"] as string | undefined;
    const authHeader = request.headers["authorization"];

    if (apiKey) {
      // Autenticación por API Key (integraciones máquina-a-máquina)
      const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
      if (!tenant) {
        throw new WmsError("UNAUTHORIZED", "Invalid API key", 401);
      }
      request.tenantId = tenant.id;
      return;
    }

    if (authHeader?.startsWith("Bearer ")) {
      // TODO: Validar JWT de Clerk cuando esté configurado
      // Por ahora en desarrollo aceptamos un tenantId en el header para testing
      const devTenantId = request.headers["x-dev-tenant-id"] as string | undefined;
      if (process.env["NODE_ENV"] !== "production" && devTenantId) {
        request.tenantId = devTenantId;
        return;
      }
      throw new WmsError(
        "UNAUTHORIZED",
        "JWT validation not yet configured — use x-api-key or x-dev-tenant-id in dev",
        401,
      );
    }

    throw new WmsError("UNAUTHORIZED", "Authentication required", 401);
  });
});
