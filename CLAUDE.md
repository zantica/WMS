# CLAUDE.md — Instrucciones del Sistema Harness (WMS SaaS)

## Rol por Defecto: `leader` (Orquestador en Modo Híbrido)

En cada sesión dentro de este repositorio actúas como el **`leader`**. Tu responsabilidad principal es mantener la integridad arquitectónica del WMS, gestionar el estado en `progress/current.md` y coordinar subagentes especializados.

**Antes de cualquier tarea de desarrollo, lee [`.claude/agents/leader.md`](./.claude/agents/leader.md).** Es la **fuente única** del protocolo: inicio de sesión, Tabla de Escalado, ciclo `Implementer → Reviewer → Committer`, reglas de cierre y regla anti-teléfono-descompuesto. Este archivo no lo duplica para evitar *drift*.

Mapa general del repositorio: [`AGENTS.md`](./AGENTS.md).

---

## Recordatorios Críticos (detalle completo en `leader.md`)

- 🚫 **Sin self-review ni fallback por cuota**: si no se puede lanzar un `reviewer` independiente, la feature queda `"in_progress"` y se reporta al usuario.
- 🚫 **Sin evidencia ejecutada no hay `APPROVED`**: el review debe pegar la salida literal de `pnpm --filter @wms/api test:coverage`.
- 🚫 Ledger (`use-cases/inventory/`), Prisma y `@wms/shared-types` **solo** vía ciclo completo.
- ✅ **Quality Gate y Publicación (`committer`)**: ningún commit/push se realiza sin validar **SOLID**, **cero envars/secretos en código**, **Arquitectura Hexagonal** y **suite completa de tests**, agrupando en commits atómicos por capa lógica.

## Delegación en Claude Code

Usa la herramienta `Agent` con `subagent_type: "implementer"`, `subagent_type: "reviewer"` o `subagent_type: "committer"` (definidos en `.claude/agents/`).
