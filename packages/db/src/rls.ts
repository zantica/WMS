// packages/db/src/rls.ts
// Helpers reutilizables de Row Level Security (RLS) y propagación de contexto multi-tenant
// en PostgreSQL para @wms/db y @wms/api.
//
// Características:
// 1. Especificación declarativa de todas las tablas protegidas con ENABLE + FORCE ROW LEVEL SECURITY.
// 2. Generador/ejecutor idempotente de las sentencias SQL de RLS (`applyTenantRlsPolicies`).
// 3. Helper `withTenantContext(client, tenantId, fn, options)` compatible con `IsolationLevel.Serializable`,
//    `SELECT ... FOR UPDATE` y reutilización/anidamiento de `TransactionClient` (mediante AsyncLocalStorage
//    o inyección directa de `tx`).
// 4. Camino controlado de resolución de autenticación (`withAuthClerkLookup`) para buscar usuario por `clerkId`
//    sin desactivar RLS ni exponer filas de otros usuarios/tenants.

import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, type PrismaClient } from "@prisma/client";

export const TENANT_CONTEXT_GUC = "app.current_tenant_id" as const;
export const AUTH_CLERK_LOOKUP_GUC = "app.auth_clerk_id" as const;

export const SAFE_TENANT_ID_REGEX = /^[a-zA-Z0-9._:-]{1,128}$/;

export interface RlsTableDefinition {
  tableName: string;
  policyName: string;
  kind: "direct_tenant_column" | "parent_relation" | "auth_controlled";
  tenantColumn?: string | undefined;
  parentTable?: string | undefined;
  foreignKeyColumn?: string | undefined;
  enableRls: true;
  forceRls: true;
}

/**
 * Catálogo completo de tablas multi-tenant protegidas por PostgreSQL Row Level Security.
 * Incluye tablas con columna directa `"tenantId"`, tablas hijas (`order_lines`, `task_steps`)
 * y `users` (que además soporta lookup puntual de autenticación por `clerkId`).
 */
