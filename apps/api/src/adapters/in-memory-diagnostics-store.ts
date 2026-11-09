// apps/api/src/adapters/in-memory-diagnostics-store.ts
// Adaptador en memoria (Ring Buffer / FIFO por tenant) que implementa el puerto DiagnosticsStore.
// Aísla estrictamente los registros por tenantId y redacta campos sensibles antes de almacenar.

import { randomUUID } from "node:crypto";
import type {
  DiagnosticErrorRecord,
  ListDiagnosticErrorsFilters,
} from "@wms/shared-types";
import type {
  DiagnosticsStore,
  RecordDiagnosticErrorInput,
} from "../ports/diagnostics-store.js";
import { redactSensitiveData } from "../use-cases/diagnostics/redact-sensitive.js";

export interface InMemoryDiagnosticsStoreOptions {
  maxEntriesPerTenant?: number | undefined;
}

const DEFAULT_MAX_ENTRIES_PER_TENANT = 200;

export class InMemoryDiagnosticsStore implements DiagnosticsStore {
  private readonly maxEntriesPerTenant: number;
  private readonly buckets = new Map<string, DiagnosticErrorRecord[]>();

  constructor(options: InMemoryDiagnosticsStoreOptions = {}) {
    const configuredMax =
      options.maxEntriesPerTenant ?? DEFAULT_MAX_ENTRIES_PER_TENANT;
    this.maxEntriesPerTenant = Math.max(1, Math.floor(configuredMax));
  }

  public async recordError(
    input: RecordDiagnosticErrorInput,
  ): Promise<DiagnosticErrorRecord> {
    const tenantId = input.tenantId.trim();
    if (!tenantId) {
      throw new Error("tenantId cannot be empty in DiagnosticsStore.recordError");
    }

    const sanitizedMessage = redactSensitiveData(input.message);
    const sanitizedDetails =
      input.details !== undefined
        ? redactSensitiveData(input.details)
        : undefined;

    const record: DiagnosticErrorRecord = {
      id: input.id && input.id.trim().length > 0 ? input.id.trim() : randomUUID(),
      tenantId,
      correlationId: input.correlationId.trim(),
      errorCode: input.errorCode.trim(),
      message:
        typeof sanitizedMessage === "string"
          ? sanitizedMessage
          : String(sanitizedMessage),
      statusCode: input.statusCode,
      method: input.method.trim().toUpperCase(),
      path: input.path.trim(),
      userId: input.userId ?? null,
      ...(sanitizedDetails !== undefined ? { details: sanitizedDetails } : {}),
      occurredAt: input.occurredAt ?? new Date().toISOString(),
    };

    let bucket = this.buckets.get(tenantId);
    if (!bucket) {
      bucket = [];
      this.buckets.set(tenantId, bucket);
    }

    // Insertar al inicio para mantener orden cronológico inverso (más reciente primero)
    bucket.unshift(record);

    // Capacidad acotada FIFO por tenant (descarta los más antiguos)
    if (bucket.length > this.maxEntriesPerTenant) {
      bucket.length = this.maxEntriesPerTenant;
    }

    return record;
  }

  public async listErrorsByTenant(
    tenantId: string,
    filters?: ListDiagnosticErrorsFilters,
  ): Promise<DiagnosticErrorRecord[]> {
    const normalizedTenantId = tenantId.trim();
    if (!normalizedTenantId) {
      return [];
    }

    const bucket = this.buckets.get(normalizedTenantId);
    if (!bucket || bucket.length === 0) {
      return [];
    }

    const errorCodeFilter = filters?.errorCode?.trim();
    const correlationIdFilter = filters?.correlationId?.trim();
    const limit =
      filters?.limit !== undefined && filters.limit > 0
        ? Math.floor(filters.limit)
        : bucket.length;

    const result: DiagnosticErrorRecord[] = [];

    for (const entry of bucket) {
      // Defensa adicional: jamás devolver un registro cuyo tenantId no coincida exactamente
      if (entry.tenantId !== normalizedTenantId) {
        continue;
      }
      if (errorCodeFilter && entry.errorCode !== errorCodeFilter) {
        continue;
      }
      if (correlationIdFilter && entry.correlationId !== correlationIdFilter) {
        continue;
      }
      result.push(entry);
      if (result.length >= limit) {
        break;
      }
    }

    return result;
  }

  /**
   * Método auxiliar para tests: limpia todos los buckets en memoria.
   */
  public clear(): void {
    this.buckets.clear();
  }
}
