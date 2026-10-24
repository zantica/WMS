# Dictamen de Auditoría — `F2.1`: Generación automática de tarea PUTAWAY al completar RECEIVING

- **Feature**: `F2.1` — *Generación automática de tarea PUTAWAY al completar RECEIVING*
- **Auditor**: Subagente `reviewer`
- **Fecha**: 2026-10-24
- **Archivos auditados**:
  - `apps/api/src/use-cases/inventory/create-putaway-task.ts`
  - `apps/api/src/use-cases/inventory/__tests__/create-putaway-task.test.ts`
  - `apps/api/src/routes/receipts.ts`
  - `apps/api/src/routes/tasks.ts`
  - `packages/shared-types/src/index.ts`
  - `apps/api/src/use-cases/inventory/__tests__/allocate-order.test.ts`
  - `apps/api/src/use-cases/inventory/__tests__/move-stock.test.ts`

---

## Evaluación de Puntos de Control (`CHECKPOINTS.md`)

### CP-1: Integridad del Inventory Ledger (Bounded Context B) — ✅ CUMPLE
- **Inmutabilidad absoluta**: Ningún archivo ejecuta `update`, `updateMany`, `delete` ni `deleteMany` sobre `inventoryTransaction`.
- **Atomicidad SQL**: `createPutawayTask` se ejecuta íntegramente dentro de `prisma.$transaction(..., { isolationLevel: "Serializable" })`.
- **Consistencia contable (`RECEIVING -> PUTAWAY -> STORAGE`)**:
  - En `apps/api/src/routes/receipts.ts`, cada confirmación de línea invoca `moveStock` con razón `INBOUND_RECEIPT` hacia la ubicación `RECEIVING`, y al completarse todos los pasos dispara `createPutawayTask`.
  - En `apps/api/src/routes/tasks.ts`, la confirmación de pasos `PUTAWAY` ahora exige que exista una ubicación `RECEIVING` activa en `step.location.warehouseId` para el `tenantId` actual (lanzando `WmsError("LOCATION_NOT_FOUND", ..., 409)` en caso contrario), evitando que `fromLocationId` sea `undefined` y garantizando que `moveStock` descuente de `RECEIVING` con bloqueo pesimista `FOR UPDATE` y valide no-negatividad antes de acreditar en `STORAGE`.

### CP-2: Aislamiento Multi-Tenant y Seguridad — ✅ CUMPLE
- **Filtro `tenantId` obligatorio**:
  - `create-putaway-task.ts`: filtra por `tenantId` en `tx.warehouseTask.findFirst` y `tx.location.findMany`.
  - `receipts.ts`: filtra por `tenantId: request.tenantId` en `warehouse.findFirst`, `product.findMany`, `location.findFirst`, `warehouseTask.findFirst` y `product.findFirst`.
  - `tasks.ts`: filtra por `tenantId: request.tenantId` en `warehouseTask.findMany`, `warehouseTask.findFirst`, `salesOrder.findFirst` y `location.findFirst` (tanto para `PACKING` como para `RECEIVING`).
- **Sin fugas entre tenants**: Recursos inexistentes o de otro tenant lanzan `WmsError("TASK_NOT_FOUND", ..., 404)`.

### CP-3: Contratos de API, Tipado y Arquitectura Monorepo — ✅ CUMPLE
- **Fronteras de paquetes**: `packages/shared-types/src/index.ts` se mantiene libre de dependencias de `@prisma/client` o `@wms/db`, actualizando `WarehouseTaskDTO.orderId` a `string | null`.
- **Validación y Envolventes**: Entradas HTTP validadas con Zod (`CreateReceiptSchema`, `ConfirmReceiptLineSchema`, `ConfirmStepSchema`), respuestas envueltas en `{ success: true, data: ... }` (`ApiResponse<T>`), e inclusión de `putawayTaskId` en la respuesta de `POST /api/v1/receipts/:taskId/confirm-line`.
- **TypeScript Estricto & ESM**: Cumplimiento de `strict: true`, `noUncheckedIndexedAccess: true` (guardia explícita `if (!firstStep)`) y `exactOptionalPropertyTypes: true` (`...(request.userId ? { userId: request.userId } : {})`). Todos los imports relativos locales incluyen la extensión `.js`.

### CP-4: Verificación Automatizada y Cobertura — ✅ CUMPLE
- **Cobertura y casos borde**: `apps/api/src/use-cases/inventory/__tests__/create-putaway-task.test.ts` incluye 7 tests unitarios que cubren el 100% de las ramas, funciones y líneas de `create-putaway-task.ts` (≥ 80% requerido):
  1. `TASK_NOT_FOUND` (404) cuando la tarea no existe o pertenece a otro tenant.
  2. `VALIDATION_ERROR` (422) cuando la tarea no es de tipo `RECEIVING`.
  3. `VALIDATION_ERROR` (409) cuando la tarea `RECEIVING` no está `COMPLETED`.
  4. `VALIDATION_ERROR` (422) cuando ningún paso tiene `scannedQty > 0`.
  5. `LOCATION_NOT_FOUND` (409) cuando el almacén no posee ubicaciones `STORAGE` activas.
  6. Creación exitosa de tarea `PUTAWAY` con `expectedQty = scannedQty`.
  7. Asignación determinista de múltiples ubicaciones `STORAGE` y ordenamiento de `TaskStep`s por `location.code ASC` (`sequence: 1..N`), ignorando pasos con `scannedQty === 0` y respetando sobrerrecepciones.

---

## Veredicto Final

**VEREDICTO: APPROVED**
