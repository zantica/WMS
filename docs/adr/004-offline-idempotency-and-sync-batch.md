# ADR 004: Puerto IdempotencyStore, Idempotencia Transaccional y Sincronización por Lotes Offline (Server-Wins)

- **Estado**: Aceptado
- **Fecha**: 2026-11-10
- **Feature**: `F6.1` — Puerto IdempotencyStore y Endpoint POST /api/v1/tasks/sync-batch

---

## 1. Contexto

En entornos de almacén físico donde operarios interactúan con `@wms/mobile`, la conectividad WiFi o celular es inherentemente inestable debido a estanterías metálicas de gran altura y zonas ciegas (cámaras frigoríficas, muelles de carga). Los operarios escanean códigos de barras y confirman pasos de picking, putaway y recepción en modo offline, encolando mutaciones en el dispositivo.

Esta operativa offline-first genera tres desafíos arquitectónicos críticos:

1. **Doble Gasto y Duplicación en el Ledger (At-Least-Once Delivery)**: Las aplicaciones móviles reintentan el envío de lotes sincronizados ante timeouts de red o pérdida de ACK. Si la confirmación de un paso ya fue aplicada en el servidor pero la respuesta HTTP no llegó al móvil, reintentar la llamada jamás debe crear un segundo asiento en `inventory_transactions` ni volver a mutar `inventory_balances`.
2. **Condiciones de Carrera y Concurrencia Real**: Si dos dispositivos sincronizan mutaciones simultáneas que afectan al mismo paso o si un supervisor cancela/reasigna una tarea en el servidor mientras el operario estaba offline, el sistema debe resolver el conflicto de forma determinista y consistente.
3. **Desacoplamiento Hexagonal**: El mecanismo de verificación y almacenamiento de idempotencia no debe quedar acoplado al transporte Fastify ni depender exclusivamente de un motor de persistencia concreto, permitiendo simularlo limpiamente en memoria (`InMemoryIdempotencyStore`) para tests unitarios rápidos y respaldarlo con PostgreSQL (`PrismaIdempotencyStore`) en producción.

### Alternativas Descartadas:
- *Cliente-Gana (Client-Wins / Last-Write-Wins)*: Descartado rotundamente. Permitir que un dispositivo desconectado sobrescriba el inventario consolidado en el servidor violaría la inmutabilidad contable del Ledger y generaría discrepancias físicas irreparables de stock físico.
- *Cache en memoria efímera (Redis o Map) para idempotencia*: Descartado para operaciones del Ledger porque la idempotencia debe persistirse de forma transaccional en la misma transacción SQL (`Serializable`) que actualiza saldos. Un fallo de proceso o reinicio de pod provocaría pérdida de claves de idempotencia y posterior duplicación de inventario.
- *Rollback total del lote ante un solo conflicto en `sync-batch`*: Descartado. Si un operario sincroniza 10 pasos y el paso 3 entra en conflicto porque ya fue cancelado por el supervisor, los pasos válidos anteriores y posteriores deben aplicarse o aislarse individualmente, permitiendo al móvil poner en cuarentena únicamente las mutaciones rechazadas.

---

## 2. Decisión

1. **Puerto Hexagonal `IdempotencyStore` y Adaptadores**:
   - Se define el puerto `apps/api/src/ports/idempotency-store.ts` con métodos `find` y `save`.
   - Se implementa `InMemoryIdempotencyStore` (`apps/api/src/adapters/in-memory-idempotency-store.ts`) para tests unitarios ultrarrápidos y desacoplados.
   - Se implementa `PrismaIdempotencyStore` (`apps/api/src/adapters/prisma-idempotency-store.ts`) capaz de reutilizar el cliente transaccional `tx` y respetar las políticas RLS.

