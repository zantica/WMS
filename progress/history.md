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


---

## [2026-10-26] Feature `F4.1` — Esqueleto del Dashboard Web en `apps/web` (Next.js App Router + `@wms/shared-types`)
- **Estado**: `done` (`VEREDICTO: APPROVED`)
- **Reportes en disco**:
  - Implementación: [`progress/impl_F4.1.md`](./impl_F4.1.md)
  - Revisión: [`progress/review_F4.1.md`](./review_F4.1.md)
- **Cambios clave**:
  - Inicialización del paquete `@wms/web` en `apps/web/` con Next.js App Router, `WmsWebApiClient` (`src/lib/api-client.ts`) y agregadores puros del supervisor (`src/lib/dashboard-metrics.ts`).
  - Vistas en `src/app/` para Resumen Ejecutivo (`/`), Catálogo y Mapa de Ubicaciones (`/catalog`), Balances `OnHand`/`Allocated`/`ATP` y Kardex (`/inventory`), y Monitoreo de Pedidos y Tareas (`/operations`).
  - Suites de tests unitarios en `apps/web/src/lib/__tests__/api-client.test.ts` y `apps/web/src/lib/__tests__/dashboard-metrics.test.ts`.


---

## [2026-10-26] Feature `F4.2` y Cierre del Hito 4 — Autenticación JWT y Webhooks de Integración Externa
- **Estado**: `done` (`VEREDICTO: APPROVED`) — **Hito 4 100% Completado**
- **Reportes en disco**:
  - Implementación: [`progress/impl_F4.2.md`](./impl_F4.2.md)
  - Revisión: [`progress/review_F4.2.md`](./review_F4.2.md)
- **Cambios clave**:
  - Verificación criptográfica JWT (HMAC-SHA256 / `timingSafeEqual`), expiración, validación de estado de usuario activo y matching de tenant en `apps/api/src/plugins/auth.ts`.
  - Guard de autorización por rol `requireRole` para `ADMIN`, `SUPERVISOR` y `OPERATOR`.
  - Ingesta idempotente de pedidos externos por `(tenantId, externalId)` con soporte `autoAllocate` en `ingest-external-order.ts` y ruta `POST /api/v1/webhooks/orders`.
  - Notificación saliente firmada `order.shipped` en `notify-order-shipped.ts` integrada en el despacho de pedidos.
  - Suites completas de tests unitarios en `auth.test.ts` (17 tests) y `webhooks.test.ts` (15 tests).


---

## [2026-10-31] Feature `F7.1` — Observabilidad Estructurada, `correlationId` y Puerto `DiagnosticsStore`
- **Estado**: `done` (`VEREDICTO: APPROVED`)
- **Reportes en disco**:
  - Implementación: [`progress/impl_F7.1.md`](./impl_F7.1.md)
  - Revisión: [`progress/review_F7.1.md`](./review_F7.1.md)
  - ADR: [`docs/adr/001-observability-and-diagnostics-port.md`](../docs/adr/001-observability-and-diagnostics-port.md)
- **Cambios clave**:
  - Nuevos contratos en `@wms/shared-types` (`CORRELATION_ID_HEADER`, `DiagnosticErrorRecord`, `ListDiagnosticErrorsFilters`, `FORBIDDEN`, `ApiError.error.correlationId`).
  - Puerto hexagonal `DiagnosticsStore` (`apps/api/src/ports/diagnostics-store.ts`), adaptador `InMemoryDiagnosticsStore` (ring buffer FIFO por `tenantId`) y casos de uso puros en `apps/api/src/use-cases/diagnostics/` (`recordDiagnosticError`, `listDiagnosticErrors`, `redactSensitiveData`, `resolveSafeCorrelationId`).
  - Plugin Fastify `observabilityPlugin`, actualización de `errorHandler`, ruta `GET /api/v1/diagnostics/errors` (restringida a `ADMIN`/`SUPERVISOR`) y propagación de `x-correlation-id` en `@wms/web` y `@wms/mobile`.
  - 155 tests pasando en total y cobertura de `99.65%` en `@wms/api`.


---

## [2026-10-31] Feature `F7.2` y Cierre del Hito 7 — PostgreSQL Row Level Security (RLS) con `FORCE RLS` y Puerto `TenantContext`
- **Estado**: `done` (`VEREDICTO: APPROVED`) — **Hito 7 100% Completado**
- **Reportes en disco**:
  - Implementación: [`progress/impl_F7.2.md`](./impl_F7.2.md)
  - Revisión: [`progress/review_F7.2.md`](./review_F7.2.md)
  - ADR: [`docs/adr/002-postgresql-rls-and-tenant-context.md`](../docs/adr/002-postgresql-rls-and-tenant-context.md)
