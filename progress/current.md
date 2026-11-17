# Estado Actual de la Sesión (`progress/current.md`)

- **Última actualización**: 2026-11-17
- **Estado General**: ✅ **`F9.3` completada y aprobada (`APPROVED` en `progress/review_F9.3.md`) — Siguiente: `F5.1` (Bulk Import)**
- **Hitos Completados**:
  - ✅ **Hito 1 — Esqueleto + Ledger** (`F1.1`, `F1.2`, `F1.3` en `done`)
  - ✅ **Hito 2 — App Expo + Inbound + Putaway** (`F2.1`, `F2.2`, `F2.3`, `F2.4` en `done`)
  - ✅ **Hito 3 — Motor de Pedidos + Picking** (`F3.1`, `F3.2`, `F3.3` en `done`)
  - ✅ **Hito 4 — Panel Web + Integración External** (`F4.1`, `F4.2` en `done`)
  - ✅ **Hito 6 — Modo Offline-First (API + Móvil)** (`F6.1`, `F6.2` en `done`)
  - ✅ **Hito 7 — Visibilidad de Errores y Seguridad en Base de Datos** (`F7.1`, `F7.2` en `done`)
- **Orden de Ejecución Activo (Fase 2)**:
  1. ✅ **`F7.1`** — Observabilidad Estructurada, `correlationId` y Puerto `DiagnosticsStore` (`done`)
  2. ✅ **`F7.2`** — PostgreSQL Row Level Security (RLS) con `FORCE RLS` y Puerto `TenantContext` (`done`)
  3. ✅ **`F6.1`** — Puerto `IdempotencyStore` y Endpoint `POST /api/v1/tasks/sync-batch` (`done`)
  4. ✅ **`F6.2`** — Motor `OfflineSyncQueue` Hexagonal, Caché Local de Tareas y Auto-Sync con Cuarentena (`done`)
  5. ✅ **`FIX-SONAR-DUP`** — Remediación de duplicación SonarCloud: `.sonarcloud.properties` + refactorización DRY en tareas móviles (`done`)
  6. ✅ **`F9.1`** — Maestro de Producto WMS, Categorías configurables, Búsqueda por SKU y Gestión de Usuarios/Roles (`done`, `APPROVED` en [`progress/review_F9.1.md`](./review_F9.1.md))
  7. ✅ **`F9.2`** — Topología Física (`RACK` / `SHELVING` / `FLOOR`), Alta Estructurada y Vista Gráfica del Layout (`done`, `APPROVED` en [`progress/review_F9.2.md`](./review_F9.2.md))
  8. ✅ **`F9.4`** — Generación Automática de SKU por Categoría (`ROPA-001`) y Código de Barras en Alta de Producto (`done`, `APPROVED` en [`progress/review_F9.4.md`](./review_F9.4.md))
  9. ✅ **`F9.3`** — Internacionalización Multi-Idioma (`es-ES` / `es-419` / `en-US` / `pt-BR` / `pt-PT`) Tipada en `@wms/shared-types` + `@wms/web` con Persistencia en Cookie y Autodetección de Navegador (`done`, `APPROVED` en [`progress/review_F9.3.md`](./review_F9.3.md))
  10. ⏳ **`F5.1`** — Carga masiva (Bulk Import) con modo `dryRun`, normalización y estrategia `ColumnMapper` (`pending`)
  11. ✅ **`F5.2`** — Puerto `LabelRenderer` (QR + Code128) con Prefijos Tipados y Vista Web de Impresión (`done`, `APPROVED` en [`progress/review_F5.2.md`](./review_F5.2.md))
