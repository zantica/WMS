// apps/api/src/use-cases/security/__tests__/tenant-context.test.ts
// Suite exhaustiva de tests unitarios y de integración de políticas RLS (F7.2):
// 1. Happy Path: executeInTenantContext, PrismaTenantContextAdapter y withTenantContext con SET LOCAL.
// 2. Casos Borde (Edge Cases): trim de espacios, longitud máxima exacta (128), caracteres permitidos (: . _ -),
//    anidamiento de withTenantContext en el mismo tenant sin abrir sub-transacciones redundantes.
// 3. Errores de Dominio y Validación: WmsError ante tenantId vacío, nulo, solo espacios, >128 chars,
//    intentos de inyección SQL/GUC, timeoutMs/maxWaitMs inválidos y assertTenantOwnership.
// 4. Fallos, Limpieza y Aislamiento Multi-Tenant: limpieza automática tras rollback/excepción,
//    bloqueo de cambio de tenant en transacción anidada (TENANT_MISMATCH), compatibilidad con
//    moveStock / allocateOrder / cancelOrder / handlePickingException / createPutawayTask,
//    verificación de la migración SQL de RLS (ENABLE + FORCE RLS + USING + WITH CHECK)
//    y simulación/integración del aislamiento Tenant A vs Tenant B y denegación sin contexto.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AUTH_CLERK_LOOKUP_GUC,
  RLS_PROTECTED_TABLES,
  TENANT_CONTEXT_GUC,
  applyTenantRlsPolicies,
  buildTenantRlsSqlStatements,
  evaluateRlsPolicyPredicate,
  getActiveTenantStore,
  normalizeValidTenantId,
  withAuthClerkLookup,
  type PrismaClient,
  type TenantTransactionClient,
} from "@wms/db";
import {
  PrismaTenantContextAdapter,
  withTenantContext,
} from "../../../adapters/prisma-tenant-context.js";
import { WmsError } from "../../../plugins/error-handler.js";
import type {
  TenantContextPort,
  TenantScopedWork,
} from "../../../ports/tenant-context.js";
import {
  assertTenantOwnership,
  executeInTenantContext,
  getAmbientTenantScope,
  validateTenantId,
} from "../tenant-context.js";
import { moveStock } from "../../inventory/move-stock.js";
import { allocateOrder } from "../../inventory/allocate-order.js";
import { cancelOrder } from "../../inventory/cancel-order.js";
import { createPutawayTask } from "../../inventory/create-putaway-task.js";
import { handlePickingException } from "../../inventory/handle-picking-exception.js";

/**
 * Fake hexagonal en memoria del puerto `TenantContextPort` para pruebas unitarias puras.
 */
class FakeTenantContextPort implements TenantContextPort<{ tenantId: string }> {
  private currentTenantId: string | null = null;
  public readonly history: Array<{
    tenantId: string;
    isolationLevel?: string | undefined;
  }> = [];

  async runWithTenant<TResult>(
    tenantId: string,
    work: TenantScopedWork<TResult, { tenantId: string }>,
    options?: { isolationLevel?: string | undefined },
  ): Promise<TResult> {
    if (this.currentTenantId !== null && this.currentTenantId !== tenantId) {
      throw new WmsError(
        "TENANT_MISMATCH",
        `Tenant switch forbidden (${this.currentTenantId} -> ${tenantId})`,
        403,
      );
    }

    const previous = this.currentTenantId;
    this.currentTenantId = tenantId;
    this.history.push({
      tenantId,
      isolationLevel: options?.isolationLevel,
    });

    try {
      return await work({ tenantId });
    } finally {
      this.currentTenantId = previous;
    }
  }

  getCurrentTenantId(): string | null {
    return this.currentTenantId;
  }
}

/**
 * Crea un cliente Prisma simulado que registra todas las llamadas a `$transaction`
 * y las sentencias `SELECT set_config('app.current_tenant_id', ..., true)`.
 */
