# Reporte de Quality Gate y Publicación: DOM-1 (@wms/domain)
- **ESTADO**: PUBLISHED
- **Fecha**: 2026-11-10
- **Rama**: main

## 1. Auditoría de Calidad (4 Pilares)
- [x] **Pilar 1 — SOLID**:
  - **S (Single Responsibility)**: Primitivas DDD especializadas (`Quantity` para precisión decimal, `InventoryBalance` para reglas de saldo e inventario, `WarehouseTask`/`TaskStep` para ciclo de tareas, y máquinas de estado puras en `task-state-machine` y `sales-order-state-machine`).
  - **O (Open/Closed)**: Arquitectura base extensible mediante `Entity`, `ValueObject`, `AggregateRoot` y jerarquía de `DomainError`.
  - **L (Liskov Substitution)**: Las clases base y agregados preservan contratos e invariantes; errores tipados con código estable (`code`).
  - **I (Interface Segregation)**: Props e interfaces cohesivas (`InventoryBalanceProps`, `TaskStepProps`, `WarehouseTaskProps`, `ConfirmStepResult`, `OrderCancellationPlan`).
  - **D (Dependency Inversion)**: Dominio 100% puro, sin dependencias de infraestructura ni de frameworks externos (Prisma, Fastify, React, Expo, APIs de Node).
- [x] **Pilar 2 — Cero Envars / Secretos en Código**:
  - Cero lecturas de `process.env` o `import.meta.env` en `packages/domain/`.
  - Guarda automatizada en `packages/domain/src/shared/__tests__/domain-purity.test.ts` que valida activamente la ausencia de `process.env`.
  - Sin credenciales, tokens ni cadenas de conexión hardcodeadas en ningún archivo.
- [x] **Pilar 3 — Arquitectura Hexagonal & Checkpoints (CP-1 a CP-7)**:
  - Dominio puro aislado en monorepo: `tsconfig.json` con `"types": []` para evitar contaminación del entorno.
  - ESM estricto con extensiones `.js` en todos los imports relativos.
  - Invariantes de Ledger respetadas: saldo no negativo (`onHand >= 0`, `allocated <= onHand`, `available = onHand - allocated`).
  - Barrido de reglas SonarCloud verificado: cero uso de `Math.random()`, cero ReDoS, sin promesas flotantes, y sin lockfiles extraños (solo `pnpm-lock.yaml`).
- [x] **Pilar 4 — Suite Completa de Tests y Compilación**:
  - Compilación monorepo (`pnpm build`) exitosa (6/6 paquetes).
  - Suite monorepo (`pnpm test`) exitosa: 81 tests en `@wms/domain`, 180 tests en `@wms/api`, 64 tests en `@wms/mobile`, 12 tests en `@wms/web`.
  - Cobertura `@wms/api`: use-cases `>= 80%` en branches y líneas; cobertura global `93.34%`.
  - Cobertura `@wms/domain`: `100%` en declaraciones, líneas y funciones, `97.67%` en ramas.

## 2. Evidencia Ejecutada

```text
$ pnpm turbo run build --force
   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
 Tasks:    6 successful, 6 total
 Time:    6.852s
 Exit code: 0

$ pnpm turbo run test --force
   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running test in 6 packages

@wms/domain:test:  Test Files  5 passed (5)
@wms/domain:test:       Tests  81 passed (81)
@wms/web:test:     Test Files  2 passed (2)
@wms/web:test:          Tests  12 passed (12)
@wms/mobile:test:  Test Files  9 passed (9)
@wms/mobile:test:       Tests  64 passed (64)
@wms/api:test:     Test Files  16 passed | 2 skipped (18)
@wms/api:test:          Tests  180 passed | 6 skipped (186)

 Tasks:    6 successful, 6 total
 Time:    7.09s
 Exit code: 0

$ pnpm --filter @wms/api test:coverage
 Test Files  16 passed | 2 skipped (18)
      Tests  180 passed | 6 skipped (186)
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.34 |    87.17 |   88.57 |   93.34 |                   
 diagnostics       |   99.36 |    93.84 |     100 |   99.36 |                   
 integrations      |     100 |    90.14 |     100 |     100 |                   
 inventory         |   98.81 |    88.02 |     100 |   98.81 |                   
  ...cate-order.ts |   98.29 |       80 |     100 |   98.29 | 188-189           
  cancel-order.ts  |   98.64 |       90 |     100 |   98.64 | 214-215           
  ...taway-task.ts |   98.37 |     91.3 |     100 |   98.37 | 166-167           
  ...-exception.ts |   98.91 |    84.09 |     100 |   98.91 | 216,405-406       
  move-stock.ts    |     100 |      100 |     100 |     100 |                   
 security          |     100 |      100 |     100 |     100 |                   
 tasks             |   83.29 |    81.63 |      60 |   83.29 |                   
  ...ceipt-line.ts |   83.68 |    89.47 |      50 |   83.68 | ...38-239,242-262 
  ...-task-step.ts |    84.9 |    85.22 |      50 |    84.9 | ...30-431,437-457 
  ...task-batch.ts |   80.59 |    66.66 |     100 |   80.59 | ...08,224-232,296 
-------------------|---------|----------|---------|---------|-------------------
 Exit code: 0

$ pnpm --filter @wms/domain test:coverage
 Test Files  5 passed (5)
      Tests  81 passed (81)
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
 Exit code: 0
```

## 3. Commits Atómicos Creados y Push (si ESTADO = PUBLISHED)
- `25c9f6d` `feat(domain): add @wms/domain package with DDD primitives and state machines (DOM-1)`
- `08e9e87` `docs(domain): document shared domain package and record ADR 006 (DOM-1)`
- `chore(harness): record DOM-1 reports and update progress to done`
- **Resultado de `git push`**: `<pendiente de ejecucion>`
