// apps/api/src/routes/v1/diagnostics.ts
// Rutas de Diagnóstico y Visibilidad de Errores (F7.1).
// Montada bajo /api/v1/diagnostics. Expone GET /errors restringido a ADMIN y SUPERVISOR.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ApiResponse, DiagnosticErrorRecord } from "@wms/shared-types";
import {
  DEFAULT_DIAGNOSTICS_LIMIT,
  MAX_DIAGNOSTICS_LIMIT,
  listDiagnosticErrors,
} from "../../use-cases/diagnostics/list-diagnostic-errors.js";

const ListDiagnosticErrorsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_DIAGNOSTICS_LIMIT)
    .default(DEFAULT_DIAGNOSTICS_LIMIT),
  errorCode: z.string().trim().min(1).optional(),
  correlationId: z.string().trim().min(1).optional(),
});

export const diagnosticsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/diagnostics/errors — Lista errores recientes aislados por el tenantId autenticado
  app.get(
    "/errors",
    {
      schema: {
        tags: ["Diagnostics"],
        summary:
          "Listar errores recientes del tenant actual (restringido a ADMIN y SUPERVISOR)",
      },
    },
    async (
      request,
      reply,
    ): Promise<ApiResponse<DiagnosticErrorRecord[]>> => {
      const query = ListDiagnosticErrorsQuerySchema.parse(request.query ?? {});

      const errors = await listDiagnosticErrors(
        {
          tenantId: request.tenantId,
          userRole: request.userRole,
          filters: {
            limit: query.limit,
            errorCode: query.errorCode,
            correlationId: query.correlationId,
          },
        },
        app.diagnosticsStore,
      );

      return reply.status(200).send({
        success: true,
        data: errors,
      });
    },
  );
};
