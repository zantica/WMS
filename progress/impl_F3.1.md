# Reporte de Implementación: `F3.1` — Cancelación de Pedidos y liberación atómica de reservas (`ALLOCATION_CANCEL`)

- **Estado**: DONE
- **Fecha**: 2026-10-26
- **Subagente**: `implementer`

---

## Archivos Creados / Modificados

- [`apps/api/src/use-cases/inventory/cancel-order.ts`](../apps/api/src/use-cases/inventory/cancel-order.ts): Creado caso de uso transaccional `cancelOrder` para cancelar pedidos en estados `PENDING`, `ON_HOLD`, `ALLOCATED` o `PICKING`, liberando atómicamente las reservas pendientes y cancelando las tareas de `PICKING` activas.
- [`apps/api/src/routes/orders.ts`](../apps/api/src/routes/orders.ts): Añadido el endpoint `POST /api/v1/orders/:id/cancel` con validación Zod (`CancelOrderSchema`) para motivo opcional (`reason`) y retorno tipado `ApiResponse<CancelOrderResult>`.
- [`apps/api/src/use-cases/inventory/__tests__/cancel-order.test.ts`](../apps/api/src/use-cases/inventory/__tests__/cancel-order.test.ts): Creada suite de 10 casos de prueba unitarios en Vitest cubriendo aislamiento multi-tenant, rechazo en estados terminales (`PACKED`, `SHIPPED`, `CANCELLED`), cancelación sin reservas (`PENDING`/`ON_HOLD`), liberación total y parcial en `ALLOCATED`/`PICKING`, e invariante de no-negatividad de `allocatedQty`.

---

## Decisiones de Diseño e Invariantes

- **Transacción `Serializable` y Bloqueo Pesimista (`SELECT ... FOR UPDATE`)**: Toda la operación de cancelación y liberación de reservas se ejecuta dentro de `prisma.$transaction(..., { isolationLevel: "Serializable", timeout: 15_000 })`. Por cada `TaskStep` no completado (`expectedQty - scannedQty > 0`) de una tarea `PICKING` activa (`PENDING`, `IN_PROGRESS` o `EXCEPTION`), se bloquea la fila correspondiente en `inventory_balances` filtrando por `tenant_id`, `location_id` y `product_id`.
- **Inmutabilidad del Ledger y Regla de No-Negatividad**: Se calcula `toRelease = Math.min(Math.max(0, Number(balance.allocated_qty)), remainingToRelease)` para garantizar que `allocatedQty` nunca caiga por debajo de `0`. Se decrementa `allocatedQty` en `InventoryBalance` y se inserta un asiento inmutable en `InventoryTransaction` con `reason: "ALLOCATION_CANCEL"`, `fromLocationId: step.locationId`, `quantity: toRelease` y `referenceId: order.id`.
- **Cierre Limpio de Tareas de Picking**: Los pasos pendientes o en excepción de tareas `PICKING` activas pasan a `SKIPPED` y la `WarehouseTask` se marca como `CANCELLED` con `completedAt: new Date()`.
- **Aislamiento Multi-Tenant y TypeScript Estricto**: Todas las consultas filtran explícitamente por `tenantId`. Los tipos opcionales (`userId?: string | undefined`, `reason?: string | undefined`) y accesos indexados (`lockedBalances[0]`) cumplen estrictamente con `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true` y `moduleResolution: "NodeNext"` (imports `.js`).

---

## Resultados de Verificación

- **Verificación Estática de Tipos y Contratos**: Inspeccionados todos los tipos de entrada/salida, compatibilidad con `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) e imports ESM `.js`.
- **Cobertura de Casos de Prueba (`cancel-order.test.ts`)**:
  - `ORDER_NOT_FOUND` (404) para pedidos inexistentes o de otro `tenantId`.
  - `VALIDATION_ERROR` (409) para pedidos en estados terminales `PACKED`, `SHIPPED` y `CANCELLED` verificando que no ocurran mutaciones en el Ledger ni en saldos.
  - Cancelación limpia en `PENDING` y `ON_HOLD` (con concatenación de motivo en `notes`).
  - Liberación total en `ALLOCATED` y liberación parcial en `PICKING` (`expectedQty - scannedQty`), ignorando pasos ya `COMPLETED` y protegiendo contra `allocatedQty < 0`.
