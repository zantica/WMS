# CHECKPOINTS.md — Criterios Objetivos de Aceptación y Calidad (WMS)

Todo cambio de código evaluado por el subagente `reviewer` (o verificado tras un fix directo) debe cumplir estos puntos de control antes de marcar cualquier tarea como `"done"` en [`feature_list.json`](./feature_list.json).

---

## CP-1: Integridad del Inventory Ledger (Bounded Context B) ⚠️ CRÍTICO
- [ ] **Inmutabilidad absoluta**: Ningún código ejecuta `update`, `updateMany`, `delete` ni `deleteMany` sobre `prisma.inventoryTransaction`.
- [ ] **Atomicidad SQL**: Todo movimiento físico o reserva que altere `InventoryBalance` e `InventoryTransaction` ocurre dentro de `prisma.$transaction(..., { isolationLevel: "Serializable" })`.
- [ ] **Bloqueo pesimista (`SELECT ... FOR UPDATE`)**: Antes de descontar `onHandQty` o incrementar `allocatedQty`, se bloquea la fila en `inventory_balances` mediante `FOR UPDATE` filtrando por `tenant_id`, `location_id` y `product_id`.
- [ ] **Regla de Oro (No-Negatividad)**: Se verifica explícitamente que `onHandQty >= 0` y `ATP (onHandQty - allocatedQty) >= 0` antes de confirmar la operación; en caso contrario se lanza `WmsError("INSUFFICIENT_STOCK", ..., 409)`.

## CP-2: Aislamiento Multi-Tenant y Seguridad
- [ ] **Filtro `tenantId` obligatorio**: Todas las consultas (`findMany`, `findFirst`, `findUnique`, `update`, `$queryRaw`) incluyen `tenantId: request.tenantId`.
- [ ] **Sin fugas entre tenants**: Un recurso perteneciente a otro `tenantId` devuelve `404` (`*_NOT_FOUND`) o `403` (`TENANT_MISMATCH`), nunca datos cruzados.
- [ ] **Autenticación**: Los endpoints nuevos (salvo `/health` y `/docs`) pasan por el hook de autenticación (`request.tenantId` garantizado).

## CP-3: Contratos de API, Tipado y Arquitectura Monorepo
- [ ] **Fronteras de paquetes**:
  - `@wms/shared-types` **no importa nada de `@prisma/client` ni `@wms/db`**.
  - Los DTOs de entrada/salida compartidos entre `api`, `web` y `mobile` están definidos en `@wms/shared-types`.
- [ ] **Validación y Envolventes**:
  - Todas las entradas HTTP (`body`, `params`, `querystring`) se validan con esquemas **Zod**.
  - Las respuestas exitosas devuelven `{ success: true, data: ... }` (`ApiResponse<T>`).
  - Los errores de negocio usan `throw new WmsError(code, message, statusCode, details)`.
- [ ] **TypeScript Estricto & ESM**:
  - Compilación limpia (`pnpm build` sin errores con `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`).
  - Imports relativos locales usan extensión `.js` (requerido por `moduleResolution: "NodeNext"`).

## CP-4: Verificación Automatizada y Cobertura
- [ ] **Suite de tests en verde**: `pnpm test` finaliza con código de salida `0`.
- [ ] **Cobertura de casos de uso**: Los casos de uso en `apps/api/src/use-cases/**` mantienen **≥ 80%** en ramas (*branches*), funciones y líneas (`pnpm --filter @wms/api test:coverage`).
- [ ] **Tests de casos borde**: Toda nueva lógica de negocio incluye tests para el camino feliz (*happy path*) y al menos un caso de error de dominio (`WmsError`) o condición de carrera/rollback.
