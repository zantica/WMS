# Reporte de Implementación: DOM-2 — Adopción de `@wms/domain` en `@wms/api`
- **Estado**: DONE
- **Fecha**: 2026-11-11

## Archivos Creados / Modificados / Eliminados
### Dependencias y Contratos
- `apps/api/package.json` y `pnpm-lock.yaml`: añadida dependencia `"@wms/domain": "workspace:*"` y enlazado vía `pnpm install`.
- `apps/api/src/shared/domain-error-mapper.ts` (nuevo): mapeo `DomainError -> WmsError` conservando códigos públicos (`VALIDATION_ERROR`, `INSUFFICIENT_STOCK`, `TASK_NOT_FOUND`, `ORDER_ALREADY_ALLOCATED`) y códigos HTTP actuales.

### Puertos (`apps/api/src/ports/`)
- `apps/api/src/ports/inventory-repository.ts` (nuevo): `InventoryRepository` (`findBalanceForUpdate`, `findStorageBalancesForUpdate`, `saveBalance`, `recordTransaction` append-only, `findLocation`, `findLocationByType`).
- `apps/api/src/ports/order-repository.ts` (nuevo): `OrderRepository` (`findById`, `updateStatus`, `incrementPickedQty`, `findActivePickingTasks`).
- `apps/api/src/ports/task-repository.ts` (nuevo): `TaskRepository` (`findById`, `create`, `addStep`, `save` reconstruyendo `WarehouseTask` y `TaskStep`).
- `apps/api/src/ports/unit-of-work.ts` (nuevo): `UnitOfWork` y `UnitOfWorkRepositories`.

### Adaptadores (`apps/api/src/adapters/`)
- `apps/api/src/adapters/prisma-inventory-repository.ts` (nuevo): preserva `SELECT ... FOR UPDATE`, `FOR UPDATE OF ib`, `ORDER BY l.code ASC`, filtro explícito por `tenantId` (`updateMany` en balances cargados / `upsert` en nuevos) y Ledger inmutable.
- `apps/api/src/adapters/prisma-order-repository.ts` (nuevo): consultas y actualizaciones acotadas por `tenantId`.
- `apps/api/src/adapters/prisma-task-repository.ts` (nuevo): reconstruye `WarehouseTask` + `TaskStep`, actualiza por `tenantId` (`updateMany`) y valida pertenencia al añadir pasos.
- `apps/api/src/adapters/prisma-unit-of-work.ts` (nuevo): envuelve `withTenantContext` (RLS `SET LOCAL app.current_tenant_id`), `IsolationLevel.Serializable` y reutilización de `AsyncLocalStorage` / `tx` explícito.
- `apps/api/src/adapters/in-memory-inventory-repository.ts`, `in-memory-order-repository.ts`, `in-memory-task-repository.ts`, `in-memory-unit-of-work.ts` (nuevos): adaptadores en memoria (LSP) con snapshot/rollback completo y aislamiento multi-tenant.

### Casos de Uso Refactorizados (sin importar `@wms/db` ni Prisma)
- `apps/api/src/use-cases/inventory/move-stock.ts`: usa `Quantity.positive`, `InventoryBalance.withdraw` (`qty <= available`), `InventoryBalance.receive` y `UnitOfWork`.
- `apps/api/src/use-cases/inventory/allocate-order.ts`: usa `canTransitionOrder`, `InventoryBalance.allocate`, ordenamiento por `location.code ASC` y `UnitOfWork`.
- `apps/api/src/use-cases/inventory/cancel-order.ts`: usa `planOrderCancellation`, `WarehouseTask.cancel()`, `InventoryBalance.releaseUpTo` (clamp a 0) y `UnitOfWork`.
- `apps/api/src/use-cases/inventory/handle-picking-exception.ts`: usa `InventoryBalance.releaseUpTo`, `InventoryBalance.allocate`, `WarehouseTask.reportStepException` / `escalateStepException`, `canTransitionOrder` y `UnitOfWork`.
- `apps/api/src/use-cases/tasks/confirm-task-step.ts`: usa `WarehouseTask.start()` (transición `PENDING -> IN_PROGRESS` en primer escaneo), `WarehouseTask.confirmStep` (rechaza `STEP_ALREADY_RESOLVED` en `EXCEPTION`/`SKIPPED`/`COMPLETED` y `SCAN_EXCEEDS_EXPECTED`), `InventoryBalance.consume` en `PICKING`, `moveStock` en `PUTAWAY`, `ALLOCATED -> PACKED` directo y `IdempotencyStore` transaccional.

