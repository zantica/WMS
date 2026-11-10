// packages/shared-types/src/api-helpers.ts
// Funciones utilitarias para clientes HTTP (@wms/web, @wms/mobile).
// Centralizadas para garantizar consistencia y eliminar duplicación de código.

import {
  CORRELATION_ID_HEADER,
  type ApiError,
  type ApiResponse,
} from "./index.js";

let fallbackCorrelationSeq = 0;

export function generateCorrelationId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  fallbackCorrelationSeq = (fallbackCorrelationSeq + 1) >>> 0;
  return `corr-${Date.now().toString(36)}-${fallbackCorrelationSeq.toString(36)}`;
}

export function extractResponseHeaderCorrelationId(
  response: unknown,
): string | undefined {
  const headersObj = (response as { headers?: { get?: (name: string) => string | null } })?.headers;
  if (headersObj && typeof headersObj.get === "function") {
    const val = headersObj.get(CORRELATION_ID_HEADER);
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return undefined;
}

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return trimmed.slice(0, end);
}

export function isApiErrorPayload(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate["success"] !== false) {
    return false;
  }
  const errorObj = candidate["error"];
  if (typeof errorObj !== "object" || errorObj === null) {
    return false;
  }
  const errRecord = errorObj as Record<string, unknown>;
  return (
    typeof errRecord["code"] === "string" &&
    typeof errRecord["message"] === "string"
  );
}

export function isApiSuccessPayload<T>(value: unknown): value is ApiResponse<T> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate["success"] === true && "data" in candidate;
}
