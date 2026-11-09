// apps/api/src/use-cases/diagnostics/list-diagnostic-errors.ts
// Caso de uso puro para consultar errores recientes de diagnóstico de un tenant.
// Restringido a roles ADMIN y SUPERVISOR; OPERATOR recibe WmsError FORBIDDEN (403).

import type {
  DiagnosticErrorRecord,
  ListDiagnosticErrorsFilters,
  UserRole,
} from "@wms/shared-types";
import type { DiagnosticsStore } from "../../ports/diagnostics-store.js";
import { WmsError } from "../../plugins/error-handler.js";

export const DEFAULT_DIAGNOSTICS_LIMIT = 50;
export const MAX_DIAGNOSTICS_LIMIT = 200;

const ALLOWED_DIAGNOSTIC_ROLES: ReadonlySet<UserRole> = new Set([
  "ADMIN",
  "SUPERVISOR",
]);

export interface ListDiagnosticErrorsUseCaseInput {
  tenantId: string;
  userRole?: UserRole | undefined;
  filters?: ListDiagnosticErrorsFilters | undefined;
}

export async function listDiagnosticErrors(
  input: ListDiagnosticErrorsUseCaseInput,
  diagnosticsStore: DiagnosticsStore,
): Promise<DiagnosticErrorRecord[]> {
  const tenantId = input.tenantId.trim();
  if (!tenantId) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "tenantId is required to query diagnostic errors",
      400,
    );
  }

  if (!input.userRole || !ALLOWED_DIAGNOSTIC_ROLES.has(input.userRole)) {
    throw new WmsError(
      "FORBIDDEN",
      "Only ADMIN and SUPERVISOR roles can access diagnostic error logs",
      403,
      {
        requiredRoles: ["ADMIN", "SUPERVISOR"],
        currentRole: input.userRole ?? null,
      },
    );
  }

  const rawLimit = input.filters?.limit;
  const limit = rawLimit !== undefined ? rawLimit : DEFAULT_DIAGNOSTICS_LIMIT;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > MAX_DIAGNOSTICS_LIMIT
  ) {
    throw new WmsError(
      "VALIDATION_ERROR",
      `limit must be an integer between 1 and ${MAX_DIAGNOSTICS_LIMIT}`,
      422,
      { limit },
    );
  }

  const errorCode = input.filters?.errorCode?.trim();
  const correlationId = input.filters?.correlationId?.trim();

  return diagnosticsStore.listErrorsByTenant(tenantId, {
    limit,
    errorCode: errorCode && errorCode.length > 0 ? errorCode : undefined,
    correlationId:
      correlationId && correlationId.length > 0 ? correlationId : undefined,
  });
}
