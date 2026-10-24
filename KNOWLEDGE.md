# WMS — Libro de Conocimiento del Proyecto

> Este documento es la memoria viva del proyecto. Se actualiza al cierre de cada hito con
> decisiones de diseño, patrones establecidos, errores encontrados y guías para el siguiente hito.
> **Si tocas código de este proyecto, lee este archivo primero.**

---

## Índice

- [Filosofía del proyecto](#filosofía-del-proyecto)
- [Hito 1 — Lo que aprendimos](#hito-1--lo-que-aprendimos)
- [Bugs encontrados y corregidos](#bugs-encontrados-y-corregidos)
- [Patrones establecidos (no romper)](#patrones-establecidos-no-romper)
- [Guía para el Hito 2 — App Expo](#guía-para-el-hito-2--app-expo)
- [Guía para el Hito 3 — Motor de Pedidos](#guía-para-el-hito-3--motor-de-pedidos)
- [Guía para el Hito 4 — Panel Web + Integraciones](#guía-para-el-hito-4--panel-web--integraciones)
- [Convenciones de código](#convenciones-de-código)
- [Errores a no repetir](#errores-a-no-repetir)
- [Glosario de dominio](#glosario-de-dominio)

---

## Bugs encontrados y corregidos

> Registrados en orden cronológico. Si ves un error parecido, busca aquí primero.

### Bug #1 — `pino-pretty` no instalado (Hito 1, primer arranque)

**Síntoma**: La API no arrancaba. Error de módulo no encontrado en `server.ts`.  
**Causa**: `server.ts` referenciaba `pino-pretty` en el transport de logs de desarrollo pero no estaba declarado en `package.json`.  
**Fix**: Añadido `"pino-pretty": "^11.3.0"` a `devDependencies` de `apps/api/package.json`.  
**Lección**: Al referenciar un paquete en código aunque sea solo en desarrollo, debe estar en `devDependencies`.

---

### Bug #2 — FK obligatoria `orderId` en `WarehouseTask` rompía recepciones (Hito 1)

**Síntoma**: `POST /receipts` fallaba con error de FK en PostgreSQL porque se intentaba insertar `orderId: "receipt-placeholder"` que no existe en `sales_orders`.  
**Causa**: El modelo `WarehouseTask` tenía `orderId String` (obligatorio) como FK hacia `SalesOrder`, pero las tareas de recepción de mercancía no tienen un pedido de venta asociado.  
**Fix**: Cambiado a `orderId String?` (opcional) en el schema + añadido campo `receiptRef String?` para identificar recepciones. En `receipts.ts` se usa `receiptRef: receipt-${Date.now()}` en lugar del placeholder roto.  
**Lección**: Al modelar tareas genéricas (`WarehouseTask`) que sirven a múltiples flujos, las referencias a documentos específicos de cada flujo deben ser opcionales.

---

### Bug #3 — `app.decorate` con tipos inválidos en `auth.ts` (Hito 1)

**Síntoma**: Error de compilación TypeScript en el plugin de auth.  
**Causa**: Se añadió un `app.decorate("authenticate", ...)` placeholder con tipos imposibles `extends undefined ? never : never`.  
**Fix**: Eliminado el bloque de `app.decorate`. Se implementará correctamente cuando se integre Clerk en Hito 4.  
**Lección**: No añadir decorators placeholder con tipos inválidos. Si quieres reservar la API, declárala en el `declare module 'fastify'` pero no la implementes hasta que haga falta.

---

### Bug #4 — `npm install` en vez de `pnpm install` (Hito 1, primer arranque)

**Síntoma**: Los módulos `@wms/db` y `@wms/shared-types` no se resuelven. Error `Cannot find module`.  
**Causa**: npm no entiende la sintaxis `"workspace:*"` de pnpm. Los symlinks del monorepo no se crean.  
**Fix**: Eliminar `node_modules/` de la raíz y ejecutar `pnpm install`.  
**Lección**: Cuando el `package.json` tiene `"packageManager": "pnpm@x.x.x"`, npm lanzará un warning. No ignorarlo.

---


---

## Filosofía del proyecto

1. **El almacén es una cuenta bancaria.** El stock nunca se toca con un `UPDATE qty = qty - 1`. Cada movimiento es una transacción en el Ledger. Sin excepciones.
2. **La app móvil es el producto real.** El panel web es para el jefe. La app es para las personas que trabajan de pie 8 horas. Cada pantalla debe funcionar con una sola mano, sin necesidad de leer texto largo.
3. **Seguridad primero, velocidad después.** Un error de stock (doble reserva, saldo negativo) cuesta dinero y rompe la confianza del cliente. Una respuesta lenta de 200ms extra no.
4. **Multi-tenant desde el día 0.** Cada tabla tiene `tenantId`. Cada query lo filtra. No hay excepciones.

---

## Hito 1 — Lo que aprendimos

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

---

## Patrones establecidos (no romper)

### ❌ Nunca hacer esto

```typescript
// PROHIBIDO — modifica stock sin Ledger
await prisma.inventoryBalance.update({
  where: { id: balanceId },
  data: { onHandQty: { decrement: 5 } }
});

// PROHIBIDO — permite race condition
const balance = await prisma.inventoryBalance.findUnique(...);
if (balance.onHandQty >= qty) {
  await prisma.inventoryBalance.update(...); // Otra TX pudo cambiar esto entre estas dos líneas
}
```

### ✅ Siempre hacer esto

```typescript
// CORRECTO — todo movimiento pasa por el use case
import { moveStock } from '../use-cases/inventory/move-stock.js';

await moveStock({
  tenantId,
  productId,
  fromLocationId: 'loc-origen',
  toLocationId: 'loc-destino',
  quantity: 5,
  reason: 'PICK',
  referenceId: orderId,
  userId: request.userId,
});
// moveStock internamente hace: SELECT FOR UPDATE → UPDATE balance → INSERT transaction (todo en 1 TX)
```

### Patrón de ruta: siempre filtrar por `tenantId`

```typescript
// CORRECTO
const product = await prisma.product.findFirst({
  where: { id: params.id, tenantId: request.tenantId } // ← siempre los dos
});

// PELIGROSO — un tenant podría ver datos de otro
const product = await prisma.product.findUnique({
  where: { id: params.id } // ← falta tenantId
});
```

### Patrón de error: lanzar `WmsError` desde use-cases, Zod desde validación de input

```typescript
// En use-cases: WmsError con código de dominio
throw new WmsError('INSUFFICIENT_STOCK', 'Not enough stock', 409, { missing: 3 });

// En rutas: Zod para validar el body antes de llegar al use-case
const body = CreateOrderSchema.parse(request.body);
// Si falla, el error-handler lo convierte en ApiError { code: 'VALIDATION_ERROR' }
```

---

## Guía para el Hito 2 — App Expo

### Qué construir

La app móvil con 4 pantallas y el componente de escaneo.

### Decisiones ya tomadas que la app debe respetar

1. **Autenticación**: La app usará JWT de Clerk. El token se guarda en `expo-secure-store` (nunca en AsyncStorage — no es seguro).

2. **Base URL de la API**: Configurar como variable de entorno de Expo (`app.config.js` o `.env` con `EXPO_PUBLIC_API_URL`).

3. **Manejo de escaneo dual (cámara + HID Bluetooth)**:
   El lector Bluetooth HID simula un teclado físico — envía los caracteres del código de barras seguidos de un `Enter`. La cámara de Expo devuelve el string directamente.
   
   ```typescript
   // El handler onScan debe ser el mismo para ambas fuentes
   function onScan(scannedCode: string) {
     // Aquí NO distinguimos si vino de cámara o HID
     confirmStep({ scannedCode });
   }
   
   // Para HID: usar un TextInput oculto siempre enfocado que captura el "teclado" del lector
   // Para cámara: expo-camera con onBarcodeScanned
   ```

4. **Sonido y vibración obligatorios**: Cada escaneo correcto → vibración corta + sonido de "beep". Cada error → vibración larga + sonido de error. El operario trabaja de pie y no mira la pantalla constantemente.
   ```typescript
   import * as Haptics from 'expo-haptics';
   // Éxito:
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
   // Error:
   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
   ```

5. **Modo simulador para desarrollo**: La cámara no funciona en el simulador de iOS/Android. Crear un botón de "Simular escaneo" visible solo en `__DEV__` que permita introducir el código manualmente.

### Pendiente técnico del Hito 1 que afecta al Hito 2

- **Fix obligatorio**: Hacer `orderId` opcional en `WarehouseTask` para las tareas de recepción. Crear migración de Prisma.
- **Fix obligatorio**: En `receipts.ts`, reemplazar `orderId: "receipt-placeholder"` con un modelo `InboundReceipt` propio, o al menos un campo `receiptId` separado.

### Endpoint que la app usará más

```
GET  /api/v1/tasks?type=RECEIVING&status=PENDING  → lista de tareas al abrir la pantalla
POST /api/v1/tasks/:id/start                      → el operario "toma" la tarea
POST /api/v1/tasks/:id/steps/:stepId/confirm      → cada escaneo confirmado
POST /api/v1/receipts/:taskId/confirm-line        → cada producto recibido
```

---

## Guía para el Hito 3 — Motor de Pedidos

### Qué construir

La pantalla de Picking guiado en Expo + el endpoint de despacho final + lógica de Webhook outbound.

### Decisiones de diseño para este hito

1. **El picking tiene DOS sub-pasos por step** (no uno):
   - Sub-paso A: Operario llega a la ubicación → **escanea el QR de la estantería** (valida que está en el lugar correcto)
   - Sub-paso B: Operario toma el producto → **escanea el barcode del producto** tantas veces como la `expectedQty`
   
   La app gestiona este estado localmente (sin llamar a la API en el sub-paso A). Solo llama a la API en el sub-paso B.

2. **Webhook de despacho**: Cuando se ejecuta `POST /orders/:id/dispatch`, el sistema debe emitir un webhook `order.shipped` al e-commerce configurado del tenant. Guardar la URL de webhook y el secret en la tabla `Tenant` o en una tabla `TenantWebhook` separada. El cuerpo del webhook debe incluir `orderId`, `externalId`, `shippedAt` y un HMAC-SHA256 para que el receptor pueda verificar la autenticidad.

3. **El botón "No encuentro el producto"** en la app debe:
   - Llamar a `POST /tasks/:id/steps/:stepId/confirm` con `exceptionNote: "Producto no encontrado en ubicación"`
   - El step queda en estado `EXCEPTION` y el operario puede continuar con el siguiente step
   - El supervisor ve en el dashboard que hay excepciones pendientes de resolver

4. **Finalización del picking → estado PACKED**: Cuando todos los steps de una tarea PICKING están en COMPLETED o EXCEPTION, el sistema automáticamente mueve el pedido a `PACKED`. Esto ya está implementado en `tasks.ts` — no duplicar la lógica.

### Endpoint crítico a implementar en este hito

```
POST /api/v1/orders/:id/dispatch
```

Este endpoint ya existe en `orders.ts` pero falta el Webhook outbound. Completarlo en Hito 3.

---

## Guía para el Hito 4 — Panel Web + Integraciones

### Qué construir

Dashboard Next.js 14 (App Router) + generador de PDF de QRs + endpoint público para Shopify/WooCommerce.

### Decisiones de diseño

1. **Generador de QR PDF**: Usar `@react-pdf/renderer` + `qrcode` (npm). Cada página del PDF contiene una cuadrícula de QRs, uno por ubicación, con el código impreso debajo. El operario recorta y pega en la estantería. Tamaño recomendado: 5x5 cm.

2. **Autenticación del panel web**: Clerk con `<ClerkProvider>` en el layout raíz de Next.js. El panel web y la API comparten el mismo `CLERK_PUBLISHABLE_KEY`.

3. **Inbound Adapter para Shopify**:
   El endpoint `POST /api/v1/orders` ya existe y acepta `externalId` y `externalRef`. Para conectar Shopify:
   - Configurar un Webhook en Shopify `orders/create` → `POST /api/v1/webhooks/shopify`
   - Verificar la firma HMAC de Shopify antes de procesar
   - Mapear el formato de Shopify al `CreateOrderInput` y llamar internamente al use case
   - Crear `apps/api/src/routes/webhooks/shopify.ts` para esto (no mezclar con `orders.ts`)

4. **Vista de Auditoría (Kardex)**:
   Ya existe `GET /api/v1/inventory/transactions`. El panel solo necesita mostrarlas en una tabla con filtros por producto, fecha y razón. No hay trabajo de backend adicional.

5. **Stack del panel web**:
   ```
   apps/web/
   ├── app/
   │   ├── layout.tsx       ← ClerkProvider + nav
   │   ├── page.tsx         ← Dashboard KPIs
   │   ├── products/        ← CRUD catálogo
   │   ├── inventory/       ← Stock en vivo
   │   ├── orders/          ← Monitor de pedidos (Kanban)
   │   ├── locations/       ← CRUD + Imprimir QR
   │   └── ledger/          ← Auditoría
   └── components/
       ├── QrPdfButton.tsx  ← Genera PDF en el cliente
       └── KanbanBoard.tsx  ← Pedidos por estado
   ```

---

## Convenciones de código

### Imports
- Siempre usar extensión `.js` en imports de TypeScript (aunque el archivo sea `.ts`). Node ESM lo requiere.
- Orden: primero node_modules, luego `@wms/*` packages, luego imports locales.

### Nombres
- **Use cases**: verbos en camelCase → `moveStock`, `allocateOrder`, `dispatchOrder`
- **Rutas**: sustantivos en plural → `products.ts`, `orders.ts`, `tasks.ts`
- **DTOs**: sufijo `DTO` → `ProductDTO`, `SalesOrderDTO`
- **Schemas Zod**: sufijo `Schema` → `CreateProductSchema`, `ConfirmStepSchema`
- **Errores de dominio**: constantes de `WmsErrorCode` → `INSUFFICIENT_STOCK`, `ORDER_NOT_FOUND`

### Tests
- Un archivo de test por use case, en `__tests__/` junto al use case.
- Los tests unitarios mockean Prisma completo.
- Los tests de integración (Hito 2+) usarán una base de datos real de test.
- Nombrar los tests en español para que sirvan como documentación del comportamiento esperado.

### Respuestas de la API
Siempre el shape `ApiResponse<T>` o `ApiError`:
```typescript
// Éxito
{ success: true, data: T }

// Error
{ success: false, error: { code: WmsErrorCode, message: string, details?: unknown } }
```
**Nunca devolver datos sin envolverlos en este shape.**

---

## Errores a no repetir

### 1. No olvidar `tenantId` en queries

El error más peligroso del sistema. Si olvidas filtrar por `tenantId`, un tenant puede ver o modificar datos de otro. Añadir un test de integración que verifique el aislamiento entre tenants en Hito 2.

### 2. No usar `prisma.$transaction` sin timeout explícito

Las transacciones sin timeout pueden colgar indefinidamente si hay un deadlock. Siempre usar:
```typescript
await prisma.$transaction(callback, { timeout: 10_000 });
```

### 3. No devolver Decimals de Prisma directamente al cliente

Prisma retorna `Decimal` (no `number`) para campos con `@db.Decimal`. Si los devuelves directamente en JSON, el cliente recibe un objeto extraño en lugar de un número.
```typescript
// MAL
data: { qty: balance.onHandQty }  // Decimal object

// BIEN
data: { qty: Number(balance.onHandQty) }  // number primitivo
```

### 4. No bloquear al operario móvil por errores de red

La app móvil debe tener un estado de "trabajando offline" visible. Si la API no responde en 5 segundos, mostrar un mensaje claro. El operario no puede quedarse parado en medio del pasillo esperando a que cargue.

### 5. El seed no es idempotente por defecto

El seed usa `upsert` para ser re-ejecutable sin errores. Si añades nuevas entidades al seed, usa siempre `upsert` o comprueba antes si ya existe.

---

## Glosario de dominio

| Término | Significado en el sistema |
|---------|--------------------------|
| **ATP** | Available To Promise — `onHandQty - allocatedQty`. Lo que puedes vender ahora mismo |
| **Ledger** | `InventoryTransaction` — el libro mayor inmutable de todos los movimientos |
| **Snapshot** | `InventoryBalance` — proyección en tiempo real del stock por ubicación |
| **Inbound** | Mercancía que entra al almacén (del proveedor) |
| **Outbound** | Mercancía que sale del almacén (al cliente) |
| **Putaway** | El acto de mover mercancía de RECEIVING a su ubicación STORAGE definitiva |
| **Allocation** | Reservar stock para un pedido sin moverlo físicamente todavía |
| **Pick** | El acto físico de recoger producto de la estantería para un pedido |
| **Task** | Unidad de trabajo asignada a un operario en la app móvil |
| **Step** | Cada punto individual del recorrido dentro de una Task |
| **Exception** | Un step que el operario no pudo completar normalmente (stock dañado, no encontrado) |
| **HID** | Human Interface Device — protocolo que usan los lectores Bluetooth para simular un teclado |
| **EAN / EAN-13** | Código de barras estándar europeo de 13 dígitos (el de los supermercados) |
| **SKU** | Stock Keeping Unit — el código interno que tú defines para cada producto |
| **3PL** | Third-Party Logistics — almacenes que gestionan stock de múltiples empresas clientes |
| **Tenant** | Cada empresa cliente que usa el WMS (aislada de las demás) |
| **Kanban** | Vista de columnas por estado (PENDING → PICKING → SHIPPED) para el panel web |
