# Reporte de Implementación: F7.2 — PostgreSQL Row Level Security (RLS) con `FORCE RLS` y Puerto `TenantContext`

- **Estado**: DONE
- **Fecha**: 2026-10-31

## Archivos Creados / Modificados

- `packages/shared-types/src/index.ts`: Se añadieron las constantes canónicas `TENANT_CONTEXT_GUC = "app.current_tenant_id"` y `AUTH_CLERK_LOOKUP_GUC = "app.auth_clerk_id"`, el tipo `TenantIsolationLevel` y los contratos `TenantContextOptions` y `RlsTablePolicySpec`.
- `packages/db/prisma/migrations/20261031010000_tenant_rls/migration.sql`: Migración SQL versionada que habilita `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` junto con políticas `USING` y `WITH CHECK` en las 10 tablas multi-tenant (`users`, `warehouses`, `locations`, `products`, `inventory_transactions`, `inventory_balances`, `sales_orders`, `order_lines`, `warehouse_tasks`, `task_steps`).
- `packages/db/src/rls.ts` y `packages/db/src/index.ts`: Catálogo `RLS_PROTECTED_TABLES`, generador/ejecutor idempotente `buildTenantRlsSqlStatements` / `applyTenantRlsPolicies`, evaluador determinista `evaluateRlsPolicyPredicate`, helper transaccional `withTenantContext` con `SELECT set_config('app.current_tenant_id', tenantId, true)` (`SET LOCAL`) y helper `withAuthClerkLookup` para resolución inicial de auth.
- `apps/api/src/ports/tenant-context.ts`: Definición del puerto hexagonal `TenantContextPort` (`runWithTenant`, `getCurrentTenantId`) desacoplado de Fastify y Prisma.
- `apps/api/src/use-cases/security/tenant-context.ts`: Casos de uso y validadores de dominio (`validateTenantId`, `assertTenantOwnership`, `executeInTenantContext`, `runWithAmbientTenantScope`, `getAmbientTenantScope`) con errores tipados `WmsError`.
- `apps/api/src/adapters/prisma-tenant-context.ts`: Adaptador concreto `PrismaTenantContextAdapter` y helper `withTenantContext` en `@wms/api` compatible con `IsolationLevel.Serializable`, `SELECT ... FOR UPDATE` y reutilización de `TransactionClient`.
- `apps/api/src/plugins/auth.ts` y `apps/api/src/server.ts`: Función controlada `lookupUserByClerkIdForAuth` con `SET LOCAL app.auth_clerk_id` para el handshake inicial de JWT y decoración de `app.tenantContext` en Fastify.
- `apps/api/src/use-cases/inventory/move-stock.ts`, `allocate-order.ts`, `cancel-order.ts`, `create-putaway-task.ts`, `handle-picking-exception.ts`: Soporte de reutilización transparente de un `TransactionClient` existente (vía `params.tx` o alcance activo de `withTenantContext`) y rechazo inmediato con `WmsError("TENANT_MISMATCH", ..., 403)` ante discrepancia de `tenantId`.
- `docs/adr/002-postgresql-rls-and-tenant-context.md`: ADR documentando el diseño de `FORCE ROW LEVEL SECURITY`, `SET LOCAL` con `set_config(..., true)`, la convivencia con `Serializable` + `SELECT ... FOR UPDATE` y la resolución inicial de autenticación.
- `apps/api/src/use-cases/security/__tests__/tenant-context.test.ts`: Suite de 16 tests unitarios y de integración de políticas RLS (Happy Path, Casos Borde, Errores `WmsError`, Rollback, anidamiento con casos de uso del Ledger y verificación de políticas SQL).

## Decisiones de Diseño e Invariantes

- **Defensa en Profundidad con Denegación por Defecto (`FORCE RLS`)**: Todas las políticas RLS evalúan `NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL AND ...`. Si la variable de sesión es `NULL` o `''`, tanto `USING` como `WITH CHECK` evalúan a `FALSE`, impidiendo cualquier lectura o escritura sin contexto válido.
- **Cero Contaminación en el Pool de Conexiones (`SET LOCAL`)**: `withTenantContext` aplica `SELECT set_config('app.current_tenant_id', tenantId, true)` dentro de la transacción interactiva, de modo que PostgreSQL revierte automáticamente el ajuste al hacer `COMMIT` o `ROLLBACK`.
- **Inmutabilidad y Concurrencia del Ledger**: Los casos de uso `moveStock`, `allocateOrder`, `cancelOrder`, `createPutawayTask` y `handlePickingException` mantienen transacciones `Serializable`, bloqueos `SELECT ... FOR UPDATE` e inmutabilidad *append-only* en `inventory_transactions`, pudiendo ejecutarse dentro de `withTenantContext` sin abrir sub-transacciones conflictivas.

## Resultados de Verificación

- `pnpm build`: OK (5/5 paquetes compilados sin errores: `@wms/shared-types`, `@wms/db`, `@wms/api`, `@wms/web`, `@wms/mobile`).
- `pnpm test`: OK (17 suites pasadas, 171 tests en total: 137 en `@wms/api`, 11 en `@wms/web`, 23 en `@wms/mobile`).
- `pnpm --filter @wms/api test:coverage`: 137 tests passed, coverage `99.20%` statements/lines (`100%` en `security/tenant-context.ts`), `90.74%` branches, `100%` functions.
