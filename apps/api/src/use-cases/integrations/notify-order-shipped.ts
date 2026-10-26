// apps/api/src/use-cases/integrations/notify-order-shipped.ts
// Caso de uso: Notificación saliente (`order.shipped`) firmada con HMAC-SHA256 hacia el e-commerce/ERP.
//
// Garantías:
// 1. Firma criptográfica determinista `sha256=<hex>` en cabecera `x-wms-signature`.
// 2. Resiliencia: fallos de red o respuestas no-2xx del endpoint externo se capturan y reportan
//    en `NotifyOrderShippedResult` sin abortar el despacho local del pedido.

import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  OrderShippedWebhookLine,
  OrderShippedWebhookPayload,
} from "@wms/shared-types";

export type { OrderShippedWebhookLine, OrderShippedWebhookPayload };

export interface NotifyOrderShippedLineInput {
  productId: string;
  sku?: string | undefined;
  requestedQty: number | { toString(): string };
  pickedQty: number | { toString(): string };
}

export interface NotifyOrderShippedParams {
  orderId: string;
  tenantId: string;
  warehouseId: string;
  externalId?: string | null | undefined;
  externalRef?: string | null | undefined;
  shippedAt?: Date | string | undefined;
  lines: NotifyOrderShippedLineInput[];
  webhookUrl?: string | undefined;
  secret?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface NotifyOrderShippedResult {
  delivered: boolean;
  skipped: boolean;
  statusCode: number | null;
  signature: string;
  payload: OrderShippedWebhookPayload;
  error?: string | undefined;
}

function resolveWebhookSecret(explicitSecret?: string): string {
  return (
    explicitSecret ??
    process.env["WEBHOOK_SHARED_SECRET"] ??
    "wms-dev-webhook-secret"
  );
}

/**
 * Calcula la firma HMAC-SHA256 en formato `sha256=<hex>` sobre el cuerpo JSON serializado.
 */
export function signWebhookPayload(rawBody: string, secret?: string): string {
  const resolvedSecret = resolveWebhookSecret(secret);
  const digest = createHmac("sha256", resolvedSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  return `sha256=${digest}`;
}

/**
 * Verifica en tiempo constante (`timingSafeEqual`) la firma HMAC-SHA256 de un webhook entrante o saliente.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret?: string,
): boolean {
  if (!signatureHeader || !signatureHeader.trim()) {
    return false;
  }

  const expected = signWebhookPayload(rawBody, secret);
  const trimmed = signatureHeader.trim();
  const normalizedActual = trimmed.startsWith("sha256=")
    ? trimmed
    : `sha256=${trimmed}`;

  const actualBuf = Buffer.from(normalizedActual, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Construye el evento `order.shipped`, calcula su firma HMAC-SHA256 y, si existe URL configurada,
 * realiza el envío HTTP POST capturando cualquier error de red sin interrumpir el flujo llamador.
 */
export async function notifyOrderShipped(
  params: NotifyOrderShippedParams,
): Promise<NotifyOrderShippedResult> {
  const shippedAtIso =
    params.shippedAt instanceof Date
      ? params.shippedAt.toISOString()
      : (params.shippedAt ?? new Date().toISOString());

  const payload: OrderShippedWebhookPayload = {
    event: "order.shipped",
    orderId: params.orderId,
    externalId: params.externalId ?? null,
    externalRef: params.externalRef ?? null,
    tenantId: params.tenantId,
    warehouseId: params.warehouseId,
    shippedAt: shippedAtIso,
    lines: params.lines.map((line) => ({
      productId: line.productId,
      ...(line.sku !== undefined ? { sku: line.sku } : {}),
      requestedQty: Number(line.requestedQty),
      pickedQty: Number(line.pickedQty),
    })),
  };

  const rawBody = JSON.stringify(payload);
  const signature = signWebhookPayload(rawBody, params.secret);
  const targetUrl =
    params.webhookUrl ?? process.env["WEBHOOK_OUTBOUND_URL"] ?? "";

  if (!targetUrl.trim()) {
    return {
      delivered: false,
      skipped: true,
      statusCode: null,
      signature,
      payload,
    };
  }

  const fetchFn = params.fetchImpl ?? globalThis.fetch;

  try {
    const response = await fetchFn(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wms-event": "order.shipped",
        "x-wms-signature": signature,
      },
      body: rawBody,
    });

    if (!response.ok) {
      return {
        delivered: false,
        skipped: false,
        statusCode: response.status,
        signature,
        payload,
        error: `Webhook endpoint responded with HTTP ${response.status}`,
      };
    }

    return {
      delivered: true,
      skipped: false,
      statusCode: response.status,
      signature,
      payload,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown webhook delivery error";
    return {
      delivered: false,
      skipped: false,
      statusCode: null,
      signature,
      payload,
      error: message,
    };
  }
}
