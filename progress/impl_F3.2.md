# Reporte de Implementación: F3.2 — Gestión de Excepciones de Picking y Re-asignación de Stock

- **Estado**: DONE
- **Fecha**: 2026-10-26

## Archivos Creados / Modificados
- `apps/api/src/use-cases/inventory/handle-picking-exception.ts`: Nuevo caso de uso transaccional (`Serializable`) para liberar reservas en ubicaciones con excepción de picking (`ALLOCATION_CANCEL`), re-alocar en ubicaciones `STORAGE` alternativas con `ATP > 0` (`ALLOCATION` + nuevos `TaskStep`) o pasar el pedido a `ON_HOLD` liberando las reservas restantes de la tarea cuando no hay stock alternativo suficiente.
- `apps/api/src/use-cases/tasks/confirm-task-step.ts`: Integración de `handlePickingException` cuando `task.type === "PICKING"` y `(reportException || exceptionNote)`, enriqueciendo `ConfirmTaskStepResult` con `reallocated`, `orderStatus` y `replacementSteps`.
- `apps/api/src/use-cases/inventory/__tests__/handle-picking-exception.test.ts`: Suite de 13 tests unitarios cubriendo re-asignación en 1 y múltiples ubicaciones `STORAGE`, escaneo parcial previo, transición a `ON_HOLD` con liberación de pasos `PENDING` restantes, protección de no-negatividad (`allocatedQty >= 0`), aislamiento multi-tenant y validaciones `WmsError`.
- `apps/api/src/use-cases/tasks/__tests__/confirm-task-step.test.ts`: Actualización de los tests de reporte de excepción para verificar la delegación en `handlePickingException` en tareas `PICKING` y preservación del flujo en `PUTAWAY`.

## Decisiones de Diseño e Invariantes
- **Transacción Serializable + Bloqueo Pesimista (`SELECT ... FOR UPDATE`)**: Tanto la liberación del saldo reservado en la ubicación con incidencia como la consulta de ubicaciones `STORAGE` alternativas (`FOR UPDATE OF ib`) y la limpieza de otros pasos pendientes se ejecutan dentro de una única transacción `Serializable` (`timeout: 15_000`).
- **Inmutabilidad del Ledger (`InventoryTransaction`)**: Toda liberación de reserva inserta un asiento `ALLOCATION_CANCEL` y toda nueva reserva en ubicación alternativa inserta un asiento `ALLOCATION` con cantidad positiva (`quantity > 0`), sin realizar `UPDATE` ni `DELETE` sobre `inventory_transactions`.
- **No-Negatividad y Consistencia en `ON_HOLD`**: La cantidad a liberar se acota con `Math.min(Math.max(0, Number(balance.allocated_qty)), missingQty)` para impedir `allocatedQty < 0`. Cuando el ATP alternativo total no alcanza para cubrir `missingQty`, no se comprometen reservas parciales y se liberan también los demás pasos `PENDING` de la tarea (marcándolos `SKIPPED`), dejando el `SalesOrder` en `ON_HOLD` limpio para una futura ejecución de `allocateOrder`.
- **Aislamiento Multi-Tenant**: Todas las consultas Prisma y `$queryRaw` filtran explícitamente por `tenantId` (`tenant_id = ${tenantId}`).

## Resultados de Verificación
- Verificación estática exhaustiva de tipos (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`), imports ESM con extensión `.js` y cobertura de 13 escenarios en `handle-picking-exception.test.ts` + suite actualizada en `confirm-task-step.test.ts`.
