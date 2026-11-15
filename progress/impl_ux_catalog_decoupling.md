# Reporte de Implementación: ux_catalog_decoupling — Desacoplamiento UX de Catálogo, Topología y Usuarios
- **Estado**: DONE
- **Fecha**: 2026-11-15

## Archivos Creados / Modificados / Eliminados
- `apps/web/src/components/dashboard-shell.tsx`: Actualizado `NAV_ITEMS` para desacoplar el dominio en 6 rutas independientes: `/` (LIVE), `/catalog` (SKU), `/locations` (ZONES), `/users` (RBAC), `/inventory` (LEDGER) y `/operations` (OPS).
- `apps/web/src/app/catalog/page.tsx`: Refactorizado integralmente (de 1.148 a ~590 líneas). Pestañas internas limpias para `Productos` y `Categorías`, divulgación progresiva con formularios de alta colapsados por defecto, preservando toda la funcionalidad existente (búsqueda reactiva, edición inline de categoría, bajas lógicas) y consumiendo exclusivamente `listProducts` y `listCategories`.
- `apps/web/src/app/locations/page.tsx`: Creado. Vista especializada en topología física y layout de zonas. Incluye KPI strip compacto (`LAYOUT`, ocupación, OnHand, Reservado, ATP), filtro por zona operativa mediante tabs/pills (`ALL`, `RECEIVING`, `STORAGE`, `PACKING`, `DISPATCH`), formulario de alta colapsable y grid de ubicaciones agrupado por zona (`groupLocationsByZone`), consumiendo solo `listLocations` y `listBalances`.
- `apps/web/src/app/users/page.tsx`: Creado. Vista de gobierno de usuarios y roles (RBAC). Resumen rápido por rol (ADMIN, SUPERVISOR, OPERATOR) y estado, formulario colapsable de registro de usuario y tabla con actualización de rol inline interactiva y bajas lógicas, consumiendo únicamente `listUsers`.
- `apps/web/src/app/globals.css`: Incorporados estilos reutilizables del Design System para pestañas y divulgación progresiva (`.wms-tabs`, `.wms-tab`, `.wms-tab-active`, `.wms-tab-badge`, `.wms-disclosure-box`, `.wms-disclosure-header`, `.wms-disclosure-title`) respetando `S5 dark-data-dense` / `P2` / `T3` y asegurando 0 colores hex crudos en archivos TSX.
- `apps/web/src/lib/dashboard-metrics.ts`: Añadidos helpers puros `computeTopologySummary` y `computeUsersSummary` con sus interfaces `TopologySummary` y `UsersSummary`.
- `apps/web/src/lib/__tests__/dashboard-metrics.test.ts`: Añadidos tests unitarios que validan agregaciones de topología, tasas de ocupación volumétrica y gobierno de usuarios/roles.

## Decisiones de Diseño e Invariantes
- **Divulgación Progresiva (Progressive Disclosure)**: Se eliminó la sobrecarga vertical de la pantalla de 1.148 líneas. Los formularios de alta permanecen colapsados hasta que el usuario los invoca explícitamente, priorizando la búsqueda y la tabla de datos en primer plano.
- **Desacoplamiento de Carga de Datos**: Se eliminó la llamada monolítica `Promise.all` que combinaba 5 entidades en `/catalog`. Ahora `/catalog` carga 2 entidades, `/locations` carga 2 entidades y `/users` carga 1 entidad, reduciendo la latencia de red y el ancho de banda.
- **Cumplimiento de Design Tokens**: Los archivos `.tsx` usan únicamente variables CSS `var(--...)` y clases utilitarias del design system (`S5 dark-data-dense`, `P2 Refinada`, `T3 DM Sans + JetBrains Mono`), garantizando uniformidad visual y soporte para modo reducido de movimiento y accesibilidad táctil/teclado.
- **Invariantes del Ledger y Monorepo**: No se modificaron `packages/db`, `packages/shared-types` ni `apps/api`. No se implementaron tipos de `F9.2` (refactor puro sobre `@wms/web`).

## Resultados de Verificación (salida literal, no parafraseada)

### 1. Chequeo de Tipos y Compilación (`pnpm --filter @wms/web build` y `pnpm --filter @wms/web lint`)
```
> @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
> tsc --noEmit
Exit code: 0

> @wms/web@0.0.1 lint C:\Users\santi\Documents\projects\WMS\apps\web
> tsc --noEmit
Exit code: 0
```

### 2. Suite de Tests Unitarios Web (`pnpm --filter @wms/web test`)
```
> @wms/web@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\web
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web

 ✓ src/lib/__tests__/api-client.test.ts (7 tests) 15ms
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 18ms

 Test Files  2 passed (2)
      Tests  15 passed (15)
   Start at  01:41:56
   Duration  731ms (transform 149ms, setup 0ms, collect 210ms, tests 33ms, environment 0ms, prepare 480ms)
```

### 3. Cobertura de Código (`pnpm --filter @wms/web test:coverage`)
```
 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web
      Coverage enabled with v8

 ✓ src/lib/__tests__/api-client.test.ts (7 tests) 15ms
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 17ms

 Test Files  2 passed (2)
      Tests  15 passed (15)
   Start at  01:42:11
   Duration  848ms (transform 119ms, setup 0ms, collect 200ms, tests 33ms, environment 1ms, prepare 487ms)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   95.53 |    82.63 |     100 |   95.53 |                   
 api-client.ts     |   92.63 |       78 |     100 |   92.63 | ...98,602,606,673 
 ...ard-metrics.ts |   99.68 |    89.55 |     100 |   99.68 | 351               
-------------------|---------|----------|---------|---------|-------------------
```

### 4. Build Monorepo Turborepo (`pnpm build`)
```
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

 Tasks:    6 successful, 6 total
Cached:    3 cached, 6 total
  Time:    7.981s
```
