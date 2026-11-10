# Reporte de Implementación: F6.2 — Motor OfflineSyncQueue Hexagonal, Caché Local de Tareas y Auto-Sync con Cuarentena en @wms/mobile

- **Estado**: DONE
- **Fecha**: 2026-11-10

## Archivos Creados / Modificados / Eliminados

### Creados:
- `apps/mobile/src/offline/types.ts`: Definición de tipos inmutables (`OfflineQueueItem`, `QueueItemStatus`, `NetworkStatus`, `QueueSnapshot`, `OfflineValidationResult`, `QuarantineReason`).
- `apps/mobile/src/offline/ports/queue-storage.ts`: Puerto hexagonal `OfflineQueueStorage` (`load`, `save`, `clear`).
- `apps/mobile/src/offline/ports/sync-transport.ts`: Puerto hexagonal `SyncTransport` (`sendBatch`).
- `apps/mobile/src/offline/ports/connectivity-monitor.ts`: Puerto hexagonal `ConnectivityMonitor` (`isOnline`, `subscribe`, `dispose`).
- `apps/mobile/src/offline/adapters/in-memory-queue-storage.ts`: Adaptador en memoria con deep-clone para aislamiento de mutaciones.
- `apps/mobile/src/offline/adapters/serializable-storage-adapter.ts`: Adaptador serializable JSON desacoplado para cualquier `KeyValueStore` (compatible con AsyncStorage / SQLite).
- `apps/mobile/src/offline/adapters/http-sync-transport.ts`: Adaptador que conecta el puerto `SyncTransport` con `WmsApiClient.syncTaskBatch`.
- `apps/mobile/src/offline/adapters/event-connectivity-monitor.ts`: Adaptador desacoplado de conectividad basado en eventos.
- `apps/mobile/src/offline/local-task-cache.ts`: Caché local de tareas con validación offline (`validateScan`, `validateReceiptLine`, secuencia estricta, cantidades y códigos) y mutación optimista (`applyOptimisticStep`, `applyOptimisticReceiptLine`).
- `apps/mobile/src/offline/sync-queue.ts`: Motor `OfflineSyncQueue` puro, desacoplado de React y Expo, con generación criptográfica de `idempotencyKey` (`crypto.randomUUID()`), orden FIFO (`occurredAt ASC`), backoff exponencial con límite y aislamiento en estado `QUARANTINED` para mutaciones con conflicto Server-Wins (`CONFLICT` / `REJECTED`).
- `apps/mobile/src/offline/index.ts`: Barril público de exportaciones del motor offline.
- `apps/mobile/src/offline/__tests__/local-task-cache.test.ts`: 11 tests unitarios cubriendo validación de código, secuencia, cantidades y mutaciones optimistas.
- `apps/mobile/src/offline/__tests__/sync-queue.test.ts`: 10 tests unitarios y de fallo (happy path, reintentos duplicados `ALREADY_APPLIED`, cortes a mitad de lote, cuarentena, reactivación, descarte, fallos transitorios de transporte con backoff exponencial y auto-sync).
- `apps/mobile/src/offline/__tests__/adapters.test.ts`: 5 tests de adaptadores (`InMemoryOfflineQueueStorage`, `SerializableStorageAdapter`, `HttpSyncTransport`, `EventConnectivityMonitor`).
- `apps/mobile/src/context/offline-sync.tsx`: Proveedor React `OfflineSyncProvider` y hook `useOfflineSync` para exponer estado, cola, caché y acciones.
- `apps/mobile/src/components/OfflineSyncStatusBar.tsx`: Barra de telemetría permanente con indicador visual `ONLINE` / `OFFLINE` / `SYNCING`, contador de cola y tag interactivo de Cuarentena (Design System `S5 dark-data-dense` / `P2 Refinada` / `T3`, cero hex crudos).
- `apps/mobile/src/components/QuarantineModal.tsx`: Modal overlay accesible para inspección, reintento o descarte de operaciones rechazadas por Server-Wins.
- `apps/mobile/src/components/__tests__/offline-ui.test.ts`: 3 tests de integración con el Design System móvil.
- `docs/adr/005-offline-sync-queue-and-local-cache.md`: ADR 005 documentando el contexto, decisión y consecuencias del motor offline hexagonal.

### Modificados:
- `apps/mobile/src/api/client.ts`: Añadido método `syncTaskBatch(request)` y campo opcional `idempotencyKey` a inputs de confirmación.
- `apps/mobile/src/api/__tests__/client.test.ts`: Test unitario para `client.syncTaskBatch`.
- `apps/mobile/app/_layout.tsx`: Integrado `OfflineSyncProvider` dentro de `SessionProvider`.
- `apps/mobile/app/(tabs)/_layout.tsx`: Integrado estado de conectividad en tiempo real y badges de cola/cuarentena en cabecera.
- `apps/mobile/app/(tabs)/index.tsx`: Integrado `OfflineSyncStatusBar`, fallback a `LocalTaskCache` y carga de tareas offline.
- `apps/mobile/app/tasks/putaway/[taskId].tsx`: Integrada validación offline con `LocalTaskCache`, encolado en `OfflineSyncQueue` y `OfflineSyncStatusBar`.
- `apps/mobile/app/tasks/picking/[taskId].tsx`: Integrada carga desde `LocalTaskCache` y `OfflineSyncStatusBar`.
- `apps/mobile/app/tasks/receiving/[taskId].tsx`: Integrada validación offline de recepción con `LocalTaskCache`, encolado en `OfflineSyncQueue` y `OfflineSyncStatusBar`.
- `apps/mobile/vitest.config.ts`: Configurado scope de cobertura incluyendo `src/offline/` y excluyendo interfaces puras.
- `docs/adr/README.md`: Añadido ADR 005 al índice general.