export const RLS_PROTECTED_TABLES: readonly RlsTableDefinition[] = [
  {
    tableName: "users",
    policyName: "users_tenant_isolation_policy",
    kind: "auth_controlled",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "warehouses",
    policyName: "warehouses_tenant_isolation_policy",
    kind: "direct_tenant_column",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "locations",
    policyName: "locations_tenant_isolation_policy",
    kind: "direct_tenant_column",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "products",
    policyName: "products_tenant_isolation_policy",
    kind: "direct_tenant_column",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "inventory_transactions",
    policyName: "inventory_transactions_tenant_isolation_policy",
    kind: "direct_tenant_column",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "inventory_balances",
    policyName: "inventory_balances_tenant_isolation_policy",
    kind: "direct_tenant_column",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "sales_orders",
    policyName: "sales_orders_tenant_isolation_policy",
    kind: "direct_tenant_column",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "order_lines",
    policyName: "order_lines_tenant_isolation_policy",
    kind: "parent_relation",
    parentTable: "sales_orders",
    foreignKeyColumn: "orderId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "warehouse_tasks",
    policyName: "warehouse_tasks_tenant_isolation_policy",
    kind: "direct_tenant_column",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "task_steps",
    policyName: "task_steps_tenant_isolation_policy",
    kind: "parent_relation",
    parentTable: "warehouse_tasks",
    foreignKeyColumn: "taskId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "idempotency_records",
    policyName: "idempotency_records_tenant_isolation_policy",
    kind: "direct_tenant_column",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
  {
    tableName: "categories",
    policyName: "categories_tenant_isolation_policy",
    kind: "direct_tenant_column",
    tenantColumn: "tenantId",
    enableRls: true,
    forceRls: true,
  },
] as const;

/**
 * Valida y normaliza un `tenantId` antes de inyectarlo en una sesión/transacción PostgreSQL.
 * Rechaza valores nulos, vacíos, demasiado largos o con caracteres potencialmente peligrosos.
 */
export function normalizeValidTenantId(tenantId: unknown): string {
  if (typeof tenantId !== "string") {
    throw new Error("Invalid tenantId: expected non-empty string");
  }
  const trimmed = tenantId.trim();
  if (!trimmed) {
    throw new Error("Invalid tenantId: tenantId cannot be empty");
  }
  if (!SAFE_TENANT_ID_REGEX.test(trimmed)) {
    throw new Error(
      `Invalid tenantId format: "${trimmed}". Must match ${SAFE_TENANT_ID_REGEX.source}`,
    );
  }
  return trimmed;
}

/**
 * Construye la lista ordenada e idempotente de sentencias SQL (`ALTER TABLE` + `DROP POLICY` + `CREATE POLICY`)
 * para habilitar `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` en todas las tablas multi-tenant.
 */
export function buildTenantRlsSqlStatements(): string[] {
  const statements: string[] = [];

  for (const def of RLS_PROTECTED_TABLES) {
    statements.push(`ALTER TABLE "${def.tableName}" ENABLE ROW LEVEL SECURITY`);
    statements.push(`ALTER TABLE "${def.tableName}" FORCE ROW LEVEL SECURITY`);
    statements.push(
      `DROP POLICY IF EXISTS "${def.policyName}" ON "${def.tableName}"`,
    );

    if (def.kind === "auth_controlled") {
      statements.push(
        [
          `CREATE POLICY "${def.policyName}" ON "${def.tableName}"`,
          `  FOR ALL`,
          `  USING (`,
          `    (`,
          `      NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '') IS NOT NULL`,
          `      AND "tenantId" = NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '')`,
          `    )`,
          `    OR (`,
          `      NULLIF(current_setting('${AUTH_CLERK_LOOKUP_GUC}', true), '') IS NOT NULL`,
          `      AND "clerkId" = NULLIF(current_setting('${AUTH_CLERK_LOOKUP_GUC}', true), '')`,
          `    )`,
          `  )`,
          `  WITH CHECK (`,
          `    NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '') IS NOT NULL`,
          `    AND "tenantId" = NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '')`,
          `  )`,
        ].join("\n"),
      );
    } else if (def.kind === "direct_tenant_column") {
      const col = def.tenantColumn ?? "tenantId";
      statements.push(
        [
          `CREATE POLICY "${def.policyName}" ON "${def.tableName}"`,
          `  FOR ALL`,
          `  USING (`,
          `    NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '') IS NOT NULL`,
          `    AND "${col}" = NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '')`,
          `  )`,
          `  WITH CHECK (`,
          `    NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '') IS NOT NULL`,
          `    AND "${col}" = NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '')`,
          `  )`,
        ].join("\n"),
      );
    } else {
      const parentTable = def.parentTable!;
      const fk = def.foreignKeyColumn!;
      statements.push(
        [
          `CREATE POLICY "${def.policyName}" ON "${def.tableName}"`,
          `  FOR ALL`,
          `  USING (`,
          `    NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '') IS NOT NULL`,
          `    AND EXISTS (`,
          `      SELECT 1`,
          `      FROM "${parentTable}" parent_ref`,
          `      WHERE parent_ref."id" = "${def.tableName}"."${fk}"`,
          `        AND parent_ref."tenantId" = NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '')`,
          `    )`,
          `  )`,
          `  WITH CHECK (`,
          `    NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '') IS NOT NULL`,
          `    AND EXISTS (`,
          `      SELECT 1`,
          `      FROM "${parentTable}" parent_ref`,
          `      WHERE parent_ref."id" = "${def.tableName}"."${fk}"`,
          `        AND parent_ref."tenantId" = NULLIF(current_setting('${TENANT_CONTEXT_GUC}', true), '')`,
          `    )`,
          `  )`,
        ].join("\n"),
      );
    }
  }

  return statements;
}

export interface RawSqlExecutor {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
}

/**
 * Aplica de forma idempotente todas las políticas RLS en una instancia PostgreSQL / Prisma.
 * Útil para entornos de integración, tests automatizados o bootstrap de base de datos.
 */
export async function applyTenantRlsPolicies(
  executor: RawSqlExecutor,
): Promise<{ appliedStatements: number; tables: string[] }> {
  const statements = buildTenantRlsSqlStatements();
  for (const sql of statements) {
    await executor.$executeRawUnsafe(sql);
  }
  return {
    appliedStatements: statements.length,
    tables: RLS_PROTECTED_TABLES.map((t) => t.tableName),
  };
}

/**
 * Evaluador determinista de la semántica exacta de las políticas RLS de PostgreSQL:
 * - Si `currentTenantId` es `null`, `undefined` o `""` (vacío o solo espacios):
 *   deniega acceso por defecto (`false`), salvo lectura en `users` cuando `authClerkId` coincide.
 * - En `WITH CHECK` (escrituras `INSERT` / `UPDATE`), siempre exige `currentTenantId` no vacío
 *   e igual al `rowTenantId` (o `parentTenantId` en tablas hijas).
 */
export function evaluateRlsPolicyPredicate(params: {
  tableName: string;
  operation: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  currentTenantId?: string | null | undefined;
  authClerkId?: string | null | undefined;
  rowTenantId?: string | null | undefined;
  rowClerkId?: string | null | undefined;
  parentTenantId?: string | null | undefined;
}): boolean {
  const def = RLS_PROTECTED_TABLES.find(
    (item) => item.tableName === params.tableName,
  );
  if (!def) {
    // La tabla `tenants` no tiene RLS para permitir resolución inicial de API Key
    return params.tableName === "tenants";
  }

  const activeTenant =
    typeof params.currentTenantId === "string" &&
    params.currentTenantId.length > 0
      ? params.currentTenantId
      : null;

  const activeAuthClerk =
    typeof params.authClerkId === "string" && params.authClerkId.length > 0
      ? params.authClerkId
      : null;

  const isWriteCheck =
    params.operation === "INSERT" || params.operation === "UPDATE";

  if (def.kind === "auth_controlled") {
    const matchesTenant =
      activeTenant !== null &&
      typeof params.rowTenantId === "string" &&
      params.rowTenantId === activeTenant;

    if (isWriteCheck) {
      return matchesTenant;
    }

    const matchesClerkLookup =
      activeAuthClerk !== null &&
      typeof params.rowClerkId === "string" &&
      params.rowClerkId === activeAuthClerk;

    return matchesTenant || matchesClerkLookup;
  }

  if (def.kind === "direct_tenant_column") {
    return (
      activeTenant !== null &&
      typeof params.rowTenantId === "string" &&
      params.rowTenantId === activeTenant
    );
  }

  // parent_relation (`order_lines` -> `sales_orders`, `task_steps` -> `warehouse_tasks`)
  return (
    activeTenant !== null &&
    typeof params.parentTenantId === "string" &&
    params.parentTenantId === activeTenant
  );
}

// ─────────────────────────────────────────────────────────────
// TRANSACCIONES CON CONTEXTO DE TENANT (SET LOCAL + REUTILIZACIÓN)
// ─────────────────────────────────────────────────────────────

export type TenantTransactionClient = Prisma.TransactionClient & {
  $queryRaw?: PrismaClient["$queryRaw"];
  $executeRaw?: PrismaClient["$executeRaw"];
};

export interface WithTenantContextOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel | undefined;
  timeout?: number | undefined;
  maxWait?: number | undefined;
  /**
   * Si se provee un `TransactionClient` existente, `withTenantContext` reutiliza
   * la transacción activa y verifica/establece `app.current_tenant_id` sin abrir
   * una transacción anidada incompatible.
   */
  existingTx?: TenantTransactionClient | undefined;
}

