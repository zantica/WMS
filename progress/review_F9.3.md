# Revisión `F9.3` — Internacionalización Multi-Idioma Tipada (`es-ES`, `es-419`, `en-US`, `pt-BR`, `pt-PT`)

- **Veredicto**: `APPROVED`
- **Fecha**: 2026-11-17
- **Revisor**: Subagente `reviewer` (auditoría independiente)

---

## Evaluación de Checkpoints (`CHECKPOINTS.md`)

### CP-1: Integridad del Inventory Ledger
- [x] **N/A**: La feature `F9.3` opera exclusivamente en `@wms/shared-types` y `@wms/web`; no modifica `InventoryTransaction`, `InventoryBalance` ni casos de uso del Ledger.

### CP-2: Aislamiento Multi-Tenant y Seguridad
- [x] **N/A / Preservado**: No introduce endpoints en `@wms/api`. En `apps/web/src/components/dashboard-shell.tsx`, el selector regional convive con la sesión multi-tenant (`warehouseId`, `x-api-key`) sin exponer secretos ni alterar encabezados de aislamiento.

### CP-3: Contratos de API, Tipado y Arquitectura Monorepo
- [x] **Fronteras de paquetes**: Verificado mediante `Select-String` que `packages/shared-types/src` no importa `@prisma/client` ni `@wms/db`, y que `packages/shared-types/src/i18n` y `design-tokens.ts` no referencian `window`, `document`, `navigator` ni `process.env`.
- [x] **Tipado estricto y ESM**: `packages/shared-types/src/i18n/types.ts` define `SupportedLocale`, `TranslationDictionary` (`DeepStringRecord<typeof esES>`) y `TranslationKey`. Los 4 diccionarios adicionales usan `as const satisfies TranslationDictionary` y los imports relativos usan extensión `.js` (`NodeNext`).
- [x] **Retrocompatibilidad**: `resolveTaskStatusVisual`, `resolveTaskTypeVisual`, `resolveStepStatusVisual` y `resolveOrderStatusVisual` en `packages/shared-types/src/design-tokens.ts` aceptan `locale: SupportedLocale = DEFAULT_LOCALE` manteniendo idéntica salida por defecto (`es-ES`).

### CP-4: Verificación Automatizada y Cobertura
- [x] **Suite ejecutada independientemente por el reviewer** con código de salida `0` en todos los paquetes (`@wms/shared-types`, `@wms/web`, `@wms/api` y `pnpm build`).
- [x] **Escenarios cubiertos**:
  - **Happy Path**: Paridad 100% de claves entre los 5 diccionarios y sincronización literal TS <-> JSON (`i18n.test.ts`), traducción regional (`Albarán`, `Nota de entrega`, `Delivery note`, `Comprovante de entrega`, `Guia de remessa`), interpolación `{param}`, formateo `Intl` y cambio de idioma en `DashboardShell` / `LabelPrintModal`.
  - **Casos Borde**: `count: 0`, parámetro omitido preservando `{name}`, `Accept-Language` con pesos `q` y `q=0`, fecha inválida (`""`), `useTranslation()` fuera de `<LocaleProvider>`.
  - **Errores de Dominio / Validación**: Locales no soportados (`fr-FR`, `*`, `""`, `null`, `undefined`) normalizan a `null` y resuelven al siguiente nivel de la jerarquía.
  - **Resolución Jerárquica**: Cookie `wms_locale` (con normalización de alias cortos `es`, `en`, `pt`) → `Accept-Language` / `navigator.languages` (variantes Latam `es-MX`/`es-AR`/`es-CO`/`es-CL` → `es-419`, `en-*` → `en-US`, `pt-BR` → `pt-BR`, `pt-PT`/`pt-*` → `pt-PT`) → Fallback `'es-ES'`.

### CP-5: Arquitectura Hexagonal, Puertos y Criterios de Hecho
- [x] **Puertos y Adaptadores**: `LocaleStoragePort` y `LocaleDetectorPort` definidos en `packages/shared-types/src/i18n/ports.ts` e inyectados en `resolveLocale`. Adaptadores de navegador (`createBrowserLocaleStorage` con cookie `SameSite=Lax; Path=/; Max-Age=31536000`, `createBrowserLocaleDetector` y `syncDocumentLang`) aislados en `apps/web/src/context/locale-context.tsx`.
- [x] **Criterios de aceptación `F9.3`**: Todos cumplidos (motor puro sin dependencias externas, 5 diccionarios con paridad verificada, extensión retrocompatible de resolutores visuales, `LocaleProvider` + `useTranslation` + selector en `DashboardShell` y vistas traducidas).

### CP-6: Higiene del Código
- [x] Sin archivos duplicados, sin re-exports huérfanos, sin `it.skip` nuevos en `i18n.test.ts` ni `locale-context.test.tsx`, y sin lockfiles ajenos a `pnpm-lock.yaml`.

### CP-7: Estándar de Calidad Pre-Commit (SOLID, Cero Envars y SonarCloud)
- [x] **SOLID**: Responsabilidades separadas (`types.ts`, `ports.ts`, `resolver.ts`, `translator.ts` y adaptadores en `locale-context.tsx`).
- [x] **Cero `process.env` y secretos**: Verificado con `Select-String` sin coincidencias en los archivos auditados.
- [x] **Zero Sonar Issues**: Sin `Math.random()`, sin regex super-lineales (solo `/_/g` y `/\{([a-zA-Z0-9_]+)\}/g`), y manejo explícito de promesa con `void handlePing()` en `dashboard-shell.tsx`.

---

## Evidencia Ejecutada (Por el Reviewer)

### 1. `pnpm build` (Exit code: 0)
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    79ms >>> FULL TURBO
```

### 2. `pnpm --filter @wms/shared-types test` (Exit code: 0)
```text
> @wms/shared-types@0.0.1 test C:\Users\santi\Documents\projects\WMS\packages\shared-types
> vitest run

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/packages/shared-types

 ✓ src/i18n/__tests__/i18n.test.ts (14 tests) 45ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```

### 3. `pnpm --filter @wms/web test` (Exit code: 0)
```text
> @wms/web@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\web
> vitest run

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web

 ✓ src/lib/__tests__/api-client.test.ts (10 tests) 21ms
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 23ms
 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (9 tests) 33ms
 ✓ src/context/__tests__/locale-context.test.tsx (6 tests) 54ms
 ✓ src/app/locations/__tests__/locations-page.test.tsx (2 tests) 45ms

 Test Files  5 passed (5)
      Tests  35 passed (35)
```

### 4. `pnpm --filter @wms/api test` (Exit code: 0)
```text
> @wms/api@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run

 Test Files  28 passed | 3 skipped (31)
      Tests  365 passed | 8 skipped (373)
```
*(Los 3 archivos omitidos corresponden a tests de integración PostgreSQL existentes sin instancia BD activa en esta sesión).*

---

## Hallazgos
- Ningún hallazgo bloqueante ni observaciones pendientes. La implementación de `F9.3` cumple con todos los criterios de aceptación y estándares de calidad del repositorio.
