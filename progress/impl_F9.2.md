# Reporte de Implementación: F9.2 — Topología Física (`RACK` / `SHELVING` / `FLOOR`), Alta Estructurada de Ubicaciones y Vista Gráfica del Layout

- **Estado**: DONE
- **Fecha**: 2026-11-16
- **Feature**: `F9.2` (Topología Física, Generador en Bloque con `dryRun`/`batchId`, Rollback y Layout con Divulgación Progresiva)

---

## Archivos Creados / Modificados / Eliminados

### Paquetes Compartidos y Base de Datos
- `packages/db/prisma/schema.prisma`:
  - Añadidos enums `StorageType` (`RACK`, `SHELVING`, `FLOOR`) y `LocationStatus` (`ACTIVE`, `BLOCKED`).
  - Extendido modelo `Location` con coordenadas: `storageType`, `status`, `zone`, `aisle`, `rack`, `level`, `position`, `generationBatchId`.
  - Añadidos índices compuestos: `@@index([tenantId, warehouseId, zone, aisle])` y `@@index([tenantId, generationBatchId])`.
- `packages/db/prisma/migrations/20261116000000_location_topology/migration.sql`:
  - Migración SQL declarativa con enums, columnas de coordenadas e índices compuestos.
- `packages/db/src/seed.ts`:
  - Actualizadas ubicaciones demo (`RECEPCION-01`, `A-01-01`..`A-10-01`, `PACKING-01`, `DISPATCH-01`) con coordenadas estructuradas reales (`RACK`, `FLOOR`, `zone`, `aisle`, `rack`, `level`, `position`) en `create` y `update`.
  - Ejecutado `pnpm --filter @wms/db seed` para sincronizar `wms_dev`.
- `packages/shared-types/src/index.ts`:
  - Exportados enums `StorageType` y `LocationStatus`.
  - Extendida interfaz `LocationDTO` manteniendo compatibilidad hacia atrás mediante propiedades opcionales.
  - Añadidos contratos de layout y generación: `WarehouseLayoutSummaryDTO`, `ZoneLayoutNodeDTO`, `AisleLayoutSummaryDTO`, `AisleLayoutDetailDTO`, `RackLayoutGroupDTO`, `LocationCellDTO`, `CreateLocationInput`, `UpdateLocationInput`, `GenerateLocationBlockInput`, `GenerateLocationBlockResultDTO`, `DeleteLocationBatchResultDTO`.
  - Añadidos códigos tipados de error: `INVALID_LOCATION_CODE`, `INVALID_STORAGE_TOPOLOGY`, `LOCATION_BATCH_IN_USE`.
- `packages/shared-types/src/topology.ts`:
  - Funciones puras de dominio: `normalizeLocationCode`, `formatStructuredLocationCode`, `validateStorageTypeMetadata`, `calculateAtp`, `padSegment`.
  - Constantes exportadas: `AISLE_CELL_COLLAPSE_THRESHOLD = 200`, `SPECIAL_FLOOR_AISLE = "__FLOOR__"`.
- `packages/shared-types/src/design-tokens.ts`:
  - Resolvers visuales: `resolveStorageTypeVisual`, `resolveLocationStatusVisual`, `resolveLocationCellVisual` (mapeo térmico de 4 estados).

### Backend (`apps/api`)
- `apps/api/src/ports/topology-repository.ts`:
  - Puerto hexagonal desacoplado `TopologyRepositoryPort` para agregaciones de layout macro/pasillo, alta estructurada, idempotencia y auditoría por `batchId`.
- `apps/api/src/adapters/in-memory-topology-repository.ts`:
  - Adaptador en memoria de alto rendimiento para tests TDD unitarios sin base de datos.
  - Subsanada regla SonarCloud `typescript:S2245` (CP-7): generación de IDs deterministas seguros con `randomUUID()` de `node:crypto` en lugar de `Math.random()`.
- `apps/api/src/adapters/prisma-topology-repository.ts`:
  - Adaptador de producción con Prisma ORM, agregación de saldos y transacciones seguras con RLS y multi-tenancy.
- `apps/api/src/use-cases/topology/manage-locations.ts`:
  - Casos de uso de topología: `createSingleLocation`, `generateBlock` (`dryRun` y commit con `generationBatchId`), `deleteBatch` (rollback protegido contra stock/movimientos), `getWarehouseLayoutSummary`, `getAisleLayoutDetail`, `updateLocation`.
  - Subsanada regla SonarCloud `typescript:S2245` (CP-7): generación criptográficamente segura de `generationBatchId` usando `randomUUID()` de `node:crypto` sin `Math.random()`.
