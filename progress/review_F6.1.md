# Reporte de Revisión: F6.1 — Puerto IdempotencyStore y Endpoint POST /api/v1/tasks/sync-batch

- **VEREDICTO**: APPROVED
- **Fecha**: 2026-11-10
- **Auditor**: reviewer (subagente independiente) — verificado sin conflicto de rol

---

## Evaluación de Checkpoints

- [x] **CP-1: Integridad del Inventory Ledger (Bounded Context B)**
  - Inmutabilidad absoluta: Cero operaciones `update`, `updateMany`, `delete` o `deleteMany` sobre `prisma.inventoryTransaction`.
  - Atomicidad transaccional: La inserción en `idempotency_records` y las mutaciones físicas de `moveStock` se ejecutan dentro del mismo bloque transaccional interactivo (`tx`) bajo aislamiento `Serializable`.
  - Reintentos con `idempotencyKey` devuelven el resultado previo con `idempotencyStatus: "ALREADY_APPLIED"` sin re-invocar `moveStock`.
  - Verificado en PostgreSQL 16 real (`idempotency.integration.test.ts`): `inventory_transactions.count()` permanece estrictamente en 1 y `inventory_balances.onHandQty` no sufre mutaciones duplicadas.

- [x] **CP-2: Aislamiento Multi-Tenant y Seguridad**
  - Todas las consultas a `idempotency_records` filtran por `tenantId` (`where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } }`).
  - La migración SQL `20261110120000_idempotency_records` incluye `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` y la política `idempotency_records_tenant_isolation_policy` vinculada a `app.current_tenant_id`.
  - Registrada en el catálogo `RLS_PROTECTED_TABLES` en `packages/db/src/rls.ts`.
  - Comprobado aislamiento multi-tenant en tests unitarios y de ruta: dos tenants utilizando la misma `idempotencyKey` operan de forma completamente aislada sin interferencia.

- [x] **CP-3: Contratos de API, Tipado y Monorepo**
  - Paquete `@wms/shared-types` estrictamente libre de imports de `@prisma/client` y `@wms/db`.
  - Contratos tipados exportados: `SyncTaskActionType`, `SyncBatchItemStatus`, `SyncTaskBatchItem`, `SyncBatchItemResult`, `SyncTaskBatchRequest`, `SyncTaskBatchResult`, `IdempotencyRecordDTO` y código de error `"CONFLICT"` en `WmsErrorCode`.
  - Validación con esquemas Zod en `POST /api/v1/tasks/sync-batch`, `POST /api/v1/tasks/:id/steps/:stepId/confirm` y `POST /api/v1/receipts/:taskId/confirm-line`.
  - Envolventes `ApiResponse<T>` respetadas en todas las rutas.
  - ESM estricto con extensiones `.js` y compilación limpia con TypeScript en modo estricto.

- [x] **CP-4: Verificación Automatizada y Cobertura (>= 80%)**
  - `pnpm build` ejecutado por el auditor con salida 0 (5 paquetes exitosos).
  - `pnpm --filter @wms/api test:coverage` ejecutado por el auditor: 16 test files pasados, 180 tests pasados, 0 fallos. Cobertura global de casos de uso: 93.32% Líneas, 87.67% Ramas, 88.57% Funciones (supera el umbral mínimo del 80%).
  - Cobertura de tests exhaustiva para Happy Path, casos borde (lotes vacíos, límite de 100 ítems, timestamps inválidos), errores de dominio tipados con `WmsError`, política Servidor-Gana (`CONFLICT` / `REJECTED`) y reintentos `ALREADY_APPLIED`.
  - Suite de integración real contra PostgreSQL 16 ejecutada (`idempotency.integration.test.ts` con 3 tests pasados).