- **Cambios clave**:
  - Migración SQL `packages/db/prisma/migrations/20261031010000_tenant_rls/migration.sql` y módulo `@wms/db/rls` habilitando `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` con predicados `USING` y `WITH CHECK` (denegación por defecto ante contexto vacío/nulo) sobre las 10 tablas multi-tenant y resolución controlada de auth (`app.auth_clerk_id`).
  - Puerto hexagonal `TenantContextPort` (`apps/api/src/ports/tenant-context.ts`), caso de uso `executeInTenantContext` (`apps/api/src/use-cases/security/tenant-context.ts`) y adaptador `PrismaTenantContextAdapter` (`withTenantContext` con `SET LOCAL` vía `set_config('app.current_tenant_id', tenantId, true)` compatible con `IsolationLevel.Serializable`, `SELECT ... FOR UPDATE` y reutilización de `TransactionClient` en los casos de uso del Ledger).
  - 171 tests pasando en el monorepo (137 en `@wms/api`) y cobertura de `99.20%` en `use-cases` (`100%` en `security/tenant-context.ts`).

---

## [2026-11-09] Endurecimiento del Sistema Harness (post-análisis)
- **Motivo**: análisis externo detectó que `F4.2` se cerró con self-review del leader y CP-4 sin tests ejecutados (ver `KNOWLEDGE.md` → Bug #5).
- **Cambios**:
  - `.claude/agents/leader.md` pasa a ser la **fuente única** del protocolo; `CLAUDE.md` y `.agents/skills/harness-orchestrator/SKILL.md` solo apuntan a él.
  - Prohibido el self-review y el fallback por cuota: sin reviewer independiente la feature queda `in_progress`.
  - `reviewer.md`: `APPROVED` exige salida literal de `pnpm --filter @wms/api test:coverage`; nuevo veredicto `BLOCKED`.
  - `CHECKPOINTS.md`: CP-4 con evidencia obligatoria; nuevo **CP-6** (higiene: sin duplicados, re-exports huérfanos ni lockfiles ajenos).
  - `docs/adr/000-template.md` + `docs/adr/README.md` (índice).
  - `KNOWLEDGE.md` depurado (22 KB → ~15 KB); guías de Hitos 1–4 archivadas en `docs/hitos/`.
  - Eliminados `package-lock.json` (+ `.gitignore` + guarda en `init.ps1`/`init.sh`), `apps/mobile/src/components/BarcodeScannerView.tsx` y `apps/mobile/src/context/session-context.tsx` (re-exports sin consumidores).
  - Re-auditoría independiente de `F4.2` → [`progress/review_F4.2_reaudit.md`](./review_F4.2_reaudit.md) con veredicto **`CHANGES_REQUESTED`** (15 hallazgos de seguridad JWT/Clerk, idempotencia concurrente y cobertura). `F4.2` se revierte a `"in_progress"` en `feature_list.json`.
  - Remediación por el subagente `implementer` ([`progress/impl_F4.2.md`](./impl_F4.2.md)) y re-evaluación por `reviewer` independiente ([`progress/review_F4.2.md`](./review_F4.2.md)) con veredicto **`APPROVED`** (157 tests en `@wms/api`, 0 fallos, 90.54% branches en `integrations`, ADR 003 y migración `@@unique([tenantId, externalId])`). `F4.2` queda formalmente cerrada en `"done"`.


---

## [2026-11-10] Feature `F6.1` — Puerto `IdempotencyStore` y Endpoint `POST /api/v1/tasks/sync-batch`
- **Estado**: `done` (`VEREDICTO: APPROVED`)
- **Reportes en disco**:
  - Implementación: [`progress/impl_F6.1.md`](./impl_F6.1.md)
  - Revisión: [`progress/review_F6.1.md`](./review_F6.1.md)
  - ADR: [`docs/adr/004-offline-idempotency-and-sync-batch.md`](../docs/adr/004-offline-idempotency-and-sync-batch.md)
- **Cambios clave**:
  - Nuevos contratos en `@wms/shared-types` (`SyncTaskBatchItem`, `SyncTaskBatchRequest`, `SyncBatchItemResult`, `SyncTaskBatchResult`, `IdempotencyRecordDTO`, error `"CONFLICT"`).
  - Modelo Prisma `IdempotencyRecord` y migración SQL `20261110120000_idempotency_records` con restricción única `@@unique([tenantId, idempotencyKey])` y protección `ENABLE` + `FORCE ROW LEVEL SECURITY` (`idempotency_records_tenant_isolation_policy`).
  - Puerto hexagonal `IdempotencyStore` (`apps/api/src/ports/idempotency-store.ts`) con adaptadores `InMemoryIdempotencyStore` y `PrismaIdempotencyStore` participando en la misma transacción `Serializable` del Ledger para `confirmTaskStep` y `confirmReceiptLine`.
  - Caso de uso `syncTaskBatch` (`apps/api/src/use-cases/tasks/sync-task-batch.ts`) y endpoint `POST /api/v1/tasks/sync-batch` con ordenación FIFO por `occurredAt`, registro de `receivedAt` y política Servidor-Gana (`CONFLICT` / `REJECTED`).
  - 180 tests unitarios pasando en `@wms/api` (cobertura de `93.32%` en `use-cases`) y 3 tests de integración en PostgreSQL 16 real (`idempotency.integration.test.ts`).