- `apps/api/src/routes/locations.ts`:
  - Rutas Fastify: `GET /layout/:warehouseId`, `GET /layout/:warehouseId/aisles/:aisle`, `POST /generate-block`, `DELETE /batches/:batchId`, `PATCH /:id`, `GET /`, `POST /`.
- `apps/api/src/server.ts`:
  - Inyección de dependencias en Fastify decorators (`topologyRepository`) y fallback en composition root.
- `apps/api/src/shared/__tests__/topology.test.ts`:
  - 15 tests unitarios puros para Invariantes 1, 2, 3, ATP y visual resolvers.
- `apps/api/src/use-cases/topology/__tests__/manage-locations.test.ts`:
  - 17 tests unitarios para los casos de uso (invariantes, multi-tenancy y rollback).
- `apps/api/src/routes/__tests__/locations-topology-routes.test.ts`:
  - 10 tests de integración HTTP de rutas Fastify mediante `app.inject()`.

### Frontend (`apps/web`)
- `apps/web/src/app/globals.css`:
  - Añadidas clases semánticas `.wms-*` para el layout físico: `.wms-aisle-grid`, `.wms-aisle-card`, `.wms-racks-grid`, `.wms-rack-card`, `.wms-rack-header`, `.wms-rack-elevation`, `.wms-rack-level-row`, `.wms-rack-level-label`, `.wms-rack-positions-row`, `.wms-rack-cell`, `.wms-rack-cell-compact`, `.wms-floor-grid`, `.wms-floor-bay-cell`, `.wms-legend-bar`, `.wms-legend-item`, `.wms-legend-swatch`, `.wms-cell-empty`, `.wms-cell-occupied`, `.wms-cell-reserved`, `.wms-cell-blocked`, `.wms-rack-summary-collapsed`, `.wms-grid-3`.
- `apps/web/src/lib/api-client.ts`:
  - Añadidos métodos tipados en `WmsApiClient`: `getWarehouseLayoutSummary`, `getAisleLayoutDetail`, `generateLocationBlock`, `deleteLocationBatch`, `updateLocation`.
- `apps/web/src/lib/dashboard-metrics.ts`:
  - Integrada fórmula canónica de ocupación `occupancyRate (%) = Math.round((occupiedLocations / activeLocations) * 100)` excluyendo ubicaciones `BLOCKED`.
- `apps/web/src/app/locations/page.tsx`:
  - Vista gráfica completa del Layout con S5 (`dark-data-dense`), P2 y T3, con **0 clases de Tailwind inexistentes** y **0 colores hex crudos**.
  - Devuelve fragmento `<>...</>` directamente para integrarse limpiamente con `DashboardShell` (`<main className="wms-main">`).
  - Paneles de Generador en Bloque y Alta Individual implementados como cajas de divulgación progresiva (`.wms-disclosure-box`) colapsables bajo demanda.
  - Modo Macro (Zonas -> Pasillos con barras térmicas) y Modo Drill-Down a Pasillo (alzado frontal invertido para RACK/SHELVING y planta para FLOOR).
  - Umbral de colapso de racks si el pasillo excede 200 celdas (`AISLE_CELL_COLLAPSE_THRESHOLD`).
  - Botón directo **🏷️ Imprimir etiquetas del lote generado** (`LabelPrintModal`).
- `apps/web/src/lib/__tests__/api-client.test.ts`:
  - Suite de tests unitarios verificando llamadas HTTP de topología y layout.
- `apps/web/src/lib/__tests__/dashboard-metrics.test.ts`:
  - Test unitario validando el cálculo de KPIs de topología física.
- `apps/web/src/app/locations/__tests__/locations-page.test.tsx`:
  - Test de renderizado SSR con `renderToStaticMarkup`.

### Documentación y ADR
- `docs/adr/008-physical-topology-layout.md`: ADR formal de la decisión arquitectónica.
- `docs/adr/README.md`: Índice actualizado con ADR 008.
- `KNOWLEDGE.md`: Actualizada la decisión #5 con la topología física, padding lexicográfico, matriz de validación y reglas de rollback.

---

## Decisiones de Diseño e Invariantes

1. **Invariante 1 — Zero-Padding y Orden Lexicográfico Estricto**:
   - `normalizeLocationCode()` y `formatStructuredLocationCode()` aplican zero-padding de al menos 2 dígitos (`01`..`99`) a cualquier segmento numérico.
   - Test unitario explícito verifica que `A-01-01-01 < A-01-01-09 < A-01-01-10 < A-01-01-11 < A-01-01-12` bajo ordenamiento lexicográfico puro (`<` y `.localeCompare()`).
2. **Invariante 2 — Matriz por `StorageType`**:
   - `RACK` / `SHELVING`: requieren obligatoriamente `zone`, `aisle`, `rack`, `level >= 1` y `position`.
   - `FLOOR`: `aisle` opcional, `level` forzado estrictamente a `"01"`. Peticiones con `level > 1` se rechazan con `WmsError(422, "INVALID_STORAGE_TOPOLOGY", ...)`.
