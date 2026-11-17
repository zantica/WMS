# Reporte de Implementación: TECH-VITE — Migración de `@wms/web` de Next.js App Router a Vite + React SPA

- **Estado**: DONE
- **Fecha**: 2026-11-17

## Archivos Creados / Modificados / Eliminados

### Creados
- `apps/web/index.html`: Shell HTML estático para Vite con metadatos, manifest, favicons (`favicon.ico`, `icon.svg`, `apple-icon.png`) y tipografía T3 (`DM Sans` + `JetBrains Mono`).
- `apps/web/vite.config.ts`: Configuración unificada de Vite (`@vitejs/plugin-react`), proxy de desarrollo (`/api` y `/health` -> `http://localhost:3001`), build estático (`dist/`) y Vitest (`environment: "node"`, cobertura v8 ≥ 80%).
- `apps/web/src/vite-env.d.ts`: Tipado de `import.meta.env.VITE_*` para TypeScript estricto.
- `apps/web/src/bootstrap.ts`: Función pura `resolveBootstrapSession(env)` desacoplada de `import.meta.env` y `process.env` (CP-7).
- `apps/web/src/main.tsx`: Composition root de cliente que importa `./styles/globals.css`, resuelve `import.meta.env.VITE_*` y monta `<App />`.
- `apps/web/src/App.tsx`: Enrutador cliente (`BrowserRouter` + `AppRoutes` reutilizable) con las 6 rutas operativas (`/`, `/catalog`, `/inventory`, `/locations`, `/operations`, `/users`) y fallback SPA `*` -> `<NotFoundPage />`.
- `apps/web/src/pages/not-found-page.tsx`: Vista 404 / SPA fallback con estilos S5 y retorno a `/`.
- `apps/web/src/__tests__/app-router.test.tsx`: Suite de tests para todas las rutas SPA, fallback 404 y `resolveBootstrapSession`.

### Modificados / Movidos
- `apps/web/package.json`: `"type": "module"`, eliminación de `next`, incorporación de `react-router-dom@^7.5.0`, `vite@5.4.21`, `@vitejs/plugin-react@4.3.4` y scripts `dev` (`vite --port 3000`), `build` (`tsc --noEmit && vite build`), `preview`.
- `apps/web/tsconfig.json`: `jsx: "react-jsx"`, `types: ["vite/client", "node"]`, inclusión de `vite.config.ts`, eliminación de plugin y rutas de Next.js.
- `apps/web/src/styles/globals.css` (movido desde `src/app/globals.css`): Añadidas variables `--font-sans` y `--font-mono` en `:root`, preservando íntegramente el Design System S5/P2 y `@media print`.
- `apps/web/public/favicon.ico`, `apps/web/public/icon.svg`, `apps/web/public/apple-icon.png` (movidos desde `src/app/`): Servidos en raíz estática y copiados a `dist/`.
- `apps/web/src/pages/overview-page.tsx`, `catalog-page.tsx`, `inventory-page.tsx`, `locations-page.tsx`, `operations-page.tsx`, `users-page.tsx` (movidos desde `src/app/**/page.tsx`): Eliminada directiva `"use client";`, migrado `next/link` -> `react-router-dom` (`Link to=...`) y ajustadas rutas relativas.
- `apps/web/src/components/dashboard-shell.tsx`: Migrado `next/link` y `next/navigation` (`usePathname`) a `react-router-dom` (`Link`, `useLocation`), eliminada directiva `"use client";` y comentario eslint de Next.
- `apps/web/src/components/labels/label-print-modal.tsx`, `apps/web/src/context/locale-context.tsx`, `apps/web/src/context/supervisor-session.tsx`: Eliminada directiva `"use client";`.
- `apps/web/src/components/__tests__/dashboard-shell.test.tsx`, `apps/web/src/context/__tests__/locale-context.test.tsx`, `apps/web/src/pages/__tests__/locations-page.test.tsx`: Eliminados mocks de `next/link` y `next/navigation`, migrados a `<MemoryRouter>` real de `react-router-dom` y actualizadas rutas de assets/páginas.
- `pnpm-lock.yaml`: Actualizado tras `remove next` y alta de `react-router-dom`, `vite` y `@vitejs/plugin-react`.