interface ActiveTenantStore {
  tenantId: string;
  tx: TenantTransactionClient;
}

const activeTenantStorage = new AsyncLocalStorage<ActiveTenantStore>();

/**
 * Obtiene el contexto de tenant activo en la pila asíncrona actual (si existe).
 */
export function getActiveTenantStore(): ActiveTenantStore | undefined {
  return activeTenantStorage.getStore();
}

async function applyLocalTenantGuc(
  tx: TenantTransactionClient,
  tenantId: string,
): Promise<void> {
  if (typeof tx.$queryRaw === "function") {
    await tx.$queryRaw`SELECT set_config(${TENANT_CONTEXT_GUC}, ${tenantId}, true)`;
    return;
  }
  if (typeof tx.$executeRaw === "function") {
    await tx.$executeRaw`SELECT set_config(${TENANT_CONTEXT_GUC}, ${tenantId}, true)`;
  }
}

function isTransactionClient(
  client: unknown,
): client is TenantTransactionClient {
  return (
    typeof client === "object" &&
    client !== null &&
    !("$transaction" in client && typeof (client as { $transaction?: unknown }).$transaction === "function")
  );
}

/**
 * Ejecuta `fn(tx)` dentro de una transacción PostgreSQL donde se ha fijado
 * `SELECT set_config('app.current_tenant_id', tenantId, true)` (`SET LOCAL`).
 *
 * - Al finalizar la transacción (`COMMIT` o `ROLLBACK`), PostgreSQL descarta
 *   automáticamente el valor de `app.current_tenant_id`, garantizando cero fugas
 *   en el pool de conexiones de Prisma.
 * - Soporta `IsolationLevel.Serializable` y `SELECT ... FOR UPDATE`.
 * - Soporta anidamiento transparente: si ya existe una transacción activa para el
 *   mismo `tenantId` (por `options.existingTx` o `AsyncLocalStorage`), reutiliza `tx`;
 *   si el `tenantId` anidado difiere del activo, rechaza inmediatamente para impedir
 *   contaminación cruzada entre tenants.
 */
