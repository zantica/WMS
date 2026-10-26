# Reporte de Implementación: F4.1 — Esqueleto del Dashboard Web en apps/web (Next.js App Router + @wms/shared-types)

- **Estado**: DONE
- **Fecha**: 2026-10-26

## Archivos Creados / Modificados
- `package.json`: Añadido script `"dev:web": "pnpm --filter @wms/web dev"` en la raíz del monorepo.
- `apps/web/package.json`: Configuración del paquete `@wms/web` con scripts de Turborepo (`dev`, `build`, `lint`, `test`, `test:coverage`) dependiendo internamente **únicamente** de `@wms/shared-types`.
- `apps/web/tsconfig.json`: Configuración TypeScript estricta (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`) heredando de `tsconfig.base.json`.
- `apps/web/next-env.d.ts`: Declaraciones de tipos de módulos Next.js (`next`, `next/link`, `next/navigation`) y hojas de estilo CSS.
- `apps/web/next.config.mjs`: Configuración de Next.js con `transpilePackages: ["@wms/shared-types"]`.
- `apps/web/vitest.config.ts`: Configuración de Vitest con umbral obligatorio de cobertura ≥ 80% (`lines`, `functions`, `branches`) sobre `src/lib/**/*.ts`.
- `apps/web/src/lib/api-client.ts`: Cliente HTTP tipado (`WmsWebApiClient` y `WmsWebApiError`) que inyecta credenciales multi-tenant (`x-api-key` y `Authorization: Bearer`) y consume los endpoints de `/health`, `/api/v1/products`, `/api/v1/locations`, `/api/v1/inventory/balances`, `/api/v1/inventory/transactions`, `/api/v1/inventory/adjustments`, `/api/v1/orders` (`allocate`, `cancel`, `dispatch`) y `/api/v1/tasks`.
- `apps/web/src/lib/dashboard-metrics.ts`: Funciones puras y deterministas para el cálculo de KPIs de inventario (`computeInventoryKpis`), agrupación del Mapa de Ubicaciones por zona física (`groupLocationsByZone`), resumen de pedidos (`summarizeOrdersByStatus`), monitor de progreso de tareas (`summarizeTasksMonitor`) y filtrado del Libro Mayor (`filterKardexTransactions`).
- `apps/web/src/context/supervisor-session.tsx`: Contexto React con persistencia en `localStorage` para gestionar `apiBaseUrl`, `apiKey`, `bearerToken` y `warehouseId`.
- `apps/web/src/components/dashboard-shell.tsx`: Barra lateral de navegación y barra superior de estado/configuración multi-tenant.
- `apps/web/src/app/globals.css` y `apps/web/src/app/layout.tsx`: Tema visual oscuro industrial de alto contraste y layout raíz de Next.js App Router.
- `apps/web/src/app/page.tsx`: Vista principal ejecutiva con KPIs globales (`OnHand`, `Allocated`, `ATP`), alertas de `ON_HOLD` / `EXCEPTION` y últimos movimientos del Kardex.
- `apps/web/src/app/catalog/page.tsx`: Vista de Catálogo de Productos y Mapa de Ubicaciones en vivo agrupado por zona (`RECEIVING` → `STORAGE` → `PACKING` → `DISPATCH`) con formularios de alta.
- `apps/web/src/app/inventory/page.tsx`: Vista de Saldos de Inventario (`OnHand` vs `Allocated` vs `ATP`), formulario de Ajuste Contable (`POST /api/v1/inventory/adjustments`) y Libro Mayor Inmutable (Kardex) filtrable por `TxReason`.
- `apps/web/src/app/operations/page.tsx`: Panel de Monitoreo de Pedidos y Tareas Activas con acciones de supervisor para Crear Pedido, Alocar Stock (`allocate`), Cancelar Pedido liberando reservas (`cancel` de `F3.1`) y Despachar (`dispatch`).
- `apps/web/src/lib/__tests__/api-client.test.ts` y `apps/web/src/lib/__tests__/dashboard-metrics.test.ts`: Suites de tests unitarios exhaustivos.

## Decisiones de Diseño e Invariantes
- **Fronteras del Monorepo**: `@wms/web` importa exclusivamente contratos y DTOs desde `@wms/shared-types`. No existe ninguna dependencia ni importación de `@wms/db` ni `@prisma/client`.
- **Aislamiento Multi-Tenant**: `WmsWebApiClient` y `SupervisorSessionProvider` propagan explícitamente `x-api-key` y `Authorization: Bearer` en cada petición HTTP hacia `@wms/api`.
- **Invariantes del Ledger**: La vista de Inventario y Kardex refleja el modelo contable inmutable (`ATP = OnHand - Allocated`), expone todos los motivos `TxReason` (incluyendo `ALLOCATION_CANCEL` e `INBOUND_RECEIPT`) y canaliza cualquier corrección de stock mediante `POST /api/v1/inventory/adjustments`.

## Resultados de Verificación
- Revisión estática exhaustiva de tipos bajo `strict: true`, `noUncheckedIndexedAccess: true` y `exactOptionalPropertyTypes: true` en todos los módulos `.ts` y `.tsx` de `apps/web`.
- Cobertura de pruebas unitarias diseñada por encima del 85% en `src/lib/api-client.ts` y `src/lib/dashboard-metrics.ts`.
