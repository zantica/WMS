# Historial de Sesiones (`progress/history.md`)

Registro histórico *append-only* de hitos y features completadas bajo el sistema Harness.

---

## [2026-10-24] Inicialización del Sistema Harness + Línea Base Hito 1
- **Features completadas previamente (Línea Base)**:
  - `F1.1`: Monorepo Turborepo + Esquema Prisma Multi-Tenant + Shared Types (`done`)
  - `F1.2`: Caso de uso `moveStock` con Ledger Inmutable y `SELECT FOR UPDATE` (`done`)
  - `F1.3`: Caso de uso `allocateOrder` y API REST base (`done`)
- **Infraestructura Harness instalada**:
  - Punto de entrada y reglas: `AGENTS.md`, `CLAUDE.md`, `CHECKPOINTS.md`, `feature_list.json`.
  - Documentación modular: `docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`.
  - Subagentes y Skills: `.claude/agents/{leader,implementer,reviewer}.md` y `.agents/skills/harness-orchestrator/SKILL.md`.
  - Scripts Pre-Flight: `init.sh` y `init.ps1`.

---

## [2026-10-24] Feature `F2.1` — Generación automática de tarea PUTAWAY al completar RECEIVING
- **Estado**: `done` (`VEREDICTO: APPROVED`)
- **Reportes en disco**:
  - Implementación: [`progress/impl_F2.1.md`](./impl_F2.1.md)
  - Revisión: [`progress/review_F2.1.md`](./review_F2.1.md)
- **Cambios clave**:
  - Nuevo caso de uso `createPutawayTask` en `apps/api/src/use-cases/inventory/create-putaway-task.ts` con aislamiento `Serializable`, validación multi-tenant y asignación determinista de ubicaciones `STORAGE` (`code ASC`).
  - Integración automática en `POST /api/v1/receipts/:taskId/confirm-line` y consistencia de almacén en `POST /api/v1/tasks/:id/steps/:stepId/confirm`.
  - Suite de 7 tests unitarios en `apps/api/src/use-cases/inventory/__tests__/create-putaway-task.test.ts`.

---

## [2026-10-24] Feature `F2.2` — Tests unitarios e integración para flujos de Receipts y Tasks en `@wms/api`
- **Estado**: `done` (`VEREDICTO: APPROVED`)
- **Reportes en disco**:
  - Implementación: [`progress/impl_F2.2.md`](./impl_F2.2.md)
  - Revisión: [`progress/review_F2.2.md`](./review_F2.2.md)
- **Cambios clave**:
  - Extracción de `confirmReceiptLine` y `confirmTaskStep` a `apps/api/src/use-cases/tasks/`.
  - 25 nuevos tests unitarios en `confirm-receipt-line.test.ts` (10 tests) y `confirm-task-step.test.ts` (15 tests) validando `INVALID_SCAN`, `EXCEPTION`, recepciones parciales/totales con `createPutawayTask` y flujos `PUTAWAY` / `PICKING`.

---

## [2026-10-24] Feature `F2.3` — Esqueleto de App Móvil para Operarios en `apps/mobile` (Expo + TypeScript)
- **Estado**: `done` (`VEREDICTO: APPROVED`)
- **Reportes en disco**:
  - Implementación: [`progress/impl_F2.3.md`](./impl_F2.3.md)
  - Revisión: [`progress/review_F2.3.md`](./review_F2.3.md)
- **Cambios clave**:
  - Creación del paquete `@wms/mobile` en `apps/mobile/` integrado con Turborepo y `@wms/shared-types`.
  - Cliente HTTP tipado (`WmsApiClient` y `WmsApiClientError`) con suite de 8 tests unitarios en `apps/mobile/src/api/__tests__/client.test.ts`.
  - Navegación Expo Router (`login.tsx`, bandeja de tareas en `(tabs)/index.tsx`, escáner en `(tabs)/scanner.tsx`) y componente dual de lectura `BarcodeScannerBox.tsx`.

---

## [2026-10-24] Feature `F2.4` y Cierre del Hito 2 — Flujo móvil de Recepción (Inbound) y Putaway guiado por escaneo
- **Estado**: `done` (`VEREDICTO: APPROVED`) — **Hito 2 100% Completado**
- **Reportes en disco**:
  - Implementación: [`progress/impl_F2.4.md`](./impl_F2.4.md)
  - Revisión: [`progress/review_F2.4.md`](./review_F2.4.md)
