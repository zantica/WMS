# Implementación `F9.3` — Internacionalización Multi-Idioma Tipada (`es-ES`, `es-419`, `en-US`, `pt-BR`, `pt-PT`)

- **Estado**: `DONE`
- **Fecha**: 2026-11-17

## Archivos Creados / Modificados / Eliminados

### Creados
- `packages/shared-types/src/i18n/locales/es-ES.json`, `es-419.json`, `en-US.json`, `pt-BR.json`, `pt-PT.json` (copia de los 5 diccionarios canónicos + namespaces simétricos `visuals` y `web` respetando `terminology-notes.json`).
- `packages/shared-types/src/i18n/locales/es-ES.ts`, `es-419.ts`, `en-US.ts`, `pt-BR.ts`, `pt-PT.ts` (módulos TS compilables en `NodeNext` con `as const satisfies TranslationDictionary` para paridad verificada en compile-time).
- `packages/shared-types/src/i18n/types.ts` (`SupportedLocale`, `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `LOCALE_COOKIE_NAME`, `LOCALE_COOKIE_MAX_AGE_SECONDS`, `LOCALE_METADATA`, `TranslationDictionary`, `TranslationKey`, `TranslationParams`).
- `packages/shared-types/src/i18n/ports.ts` (puertos hexagonales `LocaleStoragePort` y `LocaleDetectorPort`).
- `packages/shared-types/src/i18n/resolver.ts` (`normalizeLocale`, `parseAcceptLanguage`, `extractCookieValue`, `resolveLocale`).
- `packages/shared-types/src/i18n/translator.ts` (`DICTIONARIES`, `getDictionary`, `translate`, `createTranslator`, `formatNumber`, `formatDate`, `formatDateTime`).
- `packages/shared-types/src/i18n/index.ts`.
- `packages/shared-types/src/i18n/__tests__/i18n.test.ts` (14 tests unitarios).
- `apps/web/src/context/locale-context.tsx` (`createBrowserLocaleStorage`, `createBrowserLocaleDetector`, `syncDocumentLang`, `LocaleProvider`, `useTranslation`).
- `apps/web/src/context/__tests__/locale-context.test.tsx` (6 tests unitarios).

### Modificados
- `packages/shared-types/package.json`: añadida tarea `"test": "vitest run"` y devDependency `"vitest": "^2.1.0"`.
- `packages/shared-types/src/design-tokens.ts`: parámetro opcional `locale: SupportedLocale = DEFAULT_LOCALE` en `resolveTaskStatusVisual`, `resolveTaskTypeVisual`, `resolveStepStatusVisual`, `resolveOrderStatusVisual`.
- `packages/shared-types/src/index.ts`: re-export público `export * from "./i18n/index.js"`.
- `apps/web/src/app/layout.tsx`: envuelve con `<LocaleProvider>` y `lang="es-ES"`.
- `apps/web/src/components/dashboard-shell.tsx`: selector regional (`ES-ES`, `ES-419`, `EN-US`, `PT-BR`, `PT-PT`) en topbar y traducción de navegación, footer y panel de conexión.
- `apps/web/src/app/page.tsx`, `apps/web/src/app/catalog/page.tsx`, `apps/web/src/app/locations/page.tsx`, `apps/web/src/app/users/page.tsx`, `apps/web/src/app/inventory/page.tsx`, `apps/web/src/app/operations/page.tsx`, `apps/web/src/components/labels/label-print-modal.tsx`: traducción de vistas y propagación de `locale` a resolutores visuales y `formatNumber`.

## Decisiones de Diseño e Invariantes

1. **Paridad de claves en compile-time + runtime**: Los 5 diccionarios se compilan como módulos TS (`es-ES.ts` base `as const` y los otros 4 `as const satisfies TranslationDictionary`) sin depender de `resolveJsonModule` ni copia manual de assets en `NodeNext`, garantizando 100% paridad en `tsc` y verificando igualdad literal contra los 5 `.json` en Vitest.
2. **Desacoplamiento Hexagonal**: El motor en `@wms/shared-types` no referencia `window`, `document` ni `navigator`. La resolución jerárquica (`Cookie wms_locale` → `Accept-Language` / `navigator.languages` con pesos `q` → Fallback `'es-ES'`) consume `LocaleStoragePort` y `LocaleDetectorPort`, implementados en `@wms/web` con `SameSite=Lax; Path=/; Max-Age=31536000` y actualización de `document.documentElement.lang`.
3. **Retrocompatibilidad**: Los resolutores visuales en `design-tokens.ts` mantienen el mismo valor de retorno por defecto (`es-ES`) cuando se omite `locale`, y `useTranslation()` hace fallback seguro a `DEFAULT_LOCALE` si se invoca fuera de `<LocaleProvider>` en tests unitarios aislados.

## Resultados de Verificación

### `pnpm build`
```text
 Tasks:    6 successful, 6 total
Cached:    3 cached, 6 total
  Time:    6.664s
```

### `pnpm --filter @wms/shared-types test`
```text
 ✓ src/i18n/__tests__/i18n.test.ts (14 tests) 33ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

### `pnpm --filter @wms/web test`
```text
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 19ms
 ✓ src/lib/__tests__/api-client.test.ts (10 tests) 20ms
 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (9 tests) 28ms
 ✓ src/app/locations/__tests__/locations-page.test.tsx (2 tests) 36ms
 ✓ src/context/__tests__/locale-context.test.tsx (6 tests) 46ms

 Test Files  5 passed (5)
      Tests  35 passed (35)
```
