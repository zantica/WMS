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
3. **Evaluar modo de ejecución (Modo Híbrido)**:
   - Sigue las reglas de orquestación en [`CLAUDE.md`](./CLAUDE.md) y [`.claude/agents/leader.md`](./.claude/agents/leader.md) (o el skill `.agents/skills/harness-orchestrator/SKILL.md` en Antigravity).

---

## 2. Mapa de Documentación (`docs/`)

| Documento | Cuándo leerlo | Contenido clave |
| :--- | :--- | :--- |
| [`docs/architecture.md`](./docs/architecture.md) | Antes de diseñar features, tocar Prisma o mover stock | Bounded Contexts (Catálogo, Ledger Inmutable, Fulfillment), reglas del monorepo Turborepo e invariantes de dominio. |
| [`docs/conventions.md`](./docs/conventions.md) | Antes de escribir o revisar código en `apps/` o `packages/` | ESM (`NodeNext` con extensión `.js`), manejo de errores con `WmsError`, validación Zod, contratos `ApiResponse<T>` y aislamiento `tenantId`. |
| [`docs/verification.md`](./docs/verification.md) | Antes de dar por terminada una implementación o revisión | Comandos de test (`pnpm test`), umbrales de cobertura Vitest (≥80% en `use-cases`), chequeo de tipos y pruebas de humo. |
| [`CHECKPOINTS.md`](./CHECKPOINTS.md) | Durante la fase de *Review* o antes de marcar `"done"` | Lista de control objetiva de calidad, seguridad multi-tenant y consistencia contable del Ledger. |

---

## 3. Arquitectura de Subagentes y Memoria en Disco

Para evitar degradar la ventana de contexto (*context rot*) y prevenir el "teléfono descompuesto":

- **Roles disponibles**:
  - **Leader (Orquestador Híbrido)**: Coordina el plan en [`progress/current.md`](./progress/current.md). Puede aplicar fixes pequeños (<20 líneas, docs o configuración) directamente, pero delega features nuevas, cambios multi-archivo o lógica crítica del Ledger.
  - **Implementer**: Implementa una feature específica + sus tests y escribe su reporte técnico en `progress/impl_<feature_id>.md`.
  - **Reviewer**: Audita el código contra [`CHECKPOINTS.md`](./CHECKPOINTS.md) y [`docs/architecture.md`](./docs/architecture.md), ejecuta los tests de forma independiente y escribe su veredicto (`APPROVED` / `CHANGES_REQUESTED`) en `progress/review_<feature_id>.md`.
- **Regla Anti-Teléfono-Descompuesto**:
  - Todo subagente (exploración, implementación o revisión) **escribe su resultado detallado en `progress/`** y devuelve al agente principal únicamente la ruta del archivo generado y un resumen ejecutivo de 3–5 líneas.
