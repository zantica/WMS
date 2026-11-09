---
name: harness-orchestrator
description: >-
  Use this skill when implementing new features from feature_list.json, making changes to the
  WMS Inventory Ledger, or executing the Leader -> Implementer -> Reviewer subagent workflow in Antigravity.
---

# WMS Harness Orchestrator Skill (Antigravity)

Este skill es un **adaptador de entorno**: traduce el protocolo del harness a las herramientas nativas de Antigravity (`define_subagent` / `invoke_subagent`).

> **📌 El protocolo NO se define aquí.** La fuente única es [`.claude/agents/leader.md`](../../../.claude/agents/leader.md)
> (inicio de sesión, Tabla de Escalado, reglas duras, ciclo de 4 pasos y cierre). **Léelo primero** y síguelo al pie de la letra.
> Este archivo solo describe *cómo* lanzar los subagentes en Antigravity.

---

## Mecánica en Antigravity

### Subagente `implementer` (Paso 2 de `leader.md`)
1. Si aún no está definido en la conversación actual, llama a `define_subagent`:
   - `Name`: `"implementer"`
   - `Description`: `"Subagente que implementa features y tests en WMS SaaS y reporta en progress/impl_<id>.md"`
   - `EnableWriteTools`: `true`
   - `SystemPrompt`: el contenido de [`.claude/agents/implementer.md`](../../../.claude/agents/implementer.md).
2. `invoke_subagent` con `TypeName: "implementer"` y el prompt indicado en el Paso 2 de `leader.md`.

### Subagente `reviewer` (Paso 3 de `leader.md`)
1. Si no existe, `define_subagent`:
   - `Name`: `"reviewer"`
   - `Description`: `"Auditor independiente que valida código WMS contra CHECKPOINTS.md y reporta en progress/review_<id>.md"`
   - `EnableWriteTools`: `true` (para ejecutar tests y escribir `progress/review_<feature_id>.md`; **sin** editar `apps/` ni `packages/`)
   - `SystemPrompt`: el contenido de [`.claude/agents/reviewer.md`](../../../.claude/agents/reviewer.md).
2. `invoke_subagent` con `TypeName: "reviewer"` — **nunca reutilices la conversación del `implementer`** — y el prompt indicado en el Paso 3 de `leader.md`.

### Subagente `committer` (Paso 5 de `leader.md` o bajo demanda)
1. Si no existe en la conversación actual, llama a `define_subagent`:
   - `Name`: `"committer"`
   - `Description`: `"Subagente de Quality Gate (SOLID, cero envars en código, Arquitectura Hexagonal y suite completa de tests), commits atómicos por capa lógica y git push"`
   - `EnableWriteTools`: `true` (para ejecutar `pnpm build`, `pnpm test`, `pnpm --filter @wms/api test:coverage`, comandos `git` y escribir `progress/commit_<id>.md`)
   - `SystemPrompt`: el contenido de [`.claude/agents/committer.md`](../../../.claude/agents/committer.md).
2. `invoke_subagent` con `TypeName: "committer"` y el prompt indicado en el Paso 5 de `leader.md`.

### Iteración
- `CHANGES_REQUESTED` (del `reviewer`) o `REJECTED` (del `committer`): usa `send_message` al `implementer` existente (o relánzalo) con la ruta al reporte correspondiente en `progress/`.
- Si `invoke_subagent` falla por cuota o el usuario cancela un subagente: **no lo sustituyas tú**. Aplica la regla "Prohibido el self-review" de `leader.md`.
