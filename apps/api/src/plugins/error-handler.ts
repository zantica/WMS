// apps/api/src/plugins/error-handler.ts
// Centralized error handling plugin.
// Catches domain errors (WmsError) and Zod validation errors, includes correlationId in ApiError,
// and records tenant-scoped errors into DiagnosticsStore when available.

import type { FastifyPluginAsync, FastifyError } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import {
  CORRELATION_ID_HEADER,
  type ApiError,
  type WmsErrorCode,
} from "@wms/shared-types";
import { recordDiagnosticError } from "../use-cases/diagnostics/record-diagnostic-error.js";
import {
  redactSensitiveData,
  resolveSafeCorrelationId,
} from "../use-cases/diagnostics/redact-sensitive.js";

export class WmsError extends Error {
  constructor(
    public readonly code: WmsErrorCode,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "WmsError";
  }
}

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler(async (error: FastifyError | Error, request, reply) => {
    const correlationId =
      request.correlationId && request.correlationId.trim().length > 0
        ? request.correlationId
        : resolveSafeCorrelationId(request.headers[CORRELATION_ID_HEADER]);

    request.correlationId = correlationId;
    reply.header(CORRELATION_ID_HEADER, correlationId);

    const recordIfTenantResolved = async (
      errorCode: string,
      message: string,
      statusCode: number,
      details?: unknown,
    ): Promise<void> => {
      request.resolvedErrorCode = errorCode;

      const tenantId =
        typeof request.tenantId === "string" ? request.tenantId.trim() : "";
      if (!tenantId || !app.hasDecorator("diagnosticsStore")) {
        return;
      }

      try {
        await recordDiagnosticError(
          {
            tenantId,
            correlationId,
            errorCode,
            message,
            statusCode,
            method: request.method,
            path: request.url,
            userId: request.userId ?? null,
            details,
          },
          app.diagnosticsStore,
        );
      } catch (diagErr) {
        app.log.warn(
          { correlationId, err: diagErr },
          "failed to record diagnostic error",
        );
      }
    };

    // Errores de dominio WMS
    if (error instanceof WmsError) {
      const sanitizedDetails =
        error.details !== undefined
          ? redactSensitiveData(error.details)
          : undefined;

      await recordIfTenantResolved(
        error.code,
        error.message,
        error.statusCode,
        sanitizedDetails,
      );

      const body: ApiError = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          correlationId,
          ...(sanitizedDetails !== undefined ? { details: sanitizedDetails } : {}),
        },
      };
      return reply.status(error.statusCode).send(body);
    }

    // Errores de validación Zod
    if (error instanceof ZodError) {
      const flattened = error.flatten();
      await recordIfTenantResolved(
        "VALIDATION_ERROR",
        "Validation failed",
        422,
        flattened,
      );

      const body: ApiError = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          correlationId,
          details: flattened,
        },
      };
      return reply.status(422).send(body);
    }

    // Rate limit (fastify-rate-limit lanza 429)
    if ("statusCode" in error && error.statusCode === 429) {
      await recordIfTenantResolved("RATE_LIMITED", error.message, 429);

      const body: ApiError = {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: error.message,
          correlationId,
        },
      };
      return reply.status(429).send(body);
    }

    // Error genérico — no exponer stack en producción
    const safeMessage =
      process.env["NODE_ENV"] === "production"
        ? "Internal server error"
        : error.message;

    await recordIfTenantResolved("INTERNAL_ERROR", safeMessage, 500);

    app.log.error(
      {
        correlationId,
        tenantId: request.tenantId || null,
        userId: request.userId ?? null,
        errorCode: "INTERNAL_ERROR",
        err: redactSensitiveData({
          name: error.name,
          message: error.message,
        }),
      },
      "unhandled internal error",
    );

    const body: ApiError = {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: safeMessage,
        correlationId,
      },
    };
    return reply.status(500).send(body);
  });
};

export const errorHandler = fp(errorHandlerPlugin, {
  name: "error-handler",
});
