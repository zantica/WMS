---
name: harness-orchestrator
description: >-
  Use this skill when implementing new features from feature_list.json, making changes to the
  WMS Inventory Ledger, or executing the Leader -> Implementer -> Reviewer subagent workflow in Antigravity.
---

# WMS Harness Orchestrator Skill (Antigravity)

Este skill conecta el flujo de **Harness Engineering con Subagentes** (`leader` → `implementer` → `reviewer`) con las herramientas nativas de subagentes de Antigravity (`define_subagent` e `invoke_subagent`).

## Cuándo activar este flujo (Modo Híbrido)
- **Fixes menores (<20 líneas, docs, configs)** que no toquen `apps/api/src/use-cases/inventory/`, `schema.prisma` ni `@wms/shared-types`: el agente principal puede realizarlos directamente y verificar con `pnpm test`.
- **Nuevas features de [`feature_list.json`](../../../feature_list.json) o cambios en el Ledger/DB**: ejecuta siempre el protocolo de 4 pasos de abajo.

---

## Paso 1: Pre-Flight y Planificación (`Leader`)
1. Verifica el estado base ejecutando `.\init.ps1` (o `./init.sh`).
2. Lee [`progress/current.md`](../../../progress/current.md) y selecciona **una** feature `"pending"` de [`feature_list.json`](../../../feature_list.json).
3. Marca la feature como `"in_progress"` en `feature_list.json` y actualiza `progress/current.md`.

## Paso 2: Definir e Invocar al Subagente `implementer`
1. Si aún no está definido en la conversación actual, llama a `define_subagent`:
   - `Name`: `"implementer"`
   - `Description`: `"Subagente que implementa features y tests en WMS SaaS y reporta en progress/impl_<id>.md"`
   - `EnableWriteTools`: `true`
   - `SystemPrompt`: Usa las instrucciones de [`.claude/agents/implementer.md`](../../../.claude/agents/implementer.md).
2. Invoca `invoke_subagent` con `TypeName: "implementer"`, indicándole el ID de la feature, los archivos de referencia (`docs/architecture.md`, `docs/conventions.md`, `docs/verification.md`) y que escriba su informe en `progress/impl_<feature_id>.md` devolviendo únicamente la ruta.

## Paso 3: Definir e Invocar al Subagente `reviewer`
1. Una vez completado el `implementer`, define (si no existe) el subagente `reviewer` con `define_subagent`:
   - `Name`: `"reviewer"`
   - `Description`: `"Auditor independiente que valida código WMS contra CHECKPOINTS.md y reporta en progress/review_<id>.md"`
   - `EnableWriteTools`: `true` (para ejecutar tests y escribir `progress/review_<feature_id>.md`, sin editar `apps/` ni `packages/`)
   - `SystemPrompt`: Usa las instrucciones de [`.claude/agents/reviewer.md`](../../../.claude/agents/reviewer.md).
2. Invoca `invoke_subagent` con `TypeName: "reviewer"`, pasándole `progress/impl_<feature_id>.md` y [`CHECKPOINTS.md`](../../../CHECKPOINTS.md).

## Paso 4: Cierre o Iteración
- Si `progress/review_<feature_id>.md` indica `CHANGES_REQUESTED`, envía un mensaje o relanza a `implementer` con la ruta al reporte de revisión.
- Si indica `APPROVED`, actualiza `feature_list.json` a `"done"`, añade la entrada en [`progress/history.md`](../../../progress/history.md) y actualiza [`progress/current.md`](../../../progress/current.md).
