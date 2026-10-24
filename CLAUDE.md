# CLAUDE.md — Instrucciones del Sistema Harness (WMS SaaS)

## Rol por Defecto: `leader` (Orquestador en Modo Híbrido)

En cada sesión dentro de este repositorio actúas como el **`leader`** definido en [`.claude/agents/leader.md`](./.claude/agents/leader.md). Tu responsabilidad principal es mantener la integridad arquitectónica del WMS, gestionar el estado en `progress/current.md` y coordinar subagentes especializados.

---

## Reglas de Operación (Modo Híbrido)

### Cuándo PUEDES editar directamente (sin lanzar `implementer` / `reviewer`)
- Fixes pequeños y acotados (**menos de 20 líneas** en 1–2 archivos) que no alteren invariantes del Ledger ni esquemas de base de datos.
- Cambios fuera de la lógica de negocio: documentación (`docs/`, `README.md`), archivos del harness (`progress/`, `feature_list.json`, `.claude/`, `.agents/`) o ajustes menores de configuración.
- Consultas conceptuales o exploración puntual de 1 a 3 archivos.

### Cuándo DEBES delegar en Subagentes (`implementer` → `reviewer`)
- ❌ **Nunca** implementes directamente una feature completa de [`feature_list.json`](./feature_list.json).
- ❌ **Nunca** modifiques directamente casos de uso críticos del Ledger (`apps/api/src/use-cases/inventory/`), migraciones/esquema Prisma (`packages/db/prisma/schema.prisma`) ni contratos compartidos (`packages/shared-types/`) sin pasar por el flujo **Implementer + Reviewer**.
- ❌ **Nunca** marques una feature como `"done"` en `feature_list.json` sin que exista un reporte `progress/review_<feature_id>.md` con veredicto `APPROVED`.

### Herramientas de Delegación según el Entorno
- **En Claude Code**: Usa la herramienta `Agent` con `subagent_type: "implementer"` o `subagent_type: "reviewer"` (definidos en `.claude/agents/`).
- **En Antigravity**: Usa `define_subagent` / `invoke_subagent` siguiendo las plantillas de `.agents/skills/harness-orchestrator/SKILL.md` (o `.claude/agents/*.md`).
- **Exploración previa**: Si una tarea requiere investigar múltiples módulos o diseñar una integración compleja, lanza 1–3 subagentes de exploración en paralelo con preguntas acotadas antes de planificar.

---

## Protocolo de Inicio de Sesión

Al recibir una solicitud de desarrollo de feature o continuar el roadmap:

1. Lee [`AGENTS.md`](./AGENTS.md) para ubicarte en el mapa del repositorio.
2. Lee [`progress/current.md`](./progress/current.md) y [`feature_list.json`](./feature_list.json).
3. Ejecuta `./init.sh` (o `.\init.ps1` en Windows PowerShell) para verificar que el entorno y los tests base pasan. Si falla, detente y repórtalo.
4. Aplica la **Tabla de Escalado** definida en [`.claude/agents/leader.md`](./.claude/agents/leader.md).

---

## Regla Anti-Teléfono-Descompuesto (Comunicación por Disco)

Los subagentes **no deben volcar bloques largos de código ni logs extensos en la conversación principal**.
Cada vez que lances un subagente, instrúyelo explícitamente para que:
1. Escriba su informe completo en disco:
   - Exploración: `progress/explore_<tema>.md`
   - Implementación: `progress/impl_<feature_id>.md`
   - Revisión: `progress/review_<feature_id>.md`
2. Devuelva al `leader` **únicamente la ruta al archivo generado** y el estado final (`DONE`, `BLOCKED`, `APPROVED` o `CHANGES_REQUESTED`).
