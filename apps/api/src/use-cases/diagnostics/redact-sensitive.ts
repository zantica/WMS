// apps/api/src/use-cases/diagnostics/redact-sensitive.ts
// Utilidades puras de dominio para sanitización/redacción de credenciales y
// normalización segura de correlationId (sin dependencias de Fastify ni Prisma).

import { randomUUID } from "node:crypto";

export const REDACTED_PLACEHOLDER = "[REDACTED]" as const;

const SENSITIVE_KEY_PATTERNS = [
  "authorization",
  "x-api-key",
  "apikey",
  "api_key",
  "password",
  "passwd",
  "token",
  "secret",
  "webhooksecret",
  "x-webhook-signature",
  "cookie",
  "set-cookie",
] as const;

const SAFE_CORRELATION_ID_REGEX = /^[a-zA-Z0-9._:-]{1,128}$/;

const BEARER_OR_JWT_VALUE_REGEX =
  /^(Bearer\s+\S+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)$/i;

/**
 * Determina si el nombre de una propiedad o cabecera corresponde a un secreto o credencial.
 */
export function isSensitiveKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

/**
 * Redacta recursivamente cualquier campo sensible (`authorization`, `x-api-key`,
 * `password`, `token`, `secret`, `webhookSecret`, etc.) dentro de objetos, arrays o strings.
 */
export function redactSensitiveData(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (BEARER_OR_JWT_VALUE_REGEX.test(value.trim())) {
      return REDACTED_PLACEHOLDER;
    }
    return value;
  }

  if (typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, seen));
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, propValue] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = REDACTED_PLACEHOLDER;
    } else {
      sanitized[key] = redactSensitiveData(propValue, seen);
    }
  }

  return sanitized;
}

/**
 * Valida un `x-correlation-id` entrante o genera un `randomUUID()` seguro si no viene,
 * está vacío o contiene caracteres no permitidos (prevención de log/header injection).
 */
export function resolveSafeCorrelationId(rawHeader: unknown): string {
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (typeof candidate === "string") {
    const trimmed = candidate.trim();
    if (SAFE_CORRELATION_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return randomUUID();
}
