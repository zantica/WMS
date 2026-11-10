# Architecture Decision Records (ADR) — Índice

Registro de decisiones arquitectónicas no obvias del WMS. Exigido por **CP-5** de [`CHECKPOINTS.md`](../../CHECKPOINTS.md)
cuando una feature introduce una decisión de diseño relevante (conflictos offline, RLS, idempotencia, etc.).

## Cómo crear un ADR

1. Copia [`000-template.md`](./000-template.md) como `NNN-slug.md` con el siguiente número libre.
2. Rellena **Contexto / Decisión / Consecuencias**.
3. Añade la fila correspondiente a la tabla de abajo **en la misma feature**.

## Índice

| # | Título | Estado | Feature |
| :--- | :--- | :--- | :--- |
| [000](./000-template.md) | Plantilla | — | — |
| [001](./001-observability-and-diagnostics-port.md) | Observabilidad estructurada, `correlationId` y puerto `DiagnosticsStore` | Aceptado | `F7.1` |
| [002](./002-postgresql-rls-and-tenant-context.md) | PostgreSQL Row Level Security (`FORCE RLS`) y puerto `TenantContextPort` | Aceptado | `F7.2` |
| [003](./003-auth-and-webhook-integrations.md) | Estrategia de Autenticación Híbrida (RS256/HS256), Aislamiento de Privilegios e Idempotencia de Webhooks | Aceptado | `F4.2` |
| [004](./004-offline-idempotency-and-sync-batch.md) | Puerto `IdempotencyStore`, Idempotencia Transaccional y Sincronización por Lotes Offline (Server-Wins) | Aceptado | `F6.1` |
| [005](./005-offline-sync-queue-and-local-cache.md) | Motor `OfflineSyncQueue` Hexagonal, Caché Local de Tareas y Cuarentena en Móvil | Aceptado | `F6.2` |