function createFakePrismaClient() {
  const gucCalls: Array<{ name: string; value: string; isLocal: boolean }> = [];
  const transactionOptionsCalls: Array<Record<string, unknown>> = [];

  const mockTx = {
    $queryRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const rawSql = strings.join("?");
        if (rawSql.includes("set_config")) {
          gucCalls.push({
            name: String(values[0] ?? ""),
            value: String(values[1] ?? ""),
            isLocal: true,
          });
          return [{ set_config: values[1] }];
        }
        return [];
      },
    ),
    $executeRaw: vi.fn(async () => 1),
    inventoryBalance: {
      update: vi.fn(async () => ({})),
      upsert: vi.fn(async () => ({})),
    },
    inventoryTransaction: {
      create: vi.fn(async () => ({ id: "tx-1" })),
    },
  } as unknown as TenantTransactionClient;

  const client = {
    $transaction: vi.fn(
      async <T>(
        fn: (tx: TenantTransactionClient) => Promise<T>,
        options?: Record<string, unknown>,
      ): Promise<T> => {
        transactionOptionsCalls.push(options ?? {});
        return await fn(mockTx);
      },
    ),
  } as unknown as PrismaClient;

  return {
    client,
    mockTx,
    gucCalls,
    transactionOptionsCalls,
  };
}

