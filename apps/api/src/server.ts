// apps/api/src/server.ts
// Punto de entrada del servidor Fastify.
// Inicializa plugins, registra rutas y arranca el listener.

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { errorHandler } from "./plugins/error-handler.js";
import { authPlugin } from "./plugins/auth.js";
import { observabilityPlugin } from "./plugins/observability.js";
import { PrismaTenantContextAdapter } from "./adapters/prisma-tenant-context.js";
import { PrismaCatalogRepositoryAdapter } from "./adapters/prisma-catalog-repository.js";
import { PrismaUserRepositoryAdapter } from "./adapters/prisma-user-repository.js";
import { PrismaLocationRepository } from "./adapters/prisma-location-repository.js";
import { PrismaTopologyRepository } from "./adapters/prisma-topology-repository.js";
import { SvgLabelRendererAdapter } from "./adapters/svg-label-renderer.js";
import {
  BcryptPasswordHasher,
  resolveBcryptSaltRounds,
} from "./adapters/bcrypt-password-hasher.js";
import type { DiagnosticsStore } from "./ports/diagnostics-store.js";
import type { PasswordHasherPort } from "./ports/password-hasher.js";
import type { TenantContextPort } from "./ports/tenant-context.js";
import type { CatalogRepositoryPort } from "./ports/catalog-repository.js";
import type { UserRepositoryPort } from "./ports/user-repository.js";
import type { LocationRepositoryPort } from "./ports/location-repository.js";
import type { TopologyRepositoryPort } from "./ports/topology-repository.js";
import type { LabelRendererPort } from "./ports/label-renderer.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { productRoutes } from "./routes/products.js";
import { categoryRoutes } from "./routes/categories.js";
import { userRoutes } from "./routes/users.js";
import { locationRoutes } from "./routes/locations.js";
import { orderRoutes } from "./routes/orders.js";
import { taskRoutes } from "./routes/tasks.js";
import { receiptRoutes } from "./routes/receipts.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { diagnosticsRoutes } from "./routes/v1/diagnostics.js";
import { labelRoutes } from "./routes/v1/labels.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoute } from "./routes/health.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const HOST = process.env["HOST"] ?? "0.0.0.0";

declare module "fastify" {
  interface FastifyInstance {
    tenantContext: TenantContextPort;
    catalogRepository: CatalogRepositoryPort;
    userRepository: UserRepositoryPort;
    locationRepository: LocationRepositoryPort;
    topologyRepository: TopologyRepositoryPort;
    labelRenderer: LabelRendererPort;
    passwordHasher: PasswordHasherPort;
  }
}

export interface BuildServerOptions {
  diagnosticsStore?: DiagnosticsStore | undefined;
  tenantContext?: TenantContextPort | undefined;
  catalogRepository?: CatalogRepositoryPort | undefined;
  userRepository?: UserRepositoryPort | undefined;
  locationRepository?: LocationRepositoryPort | undefined;
  topologyRepository?: TopologyRepositoryPort | undefined;
  labelRenderer?: LabelRendererPort | undefined;
  passwordHasher?: PasswordHasherPort | undefined;
  bcryptSaltRounds?: number | undefined;
  jwtSecret?: string | undefined;
  clerkPublicKey?: string | undefined;
  jwtExpiresInSeconds?: number | undefined;
  bootstrapSetupSecret?: string | undefined;
  enableLogger?: boolean | undefined;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({
    logger:
      options.enableLogger === false
        ? false
        : {
            level: process.env["NODE_ENV"] === "production" ? "info" : "debug",
            transport:
              process.env["NODE_ENV"] !== "production" &&
              process.env["NODE_ENV"] !== "test"
                ? { target: "pino-pretty" }
                : undefined,
          },
  });

