# Design Tokens del Proyecto — WMS SaaS

Este documento define el estilo activo, tokens consolidados y arquitectura compartida de WMS SaaS en `@wms/shared-types`, `apps/web` y `apps/mobile`. Todo nuevo componente o refactorización debe respetar este archivo como única fuente de verdad junto con [`packages/shared-types/src/design-tokens.ts`](../../packages/shared-types/src/design-tokens.ts) y [`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css).

## Design tokens — WMS Control Tower (`@wms/web`) & Handheld Terminal (`@wms/mobile`)

- **Estilo**: `S5 dark-data-dense` (Industrial Data Tower — optimizado para B2B SaaS logístico, alta densidad y telemetría en tiempo real).
- **Paleta (P2 Refinada)**:
  - `--bg` (`WMS_COLORS.bg`): `#0B1120` — Lienzo abisal con tinte frío.
  - `--surface` (`WMS_COLORS.surface`): `#111A2E` — Sidebar, topbar, cabeceras de tabla, pestañas e inputs.
  - `--surface-card` (`WMS_COLORS.surfaceCard`): `#162238` — Tarjetas, paneles y contenedores de datos.
  - `--surface-hover` (`WMS_COLORS.surfaceHover`): `#1E2D4A` — Estado hover/activo interactivo de filas, chips y controles.
  - `--border` (`WMS_COLORS.border`): `#23334D` — Separadores estructurales de 1px.
  - `--border-strong` (`WMS_COLORS.borderStrong`): `#334A6E` — Contornos enfatizados y estados hover/focus.
  - `--text` (`WMS_COLORS.text`): `#E8EEF6` — Texto primario de alto contraste sin vibración óptica.
  - `--muted` (`WMS_COLORS.muted`): `#8CA0BA` — Labels secundarios, metadatos y timestamps (contraste ≥ 4.8:1).
  - `--accent` (`WMS_COLORS.accent`): `#38BDF8` — Acción primaria, foco activo y telemetría.
  - `--accent-hover` (`WMS_COLORS.accentHover`): `#7DD3FC` — Hover de acción primaria.
  - `--accent-contrast` (`WMS_COLORS.accentContrast`): `#08172A` — Texto oscuro sobre botón primario cian (contraste > 8:1).
  - `--support` / `--success` (`WMS_COLORS.support` / `WMS_COLORS.success`): `#34D399` — Disponible Prometible (ATP), en stock, online.
  - `--warning` (`WMS_COLORS.warning`): `#FBBF24` — Stock reservado (Allocated), picking en curso, precaución.
  - `--danger` (`WMS_COLORS.danger`): `#F43F5E` — Rotura de stock (`ON_HOLD`), excepción operativa, desconexión.
- **Tipografía (T3)**: `DM Sans` (cuerpo y encabezados en sentence case) + `JetBrains Mono` / `monospace` (`tabular-nums` para SKUs, ubicaciones, cantidades, timestamps e IDs).
- **Elemento memorable**: HUD de métricas contables (`OnHand − Allocated = ATP`) y cola operativa con iluminación perimetral superior de 2px por rol semántico, cifras tabulares monoespaciadas y telemetría de sincronización en vivo.

---

## Arquitectura Compartida de Tokens (`@wms/shared-types` → Web + Mobile)

1. **Fuente Única en `@wms/shared-types` ([`design-tokens.ts`](../../packages/shared-types/src/design-tokens.ts))**:
   - Exporta `WMS_COLORS`, `WMS_RADII` (`sm: 4`, `md: 6`, `lg: 8`, `pill: 999`), `WMS_SPACING` (`xs: 4` … `xxl: 24`), `WMS_FONT_SIZES` (`xs: 12` … `display: 30`), `WMS_DESIGN_TOKENS`, `WmsTone` y `buildWmsCssVariables()`.
   - Exporta los resolutores visuales puros compartidos entre Web y Mobile (garantizando que ningún estado dependa únicamente del color al incluir `symbol` y `label`):
     - `resolveToneColors(tone)` → `{ text, bg, border, webTagClass }`
     - `resolveTaskStatusVisual(status)` → `{ label, shortLabel, symbol, tone, colors }`
     - `resolveTaskTypeVisual(type)` → `{ label, code, symbol, tone, colors }`
     - `resolveStepStatusVisual(status)` → `{ label, symbol, tone, colors }`
     - `resolveOrderStatusVisual(status)` → `{ label, recommendedAction, symbol, tone, colors }`
2. **Consumo en `@wms/web` ([`dashboard-metrics.ts`](../../apps/web/src/lib/dashboard-metrics.ts) + [`globals.css`](../../apps/web/src/app/globals.css))**:
   - Las vistas (`page.tsx`, `operations/page.tsx`, `inventory/page.tsx`, `catalog/page.tsx`) consumen las clases CSS basadas en `:root` y los resolutores semánticos de `@wms/shared-types`.
3. **Consumo en `@wms/mobile` ([`tokens.ts`](../../apps/mobile/src/theme/tokens.ts) + [`WmsUiPrimitives.tsx`](../../apps/mobile/src/components/WmsUiPrimitives.tsx))**:
   - `apps/mobile/src/theme/tokens.ts` re-exporta los tokens de `@wms/shared-types` y define `WMS_MIN_TOUCH_TARGET = 44`, `tabularNums` y `monoText`.
   - `apps/mobile/src/components/WmsUiPrimitives.tsx` provee las primitivas reutilizables en React Native (`WmsTag`, `WmsKpiCard`, `WmsBanner`, `WmsEmptyState`, `WmsProgressBar`) para todas las pantallas de Expo Router.

---

## Escala de Radios y Elevación

| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--radius-sm` / `WMS_RADII.sm` | `4px` | Tags semánticos, badges de estado y píldoras de código |
| `--radius-md` / `WMS_RADII.md` | `6px` | Botones, inputs, selects y celdas de ubicación |
| `--radius-lg` / `WMS_RADII.lg` | `8px` | Tarjetas de KPI, contenedores de tablas y paneles de alerta |
| `--shadow-sm` | `0 1px 2px rgba(2, 6, 23, 0.45)` | Controles e inputs |
| `--shadow-md` | `0 4px 12px -2px rgba(2, 6, 23, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.04)` | Tarjetas elevadas |
| `--shadow-glow` | `0 0 0 1px rgba(56, 189, 248, 0.35), 0 4px 16px rgba(56, 189, 248, 0.12)` | Foco / navegación activa |

---

## Reglas de Implementación en WMS

1. **Números en tablas y métricas**: `font-variant-numeric: tabular-nums` (Web) y `fontVariant: ["tabular-nums"]` (Mobile) obligatorio en toda cifra operativa (`OnHand`, `Allocated`, `ATP`, cantidades de Kardex y contadores de pasos).
2. **Cero hex crudos en `.tsx`**: Prohibido usar colores hexadecimales literales (`#...`) en archivos `.tsx` de `apps/web` y `apps/mobile`. Todo color se referencia mediante clases de `globals.css` (Web) o `WMS_COLORS` / `resolveToneColors` (Mobile).
3. **Un único CTA primario por vista**: Solo la acción principal de sincronización o confirmación principal usa `.wms-btn-primary` / `WMS_COLORS.accent` (`#38BDF8` con texto `WMS_COLORS.accentContrast` `#08172A`).
4. **Accesibilidad y estados**:
   - `:focus-visible` con anillo cian de 2px en todo elemento interactivo web y targets táctiles `>= 44px` (`WMS_MIN_TOUCH_TARGET`) en móvil.
   - Respeto estricto a `prefers-reduced-motion: reduce`.
   - Estados no codificados únicamente por color (siempre acompañados de etiqueta textual e indicador simbólico `●`, `▲`, `✓`, `⚠`, `◆`).
   - Tablas y paneles con estados `loading` y `empty` (`WmsEmptyState`) orientadores.
