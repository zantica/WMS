# Reporte de Revisión: DOM-1
- **VEREDICTO**: APPROVED
- **Fecha**: 2026-11-10
- **Auditor**: reviewer (subagente independiente) — nunca el leader ni el implementer

## Evaluación de Checkpoints
- [x] CP-1: Integridad del Inventory Ledger (invariantes de agregados: `onHand >= 0`, `allocated <= onHand`, `available = onHand - allocated`; operaciones `receive/withdraw/allocate/release/releaseUpTo/consume/adjust`)
- [x] CP-2: Aislamiento Multi-Tenant (agregados `InventoryBalance` y `WarehouseTask` encapsulan y preservan `tenantId`)
- [x] CP-3: Contratos de API, Tipado y Monorepo (paquete `@wms/domain` ESM NodeNext, imports relativos `.js`, exports tipados en `dist/`, cero dependencias de runtime y `tsconfig` con `types: []`)
- [x] CP-4: Verificación Automatizada y Cobertura (>= 80% global; @wms/domain al 100% líneas / 97.67% ramas; suites happy path y "romper a propósito" rigurosas)
- [x] CP-5: Arquitectura Hexagonal, Puertos y Criterios de Hecho (dominio puro desacoplado de infraestructura; ADR 006 documentado en `docs/adr/006-shared-domain-package.md` e indexado en `docs/adr/README.md`)
- [x] CP-6: Higiene del Código (sin duplicados, sin código muerto, sin `it.skip` nuevos, único gestor de paquetes `pnpm-lock.yaml`)
- [x] CP-7: Principios SOLID y Cero Envars/Secretos en Código (cero `process.env`, cero `Math.random`, sincronismo total sin promesas flotantes, regex limpias)

## Evaluación de Puntos de Atención Específicos
1. **Pureza del Dominio**:
   - `packages/domain/package.json` tiene CERO dependencias de runtime (`dependencies: {}`).
   - `packages/domain/tsconfig.json` define `"types": []`.
   - Se verificó la guarda automatizada en `src/shared/__tests__/domain-purity.test.ts`: escanea recursivamente `src/` impidiendo imports de `@wms/db`, `@prisma/*`, `fastify`, `react`, `expo`, `node:*` y lecturas de `process.env`.
   - Se ejecutó inspección manual (`git grep --no-index "import "`) constatando que los únicos imports son intra-paquete (`./` o `../`) con extensión `.js`.
2. **Fidelidad a Reglas Reales y Validación de Inconsistencias**:
   - Estados y enums contrastados contra `packages/db/prisma/schema.prisma`:
     - `TX_REASONS`: 8 literales exactamente coincidentes con `enum TxReason`.
     - `TASK_STATUSES`: 5 literales coincidentes con `enum TaskStatus`.
     - `STEP_STATUSES`: 4 literales coincidentes con `enum StepStatus`.
     - `ORDER_STATUSES`: 7 literales coincidentes con `enum OrderStatus`.
   - Se validaron en el código de los use cases (`move-stock.ts`, `allocate-order.ts`, `confirm-task-step.ts`, `handle-picking-exception.ts`, `cancel-order.ts`) las 8 inconsistencias reportadas por el implementer:
     1. `PICKING` en el enum pero no transicionado por `confirm-task-step`: el dominio soporta tanto el flujo actual (ALLOCATED → PACKED) como el teórico (ALLOCATED → PICKING → PACKED).
     2. `moveStock` solo chequea `onHand >= qty`: `InventoryBalance.withdraw` exige `qty <= available` para evitar sustraer stock comprometido.
     3. Decremento ciego de `allocatedQty` en `confirm-task-step.ts`: `InventoryBalance` ofrece `release` (estricto) y `releaseUpTo` (clamp estilo `cancel-order`/`handle-picking-exception`).
     4. `confirm-task-step` solo bloqueaba `COMPLETED`: el dominio rechaza re-escanear pasos resueltos (`EXCEPTION`/`SKIPPED`) y sobre-escanear (`SCAN_EXCEEDS_EXPECTED`).
     5. Criterio de pasos resueltos: el dominio unifica `isResolved = status !== 'PENDING'`.
     6. Tarea PENDING a COMPLETED permitida (compatibilidad con `confirm-task-step`), tarea sin pasos permitida.
     7. Jerarquía de `DomainError` con `code` estables (`INSUFFICIENT_STOCK`, `OVER_ALLOCATION`, `EXCEEDS_ALLOCATED`, `INVARIANT_VIOLATION`, etc.) lista para mapeo a `WmsError` en DOM-2.
     8. Enums duplicados en dominio: documentado para test de paridad en DOM-2.
