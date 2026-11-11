// apps/api/src/adapters/prisma-unit-of-work.ts
// Adaptador Prisma/PostgreSQL para el puerto UnitOfWork.
// Garantiza aislamiento Serializable, contexto multi-tenant RLS (`withTenantContext`)
// y reutilización transparente de transacciones existentes o ambient scope.

import {
  getActiveTenantStore,
  prisma as defaultPrisma,
  withTenantContext as dbWithTenantContext,
  type Prisma,
  type PrismaClient,
  type TenantTransactionClient,
} from "@wms/db";
import { WmsError } from "../plugins/error-handler.js";
import type { UnitOfWork, UnitOfWorkOptions, UnitOfWorkRepositories } from "../ports/unit-of-work.js";
import {
  getAmbientTenantScope,
  runWithAmbientTenantScope,
  validateTenantId,
} from "../use-cases/security/tenant-context.js";
import { PrismaInventoryRepository } from "./prisma-inventory-repository.js";
import { PrismaOrderRepository } from "./prisma-order-repository.js";
import { PrismaTaskRepository } from "./prisma-task-repository.js";

type PrismaClientOrTx = PrismaClient | TenantTransactionClient | Prisma.TransactionClient;

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(
    private readonly client: PrismaClientOrTx = defaultPrisma,
    private readonly explicitTx?: unknown,
  ) {}

  async execute<T>(
    tenantId: string,
    work: (repos: UnitOfWorkRepositories) => Promise<T>,
    options?: UnitOfWorkOptions,
  ): Promise<T> {
    const validTenantId = validateTenantId(tenantId);

    const activeStore =
      getAmbientTenantScope<TenantTransactionClient>() ??
      (typeof getActiveTenantStore === "function" ? getActiveTenantStore() : undefined);

    if (activeStore && activeStore.tenantId !== validTenantId) {
      throw new WmsError(
        "TENANT_MISMATCH",
        `Active tenant context "${activeStore.tenantId}" does not match requested tenantId "${validTenantId}"`,
        403,
      );
    }

    const reusableTx =
      this.explicitTx ??
      (activeStore && "scope" in activeStore
        ? activeStore.scope
        : activeStore && "tx" in activeStore
          ? activeStore.tx
          : undefined);

    const buildRepos = (txClient: PrismaClientOrTx): UnitOfWorkRepositories => ({
      inventory: new PrismaInventoryRepository(txClient as Prisma.TransactionClient),
      orders: new PrismaOrderRepository(txClient as Prisma.TransactionClient),
      tasks: new PrismaTaskRepository(txClient as Prisma.TransactionClient),
      txScope: txClient,
    });

    if (reusableTx) {
      return await runWithAmbientTenantScope(
        { tenantId: validTenantId, scope: reusableTx },
        () => work(buildRepos(reusableTx as PrismaClientOrTx)),
      );
    }

    if (
      typeof dbWithTenantContext === "function" &&
      "$transaction" in this.client &&
      typeof this.client.$transaction === "function"
    ) {
      return await dbWithTenantContext(
        this.client as PrismaClient,
        validTenantId,
        async (tx) =>
          await runWithAmbientTenantScope(
            { tenantId: validTenantId, scope: tx },
            () => work(buildRepos(tx)),
          ),
        {
          isolationLevel: options?.isolationLevel ?? "Serializable",
          timeout: options?.timeoutMs ?? 15_000,
        },
      );
    }

    return await runWithAmbientTenantScope(
      { tenantId: validTenantId, scope: this.client },
      () => work(buildRepos(this.client)),
    );
  }
}
