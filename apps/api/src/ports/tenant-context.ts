// apps/api/src/ports/tenant-context.ts
// Puerto hexagonal para propagación y verificación del contexto multi-tenant (Row Level Security).
// Totalmente desacoplado de Fastify, Prisma y motores de base de datos concretos.

import type { TenantContextOptions } from "@wms/shared-types";

export interface TenantScopedWork<TResult, TScope = unknown> {
  (scope: TScope): Promise<TResult>;
}

/**
 * Puerto de dominio para ejecutar operaciones bajo un contexto de tenant aislado.
 * El adaptador concreto en el borde (`PrismaTenantContextAdapter`) traduce este contrato
 * a una transacción PostgreSQL con `SET LOCAL app.current_tenant_id = <tenantId>`
 * compatible con `IsolationLevel.Serializable` y `SELECT ... FOR UPDATE`.
 */
export interface TenantContextPort<TScope = unknown> {
  /**
   * Ejecuta `work(scope)` garantizando que el contexto del `tenantId` esté activo
   * durante toda la unidad de trabajo y se limpie automáticamente al terminar
   * (tanto en éxito como en rollback/excepción).
   */
  runWithTenant<TResult>(
    tenantId: string,
    work: TenantScopedWork<TResult, TScope>,
    options?: TenantContextOptions,
  ): Promise<TResult>;

  /**
   * Devuelve el `tenantId` actualmente activo en el alcance de ejecución,
   * o `null` si no existe ningún contexto activo.
   */
  getCurrentTenantId(): string | null;
}
