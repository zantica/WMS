# Reporte de Implementación — `uiux_shared_mobile` (Unificación del Design System `@wms/shared-types` + `@wms/web` + `@wms/mobile`)

- **Feature / Tarea**: `uiux_shared_mobile` — Unificación del Design System (`S5 dark-data-dense` / `P2 Refinada` / `T3`) entre `@wms/shared-types`, `@wms/web` y `@wms/mobile`
- **Estado**: `DONE`
- **Fecha**: 2026-11-10

---

## 1. Fase 1 — Plan de Tokens (`## Design tokens`)

```markdown
## Design tokens — WMS Control Tower (@wms/web) & Handheld Terminal (@wms/mobile)
- Estilo: S5 dark-data-dense (Industrial Data Tower — alta densidad, telemetría en vivo, operación con una mano en terminal móvil)
- Paleta (P2 Refinada):
  --bg #0B1120 | --surface #111A2E | --surface-card #162238 | --surface-hover #1E2D4A
  --text #E8EEF6 | --muted #8CA0BA | --border #23334D | --border-strong #334A6E
  --accent #38BDF8 | --accent-hover #7DD3FC | --accent-contrast #08172A
  --support / --success #34D399 | --warning #FBBF24 | --danger #F43F5E
- Tipografía (T3): DM Sans (body/headings en sentence case) + JetBrains Mono / monospace (tabular-nums en SKUs, ubicaciones, cantidades, IDs)
- Memorable: HUD de métricas contables y cola operativa con iluminación perimetral superior de 2px por rol semántico, cifras tabulares monoespaciadas y estado codificado con símbolo + texto + color.
```

---

## 2. Fase 2 — Archivos Creados y Modificados

### `@wms/shared-types` (Fuente Única de Verdad)
- [`packages/shared-types/src/design-tokens.ts`](../packages/shared-types/src/design-tokens.ts) *(Creado)*:
  - Define y exporta `WMS_COLORS`, `WMS_RADII`, `WMS_SPACING`, `WMS_FONT_SIZES`, `WMS_DESIGN_TOKENS`, `WmsTone` y `buildWmsCssVariables()`.
  - Implementa los resolutores puros de semántica visual compartidos entre Web y Mobile: `resolveToneColors`, `resolveTaskStatusVisual`, `resolveTaskTypeVisual`, `resolveStepStatusVisual`, `resolveOrderStatusVisual`.
- [`packages/shared-types/src/index.ts`](../packages/shared-types/src/index.ts) *(Modificado)*:
  - Re-exporta `./design-tokens.js` respetando ESM `NodeNext`.

### `@wms/web` (Dashboard de Supervisores)
- [`apps/web/src/lib/dashboard-metrics.ts`](../apps/web/src/lib/dashboard-metrics.ts) *(Modificado)*:
  - Consume y re-exporta los tokens y resolutores visuales de `@wms/shared-types`.
- [`apps/web/src/app/page.tsx`](../apps/web/src/app/page.tsx) y [`apps/web/src/app/operations/page.tsx`](../apps/web/src/app/operations/page.tsx) *(Modificados)*:
  - Integran `resolveOrderStatusVisual` y `resolveTaskStatusVisual` para renderizar badges y acciones recomendadas sin duplicar lógica ni colores.
- [`apps/web/src/lib/__tests__/dashboard-metrics.test.ts`](../apps/web/src/lib/__tests__/dashboard-metrics.test.ts) *(Modificado)*:
  - Añade test unitario validando el contrato de `WMS_DESIGN_TOKENS`, `buildWmsCssVariables` y los resolutores visuales.

### `@wms/mobile` (App de Operarios en Expo / React Native)
- [`apps/mobile/src/theme/tokens.ts`](../apps/mobile/src/theme/tokens.ts) *(Creado)*:
  - Consume y re-exporta los tokens y resolutores desde `@wms/shared-types` y añade `WMS_MIN_TOUCH_TARGET = 44`, `tabularNums` y `monoText`.
- [`apps/mobile/src/components/WmsUiPrimitives.tsx`](../apps/mobile/src/components/WmsUiPrimitives.tsx) *(Creado)*:
  - Implementa las primitivas reutilizables `WmsTag`, `WmsKpiCard` (con borde luminoso superior de 2px), `WmsBanner`, `WmsEmptyState` y `WmsProgressBar`.
