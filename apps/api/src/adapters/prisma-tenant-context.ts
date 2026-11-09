// apps/api/src/adapters/prisma-tenant-context.ts
// Adaptador concreto Prisma/PostgreSQL para el puerto `TenantContextPort`.
// Ejecuta transacciones interactivas con `SELECT set_config('app.current_tenant_id', tenantId, true)`
// (`SET LOCAL`), compatibles con `IsolationLevel.Serializable`, `SELECT ... FOR UPDATE`
// y reutilización/anidamiento de `TransactionClient`.

import {
  getActiveTenantStore,
  prisma as defaultPrisma,
  withTenantContext as dbWithTenantContext,
  type Prisma,
  type PrismaClient,
  type TenantTransactionClient,
  type WithTenantContextOptions,
} from "@wms/db";
import type { TenantContextOptions } from "@wms/shared-types";
import { WmsError } from "../plugins/error-handler.js";
import type {
  TenantContextPort,
  TenantScopedWork,
} from "../ports/tenant-context.js";
import {
  getAmbientTenantScope,
  runWithAmbientTenantScope,
  validateTenantId,
} from "../use-cases/security/tenant-context.js";

export type { TenantTransactionClient };

export interface PrismaWithTenantContextOptions extends TenantContextOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel | undefined;
  timeout?: number | undefined;
  maxWait?: number | undefined;
  existingTx?: TenantTransactionClient | undefined;
}

/**
 * Helper de infraestructura en `@wms/api` que envuelve `withTenantContext` de `@wms/db`
 * aplicando validación de dominio (`WmsError` ante `tenantId` vacío/malformado o
 * intento de cambio de tenant en una transacción anidada).
 */
export async function withTenantContext<TResult>(
  clientOrTenantId: PrismaClient | TenantTransactionClient | string,
  tenantIdOrFn:
    | string
    | ((tx: TenantTransactionClient) => Promise<TResult>),
  fnOrOptions?:
    | ((tx: TenantTransactionClient) => Promise<TResult>)
    | PrismaWithTenantContextOptions,
  maybeOptions?: PrismaWithTenantContextOptions,
): Promise<TResult> {
  let client: PrismaClient | TenantTransactionClient;
  let rawTenantId: unknown;
  let fn: (tx: TenantTransactionClient) => Promise<TResult>;
  let options: PrismaWithTenantContextOptions | undefined;

  if (typeof clientOrTenantId === "string") {
    client = defaultPrisma;
    rawTenantId = clientOrTenantId;
    fn = tenantIdOrFn as (tx: TenantTransactionClient) => Promise<TResult>;
    options = fnOrOptions as PrismaWithTenantContextOptions | undefined;
  } else {
    client = clientOrTenantId;
    rawTenantId = tenantIdOrFn;
    fn = fnOrOptions as (tx: TenantTransactionClient) => Promise<TResult>;
    options = maybeOptions;
  }

  const validTenantId = validateTenantId(rawTenantId);

  const activeStore =
    getAmbientTenantScope<TenantTransactionClient>() ?? getActiveTenantStore();
  if (activeStore && activeStore.tenantId !== validTenantId) {
    throw new WmsError(
      "TENANT_MISMATCH",
      `Cannot switch active tenant context from "${activeStore.tenantId}" to "${validTenantId}" inside the same transaction`,
      403,
      {
        activeTenantId: activeStore.tenantId,
        requestedTenantId: validTenantId,
      },
    );
  }

  const dbOptions: WithTenantContextOptions = {
    isolationLevel: options?.isolationLevel,
    timeout: options?.timeout ?? options?.timeoutMs,
    maxWait: options?.maxWait ?? options?.maxWaitMs,
    existingTx: options?.existingTx,
  };

  return await dbWithTenantContext(
    client,
    validTenantId,
    async (tx) =>
      await runWithAmbientTenantScope(
        { tenantId: validTenantId, scope: tx },
        () => fn(tx),
      ),
    dbOptions,
  );
}

/**
 * Adaptador Prisma/PostgreSQL que implementa `TenantContextPort<TenantTransactionClient>`.
 */
export class PrismaTenantContextAdapter
  implements TenantContextPort<TenantTransactionClient>
{
  private readonly client: PrismaClient;

  constructor(client: PrismaClient = defaultPrisma) {
    this.client = client;
  }

  async runWithTenant<TResult>(
    tenantId: string,
    work: TenantScopedWork<TResult, TenantTransactionClient>,
    options?: TenantContextOptions,
  ): Promise<TResult> {
    return await withTenantContext(this.client, tenantId, work, options);
  }

  getCurrentTenantId(): string | null {
    return (
      getAmbientTenantScope()?.tenantId ??
      getActiveTenantStore()?.tenantId ??
      null
    );
  }
}
