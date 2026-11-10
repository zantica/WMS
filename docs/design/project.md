# Design Tokens del Proyecto — WMS SaaS

Este documento define el estilo activo y tokens consolidados de WMS SaaS en `apps/web` y `apps/mobile`. Todo nuevo componente o refactorización debe respetar este archivo como única fuente de verdad junto con `apps/web/src/app/globals.css`.

## Design tokens — Dashboard Web (Control Tower)

- **Estilo**: `S5 dark-data-dense` (Industrial Data Tower — optimizado para B2B SaaS logístico, alta densidad y telemetría en tiempo real).
- **Paleta (P2 Refinada)**:
  - `--bg` (`--bg-base`): `#0B1120` — Lienzo abisal con tinte frío.
  - `--surface` (`--bg-surface`): `#111A2E` — Sidebar, topbar, cabeceras de tabla e inputs.
  - `--surface-card` (`--bg-card`): `#162238` — Tarjetas, paneles y contenedores de datos.
  - `--surface-hover` (`--bg-card-hover`): `#1E2D4A` — Estado hover interactivo de filas y tarjetas.
  - `--border` (`--border-subtle`): `#23334D` — Separadores estructurales de 1px.
  - `--border-strong`: `#334A6E` — Contornos enfatizados y estados hover.
  - `--text` (`--text-primary`): `#E8EEF6` — Texto primario de alto contraste sin vibración óptica.
  - `--muted` (`--text-secondary`): `#8CA0BA` — Labels secundarios, metadatos y timestamps (contraste ≥ 4.8:1).
  - `--accent` (`--accent-blue`): `#38BDF8` — Acción primaria, foco activo y telemetría.
  - `--accent-contrast`: `#08172A` — Texto oscuro sobre botón primario cian (contraste > 8:1).
  - `--support` (`--accent-emerald` / `--success`): `#34D399` — Disponible Prometible (ATP), en stock, online.
  - `--warning` (`--accent-amber`): `#FBBF24` — Stock reservado (Allocated), picking en curso, precaución.
  - `--danger` (`--accent-rose`): `#F43F5E` — Rotura de stock (`ON_HOLD`), excepción operativa, desconexión.
- **Tipografía (T3)**: `DM Sans` (cuerpo y encabezados en sentence case) + `JetBrains Mono` (`tabular-nums` para SKUs, ubicaciones, cantidades, timestamps e IDs).
- **Elemento memorable**: HUD de métricas contables (`OnHand − Allocated = ATP`) con iluminación perimetral superior por rol semántico, cifras tabulares monoespaciadas y telemetría de sincronización en vivo.

---

## Escala de Radios y Elevación

| Token | Valor | Uso |
| :--- | :--- | :--- |
| `--radius-sm` | `4px` | Tags semánticos, badges de estado y píldoras de código |
| `--radius-md` | `6px` | Botones, inputs, selects y celdas de ubicación |
| `--radius-lg` | `8px` | Tarjetas de KPI, contenedores de tablas y paneles de alerta |
| `--shadow-sm` | `0 1px 2px rgba(2, 6, 23, 0.45)` | Controles e inputs |
| `--shadow-md` | `0 4px 12px -2px rgba(2, 6, 23, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.04)` | Tarjetas elevadas |
| `--shadow-glow` | `0 0 0 1px rgba(56, 189, 248, 0.35), 0 4px 16px rgba(56, 189, 248, 0.12)` | Foco / navegación activa |

---

## Reglas de Implementación en WMS

1. **Números en tablas y métricas**: `font-variant-numeric: tabular-nums` obligatorio en toda cifra operativa (`OnHand`, `Allocated`, `ATP`, cantidades de Kardex y contadores).
2. **Cero hex crudos**: Prohibido usar colores hexadecimales en línea (`style={{ color: "#..." }}`) o fuera de las variables de `globals.css`. Usar clases semánticas (`.wms-text-success`, `.wms-text-warning`, `.wms-text-danger`, `.wms-text-accent`).
3. **Un único CTA primario por vista**: Solo la acción principal de sincronización o confirmación principal usa `.wms-btn-primary` (`--accent` `#38BDF8` con texto `--accent-contrast` `#08172A`).
4. **Accesibilidad y estados**:
   - `:focus-visible` con anillo cian de 2px en todo elemento interactivo.
   - Respeto estricto a `prefers-reduced-motion: reduce`.
   - Estados no codificados únicamente por color (siempre acompañados de etiqueta textual o indicador simbólico).
   - Tablas y paneles con estados `loading` (skeleton) y `empty` orientadores.
