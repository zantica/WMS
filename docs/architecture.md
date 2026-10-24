# Arquitectura del Sistema (WMS SaaS Multi-Tenant)

## 1. Visión General y Monorepo

El proyecto es un **Warehouse Management System (WMS) SaaS multi-tenant** gestionado con **pnpm workspaces** y **Turborepo**.

```text
wms/
├── apps/
│   ├── api/            # @wms/api — Backend Fastify 4 + TypeScript + Zod + Vitest
│   ├── mobile/         # @wms/mobile — App de operarios en Expo (Hito 2)
│   └── web/            # @wms/web — Dashboard de supervisores en Next.js (Hito 4)
└── packages/
    ├── db/             # @wms/db — Esquema Prisma + cliente singleton PostgreSQL
    └── shared-types/   # @wms/shared-types — Contratos DTO y enums agnósticos al ORM
```

### Grafo de Dependencias Permitido
- `@wms/shared-types` **no tiene dependencias internas** (prohibido importar `@prisma/client` o `@wms/db`).
- `@wms/db` encapsula Prisma y exporta el singleton `prisma` y los tipos de base de datos.
- `@wms/api` consume `@wms/db` y `@wms/shared-types`.
- `@wms/mobile` y `@wms/web` consumen **únicamente** `@wms/shared-types` (nunca `@wms/db` directamente).

---

## 2. Bounded Contexts del Dominio

### Contexto Transversal: Multi-Tenancy & Auth
- **Modelos**: `Tenant`, `User` (`ADMIN`, `SUPERVISOR`, `OPERATOR`).
- **Regla de aislamiento**: Toda tabla de dominio posee columna `tenantId`. Ninguna consulta SQL/Prisma puede ejecutarse sin filtrar explícitamente por `tenantId`.
- **Plugin de Auth** (`apps/api/src/plugins/auth.ts`): Inyecta `request.tenantId` y `request.userId` a partir del header `x-api-key` o `Authorization: Bearer <token>`.

### Bounded Context A: Topología & Catálogo
- **Modelos**: `Warehouse`, `Location`, `Product`.
- **Flujo físico de ubicaciones (`LocationType`)**:
  `RECEIVING` (descarga) → `STORAGE` (estanterías de picking) → `PACKING` (mesa de armado) → `DISPATCH` (muelle de salida).
- Los códigos de ubicación (`Location.code`, ej. `A-01-01`) son únicos por almacén y determinan el orden de recorrido de picking (`ORDER BY code ASC`).

### Bounded Context B: Inventory Ledger (⚠️ Crítico)
Es el corazón contable del almacén y opera bajo un patrón **Event Ledger + Snapshot**:
1. **`InventoryTransaction` (Libro Mayor Inmutable)**:
   - Registro *append-only* de todo movimiento (`INBOUND_RECEIPT`, `PUTAWAY`, `ALLOCATION`, `ALLOCATION_CANCEL`, `PICK`, `OUTBOUND_SHIPMENT`, `ADJUSTMENT`, `RETURN_INBOUND`).
   - `quantity` es siempre positiva (`Decimal(12,4)`); el sentido lo determinan `fromLocationId` y `toLocationId`.
   - **Prohibido** hacer `UPDATE` o `DELETE` en `inventory_transactions`.
2. **`InventoryBalance` (Proyección / Snapshot)**:
   - Mantiene `onHandQty` (stock físico real) y `allocatedQty` (stock reservado por pedidos activos) por `(locationId, productId)`.
   - **ATP (Available To Promise)** = `onHandQty - allocatedQty`.
3. **Invariantes de Concurrencia (`moveStock` y `allocateOrder`)**:
   - Siempre dentro de `prisma.$transaction(..., { isolationLevel: "Serializable" })`.
   - Bloqueo pesimista por fila con `SELECT ... FROM inventory_balances WHERE ... FOR UPDATE` antes de validar o mutar saldos.
   - Nunca permitir `onHandQty < 0` ni `allocatedQty > onHandQty`.

### Bounded Context C: Fulfillment, Inbound & Tasks
- **Modelos**: `SalesOrder`, `OrderLine`, `WarehouseTask`, `TaskStep`.
- **Ciclo de vida del pedido (`OrderStatus`)**:
  `PENDING` → `ALLOCATED` → `PICKING` → `PACKED` → `SHIPPED` (con desvíos a `ON_HOLD` o `CANCELLED`).
- **Ejecución por pasos (`WarehouseTask` & `TaskStep`)**:
  Toda operación de piso (recepción, putaway, picking, packing) se descompone en pasos secuenciales verificados por escaneo físico de código de barras/QR.
