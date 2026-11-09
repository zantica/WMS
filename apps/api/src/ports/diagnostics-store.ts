// apps/api/src/ports/diagnostics-store.ts
// Puerto hexagonal para almacenamiento y consulta de eventos de error de diagnóstico.
// Totalmente desacoplado de Fastify, Prisma y mecanismos de persistencia concretos.

import type {
  DiagnosticErrorRecord,
  ListDiagnosticErrorsFilters,
} from "@wms/shared-types";

export interface RecordDiagnosticErrorInput {
  id?: string | undefined;
  tenantId: string;
  correlationId: string;
  errorCode: string;
  message: string;
  statusCode: number;
  method: string;
  path: string;
  userId?: string | null | undefined;
  details?: unknown;
  occurredAt?: string | undefined;
}

export interface DiagnosticsStore {
  /**
   * Registra un error de diagnóstico asociado estrictamente a un tenantId,
   * aplicando sanitización/redacción de posibles secretos en details o mensaje.
   */
  recordError(
    input: RecordDiagnosticErrorInput,
  ): Promise<DiagnosticErrorRecord>;

  /**
   * Lista los errores recientes de un único tenant (ordenados del más reciente al más antiguo),
   * con soporte de filtros opcionales (`limit`, `errorCode`, `correlationId`).
   */
  listErrorsByTenant(
    tenantId: string,
    filters?: ListDiagnosticErrorsFilters,
  ): Promise<DiagnosticErrorRecord[]>;
}
