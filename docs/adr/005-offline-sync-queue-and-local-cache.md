# ADR 005: Motor OfflineSyncQueue Hexagonal, Caché Local de Tareas y Cuarentena en Móvil

- **Estado**: Aceptado
- **Fecha**: 2026-11-10
- **Feature**: `F6.2` — Motor OfflineSyncQueue Hexagonal, Caché Local de Tareas y Auto-Sync con Cuarentena en @wms/mobile

---

## 1. Contexto

En las operaciones físicas de almacén (muelles de recepción, pasillos de almacenamiento en altura, cámaras frigoríficas), la conectividad de `@wms/mobile` sufre desconexiones transitorias frecuentes. Los operarios deben continuar escaneando códigos de barras y confirmando pasos operativos (RECEIVING, PUTAWAY, PICKING) de manera ininterrumpida.

Al operar offline en el cliente móvil surgen desafíos clave:
1. **Validación Inmediata en el Dispositivo**: El operario no puede esperar a sincronizar con el servidor para saber si un código escaneado es incorrecto, si está fuera de secuencia o si la cantidad excede lo esperado.
2. **Generación Criptográfica de Idempotencia**: La `idempotencyKey` debe fijarse en el instante exacto del escaneo local para garantizar la unicidad de la mutación ante múltiples reintentos de red contra el endpoint `POST /api/v1/tasks/sync-batch` (Server-Wins, ADR 004).
3. **Manejo Determinista de Conflictos (Cuarentena)**: Si el servidor rechaza una mutación con `CONFLICT` (ej. tarea reasignada/cancelada por supervisor) o `REJECTED` (error de validación de negocio), el cliente móvil **no** debe reintentar infinitamente en el siguiente ciclo FIFO, sino aislar la mutación en un estado de **Cuarentena** (`QUARANTINED`) con visibilidad explícita para el operario.
4. **Desacoplamiento Hexagonal Puro**: El motor de sincronización no debe depender directamente de React, hooks, Expo o almacenamiento propietario, permitiendo tests unitarios instantáneos sin emuladores.

---

## 2. Decisión

1. **Puertos Hexagonales en `@wms/mobile`**:
   - `OfflineQueueStorage` (`load`, `save`, `clear`): desacopla la persistencia de la cola (implementado con `InMemoryOfflineQueueStorage` y `SerializableStorageAdapter`).
   - `SyncTransport` (`sendBatch`): desacopla el transporte HTTP (`HttpSyncTransport` consumiendo `WmsApiClient.syncTaskBatch`).
   - `ConnectivityMonitor` (`isOnline`, `subscribe`): desacopla la detección de red (`EventConnectivityMonitor`).

2. **Caché Local de Tareas (`LocalTaskCache`)**:
   - Almacena tareas asignadas en memoria/caché local.
   - `validateScan` y `validateReceiptLine`: validan código de barras, SKU, ubicación, secuencia estricta de pasos y límite de cantidades localmente.
   - `applyOptimisticStep` y `applyOptimisticReceiptLine`: aplican la mutación de forma optimista en la UI sin esperar al servidor.

3. **Motor `OfflineSyncQueue` y Cuarentena**:
   - Generación de `idempotencyKey` usando `crypto.randomUUID()` en el momento del `enqueue`.
   - Procesamiento en estricto orden FIFO (`occurredAt ASC`).
   - Tamaño de lote delimitado por `maxBatchSize` (por defecto 50).
   - Clasificación de respuestas:
     - `APPLIED` / `ALREADY_APPLIED`: se retira de la cola como éxito.
     - `CONFLICT` / `REJECTED`: pasa a `QUARANTINED` con `quarantinedAt` y `quarantineReason`, aislándose de futuros auto-syncs.
     - Error transitorio de red: ítems regresan a `PENDING` e incrementan `retryCount`, activando backoff exponencial con límite: `min(initialBackoff * (multiplier ** failures), maxBackoff)`.
   - Gestión de cuarentena: `retryQuarantined`, `discardQuarantined`, `clearQuarantined`.

4. **Telemetría Visual Permanente y Design System**:
   - Indicador visual permanente en la barra de estado: `ONLINE` (emerald), `OFFLINE` (amber), `SYNCING` (blue con indicador).
   - Contador en tiempo real de operaciones en cola y acceso directo al modal de cuarentena (`QuarantineModal`).
   - Respeto estricto del Design System: `S5 dark-data-dense` / `P2 Refinada` / `T3`, targets táctiles `>= 44px`, cero hex crudos.

---

## 3. Consecuencias

### Positivas:
- **Resiliencia Operativa Total**: Los operarios de piso continúan recibiendo, ubicando y recolectando mercancía en zonas sin cobertura WiFi.
- **Cero Duplicados en el Ledger**: La clave criptográfica fijada en el escaneo garantiza idempotencia estricta en el servidor respaldado por `IdempotencyStore`.
- **Visibilidad y Control de Conflictos**: Los conflictos de negocio no bloquean la cola general ni producen bucles infinitos de reintento.
- **Arquitectura Hexagonal Limpia**: Cobertura exhaustiva de tests unitarios y de fallo ejecutados en menos de 1 segundo sin requerir Metro ni emulador.

### Negativas / Costes Aceptados:
- Mayor complejidad de estado en el cliente móvil: requiere mantener sincronizada la caché local y gestionar las mutaciones optimistas.

### Verificación:
- `src/offline/__tests__/local-task-cache.test.ts` (9 tests)
- `src/offline/__tests__/sync-queue.test.ts` (9 tests)
- `src/offline/__tests__/adapters.test.ts` (5 tests)
- `src/components/__tests__/offline-ui.test.ts` (3 tests)
- Total móvil: 53 tests unitarios y de fallo en verde.
