# Implementación `NAVELO-ICONS` — Integración de Identidad y Marca Navelo en Web y Mobile

- **Estado**: `DONE`
- **Fecha**: 2026-11-17

## Archivos Creados / Modificados

### Creados
- `apps/web/src/app/favicon.ico` (copiado desde navelo-icons)
- `apps/web/src/app/icon.svg` (copiado desde `navelo-icon.svg`)
- `apps/web/src/app/apple-icon.png` (copiado desde `navelo-icon-180.png`)
- `apps/web/public/icons/navelo-icon.svg`
- `apps/web/public/icons/navelo-icon-mono.svg`
- `apps/web/public/icons/navelo-icon-negative.svg`
- `apps/web/public/icons/navelo-icon-192.png`
- `apps/web/public/icons/navelo-icon-512.png`
- `apps/web/public/manifest.webmanifest` (configuración Web App Manifest PWA con iconos 192x192, 512x512 y SVG, `theme_color: "#0F6E56"` y `background_color: "#061815"`)
- `apps/web/src/components/__tests__/dashboard-shell.test.tsx` (tests de integración que verifican la presencia del icono de marca en el shell, existencia física de los assets y estructura de manifest.webmanifest)
- `apps/mobile/assets/icon.png` (copiado desde `navelo-app-icon-1024.png`)
- `apps/mobile/assets/adaptive-icon.png` (copiado desde `navelo-icon-1024.png`)
- `apps/mobile/assets/favicon.png` (copiado desde `navelo-icon-48.png`)
- `apps/mobile/src/theme/__tests__/app-config.test.ts` (test unitario de validación de `app.json` y presencia de assets móviles)

### Modificados
- `apps/web/src/app/layout.tsx`: añadido `manifest: "/manifest.webmanifest"` en los metadatos raíz.
- `apps/web/src/components/dashboard-shell.tsx`: reemplazado el badge de texto plano `"WMS"` por `<img>` con `src="/icons/navelo-icon.svg"`, `alt=""`, `aria-hidden="true"`, `width={36}`, `height={36}` y clase `.wms-brand-icon`.
- `apps/web/src/app/globals.css`: ajustado `.wms-brand-badge` como contenedor cuadrado centrado de 36x36 con `radius-md` y sombra suave, y definida la regla `.wms-brand-icon`.
- `apps/mobile/app.json`: configurado `expo.icon: "./assets/icon.png"`, `expo.android.adaptiveIcon: { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#0F6E56" }` y `expo.web.favicon: "./assets/favicon.png"`.

## Decisiones de Diseño e Invariantes

1. **Resolución de Assets en Next.js App Router**:
   - Se respetan las convenciones de Next.js colocando `favicon.ico`, `icon.svg` y `apple-icon.png` en `src/app/`, sirviéndose automáticamente en las cabeceras HTML para navegadores y dispositivos iOS.
   - El catálogo estático completo (`navelo-icon.svg`, variantes mono/negativa, y versiones raster 192 y 512) se aloja en `public/icons/` para consumo directo por manifests PWA y componentes cliente.
2. **Sintonía de Color con el Design System (P2 / S5)**:
   - `theme_color: "#0F6E56"` (WMS brand primary canonical) y `background_color: "#061815"` (WMS dark-data-dense background canonical) en el manifest PWA y en el `backgroundColor` de Android Adaptive Icon en Expo.
3. **Accesibilidad en Navegación (WCAG 2.1)**:
   - El icono de marca en `dashboard-shell.tsx` cuenta con `alt=""` y `aria-hidden="true"` dentro del badge decorativo, permitiendo que lectores de pantalla anuncien limpiamente los títulos del WMS sin redundancias.

## Resultados de Verificación

### `pnpm build` (turbo monorepo completo)
```text
   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

 Tasks:    6 successful, 6 total
Cached:    5 cached, 6 total
  Time:    2.274s
```

### `pnpm --filter @wms/web test`
```text
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 21ms
 ✓ src/lib/__tests__/api-client.test.ts (10 tests) 19ms
 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (9 tests) 24ms
 ✓ src/components/__tests__/dashboard-shell.test.tsx (3 tests) 18ms
 ✓ src/context/__tests__/locale-context.test.tsx (6 tests) 48ms
 ✓ src/app/locations/__tests__/locations-page.test.tsx (2 tests) 36ms

 Test Files  6 passed (6)
      Tests  38 passed (38)
   Duration  932ms
```

### `pnpm --filter @wms/mobile test`
```text
 ✓ src/offline/__tests__/local-task-cache.test.ts (11 tests) 9ms
 ✓ src/feedback/__tests__/operator-feedback.test.ts (2 tests) 6ms
 ✓ src/theme/__tests__/app-config.test.ts (2 tests) 6ms
 ✓ src/components/__tests__/offline-ui.test.ts (3 tests) 6ms
 ✓ src/offline/__tests__/adapters.test.ts (5 tests) 14ms
 ✓ src/theme/__tests__/tokens.test.ts (3 tests) 10ms
 ✓ src/api/__tests__/client.test.ts (12 tests) 23ms
 ✓ src/workflows/__tests__/inbound-putaway.test.ts (6 tests) 7ms
 ✓ src/workflows/__tests__/picking.test.ts (7 tests) 7ms
 ✓ src/offline/__tests__/sync-queue.test.ts (10 tests) 50ms
 ✓ src/offline/__tests__/task-screen-offline.test.ts (8 tests) 11ms

 Test Files  11 passed (11)
      Tests  69 passed (69)
   Duration  1.07s
```
