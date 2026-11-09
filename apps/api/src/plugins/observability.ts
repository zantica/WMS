// apps/api/src/plugins/observability.ts
// Plugin Fastify de Observabilidad Estructurada y Propagación de correlationId (F7.1).
// - Extrae o genera un x-correlation-id seguro en cada petición.
// - Expone request.correlationId y devuelve siempre el header x-correlation-id.
// - Mide durationMs y emite logs estructurados enriquecidos (correlationId, tenantId, userId,
//   method, url, statusCode, durationMs, errorCode) con secretos redactados.
// - Decora app.diagnosticsStore detrás del puerto DiagnosticsStore.

import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { CORRELATION_ID_HEADER } from "@wms/shared-types";
import type { DiagnosticsStore } from "../ports/diagnostics-store.js";
import { InMemoryDiagnosticsStore } from "../adapters/in-memory-diagnostics-store.js";
import {
  redactSensitiveData,
  resolveSafeCorrelationId,
} from "../use-cases/diagnostics/redact-sensitive.js";

declare module "fastify" {
  interface FastifyInstance {
    diagnosticsStore: DiagnosticsStore;
  }

  interface FastifyRequest {
    correlationId: string;
    requestStartTimeMs?: number | undefined;
    resolvedErrorCode?: string | undefined;
  }
}

export interface ObservabilityPluginOptions {
  diagnosticsStore?: DiagnosticsStore | undefined;
}

const observabilityPluginImpl: FastifyPluginAsync<ObservabilityPluginOptions> =
  async (app, options) => {
    const store = options.diagnosticsStore ?? new InMemoryDiagnosticsStore();

    if (!app.hasDecorator("diagnosticsStore")) {
      app.decorate("diagnosticsStore", store);
    }

    if (!app.hasRequestDecorator("correlationId")) {
      app.decorateRequest("correlationId", "");
    }
    if (!app.hasRequestDecorator("requestStartTimeMs")) {
      app.decorateRequest("requestStartTimeMs", undefined);
    }
    if (!app.hasRequestDecorator("resolvedErrorCode")) {
      app.decorateRequest("resolvedErrorCode", undefined);
    }

    app.addHook("onRequest", async (request, reply) => {
      const incomingHeader = request.headers[CORRELATION_ID_HEADER];
      const correlationId = resolveSafeCorrelationId(incomingHeader);

      request.correlationId = correlationId;
      request.requestStartTimeMs = performance.now();

      reply.header(CORRELATION_ID_HEADER, correlationId);
    });

    app.addHook("onSend", async (request, reply, payload) => {
      if (request.correlationId) {
        reply.header(CORRELATION_ID_HEADER, request.correlationId);
      }
      return payload;
    });

    app.addHook("onResponse", async (request, reply) => {
      const durationMs =
        request.requestStartTimeMs !== undefined
          ? Math.max(
              0,
              Number((performance.now() - request.requestStartTimeMs).toFixed(2)),
            )
          : 0;

      const sanitizedHeaders = redactSensitiveData({
        authorization: request.headers["authorization"],
        "x-api-key": request.headers["x-api-key"],
        "x-webhook-signature": request.headers["x-webhook-signature"],
        "user-agent": request.headers["user-agent"],
      });

      const structuredLog = {
        correlationId: request.correlationId,
        tenantId: request.tenantId || null,
        userId: request.userId ?? null,
        userRole: request.userRole ?? null,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        durationMs,
        errorCode: request.resolvedErrorCode ?? null,
        headers: sanitizedHeaders,
      };

      if (reply.statusCode >= 500) {
        request.log.error(structuredLog, "request completed with server error");
      } else if (reply.statusCode >= 400) {
        request.log.warn(structuredLog, "request completed with client/domain error");
      } else {
        request.log.info(structuredLog, "request completed");
      }
    });
  };

export const observabilityPlugin = fp(observabilityPluginImpl, {
  name: "observability",
});
