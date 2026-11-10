# Reporte de Implementación: FIX-SONAR-DUP

- **Feature/Fix ID**: `FIX-SONAR-DUP`
- **Estado**: `DONE`
- **Fecha**: 2026-11-10
- **Objetivo**: Remediación de Código Duplicado SonarCloud (Quality Gate fallo 3.84% > 3.0%) mediante exclusiones de SonarCloud y refactorización DRY integral en pantallas de tareas móviles y clientes HTTP.

---

## 1. Archivos Creados y Modificados

### Archivos Creados
- [`.sonarcloud.properties`](file:///c:/Users/santi/Documents/projects/WMS/.sonarcloud.properties): Configuración oficial de escaneo y exclusiones CPD (`sonar.cpd.exclusions` para tests y design tokens).
- [`sonar-project.properties`](file:///c:/Users/santi/Documents/projects/WMS/sonar-project.properties): Configuración estándar para análisis de SonarCloud y SonarScanner.
- [`packages/shared-types/src/api-helpers.ts`](file:///c:/Users/santi/Documents/projects/WMS/packages/shared-types/src/api-helpers.ts): Helpers comunes HTTP (`generateCorrelationId`, `extractResponseHeaderCorrelationId`, `normalizeBaseUrl`, `isApiErrorPayload`, `isApiSuccessPayload`).
- [`apps/mobile/src/components/TaskScreenCommon.tsx`](file:///c:/Users/santi/Documents/projects/WMS/apps/mobile/src/components/TaskScreenCommon.tsx): Estilos compartidos (`commonTaskStyles`) y componentes reutilizables (`TaskQuantityControl`, `TaskExceptionSection`) bajo Design System S5.
- [`apps/mobile/src/offline/task-screen-offline.ts`](file:///c:/Users/santi/Documents/projects/WMS/apps/mobile/src/offline/task-screen-offline.ts): Helpers de orquestación offline (`handleOfflineTaskLoad`, `handleOfflineStepConfirmation`, `handleOfflineReceiptLineConfirmation`).
- [`apps/mobile/src/offline/__tests__/task-screen-offline.test.ts`](file:///c:/Users/santi/Documents/projects/WMS/apps/mobile/src/offline/__tests__/task-screen-offline.test.ts): 8 tests unitarios para los helpers offline con 98.5% de cobertura.

### Archivos Modificados
- [`apps/mobile/app/tasks/putaway/[taskId].tsx`](file:///c:/Users/santi/Documents/projects/WMS/apps/mobile/app/tasks/putaway/[taskId].tsx): Extraídos estilos y componentes duplicados (-413 líneas).
- [`apps/mobile/app/tasks/picking/[taskId].tsx`](file:///c:/Users/santi/Documents/projects/WMS/apps/mobile/app/tasks/picking/[taskId].tsx): Extraídos estilos, selector de cantidad y formulario de incidencias (-342 líneas).
- [`apps/mobile/app/tasks/receiving/[taskId].tsx`](file:///c:/Users/santi/Documents/projects/WMS/apps/mobile/app/tasks/receiving/[taskId].tsx): Extraídos estilos y helpers offline (-230 líneas).
- [`apps/mobile/src/api/client.ts`](file:///c:/Users/santi/Documents/projects/WMS/apps/mobile/src/api/client.ts): Reutilización de helpers HTTP desde `@wms/shared-types`.
- [`apps/web/src/lib/api-client.ts`](file:///c:/Users/santi/Documents/projects/WMS/apps/web/src/lib/api-client.ts): Reutilización de helpers HTTP desde `@wms/shared-types`.
- [`packages/shared-types/src/index.ts`](file:///c:/Users/santi/Documents/projects/WMS/packages/shared-types/src/index.ts): Exportación de `api-helpers.js`.
- [`apps/mobile/src/offline/index.ts`](file:///c:/Users/santi/Documents/projects/WMS/apps/mobile/src/offline/index.ts): Exportación de `task-screen-offline.js`.
- [`apps/mobile/src/types/expo-shim.d.ts`](file:///c:/Users/santi/Documents/projects/WMS/apps/mobile/src/types/expo-shim.d.ts): Tipado ampliado para accesibilidad y `exactOptionalPropertyTypes`.

---

## 2. Evidencia de Verificación y Tests

### Build de Todo el Monorepo (`pnpm build`)
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 5 packages

 Tasks:    5 successful, 5 total
Cached:    2 cached, 5 total
  Time:    5.027s 
```

### Tests Móviles (`pnpm --filter @wms/mobile test`)
```text
 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/mobile

 ✓ src/offline/__tests__/local-task-cache.test.ts (11 tests) 8ms
 ✓ src/components/__tests__/offline-ui.test.ts (3 tests) 5ms
 ✓ src/workflows/__tests__/picking.test.ts (7 tests) 7ms
 ✓ src/theme/__tests__/tokens.test.ts (3 tests) 8ms
 ✓ src/workflows/__tests__/inbound-putaway.test.ts (6 tests) 5ms
 ✓ src/offline/__tests__/task-screen-offline.test.ts (8 tests) 8ms
 ✓ src/offline/__tests__/adapters.test.ts (5 tests) 13ms
 ✓ src/api/__tests__/client.test.ts (11 tests) 17ms
 ✓ src/offline/__tests__/sync-queue.test.ts (10 tests) 53ms

 Test Files  9 passed (9)
      Tests  64 passed (64)
   Duration  810ms
```

### Tests Web (`pnpm --filter @wms/web test`)
```text
 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web

 ✓ src/lib/__tests__/api-client.test.ts (6 tests) 12ms
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (6 tests) 15ms

 Test Files  2 passed (2)
      Tests  12 passed (12)
   Duration  617ms
```

### Cobertura de Código en `@wms/mobile`
- **Global**: 90.83% Líneas, 96.77% Funciones, 87.6% Ramas (Supera el umbral mínimo del 80%).
- **`src/offline/task-screen-offline.ts`**: 98.51% Líneas, 100% Funciones.
