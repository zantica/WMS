# UI/UX Design System — Skill Híbrido

Guía y catálogo de diseño para la creación, maquetación y refactorización de interfaces en React + Tailwind CSS para WMS SaaS.

## Activación para Agentes

> **Línea de activación para el agente Leader / Implementer:**  
> *"Antes de cualquier tarea de UI, lee `docs/design/SKILL.md` (o la skill `.agents/skills/uiux-design-system/SKILL.md`) y síguelo."*

---

## Estructura y Mapa de Archivos

```
docs/design/
├── SKILL.md                          # Núcleo: 3 fases (Plan tokens -> Build -> Autocrítica)
├── README.md                         # Este archivo
└── references/                       # Catálogo curado (progressive disclosure)
    ├── styles.md                     # Catálogo de estilos (S1–S10) con tokens reales
    ├── palettes.md                   # Paletas semánticas por tipo de producto (P1–P15)
    ├── typography.md                 # Pairings tipográficos (T1–T12), escala e imports
    ├── anti-patterns.md              # Anti-patrones visuales y de interacción
    └── checklist.md                  # Checklist de entrega previa a Fase 3
```

---

## Las 3 Fases de Diseño

1. **Fase 1 — Plan de diseño (tokens)**:
   Antes de codificar, se declara el bloque `## Design tokens` especificando Estilo (S1–S10), Paleta semántica (P1–P15), Tipografía (T1–T12) y el Elemento Memorable.
2. **Fase 2 — Build (React + Tailwind)**:
   Tokens en variables CSS (`globals.css`), Tailwind mapeado a variables, cero hex crudos en `className`, variantes con `cva`, accesibilidad ≥4.5:1, micro-interacciones disciplinadas.
3. **Fase 3 — Autocrítica**:
   Verificación contra `references/checklist.md` en viewport móvil (375px), tablet (768px) y desktop (1440px).

---

## Disponibilidad en Antigravity

El sistema está disponible de forma dual:
1. **Como Skill nativa de Antigravity**: En `.agents/skills/uiux-design-system/` para descubrimiento automático en el entorno.
2. **Como documentación del repositorio**: En `docs/design/` para consulta directa de subagentes y desarrolladores humanos.
