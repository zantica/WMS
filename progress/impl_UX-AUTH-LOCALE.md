# Implementación `UX-AUTH-LOCALE` — Selector de Idioma (Siglas + EU/SA), Login UI y Feedback de Sesión Activa

- **Estado**: `DONE`
- **Fecha**: 2026-11-18
- **Alcance**: `@wms/shared-types` y `@wms/web`

---

## 1. Archivos Creados y Modificados

### `@wms/shared-types`
- `packages/shared-types/src/i18n/types.ts`: Añadidos `LocaleRegion` (`"EU" | "SA"`), `LocaleShortCode` (`"ES" | "PT" | "EN"`), y campos `code` y `regions` en `LocaleMetadata` / `LOCALE_METADATA`.
- `packages/shared-types/src/i18n/resolver.ts`: Añadidos helpers puros `getLocalesForRegion(region)` (`EU -> ["es-ES", "pt-PT", "en-US"]`, `SA -> ["es-419", "pt-BR", "en-US"]`) y `detectRegionFromContext(timeZone, languages)` con reglas IANA (`Europe/*`, `Atlantic/Canary`, `Atlantic/Madeira`, `Atlantic/Azores` -> `"EU"`, `America/*` -> `"SA"`, fallback por `languages`, default `"EU"`). Exportados vía `packages/shared-types/src/i18n/index.ts` y `packages/shared-types/src/index.ts`.
- `packages/shared-types/src/i18n/locales/{es-ES,es-419,en-US,pt-BR,pt-PT}.{json,ts}`: Añadidas las nuevas claves en `web.auth` (`tenantToggleLabel`, `activeSessionNotice`, `activeSessionLoginBlocked`, `activeSessionIndicator`, `logoutAndSwitchBtn`, `loginSuccessFeedback`, `logoutSuccessFeedback`) y actualizado `goToDashboardBtn` con paridad del 100% entre los 5 locales y sincronía JSON/TS.
- `packages/shared-types/src/i18n/__tests__/i18n.test.ts`: Tests unitarios de metadata (`code`, `regions`), `getLocalesForRegion` y `detectRegionFromContext`.

### `@wms/web`
- `apps/web/src/lib/user-initials.ts` *(nuevo)*: Helper puro `getUserInitials(name, email)` compartido entre `SessionUserChip` y `LoginPage`.
- `apps/web/src/context/locale-context.tsx`: Añadidos `region` y `availableLocales` en `LocaleContextValue`, `detectBrowserTimeZone()`, detección automática de región (`Intl.DateTimeFormat().resolvedOptions().timeZone` + `navigator.languages` / `detector`) y adaptación de región cuando `initialLocale` (o el locale resuelto) no pertenece a la región detectada.
- `apps/web/src/context/supervisor-session.tsx`: Añadidos `SessionFeedback`, `sessionFeedback` y `clearSessionFeedback`; validación de sesión en montaje cuando hay `bearerToken` o sesión por cookie en navegador sin romper tests SSR ni tests con `initialSession`; bloqueo explícito de `login()` y `bootstrapSuperuser()` cuando `session.currentUser` ya existe; emisión de feedback tras login/bootstrap y logout.
- `apps/web/src/components/dashboard-shell.tsx`: Sustituido `<select>` por selector compacto tipo segmented pills (`role="group"`, `data-testid="wms-locale-select"`, botones con sigla única `ES`/`PT`/`EN` y `title` con `nativeName` + región `EU`/`SA`); añadido banner descartable `sessionFeedback` en `<main>`.
- `apps/web/src/components/molecules/SessionUserChip.tsx`: Eliminado el wrapper `.wms-session-chip` cuando `!currentUser` mostrando `.wms-login-trigger` con icono SVG inline de candado y `loginLabel`; pill refinado `.wms-session-chip-active` con avatar de iniciales, punto indicador verde (`.wms-session-active-dot`), nombre/email, `UserRoleBadge` y botón de logout.
- `apps/web/src/components/molecules/PasswordField.tsx`: Control unificado `.wms-password-wrap` con botón integrado `.wms-password-toggle` e icono SVG de ojo accesible (`aria-pressed`).
- `apps/web/src/components/templates/AuthTemplate.tsx`: Mejora de jerarquía visual, centrado vertical, espaciado equilibrado y borde superior de acento en `.wms-auth-card`.
- `apps/web/src/components/organisms/LoginForm.tsx`: Botón submit ancho completo (`.wms-btn-block`) sin divisor `.wms-form-footer`, y campo `tenantId` colapsable tras toggle discreto `web.auth.tenantToggleLabel`.
- `apps/web/src/components/organisms/BootstrapSuperuserForm.tsx`: Botón submit ancho completo (`.wms-btn-block`) consistente con `LoginForm`.
- `apps/web/src/pages/login-page.tsx`: Panel mejorado de **"Sesión Activa"** con avatar de iniciales, nombre, email, `UserRoleBadge`, tenant, `Alert` de advertencia (`activeSessionNotice`), botón primario **"Ir al Dashboard"** y botón outline **"Cerrar sesión y cambiar de cuenta"**.
- `apps/web/src/styles/globals.css`: Estilos completos para todos los componentes nuevos/rediseñados usando exclusivamente tokens CSS de la paleta `P2 Refinada` (cero hex crudos en `.tsx`).
- `apps/web/src/components/__tests__/dashboard-shell.test.tsx`, `apps/web/src/context/__tests__/locale-context.test.tsx`, `apps/web/src/components/__tests__/atomic-auth-ui.test.tsx`: Cobertura completa para el selector por siglas, detección EU/SA, trigger limpio de login, pill de sesión activa, `PasswordField` unificado, `tenantId` colapsable, panel de sesión activa, bloqueo de doble sesión y verificación de cero hex crudos en TSX.