3. **Calidad de Tests "Romper a Propósito"**:
   - Violación de saldos negativos: testeado (`withdraw` lanza `INSUFFICIENT_STOCK`, balance no muta).
   - Sobre-asignación: testeado (`allocate` lanza `OVER_ALLOCATION`, allocated no muta).
   - Cantidades no válidas: probados con `it.each` (`NaN`, `Infinity`, `-Infinity`, `-1`, `-0.0001`, `1.23456`, `1e8`, `0.00001`, `0` en `positive`) comprobando `INVALID_QUANTITY`.
   - Transiciones ilegales y retrocesos: testeados retrocesos de tarea (COMPLETED → IN_PROGRESS, IN_PROGRESS → PENDING) y pedidos (SHIPPED → PACKED, CANCELLED → PENDING, etc.) verificando `INVALID_STATE_TRANSITION`.
   - Operaciones sobre estados terminales: probadas en tareas COMPLETED y CANCELLED para todas las operaciones (`confirmStep`, `reportStepException`, `escalateStepException`, `addStep`, `complete`, `cancel`) verificando `TERMINAL_STATE`.
   - Doble confirmación y pasos ya resueltos: probados comprobando `STEP_ALREADY_RESOLVED`.
   - Todos los tests verifican la clase específica de error y el atributo `code` estable a través del helper `codeOf`.
4. **Integridad del Repositorio y Consumibilidad**:
   - `apps/api`, `apps/web`, `apps/mobile` y `schema.prisma` permanecen intactos (`git status` limpio en esas carpetas).
   - Paquete `@wms/domain` detectado por Turborepo mediante `packages/*` en `pnpm-workspace.yaml`. Compilación limpia y exports correctos en `package.json`.
5. **Calidad y SonarCloud**:
   - Cero `Math.random` (S2245), cero ReDoS (S8786), sin promesas flotantes (S9383), código 100% sincrónico y fuertemente tipado sin `any`.

## Evidencia Ejecutada (obligatoria para APPROVED)

