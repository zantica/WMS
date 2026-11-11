# ADR 007: Adopción de `@wms/domain` en `@wms/api` mediante `UnitOfWork` y repositorios hexagonales

- **Estado**: Aceptado
- **Fecha**: 2026-11-11
- **Feature**: `DOM-2` — Adopción de `@wms/domain` en `@wms/api`: puertos `InventoryRepository`/`TaskRepository`/`OrderRepository`/`UnitOfWork` + adaptadores Prisma y refactor de los casos de uso críticos

---

## 1. Contexto

Con `DOM-1` (ADR 006) se extrajeron los agregados (`InventoryBalance`, `WarehouseTask`, `TaskStep`) y máquinas de estado (`OrderStatus`, `TaskStatus`, `StepStatus`) al paquete puro `@wms/domain`. Sin embargo, los 5 casos de uso críticos de `@wms/api` (`move-stock`, `allocate-order`, `cancel-order`, `confirm-task-step`, `handle-picking-exception`) seguían importando `@wms/db` directamente, mezclando SQL crudo y reglas de negocio, e impidiendo probarlos sin `vi.mock("@wms/db")`.

Además, existían divergencias entre la implementación legada y el dominio estricto que debían resolverse preservando el contrato público HTTP/`WmsErrorCode`:
- `moveStock` validaba `onHand >= qty` sin considerar `allocated` (permitiendo mover stock reservado).
- `confirm-task-step` decrementaba `allocatedQty` sin guarda y no persistía `IN_PROGRESS` en el primer escaneo; permitía re-escaneo sobre `EXCEPTION`/`SKIPPED` y sobre-escaneo.
- Los errores internos del dominio (`DomainError`) tienen códigos internos (`INVALID_QUANTITY`, `STEP_ALREADY_RESOLVED`, `SCAN_EXCEEDS_EXPECTED`, etc.) que no deben romper el contrato público `WmsErrorCode` de `@wms/shared-types`.

Alternativas descartadas:
- Pasar `Prisma.TransactionClient` a los casos de uso mientras se invoca `@wms/domain`: mantiene el acoplamiento con Prisma y obliga a seguir mockeando `@wms/db` en tests unitarios.
- Exponer los `DomainError.code` directamente en la API HTTP: rompería contratos existentes con `web` y `mobile`.

## 2. Decisión

1. **Puertos hexagonales (`apps/api/src/ports/`)**:
   - `InventoryRepository`: acceso con `findBalanceForUpdate`, `findStorageBalancesForUpdate`, `saveBalance`, `recordTransaction` (append-only) y búsqueda de ubicaciones.
   - `OrderRepository`: `findById`, `updateStatus`, `incrementPickedQty`, `findActivePickingTasks`.
   - `TaskRepository`: reconstrucción y persistencia del agregado `WarehouseTask`/`TaskStep` (`findById`, `create`, `addStep`, `save`).
   - `UnitOfWork`: `execute(tenantId, work, options)` coordina los tres repositorios dentro de una única transacción atómica.
2. **Adaptadores duales (LSP, `apps/api/src/adapters/`)**:
   - `PrismaUnitOfWork` + `PrismaInventoryRepository` / `PrismaOrderRepository` / `PrismaTaskRepository`: preservan `IsolationLevel.Serializable`, `SELECT ... FOR UPDATE`, `withTenantContext` (RLS) y filtro explícito por `tenantId` (incluyendo `updateMany` con `tenantId`). Soportan reutilización de `AsyncLocalStorage` (`runWithAmbientTenantScope`) y `tx` explícito por compatibilidad con llamadores pendientes (`confirm-receipt-line`).
   - `InMemoryUnitOfWork` + repositorios en memoria: ejecutan los mismos agregados reales de `@wms/domain` con snapshot/rollback completo ante excepciones, sustituyendo `vi.mock("@wms/db")` en tests unitarios.
3. **Reglas de negocio alineadas y mapeo de errores**:
   - `moveStock` usa `InventoryBalance.withdraw(qty)` (`qty <= available`).
   - `confirm-task-step` en `PICKING` usa `InventoryBalance.consume(qty)` (evitando retirar stock no reservado) y persiste `IN_PROGRESS` al primer escaneo; rechaza sobre-escaneo y re-escaneo en `COMPLETED`/`EXCEPTION`/`SKIPPED`; pasa el pedido directamente de `ALLOCATED` a `PACKED` (`PICKING` no se escribe).
   - `cancel-order` y `handle-picking-exception` usan `InventoryBalance.releaseUpTo(qty)` (clamp a `0`).
   - `apps/api/src/shared/domain-error-mapper.ts` traduce todo `DomainError` a `WmsError` conservando los códigos HTTP y `WmsErrorCode` públicos (`VALIDATION_ERROR`, `INSUFFICIENT_STOCK`, `TASK_NOT_FOUND`, `ORDER_ALREADY_ALLOCATED`).
4. **Alcance diferido**:
   - `create-putaway-task`, `confirm-receipt-line` y `sync-task-batch` quedan documentados como pendientes para una iteración posterior (mantienen compatibilidad vía `tx` opaco).

## 3. Consecuencias

- **Positivas**: casos de uso desacoplados de Prisma, testeables con `InMemoryUnitOfWork` en milisegundos sin mocks frágiles de `$queryRaw`; invariantes del dominio protegidas por construcción; paridad de enums verificada automáticamente.
- **Negativas / Riesgos**: existen dos juegos de adaptadores (Prisma e InMemory) que deben mantenerse sincronizados respecto al contrato de los puertos (mitigado por tests de integración PostgreSQL para locking y concurrencia).
- **Verificación**:
  - Paridad de enums y mapeo `DomainError -> WmsError`: `apps/api/src/__tests__/domain-prisma-parity.test.ts`.
  - Suites unitarias (Happy Path + "Romper a propósito") con `InMemoryUnitOfWork` en los 5 casos de uso (`move-stock`, `allocate-order`, `cancel-order`, `handle-picking-exception`, `confirm-task-step`).
  - Integración PostgreSQL real (locking/concurrencia `Serializable` + `SELECT ... FOR UPDATE`): `apps/api/src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts`.