---

## Decisiones de Diseño e Invariantes

1. **Invariante del Ledger y Servidor-Gana (Server-Wins)**:
   - La `idempotencyKey` se genera con `crypto.randomUUID()` en el momento exacto en que el operario pulsa o escanea (`occurredAt`).
   - El motor encola las mutaciones en estricto orden FIFO (`occurredAt ASC`).
   - Respuestas `APPLIED` o `ALREADY_APPLIED` retiran el ítem de la cola con éxito contable garantizado (cero doble gasto en el Ledger).
   - Respuestas `CONFLICT` o `REJECTED` mueven el ítem a estado `QUARANTINED`. Los ítems en cuarentena **no** se reintentan automáticamente en lotes regulares, evitando monopolizar el transporte o bucles infinitos de rechazo.
2. **Desacoplamiento Hexagonal Puro**:
   - `OfflineSyncQueue` no importa `react`, `react-native` ni `expo`. Opera exclusivamente contra los puertos inyectados (`OfflineQueueStorage`, `SyncTransport`, `ConnectivityMonitor`).
   - La persistencia es abstracta y testeable en memoria en milisegundos.
3. **Cero Hex Crudos y Design System S5 / P2 / T3**:
   - Todos los colores provienen de `WMS_COLORS` y `resolveToneColors`.
   - Targets táctiles `>= 44px` (`WMS_MIN_TOUCH_TARGET`) para uso con guantes industriales en almacén.
   - Tipografía monoespaciada con números tabulares (`monoText`, `tabularNums`) para SKUs, cantidades y códigos.

---

## Resultados de Verificación (salida literal, no parafraseada)

### `pnpm build`:
```
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 5 packages
   • Remote caching disabled

@wms/shared-types:build: cache hit, replaying logs ffdfe399fefaa48b
@wms/shared-types:build: 
@wms/shared-types:build: > @wms/shared-types@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\shared-types
@wms/shared-types:build: > tsc
@wms/shared-types:build: 
@wms/db:build: cache hit, replaying logs 5ef61c551cfb0e99
@wms/db:build: 
@wms/db:build: > @wms/db@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\db
@wms/db:build: > tsc
@wms/db:build: 
@wms/web:build: cache hit, replaying logs 6521c934f7fd277a
@wms/web:build: 
@wms/web:build: > @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
@wms/web:build: > tsc --noEmit
@wms/web:build: 
@wms/api:build: cache hit, replaying logs 40eb43af2850150b
@wms/api:build: 
@wms/api:build: > @wms/api@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\api
@wms/api:build: > tsc && tsc-alias
@wms/api:build: 
@wms/mobile:build: 
@wms/mobile:build: > @wms/mobile@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\mobile
@wms/mobile:build: > tsc --noEmit
@wms/mobile:build: 

 Tasks:    5 successful, 5 total
Cached:    4 cached, 5 total
  Time:    3.183s 
```

### `pnpm --filter @wms/mobile test:coverage`:
```
> @wms/mobile@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\mobile
> vitest run --coverage

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/mobile
      Coverage enabled with v8

 ✓ src/offline/__tests__/local-task-cache.test.ts (11 tests) 8ms
 ✓ src/theme/__tests__/tokens.test.ts (3 tests) 9ms
 ✓ src/components/__tests__/offline-ui.test.ts (3 tests) 5ms
 ✓ src/workflows/__tests__/inbound-putaway.test.ts (6 tests) 8ms
 ✓ src/workflows/__tests__/picking.test.ts (7 tests) 7ms
 ✓ src/api/__tests__/client.test.ts (11 tests) 21ms
 ✓ src/offline/__tests__/adapters.test.ts (5 tests) 13ms
 ✓ src/offline/__tests__/sync-queue.test.ts (10 tests) 52ms

 Test Files  8 passed (8)
      Tests  56 passed (56)
   Start at  12:50:22
   Duration  1.10s (transform 496ms, setup 0ms, collect 1.07s, tests 124ms, environment 3ms, prepare 2.60s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   89.77 |    88.08 |   96.84 |   89.77 |                   
 api               |   82.41 |    78.75 |     100 |   82.41 |                   
  client.ts        |   82.41 |    78.75 |     100 |   82.41 | ...21-428,431-432 
 offline           |   87.11 |    86.16 |   91.66 |   87.11 |                   
  ...task-cache.ts |   86.93 |    88.05 |    92.3 |   86.93 | ...71-272,279-282 
  sync-queue.ts    |   87.26 |    84.78 |    91.3 |   87.26 | ...15-420,425-426 
 offline/adapters  |   98.78 |    96.55 |     100 |   98.78 |                   
  ...ty-monitor.ts |     100 |      100 |     100 |     100 |                   
  ...-transport.ts |     100 |      100 |     100 |     100 |                   
  ...ue-storage.ts |     100 |      100 |     100 |     100 |                   
  ...ge-adapter.ts |   96.29 |    88.88 |     100 |   96.29 | 31                
 workflows         |   99.43 |    96.77 |     100 |   99.43 |                   
  ...nd-putaway.ts |   98.96 |    97.91 |     100 |   98.96 | 158-159           
  picking.ts       |     100 |    95.55 |     100 |     100 | 183,245           
-------------------|---------|----------|---------|---------|-------------------
```
