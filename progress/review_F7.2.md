# Reporte de Revisión: F7.2 — PostgreSQL Row Level Security (RLS) con `FORCE RLS` y Puerto `TenantContext`

- **VEREDICTO**: APPROVED
- **Fecha**: 2026-10-31

## Evaluación de Checkpoints
- [x] CP-1: Integridad del Inventory Ledger
- [x] CP-2: Aislamiento Multi-Tenant
- [x] CP-3: Contratos de API, Tipado y Monorepo
- [x] CP-4: Verificación Automatizada y Cobertura (>= 80%)
- [x] CP-5: Arquitectura Hexagonal, Puertos y Criterios de Hecho

## Resumen de Auditoría
1. **CP-1 (Integridad del Inventory Ledger)**:
   - Se mantiene intacta la inmutabilidad *append-only* de `inventory_transactions`, el aislamiento `IsolationLevel.Serializable` y los bloqueos pesimistas `SELECT ... FOR UPDATE` en `moveStock`, `allocateOrder`, `cancelOrder`, `createPutawayTask` y `handlePickingException`.
   - La reutilización transparente del `TransactionClient` activo (`params.tx` o `getAmbientTenantScope`) permite ejecutar operaciones del Ledger dentro de `withTenantContext` sin abrir sub-transacciones anidadas conflictivas y abortando inmediatamente con `WmsError("TENANT_MISMATCH", ..., 403)` si los `tenantId` difieren.
2. **CP-2 (Aislamiento Multi-Tenant y Políticas RLS)**:
   - La migración `packages/db/prisma/migrations/20261031010000_tenant_rls/migration.sql` y el generador `buildTenantRlsSqlStatements` habilitan `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` con cláusulas `USING` y `WITH CHECK` en las 10 tablas con datos de tenant (`users`, `warehouses`, `locations`, `products`, `inventory_transactions`, `inventory_balances`, `sales_orders`, `order_lines`, `warehouse_tasks`, `task_steps`).
   - Denegación por defecto verificada: cuando `current_setting('app.current_tenant_id', true)` es `NULL` o `''`, `NULLIF(..., '') IS NOT NULL` evalúa a `FALSE` tanto en lecturas como en escrituras.
   - `withTenantContext` utiliza `SELECT set_config('app.current_tenant_id', tenantId, true)` (`SET LOCAL`), garantizando reversión automática al finalizar la transacción (`COMMIT` o `ROLLBACK`) y cero contaminación en el pool de conexiones de Prisma.
3. **CP-3 (Contratos, Tipado y Monorepo)**:
   - `@wms/shared-types` define `TENANT_CONTEXT_GUC`, `AUTH_CLERK_LOOKUP_GUC`, `TenantIsolationLevel`, `TenantContextOptions` y `RlsTablePolicySpec` sin depender de `@prisma/client` ni `@wms/db`.
   - `pnpm build` compila los 5 paquetes sin errores bajo `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`, respetando extensiones `.js` en ESM.
4. **CP-4 (Verificación Automatizada y Cobertura)**:
   - `pnpm test` pasa las 17 suites (171 tests en total: 137 en `@wms/api`, 11 en `@wms/web`, 23 en `@wms/mobile`).
   - `pnpm --filter @wms/api test:coverage` alcanza `99.20%` statements/lines (`100%` en `use-cases/security/tenant-context.ts` y `use-cases/inventory/move-stock.ts`), `90.74%` branches y `100%` functions.
   - La suite `apps/api/src/use-cases/security/__tests__/tenant-context.test.ts` (16 tests) cubre Happy Path, Casos Borde, Errores `WmsError` (incluyendo intentos de inyección SQL/GUC), Rollback y Aislamiento Multi-Tenant.
5. **CP-5 (Arquitectura Hexagonal y ADR)**:
   - El puerto `TenantContextPort` (`apps/api/src/ports/tenant-context.ts`) y los casos de uso en `apps/api/src/use-cases/security/tenant-context.ts` están completamente desacoplados de Fastify y Prisma, inyectando `PrismaTenantContextAdapter` (`apps/api/src/adapters/prisma-tenant-context.ts`) en el borde (`server.ts`).
   - El ADR `docs/adr/002-postgresql-rls-and-tenant-context.md` documenta de forma clara el diseño de `FORCE RLS`, `SET LOCAL`, la compatibilidad con `Serializable` + `SELECT ... FOR UPDATE` y el handshake inicial de autenticación.

## Hallazgos / Correcciones Requeridas (si aplica)
Ninguno. Implementación aprobada sin observaciones pendientes.
