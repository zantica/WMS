# Estado Actual de la Sesión (`progress/current.md`)

- **Última actualización**: 2026-11-09
- **Estado General**: ✅ **Hito 4 formalmente cerrado (`F4.2` `APPROVED` y en `done`) — Listo para Hito 6 (`F6.1`)**
- **Hitos Completados**:
  - ✅ **Hito 1 — Esqueleto + Ledger** (`F1.1`, `F1.2`, `F1.3` en `done`)
  - ✅ **Hito 2 — App Expo + Inbound + Putaway** (`F2.1`, `F2.2`, `F2.3`, `F2.4` en `done`)
  - ✅ **Hito 3 — Motor de Pedidos + Picking** (`F3.1`, `F3.2`, `F3.3` en `done`)
  - ✅ **Hito 4 — Panel Web + Integración External** (`F4.1`, `F4.2` en `done`)
  - ✅ **Hito 7 — Visibilidad de Errores y Seguridad en Base de Datos** (`F7.1`, `F7.2` en `done`)
- **Orden de Ejecución Activo (Fase 2)**:
  1. ✅ **`F7.1`** — Observabilidad Estructurada, `correlationId` y Puerto `DiagnosticsStore` (`done`)
  2. ✅ **`F7.2`** — PostgreSQL Row Level Security (RLS) con `FORCE RLS` y Puerto `TenantContext` (`done`)
  3. ⏳ **`F6.1`** — Puerto `IdempotencyStore` y Endpoint `POST /api/v1/tasks/sync-batch` (`pending`)
  4. ⏳ **`F5.1`** — Carga masiva (Bulk Import) con modo `dryRun`, normalización y estrategia `ColumnMapper` (`pending`)
  5. ⏳ **`F5.2`** — Puerto `LabelRenderer` (QR + Code128) con Prefijos Tipados y Vista Web de Impresión (`pending`)
  6. ⏳ **`F6.2`** — Motor `OfflineSyncQueue` Hexagonal, Caché Local de Tareas y Auto-Sync con Cuarentena (`pending`)
- **Siguiente Feature en Cola**: `F6.1` — *Puerto `IdempotencyStore` y Endpoint `POST /api/v1/tasks/sync-batch`*

---

## Endurecimiento del Harness (2026-11-09)

- Protocolo con **fuente única** en `.claude/agents/leader.md`; prohibido self-review y fallback por cuota.
- `APPROVED` exige evidencia ejecutada literal; nuevo veredicto `BLOCKED`; nuevo **CP-6** (higiene del código).
- `docs/adr/` con plantilla + índice; `KNOWLEDGE.md` depurado (guías de hitos cerrados → `docs/hitos/`).
- Eliminados `package-lock.json` (guarda en `init.*`) y re-exports huérfanos de mobile.
- ✅ **Re-auditoría y remediación completa de `F4.2`**: Subsanados los 15 hallazgos de seguridad JWT/Clerk, idempotencia estricta con `@@unique` + `P2002`, raw body en firmas HMAC, timeout de webhook, ADR 003 y 157 tests con cobertura >= 80% verificados independientemente en [`progress/review_F4.2.md`](./review_F4.2.md) (`APPROVED`).

---

## Principios Rectores de Fase 2 (Obligatorios para todo código nuevo)

1. **Arquitectura Hexagonal (Puertos y Adaptadores)**:
   - Dominio y casos de uso sin acoplamiento directo a infraestructura (`Fastify`, `Expo`, `React`, librerías de formato o almacenamiento).
   - Todo recurso externo va detrás de un **Puerto** inyectado (`DiagnosticsStore`, `TenantContextPort`, `IdempotencyStore`, `ColumnMapper`, `LabelRenderer`, `OfflineQueueStorage`).
2. **TDD, Integración Real y Contratos**:
   - Tests unitarios con puertos simulados escritos primero (TDD) + tests de integración contra PostgreSQL real para locking, RLS e idempotencia.
   - Contratos compartidos en `@wms/shared-types` y decisiones no obvias documentadas en ADRs (`docs/adr/`).
