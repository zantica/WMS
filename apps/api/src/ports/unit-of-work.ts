// apps/api/src/ports/unit-of-work.ts
// Puerto hexagonal UnitOfWork: coordina repositorios de dominio en una única
// transacción atómica (Serializable + RLS/withTenantContext en producción).

import type { InventoryRepository } from "./inventory-repository.js";
import type { OrderRepository } from "./order-repository.js";
import type { TaskRepository } from "./task-repository.js";

export interface UnitOfWorkRepositories {
  inventory: InventoryRepository;
  orders: OrderRepository;
  tasks: TaskRepository;
  /** Contexto opaco de la transacción activa para puertos auxiliares (ej. IdempotencyStore). */
  txScope?: unknown;
}

export const DEFAULT_TX_TIMEOUT_MS = 15_000;

export interface UnitOfWorkOptions {
  isolationLevel?: "ReadCommitted" | "Serializable" | undefined;
  timeoutMs?: number | undefined;
}

export interface UnitOfWork {
  /**
   * Ejecuta `work(repos)` de forma atómica bajo el contexto del `tenantId`.
   * Si ocurre un error o excepción, se aborta y revierte toda la operación.
   */
  execute<T>(
    tenantId: string,
    work: (repos: UnitOfWorkRepositories) => Promise<T>,
    options?: UnitOfWorkOptions,
  ): Promise<T>;
}
