// apps/api/src/ports/idempotency-store.ts
// Puerto hexagonal para almacenamiento y verificación de idempotencia transaccional.
// Permite registrar la respuesta de una operación crítica bajo una clave única por tenant
// e interceptar reintentos para devolver la respuesta original sin repetir efectos secundarios en el Ledger.

export interface StoredIdempotencyRecord<T = unknown> {
  id: string;
  tenantId: string;
  idempotencyKey: string;
  action: string;
  requestHash?: string | null | undefined;
  responseStatus: number;
  responseBody: T;
  occurredAt?: Date | null | undefined;
  createdAt: Date;
}

export interface SaveIdempotencyRecordInput<T = unknown> {
  id?: string | undefined;
  tenantId: string;
  idempotencyKey: string;
  action: string;
  requestHash?: string | null | undefined;
  responseStatus?: number | undefined;
  responseBody: T;
  occurredAt?: Date | string | null | undefined;
}

export interface IdempotencyStore {
  /**
   * Busca un registro de idempotencia existente por (tenantId, idempotencyKey).
   * Opcionalmente recibe un contexto transaccional (`tx`).
   */
  find<T = unknown>(
    tenantId: string,
    idempotencyKey: string,
    tx?: unknown,
  ): Promise<StoredIdempotencyRecord<T> | null>;

  /**
   * Persiste un nuevo registro de idempotencia.
   * En caso de violación de unicidad por (tenantId, idempotencyKey), lanza un error.
   */
  save<T = unknown>(
    input: SaveIdempotencyRecordInput<T>,
    tx?: unknown,
  ): Promise<StoredIdempotencyRecord<T>>;
}
