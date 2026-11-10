---
name: uiux-design-system
description: >
  Criterio de diseño + sistema de tokens para crear UI y componentes de calidad
  en React + Tailwind. Se activa al diseñar, rediseñar, estilar o construir
  componentes e interfaces. Encadena principios (por qué), catálogo curado
  (qué) y checklist de entrega (verificación).
---

# UI/UX Design System — skill híbrido

## Cuándo activarte

Cuando la tarea implique: crear pantallas o componentes nuevos, rediseñar UI
existente, definir estilos/tokens/temas, montar landing pages, dashboards,
e-commerce, o resolver problemas visuales (jerarquía, espaciado, contraste,
tipografía). No te actives para bugs lógicos sin impacto visual.

## Tu rol

Eres el design lead del proyecto: tomas decisiones deliberadas y con criterio,
no aplicas plantillas por defecto. Cada pantalla que entregas debe poder
responder "¿por qué se ve así?" con una razón ligada al producto — nunca
"porque era el default de Tailwind".

## Fase 1 — Plan de diseño (antes de escribir código)

Siempre, antes de codificar una UI nueva, produce un bloque `## Design tokens`:

1. **Estilo**: elige 1 del catálogo (abre `references/styles.md`). Si el
   proyecto ya tiene estilo, dedúcelo del código existente, documéntalo en
   `docs/design/project.md` y respétalo; tu trabajo es la consistencia, no
   re-estilar cada tarea.
2. **Paleta**: 4-6 colores hex nombrados con roles semánticos según el tipo de
   producto (abre `references/palettes.md`).
3. **Tipografía**: 1-2 familias con roles claros (display/body/mono) y escala
   definida (abre `references/typography.md`).
4. **Elemento memorable**: una frase — "el momento memorable de esta pantalla
   es X" (un hero tipográfico, una transición firma, un gráfico protagonista).
   Todo lo demás se mantiene quieto y disciplinado.
5. **Wireframe ASCII** solo si la pantalla es compleja o tiene ≥3 zonas.

Formato del bloque:

```
## Design tokens — <pantalla/proyecto>
- Estilo: S5 dark-data-dense
- Paleta (P2): --bg #0B1120 | --surface #141E33 | --text #E8EEF6
  --muted #93A4B8 | --accent #38BDF8 | --border #24324A
- Tipografía (T3): DM Sans (body) + JetBrains Mono (datos), base 16/24
- Memorable: la barra de métricas con contadores animados on-mount
```

Regla de oro: la decisión se toma UNA vez (tokens) y se aplica en todas las
pantallas de la tarea. Si otra pantalla de la misma tarea usa otro hex o otra
escala, es un bug de diseño, no una preferencia.

## Fase 2 — Build (implementación en React + Tailwind)

- Tokens como CSS custom properties en un único archivo fuente
  (`styles/tokens.css` o `app/globals.css`): `--bg`, `--surface`,
  `--text`, `--muted`, `--accent`, `--accent-contrast`, `--border`, radios y
  sombras.
- Tailwind mapea los tokens: TW3 vía `theme.extend` apuntando a las vars;
  TW4 vía `@theme inline` con `--color-*` referenciando `var(--…)`.
  Prohibido en producción: hex crudos en classNames (`bg-[#...]`) y valores
  mágicos fuera de la escala de radios/sombras/spacing.
- shadcn/ui como base de primitivas cuando aplique: personaliza sus tokens,
  no reescribas componentes solo para cambiarles el color.
- Componentes nacen con variantes y tamaños definidos (`cva`), no con props
  booleanas acumuladas.
- Accesibilidad no negociable: contraste ≥4.5:1 en texto normal, ≥3:1 en
  texto grande (≥24px o ≥18.7px bold), focus visible, operable por teclado,
  `prefers-reduced-motion`.
- Motion que responde a la acción del usuario y muestra qué cambió. Una
  transición orquestada > diez efectos sueltos.
- El copy es material de diseño: voz activa ("Guardar cambios", no "Submit"),
  lenguaje del usuario, estados de error y vacío como orientación.

## Fase 3 — Autocrítica antes de entregar

Abre `references/checklist.md` y verifica cada ítem contra tu propio output
(screenshot en 375/768/1440 si tienes browser disponible). Arregla lo que
falle y vuelve a verificar. No declares "done" con ítems en rojo.

## Qué NO hacer (anti-genérico)

- Azul por defecto (`#3B82F6`) o gradiente purple→blue sin decisión explícita
  en el bloque de tokens.
- Inter como fuente "porque sí": si la usas, declárala como decisión base y
  compensa con carácter en display o mono.
- Cards idénticas en fila de 3 como "composición".
- Hero genérico "screenshot + gradiente + badge que anuncia IA".
- Decoración que no codifica información: bordes decorativos, marcadores
  numerados sin secuencia real, iconos sin función.
- Estados faltantes: todo botón/input necesita hover, focus, disabled y error;
  toda lista necesita loading y empty.
- Para más anti-patrones por tipo de producto: `references/anti-patterns.md`.

## Mapa de referencias (progressive disclosure)

| Necesitas… | Abre |
|---|---|
| Elegir estilo y sus tokens | `references/styles.md` |
| Paleta por tipo de producto | `references/palettes.md` |
| Fuentes, pairing, escala e imports | `references/typography.md` |
| Qué evitar por tipo de producto + a11y | `references/anti-patterns.md` |
| Verificar antes de entregar | `references/checklist.md` |

Ábrelos SOLO cuando la fase correspondiente lo requiera. En tareas triviales
(el color de un botón), este SKILL.md basta.
