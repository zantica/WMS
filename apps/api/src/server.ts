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
import { inventoryRoutes } from "./routes/inventory.js";
import { productRoutes } from "./routes/products.js";
import { locationRoutes } from "./routes/locations.js";
import { orderRoutes } from "./routes/orders.js";
import { taskRoutes } from "./routes/tasks.js";
import { receiptRoutes } from "./routes/receipts.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { healthRoute } from "./routes/health.js";

const PORT = Number(process.env["PORT"] ?? 3001);
const HOST = process.env["HOST"] ?? "0.0.0.0";

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env["NODE_ENV"] === "production" ? "info" : "debug",
      transport:
        process.env["NODE_ENV"] !== "production"
          ? { target: "pino-pretty" }
          : undefined,
    },
  });

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
        { name: "Products", description: "Catálogo de productos, SKUs y dimensiones" },
        { name: "Locations", description: "Zonas y ubicaciones físicas del almacén" },
        { name: "Inventory", description: "Saldos en vivo, ledger inmutable y ajustes de stock" },
        { name: "Orders", description: "Pedidos de venta, asignación y despacho" },
        { name: "Receipts", description: "Recepción de mercancía de proveedores (Inbound)" },
        { name: "Tasks", description: "Tareas guiadas de almacén (Picking, Putaway)" },
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
  await app.register(errorHandler);
  await app.register(authPlugin);

  // ── Rutas ─────────────────────────────────────────────────
  await app.register(healthRoute);
  await app.register(inventoryRoutes, { prefix: "/api/v1/inventory" });
  await app.register(productRoutes, { prefix: "/api/v1/products" });
  await app.register(locationRoutes, { prefix: "/api/v1/locations" });
  await app.register(orderRoutes, { prefix: "/api/v1/orders" });
  await app.register(taskRoutes, { prefix: "/api/v1/tasks" });
  await app.register(receiptRoutes, { prefix: "/api/v1/receipts" });
  await app.register(webhookRoutes, { prefix: "/api/v1/webhooks" });

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

main();
