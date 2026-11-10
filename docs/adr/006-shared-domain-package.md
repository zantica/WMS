# ADR 006: Paquete de dominio compartido `@wms/domain` (TypeScript puro)

- **Estado**: Aceptado
- **Fecha**: 2026-11-10
- **Feature**: `DOM-1` — Paquete @wms/domain: primitivas DDD, agregado InventoryBalance y máquinas de estado de WarehouseTask/TaskStep y SalesOrder

---

## 1. Contexto

Las reglas de negocio (saldo >= 0, allocated <= onHand, transiciones de tarea/pedido) viven hoy repartidas
dentro de casos de uso de `@wms/api` entremezcladas con Prisma (`move-stock.ts`, `allocate-order.ts`,
`cancel-order.ts`, `handle-picking-exception.ts`, `confirm-task-step.ts`). `@wms/web` y `@wms/mobile`
(offline) no pueden reutilizarlas y las invariantes solo las protege SQL/convención.

Alternativas descartadas:
- Ampliar `@wms/shared-types`: es un paquete de contratos DTO/enums sin comportamiento; mezclarlo con lógica rompería su propósito.
- Dejar las reglas en `@wms/api`: impide validación consistente en cliente y mantiene el dominio acoplado a Prisma.

## 2. Decisión

Crear `packages/domain` (`@wms/domain`): TypeScript puro, **cero dependencias de runtime**, sin Prisma, Fastify,
React, Expo ni APIs de Node (`tsconfig` con `"types": []`, de modo que `tsc` falla si se usan).

- Primitivas DDD: `Entity`, `ValueObject`, `AggregateRoot`, `DomainError` (subclases tipadas con `code` estable).
- `Quantity` (VO, Decimal(12,4), >= 0) e `InventoryBalance` (`receive/withdraw/allocate/release/releaseUpTo/consume/adjust`).
- `WarehouseTask` + `TaskStep` y máquina de estados `TaskStatus`/`StepStatus`; máquina de estados de `OrderStatus` y `planOrderCancellation`.
- Los enums de Prisma se **redefinen** como uniones de literales (el dominio no importa `@wms/db`).
- Guarda automatizada: `src/shared/__tests__/domain-purity.test.ts` escanea los imports de `src/` y falla ante `@wms/db`, `@prisma/*`, `fastify`, `react`, `next`, `expo`, `node:*` o `process.env`.
- Grafo permitido: `@wms/domain` no depende de nada interno; lo consumen `@wms/api`, `@wms/web` y `@wms/mobile`.
- La adopción en los casos de uso se hará en `DOM-2`; en DOM-1 `@wms/api` no cambia.

## 3. Consecuencias

- **Positivas**: reglas únicas, testeables sin BD y reutilizables en cliente; errores con `code` estable mapeables por los adaptadores.
- **Negativas / Riesgos**: el dominio es algo más estricto que el código actual (ver `progress/impl_DOM-1.md`: `withdraw` respeta `available`, sobre-escaneo rechazado, pasos EXCEPTION/SKIPPED no reconfirmables); DOM-2 debe decidir si se alinea el comportamiento. Los enums duplicados pueden divergir del esquema Prisma: DOM-2 debería añadir un test de paridad en `@wms/api`.
- **Verificación**: `pnpm --filter @wms/domain test:coverage` (suites happy path y "romper a propósito" por agregado; umbral ≥95% líneas) y el test de pureza.
