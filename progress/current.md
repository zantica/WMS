# Estado Actual de la Sesión (`progress/current.md`)

- **Última actualización**: 2026-11-10
- **Estado General**: ✅ **Feature `F6.1` (Hito 6 — Modo Offline-First, Parte API) completada y aprobada (`APPROVED`) — Listo para `F5.1`**
- **Hitos Completados**:
  - ✅ **Hito 1 — Esqueleto + Ledger** (`F1.1`, `F1.2`, `F1.3` en `done`)
  - ✅ **Hito 2 — App Expo + Inbound + Putaway** (`F2.1`, `F2.2`, `F2.3`, `F2.4` en `done`)
  - ✅ **Hito 3 — Motor de Pedidos + Picking** (`F3.1`, `F3.2`, `F3.3` en `done`)
  - ✅ **Hito 4 — Panel Web + Integración External** (`F4.1`, `F4.2` en `done`)
  - ✅ **Hito 7 — Visibilidad de Errores y Seguridad en Base de Datos** (`F7.1`, `F7.2` en `done`)
- **Orden de Ejecución Activo (Fase 2)**:
  1. ✅ **`F7.1`** — Observabilidad Estructurada, `correlationId` y Puerto `DiagnosticsStore` (`done`)
  2. ✅ **`F7.2`** — PostgreSQL Row Level Security (RLS) con `FORCE RLS` y Puerto `TenantContext` (`done`)
  3. ✅ **`F6.1`** — Puerto `IdempotencyStore` y Endpoint `POST /api/v1/tasks/sync-batch` (`done`)
  4. ⏳ **`F5.1`** — Carga masiva (Bulk Import) con modo `dryRun`, normalización y estrategia `ColumnMapper` (`pending`)
  5. ⏳ **`F5.2`** — Puerto `LabelRenderer` (QR + Code128) con Prefijos Tipados y Vista Web de Impresión (`pending`)
  6. ⏳ **`F6.2`** — Motor `OfflineSyncQueue` Hexagonal, Caché Local de Tareas y Auto-Sync con Cuarentena (`pending`)
- **Siguiente Feature en Cola**: `F5.1` — *Carga masiva (Bulk Import) desacoplada con modo `dryRun`, normalización y estrategia `ColumnMapper`*

---

## Endurecimiento del Harness (2026-11-09)

- Protocolo con **fuente única** en `.claude/agents/leader.md`; prohibido self-review y fallback por cuota.
- `APPROVED` exige evidencia ejecutada literal; nuevo veredicto `BLOCKED`; nuevo **CP-6** (higiene del código).
- `docs/adr/` con plantilla + índice; `KNOWLEDGE.md` depurado (guías de hitos cerrados → `docs/hitos/`).
- Eliminados `package-lock.json` (guarda en `init.*`) y re-exports huérfanos de mobile.
- ✅ **Re-auditoría y remediación completa de `F4.2`**: Subsanados los 15 hallazgos de seguridad JWT/Clerk, idempotencia estricta con `@@unique` + `P2002`, raw body en firmas HMAC, timeout de webhook, ADR 003 y 157 tests con cobertura >= 80% verificados independientemente en [`progress/review_F4.2.md`](./review_F4.2.md) (`APPROVED`).
- ✅ **Remediación CI PostgreSQL (`tenant-rls.integration.test.ts`) y SonarCloud (`zantica_WMS`) (2026-11-10)**:
  - Corregido el aborto de transacción PostgreSQL (`25P02`) aislando el fallo esperado `WITH CHECK` en su propio `withTenantContext` y limpiando entidades hijas en `afterAll`.
  - Corregidos los 11 issues de SonarCloud (`githubactions:S7637`, `githubactions:S6505`, `shell:S7688`, `shell:S6505`, `typescript:S2245`, `typescript:S8786`).
  - Integrado el barrido obligatorio de reglas SonarCloud en `CHECKPOINTS.md` (CP-7), `.claude/agents/reviewer.md`, `.claude/agents/committer.md` y `.claude/agents/leader.md` al finalizar cada implementación futura.
- ✅ **Unificación del Design System (`S5 dark-data-dense` / `P2 Refinada` / `T3`) en `@wms/shared-types`, `@wms/web` y `@wms/mobile` (2026-11-10)**:
  - Creada la fuente única de verdad en `packages/shared-types/src/design-tokens.ts` (`WMS_COLORS`, `WMS_RADII`, `WMS_SPACING`, `WMS_FONT_SIZES`, `WMS_DESIGN_TOKENS`, `buildWmsCssVariables` y resolutores visuales puros `resolveTaskStatusVisual`, `resolveTaskTypeVisual`, `resolveStepStatusVisual`, `resolveOrderStatusVisual`).
  - Rediseñadas y unificadas las 4 vistas operativas de `@wms/web` y las 9 pantallas/componentes de `@wms/mobile` (`apps/mobile/src/theme/tokens.ts` + primitivas `WmsUiPrimitives.tsx`: `WmsTag`, `WmsKpiCard`, `WmsBanner`, `WmsEmptyState`, `WmsProgressBar`).
  - Verificado independientemente en [`progress/review_uiux_shared_mobile.md`](./review_uiux_shared_mobile.md) (`APPROVED`): `0` hex crudos en los 18 archivos `.tsx`, `tabular-nums`, targets táctiles `>= 44px` y `196` tests en verde.

---

## Principios Rectores de Fase 2 (Obligatorios para todo código nuevo)

1. **Arquitectura Hexagonal (Puertos y Adaptadores)**:
   - Dominio y casos de uso sin acoplamiento directo a infraestructura (`Fastify`, `Expo`, `React`, librerías de formato o almacenamiento).
   - Todo recurso externo va detrás de un **Puerto** inyectado (`DiagnosticsStore`, `TenantContextPort`, `IdempotencyStore`, `ColumnMapper`, `LabelRenderer`, `OfflineQueueStorage`).
2. **TDD, Integración Real y Contratos**:
   - Tests unitarios con puertos simulados escritos primero (TDD) + tests de integración contra PostgreSQL real para locking, RLS e idempotencia.
   - Contratos compartidos en `@wms/shared-types` y decisiones no obvias documentadas en ADRs (`docs/adr/`).