describe("F7.2 — TenantContextPort, withTenantContext y PostgreSQL FORCE RLS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. HAPPY PATH
  // ──────────────────────────────────────────────────────────────────────────
  describe("1. Happy Path — Ejecución con contexto de tenant y SET LOCAL", () => {
    it("ejecuta trabajo a través del puerto TenantContextPort y restaura el estado al finalizar", async () => {
      const fakePort = new FakeTenantContextPort();

      expect(fakePort.getCurrentTenantId()).toBeNull();

      const result = await executeInTenantContext({
        tenantContext: fakePort,
        tenantId: "tenant-alpha-01",
        options: { isolationLevel: "Serializable", timeoutMs: 10_000 },
        work: async (scope) => {
          expect(scope.tenantId).toBe("tenant-alpha-01");
          expect(fakePort.getCurrentTenantId()).toBe("tenant-alpha-01");
          return "completed-ok";
        },
      });

      expect(result).toBe("completed-ok");
      expect(fakePort.getCurrentTenantId()).toBeNull();
      expect(fakePort.history).toEqual([
        { tenantId: "tenant-alpha-01", isolationLevel: "Serializable" },
      ]);
    });

    it("PrismaTenantContextAdapter configura SET LOCAL app.current_tenant_id dentro de la transacción y propaga Serializable", async () => {
      const { client, gucCalls, transactionOptionsCalls } =
        createFakePrismaClient();
      const adapter = new PrismaTenantContextAdapter(client);

      expect(adapter.getCurrentTenantId()).toBeNull();

      const output = await adapter.runWithTenant(
        "tenant-prod-99",
        async () => {
          expect(adapter.getCurrentTenantId()).toBe("tenant-prod-99");
          expect(getActiveTenantStore()?.tenantId).toBe("tenant-prod-99");
          return { rowsUpdated: 3 };
        },
        {
          isolationLevel: "Serializable",
          timeoutMs: 15_000,
          maxWaitMs: 5_000,
        },
      );

      expect(output).toEqual({ rowsUpdated: 3 });
      expect(adapter.getCurrentTenantId()).toBeNull();
      expect(getActiveTenantStore()).toBeUndefined();
      expect(gucCalls).toEqual([
        {
          name: TENANT_CONTEXT_GUC,
          value: "tenant-prod-99",
          isLocal: true,
        },
      ]);
      expect(transactionOptionsCalls[0]).toEqual({
        isolationLevel: "Serializable",
        timeout: 15_000,
        maxWait: 5_000,
      });
    });

    it("assertTenantOwnership permite el acceso cuando el tenant del recurso coincide", () => {
      expect(() =>
        assertTenantOwnership("tenant-1", "tenant-1", "SalesOrder"),
      ).not.toThrow();
      expect(() =>
        assertTenantOwnership("  tenant-1 ", "tenant-1", "Product"),
      ).not.toThrow();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CASOS BORDE (EDGE CASES)
  // ──────────────────────────────────────────────────────────────────────────
  describe("2. Casos Borde — Formatos límite, trim y transacciones anidadas", () => {
    it("normaliza espacios al principio/final y acepta longitud máxima exacta de 128 caracteres", () => {
      expect(validateTenantId("   tenant_01:sub.org-a   ")).toBe(
        "tenant_01:sub.org-a",
      );

      const maxLenTenantId = "t".repeat(128);
      expect(validateTenantId(maxLenTenantId)).toBe(maxLenTenantId);
      expect(normalizeValidTenantId(maxLenTenantId)).toBe(maxLenTenantId);
    });

    it("reutiliza el TransactionClient existente cuando withTenantContext se anida para el mismo tenant sin abrir otra transacción", async () => {
      const { client, gucCalls, transactionOptionsCalls } =
        createFakePrismaClient();

      const res = await withTenantContext(
        client,
        "tenant-nested",
        async (outerTx) => {
          const innerResult = await withTenantContext(
            client,
            "tenant-nested",
            async (innerTx) => {
              expect(innerTx).toBe(outerTx);
              return 42;
            },
          );
          return innerResult + 1;
        },
        { isolationLevel: "Serializable" },
      );

      expect(res).toBe(43);
      // Solo se abrió UNA transacción raíz en Prisma
      expect(transactionOptionsCalls).toHaveLength(1);
      expect(gucCalls.every((c) => c.value === "tenant-nested")).toBe(true);
    });

    it("acepta un TransactionClient explícito mediante options.existingTx o como primer argumento", async () => {
      const { mockTx, gucCalls } = createFakePrismaClient();

      const directResult = await withTenantContext(
        mockTx,
        "tenant-direct-tx",
        async (tx) => {
          expect(tx).toBe(mockTx);
          return "ok-direct";
        },
      );

      expect(directResult).toBe("ok-direct");
      expect(gucCalls).toEqual([
        {
          name: TENANT_CONTEXT_GUC,
          value: "tenant-direct-tx",
          isLocal: true,
        },
      ]);
    });

    it("withAuthClerkLookup establece SET LOCAL app.auth_clerk_id de forma aislada para resolución de usuario en auth", async () => {
      const { client, mockTx } = createFakePrismaClient();

      const userId = await withAuthClerkLookup(
        client,
        "clerk_user_abc123",
        async (tx) => {
          expect(tx).toBe(mockTx);
          return "user-db-99";
        },
      );

      expect(userId).toBe("user-db-99");
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. ERRORES DE DOMINIO Y VALIDACIÓN
  // ──────────────────────────────────────────────────────────────────────────
  describe("3. Errores de Dominio y Validación (WmsError)", () => {
    it("rechaza tenantId vacío, nulo, undefined o solo espacios con WmsError VALIDATION_ERROR (400)", async () => {
      const invalidInputs: unknown[] = ["", "   ", "\t\n", null, undefined, 123, {}];

      for (const bad of invalidInputs) {
        expect(() => validateTenantId(bad)).toThrow(WmsError);
        try {
          validateTenantId(bad);
        } catch (err) {
          expect(err).toBeInstanceOf(WmsError);
          expect((err as WmsError).code).toBe("VALIDATION_ERROR");
          expect((err as WmsError).statusCode).toBe(400);
        }
      }
    });

    it("rechaza tenantId que supera 128 caracteres o contiene payloads de inyección SQL/GUC", () => {
      const tooLong = "a".repeat(129);
      expect(() => validateTenantId(tooLong)).toThrow(
        "tenantId exceeds maximum length of 128 characters",
      );

      const injectionPayloads = [
        "tenant-1'; SET ROLE postgres; --",
        "tenant-1 OR 1=1",
        "tenant-1\nSET app.current_tenant_id = 'other'",
        "tenant/../../etc",
        "tenant$1",
      ];

      for (const payload of injectionPayloads) {
        expect(() => validateTenantId(payload)).toThrow(WmsError);
        expect(() => validateTenantId(payload)).toThrow(
          "tenantId contains invalid or unsafe characters",
        );
      }
    });

    it("rechaza timeoutMs o maxWaitMs no positivos en executeInTenantContext", async () => {
      const fakePort = new FakeTenantContextPort();

      await expect(
        executeInTenantContext({
          tenantContext: fakePort,
          tenantId: "tenant-1",
          options: { timeoutMs: 0 },
          work: async () => "never",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });

      await expect(
        executeInTenantContext({
          tenantContext: fakePort,
          tenantId: "tenant-1",
          options: { maxWaitMs: -50 },
          work: async () => "never",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    });

    it("assertTenantOwnership lanza TENANT_MISMATCH (403) cuando el recurso pertenece a otro tenant o carece de tenantId", () => {
      expect(() =>
        assertTenantOwnership("tenant-a", "tenant-b", "InventoryBalance"),
      ).toThrow(WmsError);

      try {
        assertTenantOwnership("tenant-a", "tenant-b", "InventoryBalance");
      } catch (err) {
        expect((err as WmsError).code).toBe("TENANT_MISMATCH");
        expect((err as WmsError).statusCode).toBe(403);
      }

      expect(() =>
        assertTenantOwnership("tenant-a", "", "WarehouseTask"),
      ).toThrow(WmsError);
      expect(() =>
        assertTenantOwnership("tenant-a", null, "WarehouseTask"),
      ).toThrow(WmsError);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. FALLOS, ROLLBACK, AISLAMIENTO MULTI-TENANT Y POLÍTICAS RLS SQL
  // ──────────────────────────────────────────────────────────────────────────
  describe("4. Fallos, Limpieza en Rollback y Aislamiento Cruzado Multi-Tenant (RLS)", () => {
    it("limpia el contexto activo si el bloque dentro de withTenantContext lanza una excepción (rollback)", async () => {
      const { client } = createFakePrismaClient();
      const adapter = new PrismaTenantContextAdapter(client);

      await expect(
        adapter.runWithTenant("tenant-rollback", async () => {
          expect(adapter.getCurrentTenantId()).toBe("tenant-rollback");
          throw new WmsError("INSUFFICIENT_STOCK", "Simulated stock failure", 409);
        }),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK",
        statusCode: 409,
      });

      // Tras el rollback, el contexto no puede quedar adherido a la instancia ni al AsyncLocalStorage
      expect(adapter.getCurrentTenantId()).toBeNull();
      expect(getActiveTenantStore()).toBeUndefined();

      // Una petición posterior de otro tenant puede ejecutarse limpiamente
      const nextTenantResult = await adapter.runWithTenant(
        "tenant-clean-next",
        async () => adapter.getCurrentTenantId(),
      );
      expect(nextTenantResult).toBe("tenant-clean-next");
    });

    it("bloquea con TENANT_MISMATCH (403) cualquier intento de cambiar de Tenant A a Tenant B dentro de una transacción activa", async () => {
      const { client } = createFakePrismaClient();
      const adapter = new PrismaTenantContextAdapter(client);
      const fakePort = new FakeTenantContextPort();

      const mockPortWithPreExistingTenant: TenantContextPort<string> = {
        getCurrentTenantId: () => "tenant-a",
        runWithTenant: async (_t, work) => await work("scope"),
      };

      await expect(
        executeInTenantContext({
          tenantContext: mockPortWithPreExistingTenant,
          tenantId: "tenant-b",
          work: async () => "leaked",
        }),
      ).rejects.toMatchObject({
        code: "TENANT_MISMATCH",
        statusCode: 403,
      });

      await expect(
        adapter.runWithTenant("tenant-a", async () => {
          return await adapter.runWithTenant("tenant-b", async () => "leaked");
        }),
      ).rejects.toMatchObject({
        code: "TENANT_MISMATCH",
        statusCode: 403,
      });

      expect(adapter.getCurrentTenantId()).toBeNull();
    });

    it("permite ejecutar moveStock, allocateOrder, cancelOrder, createPutawayTask y handlePickingException reutilizando la transacción activa y bloquea si el tenant difiere", async () => {
      const { client, mockTx, transactionOptionsCalls } =
        createFakePrismaClient();

      await withTenantContext(
        client,
        "tenant-ledger-1",
        async () => {
          expect(getAmbientTenantScope()?.tenantId).toBe("tenant-ledger-1");
          await moveStock({
            tenantId: "tenant-ledger-1",
            productId: "prod-1",
            toLocationId: "loc-recv",
            quantity: 10,
            reason: "INBOUND_RECEIPT",
          });
        },
        { isolationLevel: "Serializable" },
      );

      expect(transactionOptionsCalls).toHaveLength(1);
      expect(mockTx.inventoryBalance.upsert).toHaveBeenCalledTimes(1);
      expect(mockTx.inventoryTransaction.create).toHaveBeenCalledTimes(1);

      // Si dentro de una transacción de tenant-ledger-1 se invoca cualquier caso de uso del Ledger
      // con tenant-other, lanza inmediatamente TENANT_MISMATCH (403)
      await expect(
        withTenantContext(client, "tenant-ledger-1", async () => {
          await moveStock({
            tenantId: "tenant-other",
            productId: "prod-1",
            toLocationId: "loc-recv",
            quantity: 5,
            reason: "INBOUND_RECEIPT",
          });
        }),
      ).rejects.toMatchObject({
        code: "TENANT_MISMATCH",
        statusCode: 403,
      });

      await expect(
        withTenantContext(client, "tenant-ledger-1", async () => {
          await allocateOrder({
            orderId: "ord-1",
            tenantId: "tenant-other",
          });
        }),
      ).rejects.toMatchObject({
        code: "TENANT_MISMATCH",
        statusCode: 403,
      });

      await expect(
        withTenantContext(client, "tenant-ledger-1", async () => {
          await cancelOrder({
            orderId: "ord-1",
            tenantId: "tenant-other",
          });
        }),
      ).rejects.toMatchObject({
        code: "TENANT_MISMATCH",
        statusCode: 403,
      });

      await expect(
        withTenantContext(client, "tenant-ledger-1", async () => {
          await createPutawayTask({
            receivingTaskId: "task-1",
            tenantId: "tenant-other",
          });
        }),
      ).rejects.toMatchObject({
        code: "TENANT_MISMATCH",
        statusCode: 403,
      });

      await expect(
        withTenantContext(client, "tenant-ledger-1", async () => {
          await handlePickingException({
            taskId: "task-1",
            stepId: "step-1",
            tenantId: "tenant-other",
          });
        }),
      ).rejects.toMatchObject({
        code: "TENANT_MISMATCH",
        statusCode: 403,
      });
    });

    it("verifica que las migraciones SQL y buildTenantRlsSqlStatements cubren todas las tablas con ENABLE + FORCE ROW LEVEL SECURITY", async () => {
      const basePath = process.cwd().includes("apps")
        ? "../../packages/db/prisma/migrations"
        : "packages/db/prisma/migrations";
      const migrationPath1 = resolve(
        process.cwd(),
        basePath,
        "20261031010000_tenant_rls/migration.sql",
      );
      const migrationPath2 = resolve(
        process.cwd(),
        basePath,
        "20261110120000_idempotency_records/migration.sql",
      );
      const migrationPath3 = resolve(
        process.cwd(),
        basePath,
        "20261113010000_catalog_categories/migration.sql",
      );
      const migrationSql =
        readFileSync(migrationPath1, "utf8") +
        "\n" +
        readFileSync(migrationPath2, "utf8") +
        "\n" +
        readFileSync(migrationPath3, "utf8");
      const generatedStatements = buildTenantRlsSqlStatements();

      const expectedTables = [
        "users",
        "warehouses",
        "locations",
        "products",
        "inventory_transactions",
        "inventory_balances",
        "sales_orders",
        "order_lines",
        "warehouse_tasks",
        "task_steps",
        "idempotency_records",
        "categories",
      ];

      expect(RLS_PROTECTED_TABLES.map((t) => t.tableName)).toEqual(
        expectedTables,
      );

      for (const table of expectedTables) {
        expect(migrationSql).toContain(
          `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`,
        );
        expect(migrationSql).toContain(
          `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`,
        );
        expect(
          generatedStatements.some(
            (s) => s === `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
          ),
        ).toBe(true);
        expect(
          generatedStatements.some(
            (s) => s === `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
          ),
        ).toBe(true);
      }

      // Verifica que applyTenantRlsPolicies ejecuta todas las sentencias en orden
      const executedSql: string[] = [];
      const applyResult = await applyTenantRlsPolicies({
        $executeRawUnsafe: async (query: string) => {
          executedSql.push(query);
          return 0;
        },
      });

      expect(applyResult.tables).toEqual(expectedTables);
      expect(applyResult.appliedStatements).toBe(generatedStatements.length);
      expect(executedSql).toEqual(generatedStatements);
    });

    it("garantiza denegación por defecto cuando app.current_tenant_id es NULL o '' y aislamiento estricto Tenant A vs Tenant B", () => {
      // 1. Sin contexto (NULL o cadena vacía ''): TODA tabla protegida deniega SELECT e INSERT
      for (const table of RLS_PROTECTED_TABLES) {
        expect(
          evaluateRlsPolicyPredicate({
            tableName: table.tableName,
            operation: "SELECT",
            currentTenantId: null,
            rowTenantId: "tenant-a",
            parentTenantId: "tenant-a",
          }),
        ).toBe(false);

        expect(
          evaluateRlsPolicyPredicate({
            tableName: table.tableName,
            operation: "SELECT",
            currentTenantId: "",
            rowTenantId: "tenant-a",
            parentTenantId: "tenant-a",
          }),
        ).toBe(false);

        expect(
          evaluateRlsPolicyPredicate({
            tableName: table.tableName,
            operation: "INSERT",
            currentTenantId: "",
            rowTenantId: "tenant-a",
            parentTenantId: "tenant-a",
          }),
        ).toBe(false);
      }

      // 2. Contexto activo = tenant-a: permite filas de tenant-a, bloquea filas de tenant-b (USING & WITH CHECK)
      for (const table of RLS_PROTECTED_TABLES) {
        expect(
          evaluateRlsPolicyPredicate({
            tableName: table.tableName,
            operation: "SELECT",
            currentTenantId: "tenant-a",
            rowTenantId: "tenant-a",
            parentTenantId: "tenant-a",
          }),
        ).toBe(true);

        expect(
          evaluateRlsPolicyPredicate({
            tableName: table.tableName,
            operation: "SELECT",
            currentTenantId: "tenant-a",
            rowTenantId: "tenant-b",
            parentTenantId: "tenant-b",
          }),
        ).toBe(false);

        // Bloqueo de INSERT/UPDATE con tenant_id ajeno (WITH CHECK)
        expect(
          evaluateRlsPolicyPredicate({
            tableName: table.tableName,
            operation: "INSERT",
            currentTenantId: "tenant-a",
            rowTenantId: "tenant-b",
            parentTenantId: "tenant-b",
          }),
        ).toBe(false);

        expect(
          evaluateRlsPolicyPredicate({
            tableName: table.tableName,
            operation: "UPDATE",
            currentTenantId: "tenant-a",
            rowTenantId: "tenant-b",
            parentTenantId: "tenant-b",
          }),
        ).toBe(false);
      }

      // 3. Resolución inicial de auth: `users` permite SELECT puntual por `app.auth_clerk_id`,
      //    pero NUNCA permite INSERT/UPDATE sin `app.current_tenant_id` coincidente
      expect(
        evaluateRlsPolicyPredicate({
          tableName: "users",
          operation: "SELECT",
          currentTenantId: null,
          authClerkId: "clerk_123",
          rowClerkId: "clerk_123",
          rowTenantId: "tenant-a",
        }),
      ).toBe(true);

      expect(
        evaluateRlsPolicyPredicate({
          tableName: "users",
          operation: "SELECT",
          currentTenantId: null,
          authClerkId: "clerk_123",
          rowClerkId: "clerk_other",
          rowTenantId: "tenant-b",
        }),
      ).toBe(false);

      expect(
        evaluateRlsPolicyPredicate({
          tableName: "users",
          operation: "UPDATE",
          currentTenantId: null,
          authClerkId: "clerk_123",
          rowClerkId: "clerk_123",
          rowTenantId: "tenant-a",
        }),
      ).toBe(false);
    });
  });
});