2. **Persistencia Transaccional Única `(tenantId, idempotencyKey)` en la Misma Transacción del Ledger**:
   - Se crea la tabla PostgreSQL `idempotency_records` con la restricción de unicidad estricta `@@unique([tenantId, idempotencyKey])` e índices por `(tenantId, createdAt)`.
   - Se refuerza con PostgreSQL Row Level Security (`FORCE ROW LEVEL SECURITY`) mediante la política `idempotency_records_tenant_isolation_policy`.
   - En `confirmTaskStep` y `confirmReceiptLine`, si se provee `idempotencyKey`:
     - Se consulta primero `store.find(tenantId, idempotencyKey)`.
     - Si ya existe, se retorna inmediatamente el resultado original guardado con `idempotencyStatus: "ALREADY_APPLIED"`, sin invocar `moveStock` ni mutar `inventory_balances`.
     - Si no existe, se ejecuta la operación de inventario (`moveStock`, actualización de steps/tasks) y el registro en `idempotency_records` dentro de la **misma transacción interactiva `Serializable`**. Ante colisiones de clave única concurrentes (`P2002`), se captura el error y se devuelve `ALREADY_APPLIED` con el resultado consolidado.

3. **Caso de Uso y Endpoint `POST /api/v1/tasks/sync-batch`**:
   - Contratos compartidos en `@wms/shared-types`: `SyncTaskBatchRequest`, `SyncTaskBatchItem`, `SyncBatchItemResult`, `SyncTaskBatchResult`.
   - Procesamiento en estricto orden FIFO: los ítems se ordenan de forma cronológica estable por su timestamp cliente (`occurredAt ASC`).
   - Cada ítem registra tanto `occurredAt` (cliente) como `receivedAt` (servidor).
   - Tamaño máximo delimitado por `MAX_SYNC_BATCH_SIZE = 100` para evitar monopolización de recursos.

4. **Política Servidor-Gana (Server-Wins)**:
   - El estado en PostgreSQL prevalece ante colisiones concurrentes u operaciones extemporáneas.
   - Si un paso o tarea ya fue completado/cancelado en el servidor, o el stock es insuficiente, o la secuencia no corresponde, la mutación se clasifica como `status: "CONFLICT"` (o `"REJECTED"` si es error de validación).
   - El resultado de conflicto se registra en `IdempotencyStore` para que reintentos del mismo batch no intenten re-aplicar mutaciones inválidas y el cliente móvil pueda moverlas de inmediato a su cola de cuarentena (base para `F6.2`).

---

## 3. Consecuencias

### Positivas:
- **Invariante Absoluta del Ledger**: Cero duplicación de transacciones contables o saldos físicos ante reintentos de red o desincronización de clientes móviles.
- **Trazabilidad Completa Offline**: Registro exacto de cuándo ocurrió la acción en el almacén (`occurredAt`) vs cuándo fue recibida y confirmada por el servidor (`receivedAt`).
- **Defensa en Profundidad**: Aislamiento RLS en la tabla `idempotency_records` y constraint único compuesto que impide fugas o colisiones entre inquilinos.
- **Preparación para `F6.2`**: Contratos claros que permiten al cliente móvil clasificar cada mutación en `CONFIRMED` (`APPLIED` / `ALREADY_APPLIED`) o `QUARANTINE` (`CONFLICT` / `REJECTED`).

### Negativas / Costes Aceptados:
- Crecimiento de filas en `idempotency_records`: requerirá un job periódico de purga para registros con antigüedad superior a la ventana máxima de retención móvil (ej. 30 días).
- Sobrecarga de una inserción adicional por mutación en la transacción del Ledger.

### Verificación:
- **Unitarios**:
  - `apps/api/src/ports/__tests__/idempotency-store.test.ts` (5 tests)
  - `apps/api/src/use-cases/tasks/__tests__/sync-task-batch.test.ts` (10 tests)
  - `apps/api/src/use-cases/tasks/__tests__/confirm-task-step.test.ts` (16 tests)
  - `apps/api/src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts` (11 tests)
  - `apps/api/src/routes/__tests__/tasks-sync-batch.test.ts` (5 tests)
- **Integración PostgreSQL 16 Real**:
  - `apps/api/src/use-cases/tasks/__tests__/idempotency.integration.test.ts` (3 tests validando `ALREADY_APPLIED`, cero duplicados en `inventory_transactions` y saldos inmutables).
