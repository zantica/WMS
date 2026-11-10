# Reporte de Implementación: F6.1 — Puerto IdempotencyStore y Endpoint POST /api/v1/tasks/sync-batch
- **Estado**: DONE
- **Fecha**: 2026-11-10

## Archivos Creados / Modificados / Eliminados

### Creados
- `apps/api/src/ports/idempotency-store.ts`: Puerto hexagonal desacoplado para verificación y guardado de idempotencia transaccional (`find`, `save`).
- `apps/api/src/adapters/in-memory-idempotency-store.ts`: Adaptador en memoria con soporte multi-tenant y aislamiento por `(tenantId, idempotencyKey)` para tests unitarios.
- `apps/api/src/adapters/prisma-idempotency-store.ts`: Adaptador persistente Prisma que participa en la misma transacción del Ledger (`tx`), respaldado en PostgreSQL y protegido por RLS.
- `apps/api/src/use-cases/tasks/sync-task-batch.ts`: Caso de uso para sincronización por lotes de mutaciones offline en orden FIFO estricto, registro de `occurredAt` / `receivedAt`, y política Servidor-Gana (`CONFLICT` / `REJECTED`) ante colisiones concurrentes.
- `apps/api/src/ports/__tests__/idempotency-store.test.ts`: Tests unitarios de adaptadores en memoria y Prisma (5 tests).
- `apps/api/src/use-cases/tasks/__tests__/sync-task-batch.test.ts`: Tests unitarios exhaustivos de FIFO, reintentos `ALREADY_APPLIED`, Servidor-Gana (`CONFLICT`), validaciones y multi-tenancy (10 tests).
- `apps/api/src/use-cases/tasks/__tests__/idempotency.integration.test.ts`: Suite de integración real contra PostgreSQL 16 verificando que reintentos con `idempotencyKey` devuelven `ALREADY_APPLIED`, no duplican `inventory_transactions` y no alteran `inventory_balances` (3 tests).
- `apps/api/src/routes/__tests__/tasks-sync-batch.test.ts`: Tests de integración Fastify para `POST /api/v1/tasks/sync-batch` y `POST /api/v1/tasks/:id/steps/:stepId/confirm` con cabecera `Idempotency-Key` (5 tests).
- `packages/db/prisma/migrations/20261110120000_idempotency_records/migration.sql`: Migración SQL con creación de `idempotency_records`, constraint único `(tenantId, idempotencyKey)`, clave foránea a `tenants`, y activación de `ENABLE` + `FORCE ROW LEVEL SECURITY` con política `idempotency_records_tenant_isolation_policy`.
- `docs/adr/004-offline-idempotency-and-sync-batch.md`: ADR 004 documentando la arquitectura de idempotencia transaccional en el Ledger y la política de resolución offline Server-Wins.

### Modificados
- `packages/shared-types/src/index.ts`: Añadidos contratos de sincronización offline (`SyncTaskBatchItem`, `SyncTaskBatchRequest`, `SyncBatchItemResult`, `SyncTaskBatchResult`, `IdempotencyRecordDTO`) y código de error `"CONFLICT"`.
- `packages/db/prisma/schema.prisma`: Añadido modelo `IdempotencyRecord` con relación en `Tenant` y clave compuesta única `[tenantId, idempotencyKey]`.
- `packages/db/src/rls.ts`: Registrada la tabla `idempotency_records` en el catálogo `RLS_PROTECTED_TABLES`.
- `apps/api/src/use-cases/tasks/confirm-task-step.ts`: Soporte de `idempotencyKey`, `occurredAt`, `idempotencyStore` y `tx`, garantizando que reintentos devuelven `ALREADY_APPLIED` sin invocar `moveStock` ni duplicar asientos contables.
- `apps/api/src/use-cases/tasks/confirm-receipt-line.ts`: Soporte de `idempotencyKey`, `occurredAt`, `idempotencyStore` y `tx`, devolviendo `ALREADY_APPLIED` sin alterar saldos en reintentos.
- `apps/api/src/routes/tasks.ts`: Añadido endpoint `POST /api/v1/tasks/sync-batch` y extracción de cabecera/body `Idempotency-Key` en `POST /:id/steps/:stepId/confirm`.
- `apps/api/src/routes/receipts.ts`: Extracción de cabecera/body `Idempotency-Key` en `POST /:taskId/confirm-line`.
- `apps/api/src/use-cases/security/__tests__/tenant-context.test.ts`: Actualizada la aserción de cobertura de RLS para incluir `idempotency_records` en las 11 tablas protegidas.
- `docs/adr/README.md`: Añadido ADR 004 a la tabla índice.

---

## Decisiones de Diseño e Invariantes

