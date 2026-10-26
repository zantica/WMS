# Estado Actual de la Sesión (`progress/current.md`)

- **Última actualización**: 2026-10-26
- **Estado General**: 🏆 **¡TODOS LOS HITOS COMPLETADOS (100%)!**
- **Hitos Finalizados**:
  - ✅ **Hito 1 — Esqueleto + Ledger** (`F1.1`, `F1.2`, `F1.3` en `done`)
  - ✅ **Hito 2 — App Expo + Inbound + Putaway** (`F2.1`, `F2.2`, `F2.3`, `F2.4` en `done`)
  - ✅ **Hito 3 — Motor de Pedidos + Picking** (`F3.1`, `F3.2`, `F3.3` en `done`)
  - ✅ **Hito 4 — Panel Web + Integración External** (`F4.1`, `F4.2` en `done`)

---

## Resumen de Cierre del Hito 4 (`F4.1`, `F4.2`)
1. **`F4.1` — Esqueleto del Dashboard Web en `apps/web` (Next.js App Router + `@wms/shared-types`)**:
   - Implementación: [`progress/impl_F4.1.md`](./impl_F4.1.md) | Revisión: [`progress/review_F4.1.md`](./review_F4.1.md) (`APPROVED`)
   - Vistas: Resumen Ejecutivo (`/`), Catálogo y Mapa de Ubicaciones (`/catalog`), Balances y Kardex (`/inventory`), Monitor de Pedidos y Tareas (`/operations`).
   - Módulos probados: `api-client.ts` y `dashboard-metrics.ts` con cobertura en `src/lib/__tests__/`.

2. **`F4.2` — Autenticación JWT (Clerk) y Webhooks de Integración Externa (E-commerce / ERP)**:
   - Implementación: [`progress/impl_F4.2.md`](./impl_F4.2.md) | Revisión: [`progress/review_F4.2.md`](./review_F4.2.md) (`APPROVED`)
   - Validación JWT HS256, expiración, verificación de firma con `timingSafeEqual`, roles y guard `requireRole`.
   - Ingesta de pedidos con idempotencia por `(tenantId, externalId)` (`POST /api/v1/webhooks/orders`).
   - Notificación de despacho con firma HMAC `order.shipped` en `POST /api/v1/orders/:id/dispatch`.
   - 32 tests unitarios en `auth.test.ts` y `webhooks.test.ts`.
