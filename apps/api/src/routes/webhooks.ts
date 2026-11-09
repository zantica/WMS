// apps/api/src/routes/webhooks.ts
// Rutas de integración externa (E-commerce / ERP Webhooks).
// Soporta ingesta idempotente de pedidos con verificación opcional de firma HMAC-SHA256.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ApiResponse, IngestExternalOrderResult } from "@wms/shared-types";
import { requireRole } from "../plugins/auth.js";
import { WmsError } from "../plugins/error-handler.js";
import { ingestExternalOrder } from "../use-cases/integrations/ingest-external-order.js";
import { verifyWebhookSignature } from "../use-cases/integrations/notify-order-shipped.js";

const WebhookOrderLineSchema = z
  .object({
    productId: z.string().trim().min(1).optional(),
    sku: z.string().trim().min(1).optional(),
    requestedQty: z.number().positive(),
    unitPrice: z.number().nonnegative().optional(),
  })
  .refine((line) => Boolean(line.productId || line.sku), {
    message: "Each order line must specify either productId or sku",
  });

const IngestExternalOrderWebhookSchema = z.object({
  warehouseId: z.string().trim().min(1),
  externalId: z.string().trim().min(1),
  externalRef: z.string().trim().min(1).optional(),
  customerName: z.string().trim().min(1).optional(),
  customerEmail: z.string().email().optional(),
  priority: z.number().int().min(0).max(100).default(0),
  notes: z.string().optional(),
  autoAllocate: z.boolean().default(false),
  lines: z.array(WebhookOrderLineSchema).min(1),
});

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string | undefined;
  }
}

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  // Captura el raw body como string antes de parsear JSON para verificación criptográfica HMAC estricta
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      try {
        const rawString =
          typeof body === "string" ? body : body.toString("utf8");
        req.rawBody = rawString;
        const parsed = JSON.parse(rawString);
        done(null, parsed);
      } catch (err: unknown) {
        done(err as Error, undefined);
      }
    },
  );

  // POST /api/v1/webhooks/orders — Ingesta idempotente de pedidos desde E-commerce / ERP
  app.post(
    "/orders",
    {
      preHandler: requireRole("ADMIN", "SUPERVISOR"),
      schema: {
        tags: ["Orders"],
        summary:
          "Ingestar pedido desde sistema externo (Shopify, WooCommerce, ERP) con idempotencia por externalId",
      },
    },
    async (
      request,
      reply,
    ): Promise<ApiResponse<IngestExternalOrderResult>> => {
      const isProduction = process.env["NODE_ENV"] === "production";
      const sharedSecret = process.env["WEBHOOK_SHARED_SECRET"];

      if (isProduction && (!sharedSecret || !sharedSecret.trim())) {
        throw new WmsError(
          "CONFIGURATION_ERROR",
          "WEBHOOK_SHARED_SECRET environment variable is mandatory in production",
          500,
        );
      }

      if (sharedSecret) {
        const signatureHeader =
          (request.headers["x-webhook-signature"] as string | undefined) ??
          (request.headers["x-wms-signature"] as string | undefined);

        if (!signatureHeader) {
          throw new WmsError(
            "UNAUTHORIZED",
            "Missing webhook signature header",
            401,
          );
        }

        const rawBody =
          request.rawBody ??
          (typeof request.body === "string"
            ? request.body
            : JSON.stringify(request.body ?? {}));

        if (
          !verifyWebhookSignature(
            rawBody,
            signatureHeader,
            sharedSecret,
            isProduction,
          )
        ) {
          throw new WmsError(
            "UNAUTHORIZED",
            "Invalid webhook signature",
            401,
          );
        }
      }

      const body = IngestExternalOrderWebhookSchema.parse(request.body);

      const result = await ingestExternalOrder({
        tenantId: request.tenantId,
        warehouseId: body.warehouseId,
        externalId: body.externalId,
        externalRef: body.externalRef,
        customerName: body.customerName,
        customerEmail: body.customerEmail,
        priority: body.priority,
        notes: body.notes,
        autoAllocate: body.autoAllocate,
        lines: body.lines,
      });

      const statusCode = result.idempotentReplay ? 200 : 201;
      return reply.status(statusCode).send({
        success: true,
        data: result,
      });
    },
  );
};