```text
$ pnpm build
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

@wms/shared-types:build: cache hit
@wms/db:build: cache hit
@wms/mobile:build: cache hit
@wms/domain:build: cache hit
@wms/domain:build: > @wms/domain@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\domain
@wms/domain:build: > tsc
@wms/web:build: cache hit
@wms/api:build: cache hit

 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    54ms >>> FULL TURBO
exit code: 0

$ pnpm --filter @wms/domain test:coverage
> @wms/domain@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\packages\domain
> vitest run --coverage

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/packages/domain
      Coverage enabled with v8

 ✓ src/shared/__tests__/domain-purity.test.ts (4 tests) 9ms
 ✓ src/orders/__tests__/sales-order-state-machine.test.ts (25 tests) 10ms
 ✓ src/shared/__tests__/domain-primitives.test.ts (5 tests) 6ms
 ✓ src/inventory/__tests__/inventory-balance.test.ts (28 tests) 15ms
 ✓ src/tasks/__tests__/warehouse-task.test.ts (19 tests) 15ms

 Test Files  5 passed (5)
      Tests  81 passed (81)
   Start at  22:42:14
   Duration  850ms (transform 254ms, setup 0ms, collect 487ms, tests 55ms, environment 1ms, prepare 1.30s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |     100 |    97.67 |     100 |     100 |                   
 inventory         |     100 |    95.45 |     100 |     100 |                   
  ...ry-balance.ts |     100 |    90.47 |     100 |     100 | 36-37             
  quantity.ts      |     100 |      100 |     100 |     100 |                   
  tx-reason.ts     |     100 |      100 |     100 |     100 |                   
 orders            |     100 |      100 |     100 |     100 |                   
  ...te-machine.ts |     100 |      100 |     100 |     100 |                   
 shared            |     100 |      100 |     100 |     100 |                   
  ...egate-root.ts |     100 |      100 |     100 |     100 |                   
  domain-error.ts  |     100 |      100 |     100 |     100 |                   
  entity.ts        |     100 |      100 |     100 |     100 |                   
  value-object.ts  |     100 |      100 |     100 |     100 |                   
 tasks             |     100 |    98.18 |     100 |     100 |                   
  ...te-machine.ts |     100 |      100 |     100 |     100 |                   
  task-step.ts     |     100 |      100 |     100 |     100 |                   
  ...house-task.ts |     100 |    96.55 |     100 |     100 | 35                
-------------------|---------|----------|---------|---------|-------------------
exit code: 0

$ pnpm test
> wms@0.0.1 test C:\Users\santi\Documents\projects\WMS
> turbo run test

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running test in 6 packages
   • Remote caching disabled

 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    90ms >>> FULL TURBO
exit code: 0

$ pnpm --filter @wms/api test:coverage
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 ✓ src/use-cases/inventory/__tests__/cancel-order.test.ts (10 tests) 18ms
 ✓ src/use-cases/inventory/__tests__/move-stock.test.ts (8 tests) 17ms
 ✓ src/use-cases/inventory/__tests__/handle-picking-exception.test.ts (14 tests) 22ms
 ↓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests | 3 skipped)
 ✓ src/use-cases/inventory/__tests__/allocate-order.test.ts (8 tests) 32ms
 ✓ src/use-cases/diagnostics/__tests__/diagnostics.test.ts (10 tests) 21ms
 ✓ src/use-cases/inventory/__tests__/create-putaway-task.test.ts (7 tests) 32ms
 ✓ src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts (11 tests) 22ms
 ✓ src/use-cases/tasks/__tests__/confirm-task-step.test.ts (16 tests) 27ms
 ✓ src/use-cases/tasks/__tests__/sync-task-batch.test.ts (10 tests) 23ms
 ✓ src/use-cases/security/__tests__/tenant-context.test.ts (16 tests) 44ms
 ↓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests | 3 skipped)
 ✓ src/ports/__tests__/idempotency-store.test.ts (5 tests) 10ms
 ✓ src/use-cases/integrations/__tests__/webhooks.test.ts (25 tests) 106ms
 ✓ src/routes/__tests__/tasks-sync-batch.test.ts (5 tests) 98ms
 ✓ src/routes/v1/__tests__/diagnostics.test.ts (6 tests) 121ms
 ✓ src/plugins/__tests__/auth.test.ts (25 tests) 356ms
 ✓ src/routes/__tests__/orders-dispatch.test.ts (4 tests) 58ms

 Test Files  16 passed | 2 skipped (18)
      Tests  180 passed | 6 skipped (186)
   Start at  22:42:28
   Duration  2.85s (transform 2.06s, setup 0ms, collect 9.26s, tests 1.01s, environment 6ms, prepare 7.67s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.34 |    87.17 |   88.57 |   93.34 |                   
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
 tasks             |   83.29 |    81.63 |      60 |   83.29 |                   
  ...ceipt-line.ts |   83.68 |    89.47 |      50 |   83.68 | ...38-239,242-262 
  ...-task-step.ts |    84.9 |    85.22 |      50 |    84.9 | ...30-431,437-457 
  ...task-batch.ts |   80.59 |    66.66 |     100 |   80.59 | ...08,224-232,296 
-------------------|---------|----------|---------|---------|-------------------
exit code: 0
```

## Hallazgos / Correcciones Requeridas
Ninguna. La implementación de `@wms/domain` cumple estrictamente los criterios de pureza, fidelidad de reglas, cobertura y principios SOLID sin modificar los paquetes consumidores existentes.