3. **Invariante 3 — Ocupación % y Estado `BLOCKED`**:
   - `occupancyRate` (%) = `activeLocations === 0 ? 0 : Math.round((occupiedLocations / activeLocations) * 100)`.
   - Las ubicaciones `BLOCKED` no computan en el divisor de capacidad activa. Se implementó endpoint `PATCH /api/v1/locations/:id` para alternar estado.
4. **Invariante 4 — Puerto Hexagonal y 2 Endpoints con ATP Canónico**:
   - Layout macro (`GET /layout/:warehouseId`) y pasillo detallado (`GET /layout/:warehouseId/aisles/:aisle`).
   - ATP unificado: `Math.max(0, onHand - allocated)`.
5. **Invariante 5 — Generador Idempotente y Rollback Atómico**:
   - `POST /generate-block` con `dryRun: true` para simular sin persistir, y `dryRun: false` para commit idempotente asignando `generationBatchId`.
   - `DELETE /batches/:batchId` aborta con `WmsError(409, "LOCATION_BATCH_IN_USE", ...)` si alguna ubicación del lote tiene saldos de stock (`onHand > 0` o `allocated > 0`), transacciones históricas en `InventoryTransaction` o pasos en `TaskStep`.
6. **Invariante 6 — Frontend S5 sin Librerías Pesadas**:
   - 0 colores hex crudos en JSX.
   - Alzado frontal invertido (niveles superiores arriba, nivel 01 en la base) y planta para suelo.
   - Colapso automático de racks en pasillos con más de 200 celdas.
7. **Remediación CP-7 / SonarCloud `typescript:S2245` (PRNG seguro)**:
   - Eliminados todos los usos de `Math.random()` en `manage-locations.ts` y en `in-memory-topology-repository.ts`.
   - Se utiliza `randomUUID()` de `node:crypto` para la generación criptográfica segura de `generationBatchId` y de identificadores en memoria.
   - Verificado con búsqueda recursiva (`Get-ChildItem -Include *.ts, *.tsx | Select-String "Math.random("`): 0 coincidencias en el código del proyecto.

---

## Resultados de Verificación (salida literal, no parafraseada)

### `pnpm build`
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

 Tasks:    6 successful, 6 total
Cached:    2 cached, 6 total
  Time:    6.612s
