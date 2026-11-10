---
name: harness-orchestrator
description: >-
  Use this skill when implementing new features from feature_list.json, making changes to the
  WMS Inventory Ledger, or executing the Leader -> Implementer -> Reviewer subagent workflow in Antigravity.
---

# WMS Harness Orchestrator Skill (Antigravity)

Este skill es un **adaptador de entorno**: traduce el protocolo del harness a las herramientas nativas de Antigravity (`define_subagent` / `invoke_subagent`), aplicando **Model Tiering** y **optimización estricta de tokens**.

> **📌 El protocolo NO se define aquí.** La fuente única es [`.claude/agents/leader.md`](../../../.claude/agents/leader.md)
> (inicio de sesión, Tabla de Escalado, reglas duras, ciclo de 4 pasos y cierre). **Léelo primero** y síguelo al pie de la letra.
> Este archivo describe *cómo* lanzar los subagentes en Antigravity y cómo optimizar el consumo de tokens.

---

## 1. Política de Model Tiering (Ahorro de Tokens)

Al invocar subagentes en Antigravity con `invoke_subagent`, usa **siempre** el tier de modelo adecuado para evitar multiplicar costes de ventana de contexto:

| Rol / Subagente | `Model` en `invoke_subagent` | Justificación |
| :--- | :--- | :--- |
| **`implementer`** | `flash` *(default)* \| `inherit` *(solo ledger/algoritmos críticos)* | TDD, tipado y código modular resueltos eficientemente con modelo rápido. |
| **`reviewer`** | `flash` *(estricto)* | Auditoría contra checklists, diffs y ejecución de tests; no requiere modelo Flagship. |
| **`committer`** | `flash` *(estricto)* | Quality Gate, ejecución de suites y empaquetado git; puramente determinista y mecánico. |
| **`research` / `explore`** | `flash_lite` o `flash` | Búsquedas, inspección de árbol y lectura selectiva de ficheros. |

---

## 2. Mecánica en Antigravity

### Subagente `implementer` (Paso 2 de `leader.md`)
1. Si aún no está definido en la conversación actual, llama a `define_subagent`:
   - `Name`: `"implementer"`
   - `Description`: `"Subagente que implementa features y tests en WMS SaaS y reporta en progress/impl_<id>.md"`
   - `EnableWriteTools`: `true`
   - `SystemPrompt`: el contenido de [`.claude/agents/implementer.md`](../../../.claude/agents/implementer.md).
2. `invoke_subagent` con:
   - `TypeName`: `"implementer"`
   - `Model`: `"flash"` (o `"inherit"` si involucra transacciones complejas de Ledger / concurrencia crítica)
   - `Role`: `"Feature Implementer"`
   - `Prompt`: el indicado en el Paso 2 de `leader.md`.

### Subagente `reviewer` (Paso 3 de `leader.md`)
1. Si no existe, `define_subagent`:
   - `Name`: `"reviewer"`
   - `Description`: `"Auditor independiente que valida código WMS contra CHECKPOINTS.md y reporta en progress/review_<id>.md"`
   - `EnableWriteTools`: `true` (para ejecutar tests y escribir `progress/review_<feature_id>.md`; **sin** editar `apps/` ni `packages/`)
   - `SystemPrompt`: el contenido de [`.claude/agents/reviewer.md`](../../../.claude/agents/reviewer.md).
2. `invoke_subagent` con:
   - `TypeName`: `"reviewer"` — **nunca reutilices la conversación del `implementer`**
   - `Model`: `"flash"`
   - `Role`: `"Quality Reviewer"`
   - `Prompt`: el indicado en el Paso 3 de `leader.md`.

### Subagente `committer` (Paso 5 de `leader.md` o bajo demanda)
1. Si no existe en la conversación actual, llama a `define_subagent`:
   - `Name`: `"committer"`
   - `Description`: `"Subagente de Quality Gate (SOLID, cero envars en código, Arquitectura Hexagonal y suite completa de tests), commits atómicos por capa lógica y git push"`
   - `EnableWriteTools`: `true` (para ejecutar `pnpm build`, `pnpm test`, `pnpm --filter @wms/api test:coverage`, comandos `git` y escribir `progress/commit_<id>.md`)
   - `SystemPrompt`: el contenido de [`.claude/agents/committer.md`](../../../.claude/agents/committer.md).
2. `invoke_subagent` con:
   - `TypeName`: `"committer"`
   - `Model`: `"flash"`
   - `Role`: `"Git Committer & Quality Gate"`
   - `Prompt`: el indicado en el Paso 5 de `leader.md`.

### Iteración
- `CHANGES_REQUESTED` (del `reviewer`) o `REJECTED` (del `committer`): usa `send_message` al `implementer` existente (o relánzalo) con la ruta al reporte correspondiente en `progress/`.
- Si `invoke_subagent` falla por cuota o el usuario cancela un subagente: **no lo sustituyas tú**. Aplica la regla "Prohibido el self-review" de `leader.md`.
