# Reporte de Implementación: DOM-1 — Paquete @wms/domain
- **Estado**: DONE
- **Fecha**: 2026-11-10

## Archivos Creados / Modificados / Eliminados
- `packages/domain/{package.json,tsconfig.json,vitest.config.ts}`: paquete `@wms/domain` (sin deps de runtime; `tsconfig` con `types: []`; mismo patrón CJS-emit que shared-types; scripts build/test/test:coverage). Turbo/pnpm lo detectan por `packages/*` (sin cambios en turbo.json/workspace). `pnpm-lock.yaml` actualizado por `pnpm install`.
- `src/shared/{domain-error,entity,value-object,aggregate-root}.ts`: primitivas DDD y 11 `DomainError` con `code` estable.
- `src/inventory/{quantity,inventory-balance,tx-reason}.ts`: VO Decimal(12,4) en enteros; agregado con receive/withdraw/allocate/release/releaseUpTo/consume/adjust.
- `src/tasks/{task-state-machine,task-step,warehouse-task}.ts`; `src/orders/sales-order-state-machine.ts`; `src/index.ts`.
- Tests: `inventory/__tests__/inventory-balance.test.ts`, `tasks/__tests__/warehouse-task.test.ts`, `orders/__tests__/sales-order-state-machine.test.ts`, `shared/__tests__/{domain-primitives,domain-purity}.test.ts` (guarda de imports + process.env).
- Docs: `docs/adr/006-shared-domain-package.md`, índice en `docs/adr/README.md`, sección y grafo en `docs/architecture.md`.
- NO tocados: apps/api, apps/web, apps/mobile, schema Prisma.

## Decisiones de Diseño e Invariantes
- Enums Prisma redefinidos como uniones de literales (TaskStatus, StepStatus, OrderStatus, TxReason).
- Quantity: finito, >=0, ≤4 decimales, < 1e8 (Decimal(12,4)); `positive()` exige >0.
- Task: transiciones PENDING→{IN_PROGRESS,COMPLETED,EXCEPTION,CANCELLED}; IN_PROGRESS→{COMPLETED,EXCEPTION,CANCELLED}; EXCEPTION→{IN_PROGRESS,COMPLETED,CANCELLED}; terminales COMPLETED/CANCELLED. Order: PENDING→{ALLOCATED,CANCELLED}; ALLOCATED→{PICKING,PACKED,ON_HOLD,CANCELLED}; PICKING→{PACKED,ON_HOLD,CANCELLED}; ON_HOLD→{ALLOCATED,CANCELLED}; PACKED→SHIPPED. `planOrderCancellation` libera stock solo en ALLOCATED/PICKING.

## Reglas ambiguas / inconsistencias código ↔ esquema (para DOM-2)
1. `PICKING` existe en el enum y es cancelable, pero ningún código lo escribe: confirm-task-step pasa ALLOCATED→PACKED directamente (domino permite ambas).
2. `moveStock` solo valida `onHand >= qty` (ignora allocated) → puede retirar stock reservado por otros; `InventoryBalance.withdraw` es más estricto (`qty <= available`). El PICK real usa `consume`.
3. confirm-task-step decrementa `allocatedQty` sin guarda (puede quedar negativo; cancel/exception usan `Math.max(0,…)`); el dominio lanza `EXCEEDS_ALLOCATED` en release/consume y ofrece `releaseUpTo` para el comportamiento clamp.
4. confirm-task-step solo bloquea paso COMPLETED; permite re-escanear EXCEPTION/SKIPPED y sobre-escanear (scanned > expected). El dominio los rechaza (`STEP_ALREADY_RESOLVED`, `SCAN_EXCEEDS_EXPECTED`).
5. "allDone" del código considera COMPLETED|EXCEPTION, no SKIPPED; el dominio define resuelto = no PENDING.
6. Tarea no pasa a IN_PROGRESS al primer escaneo en el código; se permite PENDING→COMPLETED. Tarea sin pasos puede completarse (`every` vacuo, igual que el código).
7. Errores del API usan `VALIDATION_ERROR`/`INSUFFICIENT_STOCK`; DOM-2 debe mapear los `code` de dominio a `WmsError`.
8. Sin test de paridad enums dominio ↔ Prisma (propuesto en DOM-2).

## Resultados de Verificación (salida literal)
- Tests de dominio con cobertura (`pnpm vitest run --coverage` en packages/domain):
```
 Test Files  5 passed (5)
      Tests  81 passed (81)
All files          |     100 |    97.67 |     100 |     100 |
 inventory         |     100 |    95.45 |     100 |     100 |
  ...ry-balance.ts |     100 |    90.47 |     100 |     100 | 36-37
 tasks             |     100 |    98.18 |     100 |     100 |
  ...house-task.ts |     100 |    96.55 |     100 |     100 | 35
```
- `pnpm build`: exit 0 — `Tasks: 6 successful, 6 total` (incluye @wms/domain: `tsc`).
- `pnpm test` (global): exit 0 — `Tasks: 6 successful, 6 total`; @wms/api `Test Files 16 passed | 2 skipped (18), Tests 180 passed | 6 skipped (186)`; @wms/domain `Test Files 5 passed (5), Tests 81 passed (81)`.

## Checklist SonarCloud / CP-7
Sin código muerto ni re-exports huérfanos (ZERO y helpers de paso no usados eliminados); sin `process.env`/secretos; sin infraestructura (guardado por test); SRP/OCP (tablas de transición), sin `any`; imports `.js`.
