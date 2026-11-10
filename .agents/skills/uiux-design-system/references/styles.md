# Reference 1 — Catálogo de estilos (S1–S10)

Ábrelo en Fase 1 para elegir el estilo. Elige **1** (máx. 2 combinables con
roles claros: uno como base y uno como acento en una zona específica). Los
tokens de estilo (radios, sombras, bordes, motion) son globales para toda la
UI: no mezcles radios de estilos distintos en la misma pantalla.

| ID | Estilo | Mejor en | Pairing | Paleta base |
|----|--------|----------|---------|-------------|
| S1 | minimal-swiss | SaaS, herramientas, docs | T1 / T2 | P13 |
| S2 | editorial-serif | Marketing, contenido, premium | T4 / T8 | P7 |
| S3 | neo-brutalism | Landing dev tools, marcas jóvenes | T2 / T7 | P8 |
| S4 | glassmorphism | Dashboards, apps premium | T3 / T5 | P2 |
| S5 | dark-data-dense | B2B SaaS, dev tools, dashboards | T3 / T11 | P2 / P9 |
| S6 | soft-ui | Wellness, consumer calmado | T10 | P14 |
| S7 | corporate-trust | Fintech, salud, legal | T5 | P3 / P15 |
| S8 | playful-bold | E-commerce consumer, educación | T7 / T12 | P10 / P6 |
| S9 | luxury-refined | E-commerce premium, moda | T6 | P7 |
| S10 | retro-terminal | Dev tools, marcas tech | T11 | P9 / P12 |

---

### S1 — minimal-swiss
**Cuándo**: productos donde el contenido y los datos son el protagonista;
marcas que necesitan verse "serias pero no corporativas".
**Tokens**: radius 0–4px · bordes 1px solo para separar información (nunca
decorar) · sombra: ninguna, o una difusa de elevación real · espaciado en
escala estricta (8px base, secciones 96–128px) · color: 90% neutro + 1 acento
usado con cuentagotas.
**Tipografía**: la protagonista. Tamaños grandes con tracking apretado
(-0.02em) y mucho contraste de escala (h1 ≥3× el body).
**Motion**: mínimo. Fade 150ms. Nada que no responda a una acción.
**Trampa**: "minimal" ≠ vacío; sin un focal point fuerte queda genérico y frío.
Si quitas decoración, debes añadir jerarquía.

### S2 — editorial-serif
**Cuándo**: marketing de contenido, blogs premium, storytelling de marca.
**Tokens**: serif display grande (48–72px) + sans/serif body · columnas de
texto estrechas (máx. 70ch) · imágenes full-bleed alternadas con bloques
angostos · líneas divisorias finas 1px tono tono · paletas cálidas neutras.
**Tipografía**: serif display con opsz si la fuente lo soporta (Fraunces).
**Motion**: reveals suaves on-scroll 300ms ease-out; nada que salte.
**Trampa**: dos serifs sin roles claros = ruido. Serif display por debajo de
28px pierde todo su sentido.

### S3 — neo-brutalism
**Cuándo**: landing de dev tools, marcas jóvenes, marketing con actitud.
**Tokens**: radius 0 (máx. 2px) · borde 2–3px sólido del color de texto ·
sombra offset dura (4px 4px 0 texto, sin blur) · colores planos saturados
(1 primaria + 2 support) · cero gradientes, cero blur.
**Motion**: hover "press" (translate 2px + la sombra crece), micro-interacciones
bruscas y rápidas (80–120ms), sin easing suave.
**Tailwind**: `border-2 border-[--text]` + una sombra custom definida UNA vez
en tokens (`--shadow-hard`).
**Trampa**: en dashboards densos es puro ruido y en forms largos cansa. El
contraste es fácil; la jerarquía es difícil — gana con tamaño, no con más
bordes.

### S4 — glassmorphism
**Cuándo**: dashboards y apps premium sobre fondos oscuros con color.
**Tokens**: superficie `rgba(255,255,255,0.06–0.12)` + `backdrop-blur(12–24px)`
· borde 1px `rgba(255,255,255,0.12)` · radius 12–16px · fondo: color base
profundo + formas de color (mesh/blobs) controladas detrás del vidrio.
**Motion**: parallax sutil; el blur es estático, no lo animes.
**Trampa a11y**: el texto sobre blur necesita surface más opaca — verifica
contraste real sobre el peor caso del fondo. Prepara fallback con
`@supports (backdrop-filter…)`. En modo claro usa tints 60–80% de opacidad,
no vidrio puro.