---

## 2. Decisiones de Diseño

1. **Adaptación de región ante `initialLocale` o locale explícito**: Cuando `initialLocale` (o el locale resuelto por cookie/navegador) no pertenece a la región detectada del entorno, `LocaleProvider` adopta la región primaria del locale activo (`LOCALE_METADATA[locale].regions[0]`) para garantizar exactamente 3 opciones (`ES`, `PT`, `EN`) sin duplicar siglas ni romper tests existentes en máquinas con distinta zona horaria.
2. **Control unificado de contraseña sin solapamiento**: `.wms-password-wrap` usa contenedor flex con borde único y `:focus-within`, manteniendo `<input>` y `<button class="wms-password-toggle">` alineados sin superposición incluso con traducciones largas (p. ej. `pt-PT`).
3. **Compatibilidad total con mocks de tests**: `DashboardShell` lee `sessionFeedback` y `clearSessionFeedback` de forma defensiva para mantener compatibilidad con mocks parciales de `useSupervisorSession` en suites existentes (`dashboard-shell.test.tsx`, `locale-context.test.tsx`, `locations-page.test.tsx`).

---

## 3. Evidencia de Verificación (Salida Literal)

Comando ejecutado:
`pnpm --filter @wms/shared-types build; if ($LASTEXITCODE -eq 0) { pnpm --filter @wms/shared-types test }; if ($LASTEXITCODE -eq 0) { pnpm --filter @wms/web build }; if ($LASTEXITCODE -eq 0) { pnpm --filter @wms/web test }`

```text
> @wms/shared-types@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\shared-types
> tsc


> @wms/shared-types@0.0.1 test C:\Users\santi\Documents\projects\WMS\packages\shared-types
> vitest run


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/packages/shared-types

 ✓ src/i18n/__tests__/i18n.test.ts (18 tests) 47ms

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Start at  00:58:52
   Duration  842ms (transform 200ms, setup 0ms, collect 259ms, tests 47ms, environment 0ms, prepare 185ms)


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
✓ built in 1.57s

> @wms/web@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\web
> vitest run


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web

 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 22ms
 ✓ src/lib/__tests__/api-client.test.ts (11 tests) 22ms
 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (9 tests) 30ms
 ✓ src/pages/__tests__/locations-page.test.tsx (2 tests) 38ms
 ✓ src/components/__tests__/dashboard-shell.test.tsx (6 tests) 73ms
 ✓ src/context/__tests__/locale-context.test.tsx (7 tests) 84ms
 ✓ src/components/__tests__/atomic-auth-ui.test.tsx (6 tests) 66ms
 ✓ src/__tests__/app-router.test.tsx (10 tests) 114ms

 Test Files  8 passed (8)
      Tests  59 passed (59)
   Start at  00:59:00
   Duration  1.98s (transform 1.84s, setup 0ms, collect 5.23s, tests 448ms, environment 3ms, prepare 3.53s)
```