  app.decorate(
    "tenantContext",
    options.tenantContext ?? new PrismaTenantContextAdapter(),
  );
  app.decorate(
    "catalogRepository",
    options.catalogRepository ?? new PrismaCatalogRepositoryAdapter(),
  );
  app.decorate(
    "userRepository",
    options.userRepository ?? new PrismaUserRepositoryAdapter(),
  );
  app.decorate(
    "locationRepository",
    options.locationRepository ?? new PrismaLocationRepository(),
  );
  app.decorate(
    "topologyRepository",
    options.topologyRepository ?? new PrismaTopologyRepository(),
  );
  const saltRounds =
    options.bcryptSaltRounds ??
    resolveBcryptSaltRounds(process.env["BCRYPT_SALT_ROUNDS"]);
  const jwtSecret = options.jwtSecret ?? process.env["JWT_SECRET"];
  const clerkPublicKey = options.clerkPublicKey ?? process.env["CLERK_JWT_KEY"];
  const rawJwtExpires = Number(process.env["JWT_EXPIRES_IN_SECONDS"] ?? 28_800);
  const jwtExpiresInSeconds =
    options.jwtExpiresInSeconds ??
    (Number.isFinite(rawJwtExpires) && rawJwtExpires > 0 ? rawJwtExpires : 28_800);
  const bootstrapSetupSecret =
    options.bootstrapSetupSecret ?? process.env["BOOTSTRAP_SETUP_SECRET"];
  const isProduction = process.env["NODE_ENV"] === "production";

  app.decorate(
    "labelRenderer",
    options.labelRenderer ?? new SvgLabelRendererAdapter(),
  );
  app.decorate(
    "passwordHasher",
    options.passwordHasher ?? new BcryptPasswordHasher(saltRounds),
  );

  // ── Seguridad ──────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin:
      process.env["NODE_ENV"] === "production"
        ? [process.env["WEB_URL"] ?? ""]
        : true,
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });

  // ── Documentación OpenAPI ──────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: "WMS API",
        description: "Warehouse Management System — Fase 1 MVP",
        version: "1.0.0",
      },
      tags: [
        { name: "Auth", description: "Autenticación JWT, cookie HttpOnly y bootstrap de Superuser" },
        { name: "Products", description: "Catálogo de productos, SKUs y dimensiones" },
        { name: "Categories", description: "Categorías operativas configurables del catálogo" },
        { name: "Users", description: "Gestión de usuarios y roles del inquilino (Tenant)" },
        { name: "Locations", description: "Zonas y ubicaciones físicas del almacén" },
        { name: "Inventory", description: "Saldos en vivo, ledger inmutable y ajustes de stock" },
        { name: "Orders", description: "Pedidos de venta, asignación y despacho" },
        { name: "Receipts", description: "Recepción de mercancía de proveedores (Inbound)" },
        { name: "Tasks", description: "Tareas guiadas de almacén (Picking, Putaway)" },
        { name: "Diagnostics", description: "Observabilidad, trazabilidad y diagnóstico de errores por tenant" },
        { name: "Labels", description: "Generación de etiquetas logísticas con prefijos tipados (QR y Code128)" },
        { name: "Health", description: "Estado y monitorización del servicio" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
        },
      },
      // Aplica la API Key a todos los endpoints en Swagger UI (botón "Authorize")
      security: [{ apiKey: [] }],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      displayRequestDuration: true,
    },
  });

  // ── Plugins de aplicación ─────────────────────────────────
  await app.register(observabilityPlugin, {
    diagnosticsStore: options.diagnosticsStore,
  });
  await app.register(errorHandler);
  await app.register(authPlugin, {
    jwtSecret,
    clerkPublicKey,
  });

  // ── Rutas ─────────────────────────────────────────────────
  await app.register(healthRoute);
  await app.register(authRoutes, {
    prefix: "/api/v1/auth",
    jwtSecret,
    jwtExpiresInSeconds,
    bootstrapSetupSecret,
    isProduction,
  });
  await app.register(inventoryRoutes, { prefix: "/api/v1/inventory" });
  await app.register(productRoutes, { prefix: "/api/v1/products" });
  await app.register(categoryRoutes, { prefix: "/api/v1/categories" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(locationRoutes, { prefix: "/api/v1/locations" });
  await app.register(orderRoutes, { prefix: "/api/v1/orders" });
  await app.register(taskRoutes, { prefix: "/api/v1/tasks" });
  await app.register(receiptRoutes, { prefix: "/api/v1/receipts" });
  await app.register(webhookRoutes, { prefix: "/api/v1/webhooks" });
  await app.register(diagnosticsRoutes, { prefix: "/api/v1/diagnostics" });
  await app.register(labelRoutes, { prefix: "/api/v1/labels" });

  return app;
}

async function main() {
  const app = await buildServer();

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`🚀 WMS API running on http://localhost:${PORT}`);
    console.log(`📚 Docs available at http://localhost:${PORT}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (process.env["NODE_ENV"] !== "test" && !process.env["VITEST"]) {
  void main();
}
