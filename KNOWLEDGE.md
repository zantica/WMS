# WMS — Libro de Conocimiento del Proyecto (Memoria Viva)

> Este documento contiene **solo conocimiento vigente**: filosofía, decisiones de diseño activas, bugs con su lección,
> patrones obligatorios/prohibidos, convenciones y glosario. **Si tocas código de este proyecto, lee este archivo primero.**
>
> - Guías de hitos ya cerrados → [`docs/hitos/`](./docs/hitos/README.md) (no se cargan por defecto).
> - Decisiones arquitectónicas formales → [`docs/adr/`](./docs/adr/README.md).
> - **Mantenimiento**: al cerrar una feature, añade aquí los bugs/patrones nuevos; al cerrar un hito, archiva su guía en `docs/hitos/hito-N.md`.

---

## Índice

- [Filosofía del proyecto](#filosofía-del-proyecto)
- [Decisiones de diseño vigentes](#decisiones-de-diseño-vigentes)
- [Bugs encontrados y corregidos](#bugs-encontrados-y-corregidos)
- [Patrones establecidos (no romper)](#patrones-establecidos-no-romper)
- [Convenciones de código](#convenciones-de-código)
- [Errores a no repetir](#errores-a-no-repetir)
- [Glosario de dominio](#glosario-de-dominio)

---

## Filosofía del proyecto

1. **El almacén es una cuenta bancaria.** El stock nunca se toca con un `UPDATE qty = qty - 1`. Cada movimiento es una transacción en el Ledger. Sin excepciones.
2. **La app móvil es el producto real.** El panel web es para el jefe. La app es para las personas que trabajan de pie 8 horas. Cada pantalla debe funcionar con una sola mano, sin necesidad de leer texto largo.
3. **Seguridad primero, velocidad después.** Un error de stock (doble reserva, saldo negativo) cuesta dinero y rompe la confianza del cliente. Una respuesta lenta de 200ms extra no.
4. **Multi-tenant desde el día 0.** Cada tabla tiene `tenantId`. Cada query lo filtra. No hay excepciones.

---

## Decisiones de diseño vigentes

> Establecidas en el Hito 1 y aún en vigor. Contexto histórico completo en [`docs/hitos/hito-1.md`](./docs/hitos/hito-1.md).

### 1. Inventario tipo Ledger (inmutable) + Snapshot (proyección)

**Decisión**: Dos tablas — `InventoryTransaction` (nunca se modifica) e `InventoryBalance` (se actualiza en la misma TX).

**Por qué**: Si solo tienes el Snapshot, cuando algo falla no sabes *qué pasó*. Si solo tienes el Ledger, cada consulta de "cuánto stock hay" requiere sumar miles de filas. Juntos son perfectos: el Snapshot da velocidad, el Ledger da auditoría total.

**Consecuencia**: En Fase 2, si necesitas reconstruir el Snapshot desde cero (por un bug), puedes hacerlo reproduciendo todas las `InventoryTransaction` en orden. Eso es imposible con un sistema de `UPDATE qty`.

### 2. `SELECT FOR UPDATE` (bloqueo pesimista) en lugar de Optimistic Locking

**Decisión**: Usar `SELECT FOR UPDATE` en las filas de `InventoryBalance` durante allocation y picking.

**Por qué**: En un almacén pequeño/mediano, las reservas concurrentes sobre el mismo SKU son poco frecuentes pero altamente destructivas si fallan. Con Optimistic Locking tendrías que manejar retries en el cliente. Con pesimista, el segundo request simplemente espera (milisegundos) y lee el estado correcto.

**Cuándo reconsiderar**: Si tienes >100 operarios simultáneos reservando el mismo SKU (problema de Fase 3+), entonces el pesimista crea colas. Hasta entonces, no optimizar prematuramente.

### 3. `isolationLevel: Serializable` en las transacciones críticas

**Decisión**: Las transacciones de `moveStock` y `allocateOrder` corren en nivel `Serializable`.

**Por qué**: `READ COMMITTED` (default de PG) no protege contra phantom reads. Si dos transacciones leen ATP simultáneamente antes de reservar, ambas ven el mismo stock disponible y ambas reservan. Serializable previene esto sin necesidad de `FOR UPDATE` en todos los casos, pero lo combinamos con `FOR UPDATE` por seguridad adicional.

### 4. `quantity` siempre positiva en el Ledger

**Decisión**: El campo `quantity` en `InventoryTransaction` siempre es positivo. La dirección del movimiento la determinan `fromLocationId` y `toLocationId`.

**Por qué**: Hace las sumas de auditoría triviales y evita bugs de sign-flip. Para saber cuánto salió de una ubicación: `SUM(quantity) WHERE fromLocationId = X`. Para cuánto entró: `SUM(quantity) WHERE toLocationId = X`.

### 5. Códigos de ubicación como strings ordenables lexicográficamente

**Decisión**: Los códigos de ubicación siguen el formato `PASILLO-ESTANTERIA-NIVEL` (ej. `A-01-02`). La ruta de picking se genera simplemente con `ORDER BY location.code ASC`.

**Por qué**: Un algoritmo TSP (Travelling Salesman Problem) es overkill para almacenes de <500 ubicaciones. El orden alfabético de los códigos, bien diseñados, ya produce un recorrido eficiente en S (primero toda la columna A de arriba a abajo, luego B, etc.). El jefe de almacén controla la eficiencia del picking simplemente nombrando bien sus ubicaciones.

**Regla para el cliente**: Cuando configures las ubicaciones de un cliente nuevo, usa siempre el formato `[PASILLO]-[ESTANTERIA_2DIGITOS]-[NIVEL_2DIGITOS]`. Ej: `A-01-01`, `A-01-02`, `A-02-01`. Nunca `A1`, `Estantería 1`, ni nombres con tildes.

### 6. Auth dual: API Key para máquinas, JWT para humanos

**Decisión**: Header `x-api-key` para integraciones (Shopify, etc.), `Authorization: Bearer <JWT>` para usuarios humanos (Clerk).

**Por qué**: Las integraciones no pueden hacer OAuth cada vez. Las API Keys son simples, revocables y auditables. Los humanos necesitan sesiones con roles.

**En desarrollo**: El header `x-dev-tenant-id` actúa como bypass para no necesitar Clerk configurado. **Nunca llegará a producción** — hay un chequeo `process.env.NODE_ENV !== 'production'`.

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

### Bug #5 — Self-review del leader cerró F4.2 sin tests ejecutados (Harness, Hito 4)

**Síntoma**: `review_F4.2.md` marcó CP-4 como "en verde" con veredicto `APPROVED`, mientras `impl_F4.2.md` admitía "No se pudo ejecutar `pnpm test`… pendiente de ejecución local".  
**Causa**: El `implementer` fue cancelado y, por falta de cuota, el `leader` completó los tests **y** firmó la revisión ("fallback por cuota de subagente"). Sin reviewer independiente, CP-4 se convirtió en autofelicitación.  
**Fix**: (1) `reviewer.md`: `APPROVED` exige pegar la salida literal de `pnpm --filter @wms/api test:coverage`; sin evidencia solo cabe `BLOCKED`. (2) `leader.md`: prohibido el self-review y cualquier fallback por cuota — la feature queda `in_progress` y se reporta al usuario. (3) F4.2 sometida a re-auditoría independiente (`progress/review_F4.2_reaudit.md`).  
**Lección**: Un sistema de verificación solo vale lo que vale bajo presión. "Verificación estática" o "pendiente de ejecución" **no** es verde; quien implementa nunca revisa.

---

### Bug #6 — Crash silencioso de `turbo@2.11.9` en terminales interactivas de Windows (`STATUS_STACK_BUFFER_OVERRUN`)

**Síntoma**: Al ejecutar `.\init.ps1`, `pnpm test` o `pnpm dev` en una consola interactiva de Windows PowerShell, `turbo` muestra únicamente el aviso de actualización (`v2.11.9 ≫ v2.11.10`) y aborta inmediatamente con `ELIFECYCLE Test failed` (código `-1073740791` / `0xC0000409`). En shells no interactivas (`stdin.isTTY === false`) pasaba sin fallar.  
**Causa**: En `turbo@2.11.9`, el wrapper JS (`node_modules/turbo/bin/turbo`) inyecta `__TURBO_WINDOWS_CTRL_C_FD=3` cuando `stdin.isTTY` es `true`, pero el binario nativo `turbo.exe` re-ejecuta el binario local sin heredar el descriptor de archivo `3`, provocando un aborto del CRT de Windows al invocar `_get_osfhandle(3)`.  
**Fix**: Actualizado `turbo` a `^2.11.10` en [`package.json`](./package.json) y [`pnpm-lock.yaml`](./pnpm-lock.yaml).  
**Lección**: No fijar ni degradar `turbo` a `2.11.9` en entornos Windows.

---

### Bug #7 — Aborto de transacción PostgreSQL (`25P02`) tras capturar violación RLS con `expect(...).rejects.toThrow` dentro de `withTenantContext`

**Síntoma**: En CI (`integration-postgres`), `tenant-rls.integration.test.ts` fallaba en `tx.warehouse.create()` con `PostgresError { code: "25P02", message: "current transaction is aborted, commands ignored until end of transaction block" }`.  
**Causa**: Dentro de una misma transacción interactiva `withTenantContext(db, tenantAId, async (tx) => { ... })`, se verificó primero un intento de spoofing (`await expect(tx.product.create({ tenantId: tenantBId })).rejects.toThrow(...)`) y luego se intentó continuar ejecutando queries en el mismo `tx`. En PostgreSQL, cualquier error SQL (incluido `42501: new row violates row-level security policy`) invalida el bloque transaccional activo hasta su `ROLLBACK`; capturar la excepción en JS no limpia el estado abortado de la transacción en PG. Además, en `afterAll`, borrar `tenants` sin limpiar antes `inventory_balances` / `locations` / `warehouses` / `products` dentro de `withTenantContext` fallaba por `ON DELETE RESTRICT` y RLS.  
**Fix**: Ejecutar cada aserción de fallo SQL esperado en su propia invocación `await expect(withTenantContext(...)).rejects.toThrow(...)` (para que Prisma haga `ROLLBACK` limpio de esa transacción) y limpiar las entidades hijas por tenant con `withTenantContext` en `afterAll`.  
**Lección**: En tests de integración contra PostgreSQL real, nunca continúes reutilizando un `tx` después de provocar deliberadamente un error SQL (`RLS`, `UNIQUE`, `FK`); aísla cada fallo esperado en su propia transacción.

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

### UI/UX y Sistema de Diseño (React + Tailwind)
- **Activación**: Toda modificación o creación de UI en `apps/web` o `apps/mobile` debe seguir [`docs/design/SKILL.md`](./docs/design/SKILL.md) (y la skill `.agents/skills/uiux-design-system/SKILL.md`).
- **Plan de Tokens obligatorio**: Antes de escribir código visual, declarar el bloque `## Design tokens` (Estilo S1–S10, Paleta semántica P1–P15, Tipografía T1–T12, Elemento memorable).
- **Prohibido hex crudo**: Cero clases con hex arbitrario (`bg-[#...]`) en producción; todo color se referencia vía tokens/variables CSS semánticas (`--bg`, `--surface`, `--accent`, `--border`, etc.).
- **Estados completos obligatorios**: Ningún componente interactivo se entrega sin estados hover, focus-visible, disabled y error. Ninguna vista de datos sin skeleton de carga ni empty state guiado.
- **Autocrítica con Checklist**: Validar contra [`docs/design/references/checklist.md`](./docs/design/references/checklist.md) en viewports 375 / 768 / 1440 antes de dar por cerrada una UI.
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