export async function withTenantContext<T>(
  client: PrismaClient | TenantTransactionClient,
  tenantId: string,
  fn: (tx: TenantTransactionClient) => Promise<T>,
  options: WithTenantContextOptions = {},
): Promise<T> {
  const validTenantId = normalizeValidTenantId(tenantId);
  const ambientStore = activeTenantStorage.getStore();

  if (ambientStore && ambientStore.tenantId !== validTenantId) {
    throw new Error(
      `Tenant context mismatch: cannot switch active tenant "${ambientStore.tenantId}" to "${validTenantId}" inside the same transaction`,
    );
  }

  const reusableTx =
    options.existingTx ??
    (isTransactionClient(client) ? client : ambientStore?.tx);

  if (reusableTx) {
    await applyLocalTenantGuc(reusableTx, validTenantId);
    return await activeTenantStorage.run(
      { tenantId: validTenantId, tx: reusableTx },
      () => fn(reusableTx),
    );
  }

  const rootClient = client as PrismaClient;
  const txOptions: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    timeout?: number;
    maxWait?: number;
  } = {};

  if (options.isolationLevel !== undefined) {
    txOptions.isolationLevel = options.isolationLevel;
  }
  if (options.timeout !== undefined) {
    txOptions.timeout = options.timeout;
  }
  if (options.maxWait !== undefined) {
    txOptions.maxWait = options.maxWait;
  }

  return await rootClient.$transaction(
    async (tx) => {
      const typedTx = tx as TenantTransactionClient;
      await applyLocalTenantGuc(typedTx, validTenantId);
      return await activeTenantStorage.run(
        { tenantId: validTenantId, tx: typedTx },
        () => fn(typedTx),
      );
    },
    txOptions,
  );
}

/**
 * Camino controlado y acotado para el handshake inicial de autenticación JWT:
 * establece `SET LOCAL app.auth_clerk_id = <clerkId>` dentro de una transacción de solo lectura
 * para permitir resolver el registro `User` por `clerkId` cuando aún se desconoce el `tenantId`,
 * sin desactivar `FORCE ROW LEVEL SECURITY` en la tabla `users`.
 */
export async function withAuthClerkLookup<T>(
  client: PrismaClient | TenantTransactionClient,
  clerkId: string,
  fn: (tx: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  const validClerkId = normalizeValidTenantId(clerkId);

  if (isTransactionClient(client)) {
    if (typeof client.$queryRaw === "function") {
      await client.$queryRaw`SELECT set_config(${AUTH_CLERK_LOOKUP_GUC}, ${validClerkId}, true)`;
    }
    return await fn(client);
  }

  const rootClient = client as PrismaClient;
  if (typeof rootClient.$transaction !== "function") {
    return await fn(rootClient as unknown as TenantTransactionClient);
  }

  return await rootClient.$transaction(async (tx) => {
    const typedTx = tx as TenantTransactionClient;
    if (typeof typedTx.$queryRaw === "function") {
      await typedTx.$queryRaw`SELECT set_config(${AUTH_CLERK_LOOKUP_GUC}, ${validClerkId}, true)`;
    }
    return await fn(typedTx);
  });
}