### Tests y Documentación
- `apps/api/src/use-cases/inventory/__tests__/move-stock.test.ts` (reescrito con `InMemoryUnitOfWork`: Happy Path + Romper a propósito, 13 tests).
- `apps/api/src/use-cases/inventory/__tests__/allocate-order.test.ts` (reescrito con `InMemoryUnitOfWork`: Happy Path + Romper a propósito, 13 tests).
- `apps/api/src/use-cases/inventory/__tests__/cancel-order.test.ts` (reescrito con `InMemoryUnitOfWork`: Happy Path + Romper a propósito, 10 tests).
- `apps/api/src/use-cases/inventory/__tests__/handle-picking-exception.test.ts` (reescrito con `InMemoryUnitOfWork`: Happy Path + Romper a propósito, 13 tests).
- `apps/api/src/use-cases/tasks/__tests__/confirm-task-step.test.ts` (reescrito con `InMemoryUnitOfWork` + `InMemoryIdempotencyStore`: Happy Path + Romper a propósito, 19 tests).
- `apps/api/src/routes/__tests__/tasks-sync-batch.test.ts` (actualizado mock de `@wms/db` añadiendo `updateMany` y `withTenantContext`/`getActiveTenantStore` para compatibilidad con `PrismaUnitOfWork`).
- `apps/api/src/__tests__/domain-prisma-parity.test.ts` (nuevo): test de paridad bidireccional de enums (`TaskStatus`, `StepStatus`, `OrderStatus`, `TxReason`) y mapeo completo de `DomainError -> WmsError` (5 tests).
- `apps/api/src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts` (nuevo): suite PostgreSQL real para concurrencia `Serializable` + `SELECT ... FOR UPDATE` con `PrismaUnitOfWork` (se salta en local sin BD mediante `shouldRunPgIntegration`).
- `docs/adr/007-api-domain-adoption-uow.md` (nuevo) y `docs/adr/README.md` (actualizado índice).
- NO tocados: `apps/web`, `apps/mobile`, `packages/db/prisma/schema.prisma`, `feature_list.json`.

## Decisiones de Diseño e Invariantes
- Todas las decisiones aprobadas por el usuario fueron aplicadas y documentadas en [`docs/adr/007-api-domain-adoption-uow.md`](../docs/adr/007-api-domain-adoption-uow.md):
  1. `PICKING` en `SalesOrder` no se escribe (se mantiene `ALLOCATED -> PACKED`).
  2. `moveStock` valida `available` (`withdraw`).
  3. `confirm-task-step` usa `consume` (`EXCEEDS_ALLOCATED`); `cancel-order` y `handle-picking-exception` usan `releaseUpTo` (clamp a 0).
  4. Rechazo de re-escaneo en `EXCEPTION`/`SKIPPED` (`STEP_ALREADY_RESOLVED`) y sobre-escaneo (`SCAN_EXCEEDS_EXPECTED`).
  5. Paso resuelto = no `PENDING`.
  6. `WarehouseTask` pasa a `IN_PROGRESS` al primer escaneo y se persiste.
  7. Mapeo `DomainError -> WmsError` sin alterar códigos HTTP ni `WmsErrorCode` públicos.
  8. Test automatizado de paridad de enums dominio ↔ Prisma.

## Puntos Pendientes (Opcionales fuera de alcance)
- Refactorizar los casos de uso opcionales restantes para usar `UnitOfWork` directamente:
  - `apps/api/src/use-cases/inventory/create-putaway-task.ts`
  - `apps/api/src/use-cases/tasks/confirm-receipt-line.ts` (actualmente invoca `moveStock` pasándole `tx` opaco vía compatibilidad en `PrismaUnitOfWork`)
  - `apps/api/src/use-cases/tasks/sync-task-batch.ts`

## Resultados de Verificación (salida literal)
- `pnpm build` (exit 0):
```text
 Tasks:    6 successful, 6 total
Cached:    5 cached, 6 total
  Time:    4.235s
```

- `pnpm --filter @wms/api test:coverage` (exit 0):
```text
 Test Files  17 passed | 3 skipped (20)
      Tests  197 passed | 8 skipped (205)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   92.36 |    87.34 |   94.11 |   92.36 |                   
 inventory         |    98.1 |    89.85 |     100 |    98.1 |                   
  ...cate-order.ts |     100 |       92 |     100 |     100 | 80,95             
  cancel-order.ts  |   99.16 |     93.1 |     100 |   99.16 | 111               
  ...taway-task.ts |   98.37 |     91.3 |     100 |   98.37 | 166-167           
  ...-exception.ts |    95.9 |    83.72 |     100 |    95.9 | ...00,160,280-281 
  move-stock.ts    |     100 |    94.44 |     100 |     100 | 111               
 tasks             |   82.04 |     80.9 |   77.77 |   82.04 |                   
  ...ceipt-line.ts |   83.68 |    89.47 |      50 |   83.68 | ...38-239,242-262 
  ...-task-step.ts |   82.14 |    83.51 |     100 |   82.14 | ...04-309,421-431 
  ...task-batch.ts |   80.59 |    66.66 |     100 |   80.59 | ...08,224-232,296 
-------------------|---------|----------|---------|---------|-------------------
```
*(Nota: los 3 archivos skipped son las suites de integración PostgreSQL `idempotency.integration.test.ts`, `tenant-rls.integration.test.ts` y `ledger-locking.integration.test.ts`, que se ejecutan en CI con `DATABASE_URL` / `RUN_PG_INTEGRATION=true`.)*

- `pnpm test` (exit 0):
```text
@wms/api:test:  Test Files  17 passed | 3 skipped (20)
@wms/api:test:       Tests  197 passed | 8 skipped (205)

 Tasks:    7 successful, 7 total
Cached:    6 cached, 7 total
  Time:    3.693s
```

## Checklist SonarCloud / CP-7
- Sin `Math.random()` ni PRNG inseguro; sin `process.env` ni secretos en puertos, adaptadores o casos de uso; sin importaciones de `@wms/db`/`@prisma` en los 5 casos de uso refactorizados; Ledger append-only sin `update`/`delete` en `inventoryTransaction`; imports relativos ESM con extensión `.js`; sin código muerto ni re-exports huérfanos; SOLID respetado.
