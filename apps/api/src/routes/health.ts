// apps/api/src/routes/health.ts
import type { FastifyPluginAsync } from "fastify";

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Verificar salud del servicio",
        description: "Devuelve el estado operativo de la API",
      },
    },
    async () => {
      return { status: "ok", timestamp: new Date().toISOString(), service: "wms-api" };
    },
  );
};