- **Cambios clave**:
  - Creación de `apps/mobile/src/workflows/inbound-putaway.ts` y su suite de tests unitarios en `apps/mobile/src/workflows/__tests__/inbound-putaway.test.ts`.
  - Pantallas guiadas `apps/mobile/app/tasks/receiving/[taskId].tsx` (`POST /api/v1/receipts/:taskId/confirm-line` + transición directa al Putaway generado) y `apps/mobile/app/tasks/putaway/[taskId].tsx` (`POST /api/v1/tasks/:id/start` + `POST /api/v1/tasks/:id/steps/:stepId/confirm` + reporte de excepciones).
  - Feedback visual estructurado para errores de dominio (`INVALID_SCAN`, `INSUFFICIENT_STOCK`, `WRONG_STEP_SEQUENCE`, `LOCATION_NOT_FOUND`, `TASK_NOT_FOUND`).


---

## [2026-10-26] Feature `F3.1` — Cancelación de Pedidos y liberación atómica de reservas (`ALLOCATION_CANCEL`)
- **Estado**: `done` (`VEREDICTO: APPROVED`)
- **Reportes en disco**:
  - Implementación: [`progress/impl_F3.1.md`](./impl_F3.1.md)
  - Revisión: [`progress/review_F3.1.md`](./review_F3.1.md)
- **Cambios clave**:
  - Nuevo caso de uso `cancelOrder` en `apps/api/src/use-cases/inventory/cancel-order.ts` con aislamiento `Serializable`, bloqueo pesimista `SELECT ... FOR UPDATE`, liberación de `allocatedQty` sin valores negativos, registro inmutable `ALLOCATION_CANCEL` y cancelación de tareas `PICKING` activas.
  - Endpoint `POST /api/v1/orders/:id/cancel` en `apps/api/src/routes/orders.ts` con validación Zod y contrato `ApiResponse<CancelOrderResult>`.
  - Suite de 10 tests unitarios en `apps/api/src/use-cases/inventory/__tests__/cancel-order.test.ts`.


---

## [2026-10-26] Feature `F3.2` — Gestión de Excepciones de Picking y Re-asignación de Stock
- **Estado**: `done` (`VEREDICTO: APPROVED`)
- **Reportes en disco**:
  - Implementación: [`progress/impl_F3.2.md`](./impl_F3.2.md)
  - Revisión: [`progress/review_F3.2.md`](./review_F3.2.md)
- **Cambios clave**:
  - Nuevo caso de uso `handlePickingException` en `apps/api/src/use-cases/inventory/handle-picking-exception.ts` con aislamiento `Serializable` y `SELECT ... FOR UPDATE`: libera la reserva de la ubicación con excepción (`ALLOCATION_CANCEL`) y re-aloca en ubicaciones `STORAGE` alternativas con `ATP > 0` (`ALLOCATION` + nuevos `TaskStep`) o pasa el pedido a `ON_HOLD` liberando los pasos pendientes restantes.
  - Integración en `apps/api/src/use-cases/tasks/confirm-task-step.ts` para tareas `PICKING`.
  - Suite de 13 tests unitarios en `apps/api/src/use-cases/inventory/__tests__/handle-picking-exception.test.ts` y actualización de `apps/api/src/use-cases/tasks/__tests__/confirm-task-step.test.ts`.


---

## [2026-10-26] Feature `F3.3` y Cierre del Hito 3 — Flujo móvil de Picking y Packing paso a paso en `@wms/mobile`
- **Estado**: `done` (`VEREDICTO: APPROVED`) — **Hito 3 100% Completado**
- **Reportes en disco**:
  - Implementación: [`progress/impl_F3.3.md`](./impl_F3.3.md)
  - Revisión: [`progress/review_F3.3.md`](./review_F3.3.md)
- **Cambios clave**:
  - Creación de `apps/mobile/src/workflows/picking.ts` con recorrido ordenado por `locationCode ASC`, máquina de estados de doble escaneo (`AWAITING_LOCATION` → `AWAITING_PRODUCT` → `READY_TO_CONFIRM`) y formateo de excepciones/re-asignaciones en tiempo real (`formatPickingExceptionFeedback`).
  - Creación de la pantalla guiada `apps/mobile/app/tasks/picking/[taskId].tsx` con validación dual (estantería `STORAGE` + barcode/SKU), reporte de incidencias conectado con `F3.2` y cierre en Mesa de Packing con confirmación de despacho (`POST /api/v1/orders/:id/dispatch`).
  - Suite de tests unitarios en `apps/mobile/src/workflows/__tests__/picking.test.ts` y actualización de `client.test.ts` e `inbound-putaway.test.ts`.
