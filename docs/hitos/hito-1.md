# Hito 1 — Esqueleto + Ledger (ARCHIVADO)

> Guía archivada desde `KNOWLEDGE.md` al cerrar el hito. **Contenido histórico**: puede contener decisiones
> ya superadas. La memoria vigente está en [`KNOWLEDGE.md`](../../KNOWLEDGE.md); las decisiones formales, en [`docs/adr/`](../adr/README.md).

### ✅ Lo que se construyó

| Componente | Archivo(s) | Descripción |
|---|---|---|
| Monorepo | `turbo.json`, `pnpm-workspace.yaml` | Turborepo con 2 packages + 1 app |
| Schema DB | `packages/db/prisma/schema.prisma` | Modelo completo: Tenant, Location, Product, InventoryTransaction, InventoryBalance, SalesOrder, WarehouseTask, TaskStep |
| Ledger core | `apps/api/src/use-cases/inventory/move-stock.ts` | El movimiento atómico de stock |
| Allocator | `apps/api/src/use-cases/inventory/allocate-order.ts` | Reserva con `SELECT FOR UPDATE` |
| API Fastify | `apps/api/src/server.ts` + 6 archivos de rutas | REST completo para Hito 1 |
| Tests | `__tests__/move-stock.test.ts` + `allocate-order.test.ts` | 12 tests de las garantías críticas |
| Seed | `packages/db/src/seed.ts` | Tenant demo + 12 ubicaciones + 5 productos |

### 🧠 Decisiones de diseño tomadas y por qué

#### 1. Inventario tipo Ledger (inmutable) + Snapshot (proyección)

**Decisión**: Dos tablas — `InventoryTransaction` (nunca se modifica) e `InventoryBalance` (se actualiza en la misma TX).

**Por qué**: Si solo tienes el Snapshot, cuando algo falla no sabes *qué pasó*. Si solo tienes el Ledger, cada consulta de "cuánto stock hay" requiere sumar miles de filas. Juntos son perfectos: el Snapshot da velocidad, el Ledger da auditoría total.

**Consecuencia**: En Fase 2, si necesitas reconstruir el Snapshot desde cero (por un bug), puedes hacerlo reproduciendo todas las `InventoryTransaction` en orden. Eso es imposible con un sistema de `UPDATE qty`.

#### 2. `SELECT FOR UPDATE` (bloqueo pesimista) en lugar de Optimistic Locking

**Decisión**: Usar `SELECT FOR UPDATE` en las filas de `InventoryBalance` durante allocation y picking.

**Por qué**: En un almacén pequeño/mediano, las reservas concurrentes sobre el mismo SKU son poco frecuentes pero altamente destructivas si fallan. Con Optimistic Locking tendrías que manejar retries en el cliente. Con pesimista, el segundo request simplemente espera (milisegundos) y lee el estado correcto.

**Cuándo reconsiderar**: Si tienes >100 operarios simultáneos reservando el mismo SKU (problema de Fase 3+), entonces el pesimista crea colas. Hasta entonces, no optimizar prematuramente.

#### 3. `isolationLevel: Serializable` en las transacciones críticas

**Decisión**: Las transacciones de `moveStock` y `allocateOrder` corren en nivel `Serializable`.

**Por qué**: `READ COMMITTED` (default de PG) no protege contra phantom reads. Si dos transacciones leen ATP simultáneamente antes de reservar, ambas ven el mismo stock disponible y ambas reservan. Serializable previene esto sin necesidad de `FOR UPDATE` en todos los casos, pero lo combinamos con `FOR UPDATE` por seguridad adicional.

#### 4. `quantity` siempre positiva en el Ledger

**Decisión**: El campo `quantity` en `InventoryTransaction` siempre es positivo. La dirección del movimiento la determinan `fromLocationId` y `toLocationId`.

**Por qué**: Hace las sumas de auditoría triviales y evita bugs de sign-flip. Para saber cuánto salió de una ubicación: `SUM(quantity) WHERE fromLocationId = X`. Para cuánto entró: `SUM(quantity) WHERE toLocationId = X`.

#### 5. Códigos de ubicación como strings ordenables lexicográficamente

**Decisión**: Los códigos de ubicación siguen el formato `PASILLO-ESTANTERIA-NIVEL` (ej. `A-01-02`). La ruta de picking se genera simplemente con `ORDER BY location.code ASC`.

**Por qué**: Un algoritmo TSP (Travelling Salesman Problem) es overkill para almacenes de <500 ubicaciones. El orden alfabético de los códigos, bien diseñados, ya produce un recorrido eficiente en S (primero toda la columna A de arriba a abajo, luego B, etc.). El jefe de almacén controla la eficiencia del picking simplemente nombrando bien sus ubicaciones.

**Regla para el cliente**: Cuando configures las ubicaciones de un cliente nuevo, usa siempre el formato `[PASILLO]-[ESTANTERIA_2DIGITOS]-[NIVEL_2DIGITOS]`. Ej: `A-01-01`, `A-01-02`, `A-02-01`. Nunca `A1`, `Estantería 1`, ni nombres con tildes.

#### 6. Auth dual: API Key para máquinas, JWT para humanos

**Decisión**: Header `x-api-key` para integraciones (Shopify, etc.), `Authorization: Bearer <JWT>` para usuarios humanos (Clerk).

**Por qué**: Las integraciones no pueden hacer OAuth cada vez. Las API Keys son simples, revocables y auditables. Los humanos necesitan sesiones con roles.

**En desarrollo**: El header `x-dev-tenant-id` actúa como bypass para no necesitar Clerk configurado. **Nunca llegará a producción** — hay un chequeo `process.env.NODE_ENV !== 'production'`.

#### 7. Estructura de rutas: el `orderId` en `WarehouseTask` de recepción

**Problema encontrado**: El modelo `WarehouseTask` tiene un campo `orderId` obligatorio (FK hacia `SalesOrder`). Pero las tareas de recepción (inbound) no tienen pedido de venta — son entradas de proveedor.

**Solución temporal**: En `receipts.ts` se usa `orderId: "receipt-placeholder"`. Esto rompe la FK.

**Solución correcta para Fase 2**: Crear un modelo `InboundReceipt` separado, y hacer `orderId` opcional en `WarehouseTask` (o añadir un campo `referenceType: "ORDER" | "RECEIPT"`). **No olvidar esto al hacer la migración de Hito 2**.