```

### `pnpm --filter @wms/api test:coverage`
```text
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 ✓ src/use-cases/diagnostics/__tests__/diagnostics.test.ts (10 tests) 20ms
 ✓ src/use-cases/users/__tests__/manage-users.test.ts (19 tests) 18ms
 ✓ src/use-cases/topology/__tests__/manage-locations.test.ts (17 tests) 37ms
 ✓ src/use-cases/catalog/__tests__/manage-products.test.ts (22 tests) 39ms
 ✓ src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts (11 tests) 23ms
 ✓ src/use-cases/tasks/__tests__/sync-task-batch.test.ts (10 tests) 23ms
 ↓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests | 3 skipped)
 ✓ src/use-cases/inventory/__tests__/handle-picking-exception.test.ts (13 tests) 46ms
 ✓ src/use-cases/tasks/__tests__/confirm-task-step.test.ts (19 tests) 39ms
 ✓ src/use-cases/security/__tests__/tenant-context.test.ts (16 tests) 47ms
 ✓ src/use-cases/integrations/__tests__/webhooks.test.ts (25 tests) 143ms
 ✓ src/shared/__tests__/topology.test.ts (15 tests) 31ms
 ✓ src/use-cases/inventory/__tests__/create-putaway-task.test.ts (7 tests) 33ms
 ✓ src/use-cases/catalog/__tests__/manage-categories.test.ts (16 tests) 34ms
 ✓ src/routes/__tests__/tasks-sync-batch.test.ts (5 tests) 129ms
 ✓ src/use-cases/inventory/__tests__/move-stock.test.ts (13 tests) 25ms
 ✓ src/use-cases/inventory/__tests__/cancel-order.test.ts (10 tests) 24ms
 ✓ src/plugins/__tests__/auth.test.ts (25 tests) 444ms
 ✓ src/use-cases/inventory/__tests__/allocate-order.test.ts (13 tests) 43ms
 ↓ src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts (2 tests | 2 skipped)
 ✓ src/use-cases/labels/__tests__/generate-labels.test.ts (11 tests) 23ms
 ↓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests | 3 skipped)
 ✓ src/shared/__tests__/barcode-payload.test.ts (14 tests) 13ms
 ✓ src/adapters/__tests__/label-renderer.test.ts (12 tests) 16ms
 ✓ src/ports/__tests__/idempotency-store.test.ts (5 tests) 12ms
 ✓ src/routes/v1/__tests__/diagnostics.test.ts (6 tests) 118ms
 ✓ src/__tests__/domain-prisma-parity.test.ts (5 tests) 8ms
 ✓ src/routes/__tests__/locations-topology-routes.test.ts (10 tests) 711ms
 ✓ src/routes/__tests__/catalog-users-routes.test.ts (14 tests) 781ms
 ✓ src/routes/__tests__/orders-dispatch.test.ts (4 tests) 62ms
 ✓ src/routes/v1/__tests__/labels.test.ts (7 tests) 446ms

 Test Files  28 passed | 3 skipped (31)
      Tests  354 passed | 8 skipped (362)
   Start at  00:25:42
   Duration  4.12s (transform 2.77s, setup 0ms, collect 16.21s, tests 3.39s, environment 10ms, prepare 12.96s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   92.99 |    86.21 |   96.42 |   92.99 |                   
 catalog           |   98.95 |    92.22 |     100 |   98.95 |                   
  ...categories.ts |   99.05 |    96.77 |     100 |   99.05 | 124               
  ...e-products.ts |   98.89 |    89.83 |     100 |   98.89 | 146,207           
 diagnostics       |   99.36 |    93.93 |     100 |   99.36 |                   
  ...tic-errors.ts |     100 |      100 |     100 |     100 |                   
  ...stic-error.ts |   97.29 |    63.63 |     100 |   97.29 | 34                
  ...-sensitive.ts |     100 |      100 |     100 |     100 |                   
 integrations      |     100 |    90.14 |     100 |     100 |                   
  ...rnal-order.ts |     100 |    94.87 |     100 |     100 | 123,200           
  ...er-shipped.ts |     100 |    84.37 |     100 |     100 | ...22,128,152,187 
 inventory         |    98.1 |    89.85 |     100 |    98.1 |                   
  ...cate-order.ts |     100 |       92 |     100 |     100 | 80,95             
  cancel-order.ts  |   99.16 |     93.1 |     100 |   99.16 | 111               
  ...taway-task.ts |   98.37 |     91.3 |     100 |   98.37 | 166-167           
  ...-exception.ts |    95.9 |    83.72 |     100 |    95.9 | ...00,160,280-281 
  move-stock.ts    |     100 |    94.44 |     100 |     100 | 111               
 labels            |   92.63 |    83.33 |     100 |   92.63 |                   
  ...ion-labels.ts |    92.3 |       84 |     100 |    92.3 | 24-29             
  ...uct-labels.ts |   92.94 |    82.75 |     100 |   92.94 | 25-30             
 security          |     100 |      100 |     100 |     100 |                   
  ...nt-context.ts |     100 |      100 |     100 |     100 |                   
 tasks             |   82.04 |     80.9 |   77.77 |   82.04 |                   
  ...ceipt-line.ts |   83.68 |    89.47 |      50 |   83.68 | ...38-239,242-262 
  ...-task-step.ts |   82.14 |    83.51 |     100 |   82.14 | ...04-309,421-431 
  ...task-batch.ts |   80.59 |    66.66 |     100 |   80.59 | ...08,224-232,296 
 topology          |      88 |     61.9 |     100 |      88 |                   
  ...-locations.ts |      88 |     61.9 |     100 |      88 | ...46-347,353-358 
 users             |     100 |      100 |     100 |     100 |                   
  manage-users.ts  |     100 |      100 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------
```

### `pnpm --filter @wms/web test`
```text
> @wms/web@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\web
> vitest run

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web

 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 18ms
 ✓ src/lib/__tests__/api-client.test.ts (9 tests) 21ms
 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (9 tests) 27ms
 ✓ src/app/locations/__tests__/locations-page.test.tsx (2 tests) 19ms

 Test Files  4 passed (4)
      Tests  28 passed (28)
   Duration  874ms
```

### `pnpm --filter @wms/db seed`
```text
> @wms/db@0.0.1 seed C:\Users\santi\Documents\projects\WMS\packages\db
> tsx src/seed.ts

🌱 Seeding database...
✅ Tenant: Demo Almacén SL (apiKey: demo-api-key-12345)
✅ Warehouse: Almacén Principal
✅ 13 locations created
✅ 3 demo users created (ADMIN, SUPERVISOR, OPERATOR)
✅ 3 categories created (ROPA, CALZADO, ACCESORIOS)
✅ 5 products created
✅ Demo tasks created: task-demo-receiving (RECEIVING) & task-demo-picking (PICKING)

🚀 Seed complete! Use these credentials to test:
   API Key: demo-api-key-12345
   Warehouse ID: warehouse-demo
   Header: x-api-key: demo-api-key-12345
```
