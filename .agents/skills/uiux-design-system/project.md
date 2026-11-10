# Design Tokens del Proyecto — WMS SaaS

Este documento define el estilo activo y tokens consolidados de WMS SaaS deducidos del código existente en `apps/web` y `apps/mobile`. Todo nuevo componente o refactorización debe respetar este archivo.

## Bloque Base de Identidad Visual

- **Estilo**: `S5 dark-data-dense` (Optimizado para B2B SaaS industrial, alta densidad y datos en tiempo real).
- **Paleta base**: `P2 SaaS dashboard oscuro` (con elevaciones para panel de supervisión).
- **Tipografía base**: `T3 DM Sans / Inter` (cuerpo UI) + `JetBrains Mono` (`tabular-nums` para SKUs, cantidades, ubicaciones y métricas).
- **Elemento memorable**: Barra de métricas operativas con badges de estado de alto contraste y contadores reactivos.

---

## Mapeo de Tokens CSS (`apps/web/src/app/globals.css`)

| Rol semántico | Variable CSS | Valor Hex | Uso |
| :--- | :--- | :--- | :--- |
| `--bg` | `--bg-base` | `#0B1120` | Lienzo principal de la aplicación |
| `--surface` | `--bg-surface` | `#0F172A` | Sidebar, header y paneles de navegación |
| `--surface-card` | `--bg-card` | `#1E293B` | Tarjetas, filas de tabla y contenedores |
| `--surface-hover` | `--bg-card-hover` | `#263449` | Estados hover de tarjetas e interactivos |
| `--text` | `--text-primary` | `#F8FAFC` | Texto principal, títulos y métricas |
| `--muted` | `--text-secondary` | `#94A3B8` | Labels, texto auxiliar, timestamps |
| `--border` | `--border-subtle` | `#334155` | Separadores y bordes de contorno |
| `--accent` | `--accent-blue` | `#38BDF8` | Acciones primarias, tabs activos, foco |
| `--accent-contrast`| `#08172A` | `#08172A` | Texto sobre acento azul |
| `--success` | `--accent-emerald` | `#10B981` | En stock, completado, online |
| `--warning` | `--accent-amber` | `#F59E0B` | Stock bajo, reserva pendiente, atención |
| `--danger` | `--accent-rose` | `#F43F5E` | Sin stock, discrepancia, fallo RLS |

---

## Reglas de Implementación en WMS
1. **Números en tablas y métricas**: `tabular-nums` obligatorio para evitar parpadeos visuales al actualizar cantidades o ATP.
2. **Cero hex crudos**: Usar variables CSS o utilidades configuradas (`var(--bg-base)`, etc.), jamás `bg-[#0b1120]`.
3. **Escala de radios**: Estricta en 4px a 8px (`rounded-sm` / `rounded-md`).
4. **Estados interactivos**: Toda acción requiere hover, focus-visible con halo cian (`#38BDF8`), y estados loading/empty claramente identificados con iconos o badges semánticos.
