# Auditoría Independiente `UX-AUTH-LOCALE` — Selector de Idioma (Siglas + EU/SA), Login UI y Feedback de Sesión Activa

- **Veredicto**: `APPROVED`
- **Fecha**: 2026-11-18
- **Auditor**: Subagente `reviewer`
- **Alcance**: `@wms/shared-types` y `@wms/web` (revisión contra `progress/impl_UX-AUTH-LOCALE.md`, `CHECKPOINTS.md` y `docs/conventions.md`)

---

## 1. Resumen de Verificación Funcional y UX

1. **Selector de idioma por siglas y detección regional (`EU` / `SA`)**:
   - `packages/shared-types/src/i18n/types.ts` define `LocaleRegion` (`"EU" | "SA"`), `LocaleShortCode` (`"ES" | "PT" | "EN"`) y los campos `code` y `regions` en `LOCALE_METADATA`.
   - `packages/shared-types/src/i18n/resolver.ts` implementa `getLocalesForRegion` (`EU -> ["es-ES", "pt-PT", "en-US"]`, `SA -> ["es-419", "pt-BR", "en-US"]`) y `detectRegionFromContext` con reglas IANA (`Europe/*` + `Atlantic/Canary`, `Atlantic/Madeira`, `Atlantic/Azores` -> `"EU"`; `America/*` -> `"SA"`; fallback por `languages`; default `"EU"`).
   - `apps/web/src/context/locale-context.tsx` expone `region` y `availableLocales`, adapta la región cuando `initialLocale` o el locale resuelto no pertenece a la región detectada para garantizar siempre 3 opciones únicas (`ES`, `PT`, `EN`), y `apps/web/src/components/dashboard-shell.tsx` reemplaza `<select>` por segmented pills (`role="group"`, `data-testid="wms-locale-select"`, botones con `{meta.code}` y `title` con `${meta.nativeName} (${region})`).

2. **Login UI, `PasswordField` unificado y `tenantId` colapsable**:
   - `apps/web/src/components/molecules/SessionUserChip.tsx` elimina el contenedor `.wms-session-chip` cuando `!currentUser` y muestra un `<Link to="/login" className="wms-btn wms-btn-primary wms-btn-sm wms-login-trigger">` con icono SVG inline de candado. Con sesión activa muestra `.wms-session-chip-active`, avatar de iniciales (`getUserInitials`), `.wms-session-active-dot`, nombre, email, `UserRoleBadge` y botón de logout.
   - `apps/web/src/components/molecules/PasswordField.tsx` y `apps/web/src/styles/globals.css` unifican input + botón `.wms-password-toggle` dentro de `.wms-password-wrap` con `:focus-within` e icono SVG de ojo accesible (`aria-pressed`).
   - `apps/web/src/components/organisms/LoginForm.tsx` y `BootstrapSuperuserForm.tsx` usan botón submit de ancho completo (`.wms-btn-block`) sin `.wms-form-footer`, y `LoginForm` colapsa `tenantId` por defecto tras el toggle accesible (`aria-expanded`, `aria-controls="wms-login-tenant-panel"`).
   - `apps/web/src/components/templates/AuthTemplate.tsx` y `apps/web/src/styles/globals.css` refinan el centrado vertical, la jerarquía de cabecera y el borde superior de acento en `.wms-auth-card`.

3. **Prevención y feedback de sesión activa**:
   - `apps/web/src/context/supervisor-session.tsx` bloquea explícitamente `login()` y `bootstrapSuperuser()` lanzando `Error(t("web.auth.activeSessionLoginBlocked"))` si `session.currentUser` ya existe, valida sesión al montar cuando corresponde sin romper SSR ni `initialSession`, y emite `sessionFeedback` (`loginSuccessFeedback` / `logoutSuccessFeedback`).
   - `apps/web/src/pages/login-page.tsx` presenta el panel `data-testid="active-session-panel"` con avatar de iniciales, nombre, email, `UserRoleBadge`, tenant, `Alert` de advertencia (`activeSessionNotice`), CTA primario **"Ir al Dashboard"** y CTA outline **"Cerrar sesión y cambiar de cuenta"**.
   - `apps/web/src/components/dashboard-shell.tsx` renderiza el banner descartable `data-testid="session-feedback-banner"` (`role="status"`, `aria-live="polite"`) con botón de cierre que invoca `clearSessionFeedback()`.

4. **Paridad i18n y tokens CSS**:
   - Los 5 locales (`es-ES`, `es-419`, `en-US`, `pt-BR`, `pt-PT`) mantienen paridad del 100% de claves y sincronía exacta entre `.json` y `.ts`.
   - Cero colores hex crudos en código JSX/TSX de producción (los únicos matches corresponden a comentarios de cabecera `## Design tokens` en `pages/*.tsx`). Todos los estilos nuevos en `globals.css` usan variables CSS de la paleta P2 Refinada.
   - *Nota menor no bloqueante*: la clave `web.auth.activeSessionIndicator` añadida en los 5 diccionarios queda disponible en `@wms/shared-types` aunque actualmente no se consume en `apps/web` (donde el indicador visual se representa mediante `.wms-session-active-dot` y `web.auth.sessionActiveTitle`).

---

## 2. Evaluación de Checkpoints (`CHECKPOINTS.md`)