### Eliminados (CP-6)
- `apps/web/next.config.mjs`
- `apps/web/next-env.d.ts`
- `apps/web/vitest.config.ts` (unificado en `apps/web/vite.config.ts`)
- `apps/web/src/app/layout.tsx` y directorio `apps/web/src/app/`
- `apps/web/.next/`

## Decisiones de Diseño e Invariantes
- **Unificación Vite + Vitest y Transpilación Workspace (`@wms/shared-types`)**: `apps/web/vite.config.ts` unifica la configuración de bundling (`vite`) y testing (`vitest/config`) e incluye un alias de resolución para `@wms/shared-types` hacia `packages/shared-types/src/index.ts` (equivalente a `transpilePackages` en Next.js), permitiendo tree-shaking ESM limpio durante `vite build` sin errores de re-exportación CJS (`__exportStar`).
- **Composition Root y Cero Envars en Lógica/Componentes (CP-7)**: Únicamente `apps/web/src/main.tsx` lee `import.meta.env.VITE_*` y delega su normalización en la función pura `resolveBootstrapSession` (`src/bootstrap.ts`), inyectando `initialSession` en `<App />` -> `<SupervisorSessionProvider>`.
- **Enrutamiento SPA Testable**: Separación entre `AppRoutes` (sin router acoplado) y `App` (`BrowserRouter`), permitiendo verificar las 6 rutas operativas y el fallback 404 con `MemoryRouter` en tests unitarios.
- **Preservación de Estilos, Contextos y `turbo.json`**: `turbo.json` ya incluía `"dist/**"` en `build.outputs`; se mantuvieron intactos `api-client.ts`, `supervisor-session.tsx`, `locale-context.tsx`, `dashboard-metrics.ts` y todas las reglas CSS S5/P2/T3.

## Resultados de Verificación (salida literal, no parafraseada)

### `pnpm build` (exit code 0)
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build


   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

@wms/db:build: cache hit, replaying logs 4518167b2c80c561
@wms/domain:build: cache hit, replaying logs 67718cc3de844ab0
@wms/shared-types:build: cache hit, replaying logs a2056dbb72be1b98
@wms/api:build: > @wms/api@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\api
@wms/api:build: > tsc && tsc-alias
@wms/mobile:build: > @wms/mobile@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\mobile
@wms/mobile:build: > tsc --noEmit
@wms/web:build: > @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
@wms/web:build: > tsc --noEmit && vite build
@wms/web:build: 
@wms/web:build: vite v5.4.21 building for production...
@wms/web:build: transforming...
@wms/web:build: ✓ 72 modules transformed.
@wms/web:build: rendering chunks...
@wms/web:build: computing gzip size...
@wms/web:build: dist/index.html                   1.28 kB │ gzip:   0.66 kB
@wms/web:build: dist/assets/index-sgzv-vl0.css   33.80 kB │ gzip:   6.03 kB
@wms/web:build: dist/assets/index-IWCeJBxh.js   461.19 kB │ gzip: 123.99 kB
@wms/web:build: ✓ built in 1.83s

 Tasks:    6 successful, 6 total
Cached:    4 cached, 6 total
  Time:    7.487s
```

### `pnpm --filter @wms/web test:coverage` (exit code 0)
```text
> @wms/web@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\web
> vitest run --coverage


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web
      Coverage enabled with v8

 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (9 tests) 30ms
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 23ms
 ✓ src/components/__tests__/dashboard-shell.test.tsx (4 tests) 29ms
 ✓ src/lib/__tests__/api-client.test.ts (10 tests) 25ms
 ✓ src/pages/__tests__/locations-page.test.tsx (2 tests) 45ms
 ✓ src/context/__tests__/locale-context.test.tsx (6 tests) 55ms
 ✓ src/__tests__/app-router.test.tsx (9 tests) 94ms

 Test Files  7 passed (7)
      Tests  48 passed (48)
   Start at  18:56:07
   Duration  1.60s (transform 849ms, setup 0ms, collect 3.14s, tests 300ms, environment 2ms, prepare 2.24s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   95.72 |    83.52 |     100 |   95.72 |                   
 api-client.ts     |   93.62 |    80.37 |     100 |   93.62 | ...80,684,688,755 
 ...ard-metrics.ts |   99.07 |     88.4 |     100 |   99.07 | 372,491-492       
-------------------|---------|----------|---------|---------|-------------------
```
