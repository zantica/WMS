// apps/api/src/adapters/in-memory-unit-of-work.ts
// Adaptador en memoria para UnitOfWork.
// Simula atomicidad transaccional (snapshot + rollback completo ante excepciones)
// y aislamiento multi-tenant (tenantId + TENANT_MISMATCH ante contextos anidados dispares).

import { WmsError } from "../plugins/error-handler.js";
import type {
  UnitOfWork,
  UnitOfWorkOptions,
  UnitOfWorkRepositories,
} from "../ports/unit-of-work.js";
import {
  getAmbientTenantScope,
  runWithAmbientTenantScope,
  validateTenantId,
} from "../use-cases/security/tenant-context.js";
import {
  InMemoryInventoryRepository,
  type InMemoryBalanceRecord,
  type InMemoryLocationRecord,
  type InMemoryTransactionRecord,
} from "./in-memory-inventory-repository.js";
import {
  InMemoryOrderRepository,
  type InMemoryOrderRecord,
} from "./in-memory-order-repository.js";
import {
  InMemoryTaskRepository,
  type InMemoryProductRecord,
  type InMemoryTaskRecord,
} from "./in-memory-task-repository.js";

export interface InMemoryStoreData {
  balances: InMemoryBalanceRecord[];
  locations: InMemoryLocationRecord[];
  transactions: InMemoryTransactionRecord[];
  products: InMemoryProductRecord[];
  orders: InMemoryOrderRecord[];
  tasks: InMemoryTaskRecord[];
}

export class InMemoryUnitOfWork implements UnitOfWork {
  readonly state: InMemoryStoreData;
  private readonly inventoryRepo: InMemoryInventoryRepository;
  private readonly orderRepo: InMemoryOrderRepository;
  private readonly taskRepo: InMemoryTaskRepository;

  constructor(initial?: Partial<InMemoryStoreData>) {
    this.state = {
      balances: initial?.balances ? structuredClone(initial.balances) : [],
      locations: initial?.locations ? structuredClone(initial.locations) : [],
      transactions: initial?.transactions ? structuredClone(initial.transactions) : [],
      products: initial?.products ? structuredClone(initial.products) : [],
      orders: initial?.orders ? structuredClone(initial.orders) : [],
      tasks: initial?.tasks ? structuredClone(initial.tasks) : [],
    };
    this.inventoryRepo = new InMemoryInventoryRepository(this.state);
    this.orderRepo = new InMemoryOrderRepository(this.state);
    this.taskRepo = new InMemoryTaskRepository(this.state);
  }

  async execute<T>(
    tenantId: string,
    work: (repos: UnitOfWorkRepositories) => Promise<T>,
    _options?: UnitOfWorkOptions,
  ): Promise<T> {
    const validTenantId = validateTenantId(tenantId);

    const activeStore = getAmbientTenantScope<UnitOfWorkRepositories>();
    if (activeStore && activeStore.tenantId !== validTenantId) {
      throw new WmsError(
        "TENANT_MISMATCH",
        `Active tenant context "${activeStore.tenantId}" does not match requested tenantId "${validTenantId}"`,
        403,
      );
    }

    // Reutilizar transacción en curso si ya existe para el mismo tenant
    if (activeStore?.scope && typeof activeStore.scope === "object" && "inventory" in activeStore.scope) {
      return await work(activeStore.scope);
    }

    // Snapshot para garantizar atomicidad y rollback ante fallos
    const snapshot = structuredClone(this.state);
    const repos: UnitOfWorkRepositories = {
      inventory: this.inventoryRepo,
      orders: this.orderRepo,
      tasks: this.taskRepo,
    };

    try {
      return await runWithAmbientTenantScope(
        { tenantId: validTenantId, scope: repos },
        () => work(repos),
      );
    } catch (error) {
      this.state.balances = snapshot.balances;
      this.state.locations = snapshot.locations;
      this.state.transactions = snapshot.transactions;
      this.state.products = snapshot.products;
      this.state.orders = snapshot.orders;
      this.state.tasks = snapshot.tasks;
      throw error;
    }
  }
}
