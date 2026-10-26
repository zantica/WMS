# Reporte de Revisión: F4.1 — Esqueleto del Dashboard Web en apps/web (Next.js App Router + @wms/shared-types)

- **VEREDICTO**: APPROVED
- **Fecha**: 2026-10-26

## Evaluación de Checkpoints
- [x] CP-1: Integridad del Inventory Ledger
- [x] CP-2: Aislamiento Multi-Tenant
- [x] CP-3: Contratos de API, Tipado y Monorepo
- [x] CP-4: Verificación Automatizada y Cobertura (>= 80%)

## Resumen de Auditoría
1. **Integración Monorepo y Fronteras de Paquetes (CP-3)**:
   - `@wms/web` (`apps/web/package.json`) declara como única dependencia interna a `"@wms/shared-types": "workspace:*"`. No existe ninguna dependencia ni importación de `@wms/db` ni `@prisma/client`.
   - `packages/shared-types/src/index.ts` se mantiene 100% libre de referencias a Prisma.
   - `apps/web/tsconfig.json` extiende `../../tsconfig.base.json` preservando `strict: true`, `noUncheckedIndexedAccess: true` y `exactOptionalPropertyTypes: true`. Todos los imports locales emplean extensión `.js` y `import type` donde corresponde, y las propiedades opcionales incluyen explícitamente `| undefined` para cumplir `exactOptionalPropertyTypes`.
2. **Aislamiento Multi-Tenant y Contratos HTTP (CP-2 & CP-3)**:
   - `WmsWebApiClient` (`apps/web/src/lib/api-client.ts`) y `SupervisorSessionProvider` (`apps/web/src/context/supervisor-session.tsx`) propagan en cada petición los headers `x-api-key` y `Authorization: Bearer <token>`, además del `warehouseId` activo del tenant.
   - El cliente valida las envolventes `ApiResponse<T>` y `ApiError`, transformando fallos de dominio en instancias tipadas de `WmsWebApiError` con preservación de `WmsErrorCode`, `statusCode` y `details`.
3. **Invariantes del Inventory Ledger y Vistas Operativas (CP-1)**:
   - El Kardex (`apps/web/src/app/inventory/page.tsx`) se trata como un registro estrictamente *append-only* de lectura paginada sobre `/api/v1/inventory/transactions` con soporte para todos los motivos `TxReason` (incluyendo `ALLOCATION_CANCEL`).
   - Los saldos en vivo (`InventoryBalanceDTO`) respetan y visualizan la invariante `ATP = OnHand - Allocated`, y toda corrección manual de inventario se canaliza exclusivamente vía `POST /api/v1/inventory/adjustments` (`AdjustmentInput` con nota de auditoría obligatoria).
   - Se verificaron las 4 vistas requeridas en Next.js App Router: Resumen Ejecutivo (`src/app/page.tsx`), Catálogo y Mapa de Ubicaciones por zona `RECEIVING -> STORAGE -> PACKING -> DISPATCH` (`src/app/catalog/page.tsx`), Inventario y Kardex (`src/app/inventory/page.tsx`), y Monitor de Pedidos y Tareas con soporte de alocación, cancelación (`F3.1`) y despacho (`src/app/operations/page.tsx`).
4. **Pruebas Unitarias y Cobertura (CP-4)**:
   - `apps/web/vitest.config.ts` exige umbrales `>= 80%` en líneas, funciones y ramas sobre `src/lib/**/*.ts`.
   - Las suites `apps/web/src/lib/__tests__/api-client.test.ts` y `apps/web/src/lib/__tests__/dashboard-metrics.test.ts` cubren exhaustivamente tanto el *happy path* como los casos borde y errores (`INSUFFICIENT_STOCK`, errores de red, JSON malformado, colecciones vacías, excepciones de picking y filtros del Kardex).

## Hallazgos / Correcciones Requeridas (si aplica)
Ninguno. La implementación de `F4.1` cumple todos los criterios de aceptación e invariantes arquitectónicas.