1. **Invariante del Ledger Inmutable (CP-1)**:
   - La inserción en `idempotency_records` se ejecuta atómicamente dentro de la misma transacción SQL `Serializable` de `moveStock`.
   - Cuando llega un reintento con la misma `idempotencyKey` para el mismo `tenantId`, el caso de uso devuelve inmediatamente `record.responseBody` con `idempotencyStatus: "ALREADY_APPLIED"`.
   - Se verificó en tests de integración con PostgreSQL real que `inventory_transactions.count()` permanece estrictamente invariable (= 1) y `inventory_balances.onHandQty` no sufre mutaciones duplicadas.

2. **Aislamiento Multi-Tenant y RLS (CP-2)**:
   - Toda consulta incluye explícitamente `tenantId`.
   - La tabla `idempotency_records` tiene activado `FORCE ROW LEVEL SECURITY` con la política `idempotency_records_tenant_isolation_policy` evaluando `app.current_tenant_id`.
   - La restricción de unicidad compuesta `@@unique([tenantId, idempotencyKey])` impide colisiones entre distintos inquilinos.

3. **Política Servidor-Gana (Server-Wins / F6.1)**:
   - Procesamiento en orden FIFO por timestamp del cliente (`occurredAt ASC`).
   - El estado de verdad consolidado en PostgreSQL prevalece ante colisiones concurrentes (pasos ya finalizados, tareas canceladas, stock insuficiente).
   - Las mutaciones en conflicto se marcan como `CONFLICT` y quedan registradas para que el cliente móvil (`@wms/mobile` en `F6.2`) las aísle en su cola de cuarentena sin bloquear el resto del lote.

4. **SOLID, Cero Envars y Reglas SonarCloud (CP-7)**:
   - Cero `process.env` dentro de casos de uso o puertos.
   - Cero `Math.random()`, utilizando `crypto.randomUUID()`.
   - Cero promesas flotantes y manejo de errores tipados con `WmsError`.

---

## Resultados de Verificación (salida literal, no parafraseada)

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

@wms/mobile:build: cache hit, replaying logs 02a51dfc896a3939
@wms/mobile:build: > @wms/mobile@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\mobile
@wms/mobile:build: > tsc --noEmit

@wms/web:build: cache hit, replaying logs 6521c934f7fd277a
@wms/web:build: > @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
@wms/web:build: > tsc --noEmit

@wms/api:build: cache miss, executing e32adeec6fa8d387
@wms/api:build: > @wms/api@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\api
@wms/api:build: > tsc && tsc-alias

 Tasks:    5 successful, 5 total
Cached:    4 cached, 5 total
  Time:    4.803s 
```

### 2. `pnpm --filter @wms/api test:coverage`
```text
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 ✓ src/use-cases/diagnostics/__tests__/diagnostics.test.ts (10 tests) 20ms
 ↓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests | 3 skipped)
 ✓ src/use-cases/inventory/__tests__/handle-picking-exception.test.ts (14 tests) 21ms
 ✓ src/use-cases/inventory/__tests__/cancel-order.test.ts (10 tests) 19ms
 ✓ src/use-cases/inventory/__tests__/move-stock.test.ts (8 tests) 17ms
 ✓ src/use-cases/inventory/__tests__/allocate-order.test.ts (8 tests) 32ms
 ✓ src/use-cases/inventory/__tests__/create-putaway-task.test.ts (7 tests) 32ms
 ✓ src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts (11 tests) 22ms
 ✓ src/use-cases/tasks/__tests__/confirm-task-step.test.ts (16 tests) 28ms
 ✓ src/use-cases/security/__tests__/tenant-context.test.ts (16 tests) 40ms
 ✓ src/use-cases/tasks/__tests__/sync-task-batch.test.ts (10 tests) 25ms
 ↓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests | 3 skipped)
 ✓ src/ports/__tests__/idempotency-store.test.ts (5 tests) 9ms
 ✓ src/routes/__tests__/tasks-sync-batch.test.ts (5 tests) 89ms
 ✓ src/routes/v1/__tests__/diagnostics.test.ts (6 tests) 101ms
 ✓ src/use-cases/integrations/__tests__/webhooks.test.ts (25 tests) 100ms
 ✓ src/plugins/__tests__/auth.test.ts (25 tests) 386ms
 ✓ src/routes/__tests__/orders-dispatch.test.ts (4 tests) 55ms

 Test Files  16 passed | 2 skipped (18)
      Tests  180 passed | 6 skipped (186)
   Start at  03:19:57
   Duration  2.83s (transform 2.08s, setup 0ms, collect 9.09s, tests 996ms, environment 5ms, prepare 7.26s)

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
```

### 3. Tests de Integración PostgreSQL 16 Real (`RUN_PG_INTEGRATION=true`)
```text
 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api

 ✓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests) 265ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  03:20:08
   Duration  994ms (transform 144ms, setup 0ms, collect 239ms, tests 265ms, environment 0ms, prepare 188ms)
```
