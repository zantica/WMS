# Reporte de Revisión de Auditoría — Feature `F2.2`

- **Feature**: `F2.2` — *Tests unitarios e integración para flujos de Receipts y Tasks en `@wms/api`*
- **Revisor**: Subagente `reviewer`
- **Fecha**: 2026-10-24
- **Veredicto**: `VEREDICTO: APPROVED`

---

## 1. Evaluación contra `CHECKPOINTS.md`

### CP-1: Integridad del Inventory Ledger (Bounded Context B) ⚠️ CRÍTICO
- [x] **Inmutabilidad absoluta**: Ningún archivo creado o modificado ejecuta `update`, `updateMany`, `delete` ni `deleteMany` sobre `prisma.inventoryTransaction`.
- [x] **Atomicidad SQL & Bloqueo pesimista**: Tanto [`confirmReceiptLine`](../apps/api/src/use-cases/tasks/confirm-receipt-line.ts) (`reason: "INBOUND_RECEIPT"`) como [`confirmTaskStep`](../apps/api/src/use-cases/tasks/confirm-task-step.ts) (`reason: "PUTAWAY"` y `reason: "PICK"`) delegan los movimientos físicos de stock en [`moveStock`](../apps/api/src/use-cases/inventory/move-stock.ts), preservando la transacción `Serializable` con `SELECT ... FOR UPDATE` y validación de no-negatividad.
- [x] **Liberación de reserva en Picking**: En `confirmTaskStep` (`task.type === "PICKING"`), tras mover el stock de `STORAGE` a `PACKING`, se decrementa `allocatedQty` en `InventoryBalance` acotado por `tenantId`, `locationId` y `productId`, y se incrementa `pickedQty` en `OrderLine`.

### CP-2: Aislamiento Multi-Tenant y Seguridad
- [x] **Filtro `tenantId` obligatorio**:
  - `confirm-receipt-line.ts`: filtra `warehouseTask.findFirst({ where: { id: taskId, tenantId, type: "RECEIVING" } })`, `product.findFirst({ where: { id: productId, tenantId } })` y propaga `tenantId` a `moveStock` y `createPutawayTask`.
  - `confirm-task-step.ts`: filtra `warehouseTask.findFirst({ where: { id: taskId, tenantId } })`, `salesOrder.findFirst({ where: { id: task.orderId, tenantId } })`, `location.findFirst({ where: { tenantId, ... } })`, `inventoryBalance.updateMany({ where: { tenantId, ... } })`, `orderLine.updateMany({ where: { ..., order: { tenantId } } })` y `taskStep.findMany({ where: { taskId: task.id, task: { tenantId } } })`.
  - `routes/receipts.ts` y `routes/tasks.ts`: inyectan `request.tenantId` y `request.userId` desde el plugin de autenticación.
- [x] **Sin fugas entre tenants**: Recursos inexistentes o pertenecientes a otro `tenantId` lanzan `WmsError("TASK_NOT_FOUND", ..., 404)`, `WmsError("PRODUCT_NOT_FOUND", ..., 404)` u `WmsError("ORDER_NOT_FOUND", ..., 404)`.

### CP-3: Contratos de API, Tipado y Arquitectura Monorepo
- [x] **Fronteras de paquetes**: `@wms/shared-types` permanece libre de dependencias de Prisma/ORM.
- [x] **Validación y Envolventes**:
  - `routes/receipts.ts` y `routes/tasks.ts` validan `request.body` con esquemas Zod (`ConfirmReceiptLineSchema` y `ConfirmStepSchema`) y retornan `{ success: true, data: result }`.
  - Todos los errores de dominio usan `WmsError` con códigos válidos en `WmsErrorCode` (`VALIDATION_ERROR`, `TASK_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `ORDER_NOT_FOUND`, `LOCATION_NOT_FOUND`, `INVALID_SCAN`, `WRONG_STEP_SEQUENCE`).
- [x] **TypeScript Estricto & ESM (`NodeNext`)**:
  - Todos los imports locales llevan extensión `.js`.
  - Interfaces `ConfirmReceiptLineParams` y `ConfirmTaskStepParams` declaran propiedades opcionales con `| undefined` para compatibilidad con `exactOptionalPropertyTypes: true` al recibir el resultado de `zod.parse()`.
  - Conversión explícita de `Prisma.Decimal` con `Number(...)` en `scannedQty` y `expectedQty`.

### CP-4: Verificación Automatizada y Cobertura
- [x] **Cobertura de ramas y casos borde (>= 80%)**:
  - [`confirm-receipt-line.test.ts`](../apps/api/src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts) (10 tests): cubre `scannedQty <= 0`, `TASK_NOT_FOUND` multi-tenant, tarea ya `COMPLETED`, `PRODUCT_NOT_FOUND`, `INVALID_SCAN`, paso ya `COMPLETED`, `WRONG_STEP_SEQUENCE`, recepción parcial (`PENDING`), tarea multi-línea parcial (`IN_PROGRESS`) y cierre total con disparo de `createPutawayTask`.
  - [`confirm-task-step.test.ts`](../apps/api/src/use-cases/tasks/__tests__/confirm-task-step.test.ts) (15 tests): cubre `TASK_NOT_FOUND` (tarea y step), tarea/step ya `COMPLETED`, `quantity <= 0`, `INVALID_SCAN`, reporte de excepción (`reportException` con nota explícita y nota por defecto hacia estado `EXCEPTION` sin llamar a `moveStock`), flujo `PUTAWAY` (`LOCATION_NOT_FOUND` y movimiento `RECEIVING -> STORAGE`) y flujo `PICKING` (`ORDER_NOT_FOUND`, `LOCATION_NOT_FOUND`, picking parcial y cierre total con transición de `SalesOrder` a `PACKED`).

---

## 2. Conclusión

La extracción de los casos de uso `confirmReceiptLine` y `confirmTaskStep` y sus suites de pruebas unitarias cumplen rigurosamente todos los invariantes de arquitectura, aislamiento multi-tenant y convenciones ESM/TypeScript estricto del proyecto.

`VEREDICTO: APPROVED`
