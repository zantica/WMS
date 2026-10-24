// packages/db/src/index.ts
// Re-exports the Prisma client instance (singleton pattern) and all generated types.

import { PrismaClient } from "@prisma/client";

// Singleton: reutiliza la misma conexión en desarrollo (evita "too many connections" con hot-reload)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}

// Re-export all generated types so consumers import from "@wms/db" directly
export * from "@prisma/client";
