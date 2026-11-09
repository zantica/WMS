// apps/api/src/use-cases/diagnostics/record-diagnostic-error.ts
// Caso de uso puro para registrar un evento de error en el puerto DiagnosticsStore
// garantizando aislamiento por tenantId y sanitización de credenciales.

import type { DiagnosticErrorRecord } from "@wms/shared-types";
import type {
  DiagnosticsStore,
  RecordDiagnosticErrorInput,
} from "../../ports/diagnostics-store.js";
import { WmsError } from "../../plugins/error-handler.js";
import {
  redactSensitiveData,
  resolveSafeCorrelationId,
} from "./redact-sensitive.js";

export async function recordDiagnosticError(
  input: RecordDiagnosticErrorInput,
  diagnosticsStore: DiagnosticsStore,
): Promise<DiagnosticErrorRecord> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "tenantId is required to record a diagnostic error",
      400,
    );
  }

  const correlationId = resolveSafeCorrelationId(input.correlationId);
  const errorCode = input.errorCode.trim() || "INTERNAL_ERROR";
  const message =
    typeof redactSensitiveData(input.message) === "string"
      ? (redactSensitiveData(input.message) as string)
      : "Unexpected error";
  const method = input.method.trim().toUpperCase() || "UNKNOWN";
  const path = input.path.trim() || "/";
  const sanitizedDetails =
    input.details !== undefined ? redactSensitiveData(input.details) : undefined;

  return diagnosticsStore.recordError({
    id: input.id,
    tenantId,
    correlationId,
    errorCode,
    message,
    statusCode: input.statusCode,
    method,
    path,
    userId: input.userId ?? null,
    details: sanitizedDetails,
    occurredAt: input.occurredAt,
  });
}
