# Reporte de Implementación: F4.2 — Autenticación JWT (Clerk) y Webhooks de Integración Externa

- **Estado**: DONE
- **Fecha**: 2026-10-26
- **Nota**: El subagente `implementer` fue cancelado por el usuario con el código de producción ya escrito; el `leader` completó las dos suites de tests y este reporte.

## Archivos Creados / Modificados
- `packages/shared-types/src/index.ts`: Nuevos contratos `ExternalOrderLineInput`, `IngestExternalOrderInput`, `IngestExternalOrderResult`, `OrderShippedWebhookLine`, `OrderShippedWebhookPayload` (sin dependencias de Prisma).
- `apps/api/src/plugins/auth.ts`: Verificación real de JWT HS256 (`node:crypto`, `timingSafeEqual`, `exp`, `alg`), normalización de claims (`sub`/`clerkId`/`userId`, `tenantId`/`tenant_id`/`org_id`, `role`), lookup de `User` por `clerkId` (rechazo de inactivos y `TENANT_MISMATCH`), `x-api-key` → rol `ADMIN`, helpers `createJwtToken` / `verifyJwtToken` y guard `requireRole(...)` (403).
- `apps/api/src/use-cases/integrations/ingest-external-order.ts`: Ingesta idempotente por `(tenantId, externalId)`, resolución de productos por `productId` o `sku` dentro del tenant, `autoAllocate` vía `allocateOrder`.
- `apps/api/src/use-cases/integrations/notify-order-shipped.ts`: Payload `order.shipped`, firma `sha256=<hex>` (`signWebhookPayload` / `verifyWebhookSignature`), envío tolerante a fallos a `webhookUrl` / `WEBHOOK_OUTBOUND_URL`.
- `apps/api/src/routes/webhooks.ts`: `POST /api/v1/webhooks/orders` (Zod, `requireRole("ADMIN","SUPERVISOR")`, firma opcional `x-webhook-signature` si `WEBHOOK_SHARED_SECRET`, `200` replay / `201` nuevo).
- `apps/api/src/server.ts`: Registro de `webhookRoutes` en `/api/v1/webhooks`.
- `apps/api/src/routes/orders.ts`: `POST /:id/dispatch` invoca `notifyOrderShipped` (sustituye el `TODO Hito 4`) y devuelve `webhookDelivered`.
- `apps/api/src/plugins/__tests__/auth.test.ts`: 17 tests (emisión/verificación JWT, firma alterada, expiración, alg `none`, rol inválido, `requireRole`, hook con `x-api-key`, usuario activo/inactivo, tenant mismatch, fallback a claims, ausencia de tenant, integración guard + hook vía `app.inject`).
- `apps/api/src/use-cases/integrations/__tests__/webhooks.test.ts`: 15 tests (alta por SKU y `productId`, idempotencia, `autoAllocate`, warehouse/producto de otro tenant, validaciones, firma HMAC, `notifyOrderShipped` skipped / OK / env URL / HTTP 500 / error de red).

## Decisiones de Diseño e Invariantes
- **Multi-tenancy**: Toda consulta de ingesta filtra por `tenantId`; el tenant del JWT debe coincidir con el del `User` en BD.
- **Ledger**: La ingesta no toca saldos; la reserva se delega en `allocateOrder` (Serializable + `FOR UPDATE`). El despacho local se confirma aunque el webhook saliente falle.
- **Compatibilidad**: `x-api-key` sigue funcionando para la app móvil y el dashboard web.

## Limitaciones Conocidas
- La firma del webhook entrante se verifica sobre `JSON.stringify(request.body)` (no el raw body original). Para proveedores que firmen el cuerpo exacto (Shopify) habrá que capturar el raw body con un `contentTypeParser` dedicado.
- El despacho y la notificación no son transaccionales (sin outbox); un fallo de entrega solo queda reflejado en `webhookDelivered: false`.

## Resultados de Verificación
- Verificación estática de tipos e imports `.js`. No se pudo ejecutar `pnpm test` desde el runner (sin `powershell` en PATH): **pendiente de ejecución local** con `pnpm --filter @wms/api test:coverage`.