- **Sesión Actual (2026-11-17 — Hito 9 `F9.4` Completada)**:
  - ✅ **`F9.4`** (`done`, review `APPROVED` en [`progress/review_F9.4.md`](./review_F9.4.md)): Extensión del caso de uso `createProduct` en `apps/api/src/use-cases/catalog/manage-products.ts` para soportar `sku` opcional (con cálculo y prefijo por código de categoría, ej. `ROPA-001`, y fallback general `GEN-001` si no hay categoría) y `barcode` opcional (generación automática de código de barras numérico tipo EAN-13 interno con checksum o Code128 unívoco sin colisión). Contrato `CreateProductInput` actualizado en `@wms/shared-types`, ruta `POST /api/v1/products` con validación Zod (`sku` y `barcode` opcionales), adaptación en UI `/catalog` (`apps/web`) y suite exhaustiva de tests unitarios y de rutas.
- **Sesión Actual (2026-11-17 — Hito 9 `F9.2` Completada)**:
  - ✅ **`F9.2`** (`done`, review `APPROVED` en [`progress/review_F9.2.md`](./review_F9.2.md), ADR 008 en [`docs/adr/008-physical-topology-layout.md`](../docs/adr/008-physical-topology-layout.md)) — Separación `LocationType` vs `StorageType` (`RACK`/`SHELVING`/`FLOOR`) y `LocationStatus` (`ACTIVE`/`BLOCKED`), índice compuesto `(tenantId, warehouseId, zone, aisle)`, normalización lexicográfica con zero-padding (`normalizeLocationCode`), matriz de validación por `StorageType`, dos endpoints de layout detrás de `TopologyRepositoryPort`, generador en bloque con `dryRun`/colisiones/upsert idempotente y rollback por `batchId`, y vista gráfica interactiva en `@wms/web` (`/locations`) con alzado frontal invertido, bahías de suelo, umbral de colapso (>200 celdas) e integración directa con `LabelPrintModal`.
- **Sesión (2026-11-13 — Hito 9 `F9.1`)**:
  - ✅ **`F9.1`** (`done`, review `APPROVED` en [`progress/review_F9.1.md`](./review_F9.1.md)) — Contratos `CategoryDTO` / `TenantUserDTO` / `ListProductsFilters` en `@wms/shared-types`, modelo `Category` con migración SQL y `FORCE RLS` en `@wms/db`, puertos `CatalogRepositoryPort` / `UserRepositoryPort` con adaptadores Prisma/InMemory y casos de uso `manage-categories`, `manage-products`, `manage-users` (cobertura 93.59% en `use-cases`), vistas `/catalog` en `@wms/web` y búsqueda rápida por SKU en `@wms/mobile`.
- **Sesión (2026-11-10 / 2026-11-11 — Hito 8 `@wms/domain`)**:
  - ✅ **`DOM-1`** (`done`, publicada) — Paquete `@wms/domain` (TS puro, compartido API/Web/Mobile): primitivas DDD, `InventoryBalance`, máquinas de estado `WarehouseTask`/`TaskStep`/`SalesOrder`, 81 tests (happy path + "romper a propósito"), ADR 006.
  - ✅ **`DOM-2`** (`done`, review `APPROVED` en [`progress/review_DOM-2.md`](./review_DOM-2.md)) — Adopción de `@wms/domain` en `@wms/api`: puertos (`InventoryRepository`, `OrderRepository`, `TaskRepository`, `UnitOfWork`) + adaptadores Prisma (`FOR UPDATE`, `Serializable`, RLS) e `InMemory`, refactor de `move-stock`, `allocate-order`, `cancel-order`, `confirm-task-step` y `handle-picking-exception`, mapeo `DomainError -> WmsError`, paridad de enums, suite PG `ledger-locking.integration.test.ts` y ADR 007. Opcionales pendientes: `create-putaway-task`, `confirm-receipt-line`, `sync-task-batch`.
- **Siguiente Feature en Cola**: `F5.1` — *Carga masiva (Bulk Import) con modo `dryRun`, normalización y estrategia `ColumnMapper`* (opcionalmente `DOM-3` y mejora técnica `TECH-VITE` — *Migración @wms/web a Vite SPA*).

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
