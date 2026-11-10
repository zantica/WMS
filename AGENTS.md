# AGENTS.md — Mapa de Navegación del Harness (WMS SaaS)

Este repositorio utiliza un sistema de **Harness Engineering con Subagentes** basado en revelación progresiva (*progressive disclosure*) y memoria en disco (`progress/`). No cargues toda la documentación de golpe; lee únicamente los archivos necesarios según la tarea actual.

---

## 1. Protocolo de Arranque (Pre-Flight Obligatorio)

Antes de modificar cualquier archivo de código en `apps/` o `packages/`:

1. **Verificar salud del entorno**:
   - En Bash / Git Bash / WSL: `./init.sh`
   - En Windows PowerShell: `.\init.ps1`
   - *Si la verificación base falla, detente y repórtalo antes de iniciar una nueva feature.*
2. **Revisar estado actual**:
   - Lee [`progress/current.md`](./progress/current.md) para conocer el contexto de la sesión activa.
   - Consulta [`feature_list.json`](./feature_list.json) y selecciona **una única feature** en estado `"pending"` (o continúa la que esté `"in_progress"`).
3. **Seguir el protocolo de orquestación**:
   - La **fuente única** del protocolo (Tabla de Escalado, ciclo Implementer → Reviewer, reglas de cierre) es [`.claude/agents/leader.md`](./.claude/agents/leader.md).
   - [`CLAUDE.md`](./CLAUDE.md) (Claude Code) y [`.agents/skills/harness-orchestrator/SKILL.md`](./.agents/skills/harness-orchestrator/SKILL.md) (Antigravity) solo apuntan a él y añaden la mecánica de cada entorno.

---

## 2. Mapa de Documentación

| Documento | Cuándo leerlo | Contenido clave |
| :--- | :--- | :--- |
| [`KNOWLEDGE.md`](./KNOWLEDGE.md) | Antes de tocar código (siempre) | Memoria viva: filosofía, decisiones vigentes, bugs con lección, patrones prohibidos/obligatorios, glosario. |
| [`docs/architecture.md`](./docs/architecture.md) | Antes de diseñar features, tocar Prisma o mover stock | Bounded Contexts (Catálogo, Ledger Inmutable, Fulfillment), reglas del monorepo Turborepo e invariantes de dominio. |
| [`docs/conventions.md`](./docs/conventions.md) | Antes de escribir o revisar código en `apps/` o `packages/` | ESM (`NodeNext` con extensión `.js`), manejo de errores con `WmsError`, validación Zod, contratos `ApiResponse<T>` y aislamiento `tenantId`. |
| [`docs/verification.md`](./docs/verification.md) | Antes de dar por terminada una implementación o revisión | Comandos de test (`pnpm test`), umbrales de cobertura Vitest (≥80% en `use-cases`), chequeo de tipos y evidencia exigida en reportes. |
| [`CHECKPOINTS.md`](./CHECKPOINTS.md) | Durante la fase de *Review*, *Quality Gate* o antes de marcar `"done"` | CP-1 a CP-7: Ledger, multi-tenant, contratos, tests con evidencia, hexagonal/ADR, higiene del código, SOLID y cero envars en código. |
| [`docs/adr/`](./docs/adr/README.md) | Al introducir una decisión arquitectónica no obvias (CP-5) | Índice de ADRs y plantilla [`000-template.md`](./docs/adr/000-template.md) (Contexto / Decisión / Consecuencias). |
| [`docs/design/SKILL.md`](./docs/design/SKILL.md) | Antes de diseñar, maquetar o modificar componentes UI (`apps/web`, `apps/mobile`) | Sistema UI/UX React + Tailwind: plan de tokens (S1–S10, P1–P15, T1–T12), anti-patrones y checklist. |
| [`docs/hitos/`](./docs/hitos/README.md) | **Solo** si investigas el porqué histórico de un módulo | Guías archivadas de hitos cerrados (no se cargan por defecto). |

---

## 3. Arquitectura de Subagentes y Memoria en Disco

Para evitar degradar la ventana de contexto (*context rot*) y prevenir el "teléfono descompuesto":

- **Roles disponibles** (definición completa en `.claude/agents/`):
  - **Leader** ([`leader.md`](./.claude/agents/leader.md)): orquesta y mantiene `progress/current.md`. Aplica fixes menores directamente; delega features, cambios multi-archivo y lógica crítica del Ledger. **Nunca revisa su propio trabajo.**
  - **Implementer** ([`implementer.md`](./.claude/agents/implementer.md)): implementa una feature + tests y escribe `progress/impl_<feature_id>.md` (`DONE` | `BLOCKED`).
  - **Reviewer** ([`reviewer.md`](./.claude/agents/reviewer.md)): agente independiente que audita contra [`CHECKPOINTS.md`](./CHECKPOINTS.md), ejecuta los tests por su cuenta y escribe `progress/review_<feature_id>.md` (`APPROVED` | `CHANGES_REQUESTED` | `BLOCKED`). Sin evidencia ejecutada pegada en el reporte, no hay `APPROVED`.
  - **Committer** ([`committer.md`](./.claude/agents/committer.md)): agente de Quality Gate final que verifica los 4 Pilares de Calidad (**SOLID**, **cero envars/secretos en el código**, **Arquitectura Hexagonal** y **suite completa de tests**), divide los cambios en **commits pequeños y atómicos por capa lógica**, ejecuta `git push` y escribe `progress/commit_<id>.md` (`PUBLISHED` | `REJECTED` | `BLOCKED`).
- **Regla Anti-Teléfono-Descompuesto**:
  - Todo subagente (exploración, implementación, revisión o publicación) **escribe su resultado detallado en `progress/`** y devuelve al agente principal únicamente la ruta del archivo generado y un resumen ejecutivo de 3–5 líneas.

---

## 4. Política de Ahorro y Eficiencia de Tokens (Model Tiering y Contexto)

Para evitar la inflación acelerada de tokens y costes en sesiones largas:

1. **Model Tiering en Subagentes**:
   - `leader`: modelo superior (`pro` / `Sonnet`) para diseño arquitectónico y coordinación global.
   - `implementer`: `flash` (o `inherit` solo en cambios de concurrencia/Ledger de alta complejidad).
   - `reviewer`: `flash` (auditoría contra checklist y ejecución de tests).
   - `committer`: `flash` (Quality Gate, compilación y empaquetado git).
   - `research` / `explore`: `flash_lite` o `flash`.
2. **Tests Enfocados en TDD**:
   - Durante la implementación activa, el `implementer` solo ejecuta el archivo de test específico con salida compacta (`pnpm vitest run <archivo.test.ts> --reporter=basic`). La suite global y el cálculo de cobertura (`--coverage`) se ejecutan una única vez al final para la validación de cierre.
3. **Lectura Quirúrgica y Carga Perezosa**:
   - Prohibido volcar toda la documentación de golpe en el arranque.
   - En archivos de código de más de 80 líneas, usar delimitadores `StartLine` y `EndLine`.
4. **Ciclo de Conversación**:
   - Al cerrar una feature, compactar el contexto con `/compact` o abrir una nueva conversación para evitar la acumulación de historial en caché.