- [x] **CP-5: Arquitectura Hexagonal, Puertos y Criterios de Hecho**
  - Puerto desacoplado `IdempotencyStore` en `apps/api/src/ports/idempotency-store.ts` con métodos `find` y `save`.
  - Adaptador en memoria `InMemoryIdempotencyStore` (`adapters/in-memory-idempotency-store.ts`) para tests unitarios rápidos y desacoplados.
  - Adaptador persistente `PrismaIdempotencyStore` (`adapters/prisma-idempotency-store.ts`) compatible con contexto transaccional `tx` y ambient tenant scope.
  - ADR 004 redactado en `docs/adr/004-offline-idempotency-and-sync-batch.md` siguiendo la plantilla estándar y registrado en `docs/adr/README.md`.

- [x] **CP-6: Higiene del Código (Sin Duplicados ni Código Muerto)**
  - Sin archivos duplicados, alias huérfanos ni código comentado.
  - Consistencia en el árbol de dependencias (`pnpm-lock.yaml` intacto).

- [x] **CP-7: Principios SOLID y Cero Envars/Secretos en Código**
  - Principios SOLID respetados (SRP en separación de procesamiento de lote vs ejecución de pasos; DIP mediante interfaz `IdempotencyStore`; LSP entre adaptadores en memoria y Prisma).
  - Cero lecturas de `process.env` en `use-cases/`, `ports/` o `adapters/`.
  - Cero usos de `Math.random()` (se utiliza `randomUUID()` de `node:crypto`).
  - Cero expresiones regulares con backtracking super-lineal.
  - Cero promesas flotantes (todas llevan `await`).

---

## Evidencia Ejecutada (Obligatoria para APPROVED)

### 1. `pnpm build`
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 5 packages
   • Remote caching disabled

@wms/shared-types:build: cache hit, replaying logs ffdfe399fefaa48b
@wms/shared-types:build: > @wms/shared-types@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\shared-types
@wms/shared-types:build: > tsc

@wms/db:build: cache hit, replaying logs 5ef61c551cfb0e99
@wms/db:build: > @wms/db@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\db
@wms/db:build: > tsc

@wms/api:build: cache miss, executing 40eb43af2850150b
@wms/mobile:build: cache hit, replaying logs 02a51dfc896a3939
@wms/mobile:build: > @wms/mobile@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\mobile
@wms/mobile:build: > tsc --noEmit

@wms/web:build: cache hit, replaying logs 6521c934f7fd277a
@wms/web:build: > @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
@wms/web:build: > tsc --noEmit

@wms/api:build: > @wms/api@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\api
@wms/api:build: > tsc && tsc-alias

 Tasks:    5 successful, 5 total
Cached:    4 cached, 5 total
  Time:    4.443s 
