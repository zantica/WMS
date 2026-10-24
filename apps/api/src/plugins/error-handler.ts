// apps/api/src/plugins/error-handler.ts
// Centralized error handling plugin.
// Catches domain errors (WmsError) and Zod validation errors and returns consistent JSON.

import type { FastifyPluginAsync, FastifyError } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import type { ApiError, WmsErrorCode } from "@wms/shared-types";

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
  app.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    // Errores de dominio WMS
    if (error instanceof WmsError) {
      const body: ApiError = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
      return reply.status(error.statusCode).send(body);
    }

    // Errores de validación Zod
    if (error instanceof ZodError) {
      const body: ApiError = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          details: error.flatten(),
        },
      };
      return reply.status(422).send(body);
    }

    // Rate limit (fastify-rate-limit lanza 429)
    if ("statusCode" in error && error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: { code: "RATE_LIMITED", message: error.message },
      });
    }

    // Error genérico — no exponer stack en producción
    app.log.error(error);
    return reply.status(500).send({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          process.env["NODE_ENV"] === "production"
            ? "Internal server error"
            : error.message,
      },
    });
  });
};

export const errorHandler = fp(errorHandlerPlugin, {
  name: "error-handler",
});