### S5 — dark-data-dense
**Cuándo**: B2B SaaS, dashboards, dev tools con tablas y métricas.
**Tokens**: bg casi negro con tinte frío · superficies apiladas por elevación
(+1–2% de luminosidad por capa) · bordes 1px oscuros · texto #E5+ nivel
primario, muted ~#8A–9A · 1 accent frío (cyan/sky) + colores semánticos
solo para estado · mono para números y IDs.
**Densidad**: rows de 36–40px, paddings compactos pero en escala (4/8/12).
**Motion**: solo transitions de estado (150ms) y skeletons. Nada decorativo.
**Trampa**: grises sin tinte se ven muertos (usa slate/azulado, no neutral
puro); blanco puro #FFF en texto grande vibra — usa #E8EEF6.

### S6 — soft-ui (neumorphism-lite)
**Cuándo**: wellness, apps consumer calmadas, onboarding.
**Tokens**: bg y surface casi del mismo tono · radius 16–24px · elevación por
doble sombra (oscura abajo-derecha + clara arriba-izquierda, ambas suaves)
· color por tints, no saturados.
**Versión "lite"**: mantén SIEMPRE un borde 1px tintado en elementos
interactivos — el neumorfismo puro pierde los bounds y mata la a11y.
**Trampa**: inputs soft-ui necesitan focus explícito y contaste de borde;
nunca para texto denso o tablas. Si te obliga a bajar contraste, ya no es
diseño, es fricción.

### S7 — corporate-trust
**Cuándo**: fintech, salud, seguros, legal, B2B enterprise serio.
**Tokens**: azul profundo (deliberado, no el default de Tailwind) + blanco ·
radius 4–8px · sombras neutras suaves · espaciado formal generoso ·
iconografía outline fina · números tabulares en tablas y cifras.
**Trampa**: muere de aburrimiento si no tiene UN punto de carácter: cifras
display con serif, un acento cálido sutil en el CTA, o micro-datos con mono.
Elije uno y disciplina el resto.

### S8 — playful-bold
**Cuándo**: e-commerce consumer, educación, apps para gente real.
**Tokens**: 2–3 colores saturados · radius 16–24px · sombras con el tinte del
accent (no negras) · ilustración/emoji como motivo visual · display weights
700–800.
**Motion**: micro-bounce 200ms con overshoot corto en CTAs y estados.
**Trampa**: saturación sin jerarquía = circo. Reserva el color saturado para
CTA y momentos; el resto neutro. Un primary + dos support, y ya.

### S9 — luxury-refined
**Cuándo**: moda, premium e-commerce, hospitality de gama alta.
**Tokens**: neutros cálidos (ivory, stone) · whitespace extremo (secciones
120–160px) · serif display con tracking aperturado + eyebrows en small caps
(tracking 0.2em) · bordes hairline (1px tono tono) · radius 0–2px.
**Motion**: lento y controlado: 500–700ms ease-out en reveals.
**Trampa**: sin fotografía/material de calidad real se ve "vacío caro".
Anuncia al usuario que hace falta foto buena antes de aceptar el encargo.

### S10 — retro-terminal
**Cuándo**: dev tools, marcas para developers, secciones técnicas.
**Tokens**: mono-led · verde o ámbar sobre #0D1117 · labels estilo prompt
(">", "$") · radius 0 · scanlines o bordes ASCII sutiles · glow (text-shadow)
solo en display, un solo valor.
**Trampa**: mono en párrafos largos cansa: mono para display/datos/código,
sans para prosa. El glow en body es ilegible.

---

## Cómo combinar 2 estilos

Solo con roles explícitos: uno es **base** (tokens globales) y otro vive en
una zona concreta. Ejemplos que funcionan: S5 base + S10 en la sección de
código/logs; S1 base + S2 en el área editorial/blog. Mezclas que nunca:
dos estilos tocando el mismo tipo de componente (dos radios, dos sombras).

## Qué NO es este catálogo

No son frameworks ni librerías: son **decisiones de tokens con criterio**.
Si el producto pide algo que no está aquí, derívelo del más cercano y
documéntalo como estilo nuevo (S11…) con sus tokens.