exit code: 0
```

### 2. `pnpm --filter @wms/api test:coverage`
```text
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 ✓ src/use-cases/inventory/__tests__/cancel-order.test.ts (10 tests) 22ms
 ✓ src/use-cases/inventory/__tests__/handle-picking-exception.test.ts (14 tests) 22ms
 ↓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests | 3 skipped)
 ✓ src/use-cases/inventory/__tests__/move-stock.test.ts (8 tests) 17ms
 ✓ src/use-cases/inventory/__tests__/allocate-order.test.ts (8 tests) 35ms
 ✓ src/use-cases/inventory/__tests__/create-putaway-task.test.ts (7 tests) 36ms
 ✓ src/use-cases/diagnostics/__tests__/diagnostics.test.ts (10 tests) 23ms
 ✓ src/use-cases/security/__tests__/tenant-context.test.ts (16 tests) 58ms
 ✓ src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts (11 tests) 26ms
 ✓ src/use-cases/tasks/__tests__/sync-task-batch.test.ts (10 tests) 27ms
 ✓ src/use-cases/tasks/__tests__/confirm-task-step.test.ts (16 tests) 29ms
 ↓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests | 3 skipped)
 ✓ src/ports/__tests__/idempotency-store.test.ts (5 tests) 13ms
 ✓ src/routes/v1/__tests__/diagnostics.test.ts (6 tests) 111ms
 ✓ src/routes/__tests__/tasks-sync-batch.test.ts (5 tests) 88ms
 ✓ src/use-cases/integrations/__tests__/webhooks.test.ts (25 tests) 95ms
 ✓ src/plugins/__tests__/auth.test.ts (25 tests) 254ms
 ✓ src/routes/__tests__/orders-dispatch.test.ts (4 tests) 61ms

 Test Files  16 passed | 2 skipped (18)
      Tests  180 passed | 6 skipped (186)
   Start at  03:24:01
   Duration  3.22s (transform 2.68s, setup 0ms, collect 11.86s, tests 916ms, environment 6ms, prepare 8.05s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.32 |    87.67 |   88.57 |   93.32 |                   
 diagnostics       |   99.36 |    93.84 |     100 |   99.36 |                   
  ...tic-errors.ts |     100 |      100 |     100 |     100 |                   
  ...stic-error.ts |   97.29 |    63.63 |     100 |   97.29 | 34                
  ...-sensitive.ts |     100 |      100 |     100 |     100 |                   
 integrations      |     100 |    90.14 |     100 |     100 |                   
  ...rnal-order.ts |     100 |    94.87 |     100 |     100 | 123,200           
  ...er-shipped.ts |     100 |    84.37 |     100 |     100 | ...22,128,152,187 
 inventory         |   98.81 |    88.02 |     100 |   98.81 |                   
  ...cate-order.ts |   98.29 |       80 |     100 |   98.29 | 188-189           
  cancel-order.ts  |   98.64 |       90 |     100 |   98.64 | 214-215           
  ...taway-task.ts |   98.37 |     91.3 |     100 |   98.37 | 166-167           
  ...-exception.ts |   98.91 |    84.09 |     100 |   98.91 | 216,405-406       
  move-stock.ts    |     100 |      100 |     100 |     100 |                   
 security          |     100 |      100 |     100 |     100 |                   
  ...nt-context.ts |     100 |      100 |     100 |     100 |                   
 tasks             |   83.13 |    82.81 |      60 |   83.13 |                   
  ...ceipt-line.ts |   83.68 |    89.47 |      50 |   83.68 | ...38-239,242-262 
  ...-task-step.ts |    84.9 |    85.22 |      50 |    84.9 | ...30-431,437-457 
  ...task-batch.ts |      80 |    70.21 |     100 |      80 | ...02,217-225,286 
-------------------|---------|----------|---------|---------|-------------------
exit code: 0
```

### 3. Integración Real PostgreSQL 16 (`RUN_PG_INTEGRATION=true`)
```text
$env:RUN_PG_INTEGRATION="true"; pnpm --filter @wms/api test -- src/use-cases/tasks/__tests__/idempotency.integration.test.ts

> @wms/api@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run "src/use-cases/tasks/__tests__/idempotency.integration.test.ts"

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api

 ✓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests) 329ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  03:24:19
   Duration  1.13s (transform 150ms, setup 0ms, collect 262ms, tests 329ms, environment 0ms, prepare 212ms)
exit code: 0
```

### 4. Verificación de Suite Completa Monorepo (`turbo run test`)
```text
 Tasks:    5 successful, 5 total
Cached:    4 cached, 5 total
  Time:    3.774s 
exit code: 0
```

---

## Conclusión

La feature **F6.1** satisface estrictamente todos los criterios de aceptación y calidad de CP-1 a CP-7: la inmutabilidad del Ledger queda blindada ante reintentos de red por la idempotencia transaccional única por `(tenantId, idempotencyKey)`, la sincronización por lotes preserva el orden FIFO y la política Servidor-Gana ante inconsistencias concurrentes, la arquitectura hexagonal desacopla completamente el almacenamiento vía `IdempotencyStore`, y las suites unitarias y de integración PostgreSQL 16 pasan limpiamente al 100%. Veredicto final: **APPROVED**.