- **CP-1 (Integridad del Inventory Ledger)**: N/A para este ticket (solo `@wms/shared-types` y `@wms/web`, sin cambios en `@wms/api` ni `@wms/db`).
- **CP-2 (Aislamiento Multi-Tenant y Seguridad)**: [x] Verificado en el alcance cliente (`LoginPage` muestra el `tenantId` de la sesión activa, `login`/`bootstrapSuperuser` bloquean doble sesión cuando `currentUser` está activo, y no hay exposición de credenciales).
- **CP-3 (Contratos de API, Tipado y Monorepo)**: [x] `@wms/shared-types` no importa `@prisma/client` ni `@wms/db`; compilación TypeScript estricta limpia en ambos paquetes; imports ESM con extensión `.js` en `@wms/shared-types`.
- **CP-4 (Verificación Automatizada y Cobertura)**: [x] Suites ejecutadas por el `reviewer` con código de salida `0` (`@wms/shared-types`: 18/18 tests; `@wms/web`: 8 archivos, 59/59 tests), cubriendo happy path, casos borde (zonas horarias neutras, fallback `navigator.languages`, adaptación de región ante `initialLocale`), y rechazo de segunda sesión activa.
- **CP-5 (Arquitectura Hexagonal y Puertos)**: [x] Se mantienen y reutilizan los puertos `LocaleStoragePort` y `LocaleDetectorPort` en `@wms/shared-types` y adaptadores de navegador en `locale-context.tsx`; la lógica de initials se extrae al helper puro `apps/web/src/lib/user-initials.ts`. (Tests PostgreSQL/RLS: N/A para frontend/shared-types).
- **CP-6 (Higiene del Código)**: [x] `<select>` de idiomas sustituido completamente en `DashboardShell`; cero `it.skip` / `describe.skip`; cero lockfiles ajenos.
- **CP-7 (Calidad Pre-Commit, SOLID, Zero `process.env` y SonarCloud)**: [x] Cero `process.env` en `apps/web/src` y `packages/shared-types/src`; cero `Math.random()` (`S2245`); sin regex super-lineales (`S8786`); todas las promesas invocadas en handlers/efectos llevan `await`, `.catch(...)` o `void` explícito (`S9383`).

---

## 3. Evidencia de Verificación (Salida Literal Ejecutada por el Reviewer)

### A. Build y Tests de `@wms/shared-types`
Comando:
`pnpm --filter @wms/shared-types build; if ($LASTEXITCODE -eq 0) { pnpm --filter @wms/shared-types test }`

```text
> @wms/shared-types@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\shared-types
> tsc


> @wms/shared-types@0.0.1 test C:\Users\santi\Documents\projects\WMS\packages\shared-types
> vitest run


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/packages/shared-types

 ✓ src/i18n/__tests__/i18n.test.ts (18 tests) 43ms

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Start at  00:59:56
   Duration  779ms (transform 191ms, setup 0ms, collect 250ms, tests 43ms, environment 0ms, prepare 205ms)
```

### B. Build y Tests de `@wms/web`
Comando:
`pnpm --filter @wms/web build; if ($LASTEXITCODE -eq 0) { pnpm --filter @wms/web test }`

```text
> @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
> tsc --noEmit && vite build

vite v5.4.21 building for production...
transforming...
✓ 89 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   1.28 kB │ gzip:   0.66 kB
dist/assets/index-k58TDwb4.css   43.00 kB │ gzip:   7.13 kB
dist/assets/index-Bl_pzAyn.js   488.06 kB │ gzip: 130.87 kB
✓ built in 1.56s

> @wms/web@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\web
> vitest run


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web

 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 21ms
 ✓ src/lib/__tests__/api-client.test.ts (11 tests) 20ms
 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (9 tests) 30ms
 ✓ src/pages/__tests__/locations-page.test.tsx (2 tests) 34ms
 ✓ src/components/__tests__/dashboard-shell.test.tsx (6 tests) 67ms
 ✓ src/context/__tests__/locale-context.test.tsx (7 tests) 71ms
 ✓ src/components/__tests__/atomic-auth-ui.test.tsx (6 tests) 67ms
 ✓ src/__tests__/app-router.test.tsx (10 tests) 101ms

 Test Files  8 passed (8)
      Tests  59 passed (59)
   Start at  01:00:05
   Duration  1.48s (transform 1.27s, setup 0ms, collect 4.18s, tests 411ms, environment 2ms, prepare 2.20s)
```

### C. Auditoría Estática (Hex en TSX, `process.env`, `Math.random`, Prisma, `it.skip`)

1. Escaneo de hex crudos en `apps/web/src/**/*.tsx` (excluyendo `__tests__`):
   - Solo coincidieron líneas de comentarios de cabecera `// - Paleta (...)` en `catalog-page.tsx:6`, `login-page.tsx:6` y `users-page.tsx:6`; cero ocurrencias en código JSX/TSX.
2. Escaneo de `process.env`, `Math.random`, `@prisma/client` y `@wms/db` en `apps/web/src` y `packages/shared-types/src`:
   - Solo un comentario documental en `apps/web/src/bootstrap.ts:3`; cero usos en código ejecutable.
3. Escaneo de `it.skip` / `describe.skip`:
   - Cero coincidencias.
