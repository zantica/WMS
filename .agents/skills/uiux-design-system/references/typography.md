# Reference 3 — Tipografía (T1–T12)

Ábrela en Fase 1 para elegir fuentes y definir la escala.

## Reglas base (aplican siempre)

- **Roles**: display (títulos ≥24px y hero), body (párrafos, UI), mono
  (código, números alineados, IDs, logs). 1 familia sola es válida si tiene
  carácter; 2 es lo normal; 3 es ruido.
- **Body mínimo 16px**. 14px solo para meta/labels secundarios, 12px solo
  para captions/eyebrows.
- **Línea de texto ≤70–80 caracteres**; si un párrafo se pasa, acota su
  `max-width` (≈65ch ideal).
- **Line-height**: 1.1–1.25 en display; 1.5–1.6 en body; baja el tracking a
  medida que crece el tamaño (-0.02em en display, 0 en body).
- **Números en tablas y métricas**: `font-variant-numeric: tabular-nums`
  SIEMPRE (evita que las columnas "bailen").
- **Headings en sentence case**; all-caps solo en eyebrows de 11–12px con
  tracking 0.08–0.12em y máximo 3 palabras.
- Hero fluido: `clamp()`. Ejemplo:
  `font-size: clamp(2.5rem, 2rem + 2.5vw, 4.5rem)`.

## Escala base (mapea a los tokens de Tailwind)

| Token | px / line-height | Uso |
|---|---|---|
| text-xs | 12 / 16 | caption, eyebrow |
| text-sm | 14 / 20 | body-2, meta, labels de form |
| text-base | 16 / 24 | body |
| text-lg | 18 / 28 | subtitle, intro |
| text-xl | 20 / 28 | h4, card title |
| text-2xl | 24 / 32 | h3 |
| text-3xl | 30 / 36 | h2 |
| text-4xl | 36 / 40 | h1 |
| hero | clamp(2.5rem…4.5rem) / 1.05 | hero, pricing display |

Ratio entre niveles adyacentes ≥1.2; si dos niveles se parecen menos de
1.2×, son el mismo nivel — únelos.

---

## Pairings (import listo para `<head>` o CSS)

### T1 — Inter (sola)
`https://fonts.googleapis.com/css2?family=Inter:wght@400..800&display=swap`
La base neutra de UI. Úsala cuando la identidad viene por color/layout/datos,
no por la fuente. Si la eliges, decláralo como decisión y compensa con
contraste de pesos (400 vs 700) y tracking deliberado.

### T2 — Space Grotesk + Inter
`https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400..700&family=Inter:wght@400..800&display=swap`
Display tech con carácter geométrico; body neutro. Dev tools, SaaS técnico,
neo-brutalism.

### T3 — DM Sans + JetBrains Mono
`https://fonts.googleapis.com/css2?family=DM+Sans:wght@400..700&family=JetBrains+Mono:wght@400..700&display=swap`
Workhorse de dashboards: sans limpia + mono para números, IDs y código.

### T4 — Fraunces + Inter
`https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..900&family=Inter:wght@400..800&display=swap`
Serif display expresiva (aprovecha el eje óptico) + body neutro. Marketing
premium, editorial, fintech con voz humana.

### T5 — Sora + IBM Plex Sans
`https://fonts.googleapis.com/css2?family=Sora:wght@400..800&family=IBM+Plex+Sans:wght@400;600;700&display=swap`
Geométrica seria: fintech, corporate-trust moderno, health-tech.

### T6 — Playfair Display + Source Sans 3
`https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..900&family=Source+Sans+3:wght@400;600;700&display=swap`
El clásico luxury editorial. Solo con whitespace extremo y fotografía real.

### T7 — Archivo + Inter
`https://fonts.googleapis.com/css2?family=Archivo:wght@400..900&family=Inter:wght@400..800&display=swap`
Grotesk de peso: display 700–900 para marketing bold y e-commerce.
Archivo Black (900) en hero de hasta 6 palabras.

### T8 — Libre Franklin + Lora
`https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;600;800&family=Lora:wght@400..700&display=swap`
Franklin para UI/headings, Lora para long-form (blogs, medios). El pairing
de contenidos editoriales.

### T9 — Manrope + Georgia (system)
Sin webfont extra: Manrope display + serif del sistema para pull-quotes.
`https://fonts.googleapis.com/css2?family=Manrope:wght@200..800&display=swap`
Para cargas ultra rápidas y proyectos minimal con un toque de carácter.

### T10 — Outfit + Karla
`https://fonts.googleapis.com/css2?family=Outfit:wght@300..800&family=Karla:wght@400;700&display=swap`
Redondez amigable: wellness, educación, consumer calmado.

### T11 — JetBrains Mono (lead) + Inter
`https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..700&family=Inter:wght@400..800&display=swap`
Mono como fuente de identidad (display, labels prompt-style) + sans para
prosa. Retro-terminal y dev tools.

### T12 — Bricolage Grotesque + Inter
`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=Inter:wght@400..800&display=swap`
Display con carácter contemporáneo para portfolios y marcas creativas.

---

## Rendimiento

- `&display=swap` siempre; preload solo las weights que usas de verdad.
- Un máximo de 2 familias + 4-5 weights por app; si necesitas más, el
  diseño no está resuelto con tipografía.
- Prueba jerarquía primero con system fonts (`-apple-system, ui-sans-serif`)
  y sustituye al validar el layout: la escala manda, la fuente decora.
