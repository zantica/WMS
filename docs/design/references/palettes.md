# Reference 2 — Paletas por tipo de producto (P1–P15)

Ábrela en Fase 1 para elegir paleta. Cada paleta define las CSS vars
semánticas con el mapa fijo:

```
--bg              lienzo de la app
--surface         cards, panels, inputs elevados
--text            texto principal
--muted           texto secundario (debe cumplir ≥4.5:1 sobre --bg si es legible)
--accent          acción/énfasis (CTA, links, activo)
--accent-contrast color de texto ENCIMA de --accent
--border          separadores, contornos
--support         secundario/estado positivo (si el producto lo pide)
```

Reglas de uso:

- **60-30-10**: bg domina, surface/text estructuran, accent ≤10% del área
  visible. Si tu accent cubre más del 10%, es tu bg, no tu accent.
- Si pones texto pequeño sobre `--accent` y no llega a 4.5:1, oscurece el
  accent una marcha antes de cambiar el texto.
- Son puntos de partida curados: verifica contraste real (devtools o
  automatizado) antes de producción, sobre todo en dark modes.
- En proyecto existente: extrae los hex reales del código y guárdalos en
  `docs/design/project.md`; ese archivo gana sobre este catálogo.

---

### P1 — SaaS B2B claro
`--bg #F8FAFC · --surface #FFFFFF · --text #0F172A · --muted #64748B ·
--accent #1D4ED8 · --accent-contrast #FFFFFF · --border #E2E8F0`
Azul profundo deliberado (no el default de Tailwind). Base para tools y apps
de gestión. Combina con S1 / S5 en claro.

### P2 — SaaS dashboard oscuro
`--bg #0B1120 · --surface #141E33 · --text #E8EEF6 · --muted #93A4B8 ·
--accent #38BDF8 · --accent-contrast #08172A · --border #24324A ·
--support #34D399`
Tinte frío, elevación por capas, accent ciano con texto oscuro encima.
Combina con S4 / S5.

### P3 — Fintech trust
`--bg #FAFCFF · --surface #FFFFFF · --text #0B1B3A · --muted #5A6B87 ·
--accent #2A5BD7 · --accent-contrast #FFFFFF · --border #DCE4F0 ·
--support #0E9F6E`
Confianza + legibilidad financiera. Números tabulares obligatorios.
Combina con S7.

### P4 — Private banking / fintech premium oscuro
`--bg #0A0F1E · --surface #131A2E · --text #EEF2F8 · --muted #9AA7BC ·
--accent #C9A24B · --accent-contrast #211A08 · --border #232E4E`
Oro sobre azul noche. Cifras con serif display. Combina con S9 / S7.

### P5 — Healthcare
`--bg #F6FBF9 · --surface #FFFFFF · --text #14322B · --muted #6B7F78 ·
--accent #0F8A6D · --accent-contrast #FFFFFF · --border #DFEAE6`
Verde clínico calmado; contraste estricto (contexto regulatorio). Combina
con S7.

### P6 — E-commerce consumer
`--bg #FFFFFF · --surface #FFF8F3 · --text #201511 · --muted #8A7466 ·
--accent #E4572E · --accent-contrast #FFFFFF · --border #F0E4DC ·
--support #1B998B`
Cálido, conversión-first. El accent en CTA y precios, no en fondos.
Combina con S8.

### P7 — Luxury / premium
`--bg #FAF9F7 · --surface #FFFFFF · --text #191817 · --muted #8B8680 ·
--accent #8C6A4F · --accent-contrast #FFFFFF · --border #E8E5E0`
Bronze sobre neutros cálidos, whitespace extremo. Combina con S2 / S9.

### P8 — Marketing bold
`--bg #FFFDF5 · --surface #FFFFFF · --text #141414 · --muted #757063 ·
--accent #F04E23 · --accent-contrast #FFFFFF · --border #EAE3D3`
Para CTAs con texto ≥16px bold; para texto pequeño sube accent a #D63E14.
Combina con S3.

### P9 — Dev tool / terminal
`--bg #0D1117 · --surface #161B22 · --text #E6EDF3 · --muted #8B949E ·
--accent #3FB950 · --accent-contrast #07240F · --border #30363D`
Verde terminal sobre negro GitHub-like. Combina con S10 / S5.

### P10 — Educación / playful
`--bg #FFFFFF · --surface #F4F7FE · --text #1C2A4A · --muted #637190 ·
--accent #6C5CE7 · --accent-contrast #FFFFFF · --border #E3E9F5 ·
--support #F59E0B`
Violeta amigable + ámbar de refuerzo. Combina con S8.

### P11 — Travel / experiencias
`--bg #FAFCF9 · --surface #FFFFFF · --text #14343C · --muted #5F7480 ·
--accent #0E7C86 · --accent-contrast #FFFFFF · --border #DCE8EA ·
--support #F59E0B`
Teal profundo + sol. Fotografía como protagonista. Combina con S2.

### P12 — Portfolio / creative oscuro
`--bg #0E0E0E · --surface #171717 · --text #F5F5F0 · --muted #A6A6A6 ·
--accent #C8F135 · --accent-contrast #1A1F00 · --border #262626 ·
--support #FF7A45`
Verde ácido usado con cuentagotas (eyebrows, hover, selección). Combina con
S10 / S4.

### P13 — Minimal / Swiss
`--bg #FFFFFF · --surface #F7F7F5 · --text #111111 · --muted #757575 ·
--accent #D92B2B · --accent-contrast #FFFFFF · --border #E5E5E5`
Rojo suizo como único acento tipográfico. Combina con S1.

### P14 — Wellness / soft
`--bg #FDFBF8 · --surface #FFFFFF · --text #2A2E35 · --muted #7A838E ·
--accent #7C9070 · --accent-contrast #FFFFFF · --border #EEE9E2`
Sage calmado, tints no saturados, doble sombra suave. Combina con S6.

### P15 — Enterprise / gobierno
`--bg #F4F6F8 · --surface #FFFFFF · --text #1A2733 · --muted #5A6B7B ·
--accent #17456B · --accent-contrast #FFFFFF · --border #D9E0E6`
Navy sobrio, máxima legibilidad, cero sorpresas. Combina con S7 / S1.

---

## Cómo añadir una paleta nueva

Documéntala con el siguiente ID (P16…) respetando el mapa de vars, indica en
una línea para qué producto es y con qué estilo combina, y verifica
contraste de `--muted` sobre `--bg` y de `--accent-contrast` sobre
`--accent` antes de guardarla.