- Pantallas y componentes refactorizados con **cero hex crudos**:
  - [`apps/mobile/app/_layout.tsx`](../apps/mobile/app/_layout.tsx)
  - [`apps/mobile/app/(tabs)/_layout.tsx`](../apps/mobile/app/(tabs)/_layout.tsx)
  - [`apps/mobile/app/(tabs)/index.tsx`](../apps/mobile/app/(tabs)/index.tsx)
  - [`apps/mobile/app/(tabs)/scanner.tsx`](../apps/mobile/app/(tabs)/scanner.tsx)
  - [`apps/mobile/app/login.tsx`](../apps/mobile/app/login.tsx)
  - [`apps/mobile/app/tasks/receiving/[taskId].tsx`](../apps/mobile/app/tasks/receiving/[taskId].tsx)
  - [`apps/mobile/app/tasks/putaway/[taskId].tsx`](../apps/mobile/app/tasks/putaway/[taskId].tsx)
  - [`apps/mobile/app/tasks/picking/[taskId].tsx`](../apps/mobile/app/tasks/picking/[taskId].tsx)
  - [`apps/mobile/src/components/BarcodeScannerBox.tsx`](../apps/mobile/src/components/BarcodeScannerBox.tsx)
- [`apps/mobile/src/theme/__tests__/tokens.test.ts`](../apps/mobile/src/theme/__tests__/tokens.test.ts) *(Creado)*:
  - Suite de tests unitarios verificando invariantes de paleta, escala de radios/espaciado, tonos y resolutores de estado móviles.

### Documentación
- [`docs/design/project.md`](../docs/design/project.md) *(Actualizado)*:
  - Documenta la arquitectura compartida en `@wms/shared-types` y las primitivas en `@wms/web` y `@wms/mobile`.

---

## 3. Fase 3 — Autocrítica contra Checklist (`docs/design/references/checklist.md`)

- **A. Tokens y consistencia**: ✅ Cero hex crudos en los 18 archivos `.tsx` de `apps/web` y `apps/mobile`. Escala unificada de radios (`4/6/8px`) y espaciado (`4/8/12/16/20/24px`).
- **B. Jerarquía y composición**: ✅ HUD de métricas con iluminación superior de 2px como elemento memorable; un único CTA primario cian (`#38BDF8` sobre `#08172A`) por vista.
- **C. Responsive y Ergonomía Móvil**: ✅ Controles e inputs con `minHeight: 44` (`WMS_MIN_TOUCH_TARGET`) para operación con una sola mano en pasillo.
- **D. Accesibilidad**: ✅ Estados codificados con símbolo (`●`, `▲`, `✓`, `⚠`, `◆`, `✕`) + etiqueta textual + color; contraste > 8:1 en CTA primario y ≥ 4.8:1 en texto secundario (`#8CA0BA` sobre `#0B1120`).
- **E. Estados del componente**: ✅ Estados `loading`, `empty` (`WmsEmptyState`), `error` (`WmsBanner` con código y `actionHint`) y `disabled` cubiertos en todas las vistas.
- **F / H. Copy y Data-viz**: ✅ Encabezados en sentence case, números tabulares (`tabular-nums`) en contadores, cantidades y saldos `OnHand / Allocated / ATP`.

---

## 4. Evidencia de Verificación Ejecutada

### 4.1 Verificación de Cero Hex Crudos en `.tsx` (`apps/web` + `apps/mobile`)
```text
ZERO_RAW_HEX_IN_TSX_VERIFIED (18 files scanned)
```

### 4.2 Compilación Monorepo (`pnpm build`)
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

 Tasks:    5 successful, 5 total
Cached:    3 cached, 5 total
  Time:    6.098s
```

### 4.3 Suite de Tests (`pnpm test`)
```text
@wms/mobile:test:  ✓ src/workflows/__tests__/inbound-putaway.test.ts (6 tests) 9ms
@wms/mobile:test:  ✓ src/workflows/__tests__/picking.test.ts (7 tests) 9ms
@wms/mobile:test:  ✓ src/theme/__tests__/tokens.test.ts (3 tests) 10ms
@wms/mobile:test:  ✓ src/api/__tests__/client.test.ts (10 tests) 28ms
@wms/mobile:test:  Test Files  4 passed (4) | Tests  26 passed (26)

@wms/web:test:  ✓ src/lib/__tests__/dashboard-metrics.test.ts (6 tests) 28ms
@wms/web:test:  ✓ src/lib/__tests__/api-client.test.ts (6 tests) 25ms
@wms/web:test:  Test Files  2 passed (2) | Tests  12 passed (12)

@wms/api:test:  Test Files  13 passed | 1 skipped (14)
@wms/api:test:       Tests  158 passed | 3 skipped (161)

 Tasks:    5 successful, 5 total
```

### 4.4 Cobertura de Casos de Uso (`pnpm --filter @wms/api test:coverage`)
```text
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |    99.4 |     91.7 |     100 |    99.4 |                   
 diagnostics       |   99.36 |    93.84 |     100 |   99.36 |                   
 integrations      |     100 |    90.14 |     100 |     100 |                   
 inventory         |   98.81 |    88.02 |     100 |   98.81 |                   
 security          |     100 |      100 |     100 |     100 |                   
 tasks             |     100 |    94.73 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------
```
