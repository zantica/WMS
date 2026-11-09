# Reporte de Implementación: F4.2 — Autenticación JWT y Webhooks de Integración Externa (Correcciones de Re-auditoría)
- **Estado**: DONE
- **Fecha**: 2026-11-09

## Archivos Creados / Modificados / Eliminados

### Modificados:
- `packages/shared-types/src/index.ts`:
  - Se añade `allocationError?: string | undefined;` a `IngestExternalOrderResult` para reportar fallos en reserva sin abortar la creación del pedido.
  - Se añade `CONFIGURATION_ERROR` a `WmsErrorCode` para fallos de arranque/configuración crítica (ausencia de secreto en prod).
- `packages/db/prisma/schema.prisma`:
  - Se reemplaza `@@index([tenantId, externalId])` por `@@unique([tenantId, externalId])` en el modelo `SalesOrder` para garantizar unicidad e idempotencia estricta en base de datos.
- `apps/api/src/plugins/auth.ts`:
  - Hallazgo 1: En `NODE_ENV=production` se exige obligatoriamente `JWT_SECRET`; se prohíbe el secreto por defecto.
  - Hallazgo 2: Soporte dual `RS256` (Clerk con clave pública PEM/JWKS mediante `crypto.createVerify("RSA-SHA256")`) y `HS256` (secreto simétrico). Se elimina el uso de la clave pública de Clerk como secreto HMAC para prevenir ataques de *algorithm confusion*.
  - Hallazgo 3: Si el usuario/sub no existe en la base de datos, se valida que el `tenantId` exista en la tabla `tenants` (401 si no existe) y se fija estrictamente el rol en `OPERATOR` (se ignora cualquier claim `role: "ADMIN"` del token, impidiendo escalada de privilegios).
  - Hallazgo 4: El bypass `x-dev-tenant-id` solo se activa mediante opt-in explícito (`NODE_ENV === "development"` o `ALLOW_DEV_TENANT_HEADER === "true"`), desactivado si `NODE_ENV` está ausente o es producción.
  - Hallazgo 5: Se exige `exp` numérico finito y mayor al timestamp actual en `verifyJwtToken` (401 si falta o expira) y se valida `nbf`.
- `apps/api/src/use-cases/integrations/ingest-external-order.ts`:
  - Hallazgo 6: Captura del error `P2002` (Unique constraint failed) de Prisma en `salesOrder.create` para devolver replay idempotente `{ idempotentReplay: true, ... }` bajo carreras concurrentes TOCTOU.
  - Hallazgo 7: Manejo limpio de fallo en `allocateOrder` tras crear pedido (el pedido se retiene en estado `PENDING` y se reporta `allocationError: string` en el resultado en lugar de lanzar 409/500).
  - Hallazgo 14: Eliminados re-exports huérfanos `ExternalOrderLineInput` e `IngestExternalOrderResult`.
- `apps/api/src/use-cases/integrations/notify-order-shipped.ts`:
  - Hallazgo 9: Outbound webhook HTTP `fetch` protegido con `AbortSignal.timeout(5000)` para no bloquear el handler de despacho si el endpoint externo está caído. Secreto exigido en producción.
  - Hallazgo 11: Normalización de `shippedAt` soportando `Date`, string ISO y fallback automático a fecha actual.
  - Hallazgo 14: Eliminados re-exports huérfanos `OrderShippedWebhookLine` y `OrderShippedWebhookPayload`.
  - Corrección Pilar 2 / CP-7 (`progress/commit_F4.2_harness.md`): Eliminado el 100% de las lecturas de `process.env` en `notify-order-shipped.ts`. `resolveWebhookSecret`, `signWebhookPayload`, `verifyWebhookSignature` y `notifyOrderShipped` reciben `secret`, `webhookUrl` e `isProduction` exclusivamente por parámetros inyectados.
- `apps/api/src/routes/webhooks.ts`:
  - Hallazgo 8: Parser Fastify con `parseAs: "string"` que preserva `request.rawBody` verbatim para la verificación criptográfica HMAC exacta.
  - Validación de cabecera de firma `x-webhook-signature` obligatoria cuando `WEBHOOK_SHARED_SECRET` está configurado o en producción (401 si falta o no coincide).
  - Corrección Pilar 2 / CP-7: Inyección explícita de `sharedSecret` e `isProduction` en `verifyWebhookSignature`.
- `apps/api/src/routes/orders.ts`:
  - Hallazgo 10: Validación de params con Zod (`OrderParamsSchema`). Transición atómica a `SHIPPED` con `updateMany({ where: { id, tenantId, status: "PACKED" }, data: { status: "SHIPPED" } })` para prevenir doble dispatch concurrente.
  - Corrección Pilar 2 / CP-7: Lectura de `WEBHOOK_OUTBOUND_URL`, `WEBHOOK_SHARED_SECRET` y `NODE_ENV === "production"` en la capa de rutas e inyección explícita hacia `notifyOrderShipped`.
- `apps/api/src/use-cases/integrations/__tests__/webhooks.test.ts` y `apps/api/src/routes/__tests__/orders-dispatch.test.ts`:
  - Actualizados para probar los casos de `isProduction: true` / `false` y ausencia/presencia de `secret` y `webhookUrl` vía parámetros inyectados.
- `apps/api/src/routes/v1/__tests__/diagnostics.test.ts`:
  - Mocks de base de datos actualizados para simular usuarios aprovisionados acordes al endurecimiento de autenticación.
- `docs/adr/README.md`:
  - Indexado de ADR 003.

### Creados:
- `packages/db/prisma/migrations/20261109120000_sales_order_external_id_unique/migration.sql`:
  - Migración SQL que sustituye el índice normal por un índice único estricto `sales_orders_tenantId_externalId_key`.
- `apps/api/src/routes/__tests__/orders-dispatch.test.ts`:
  - Tests de integración de la ruta `POST /api/v1/orders/:id/dispatch` verificando atomicidad, bloqueo ante pedidos no-PACKED, 404 y llamada a webhook.
- `docs/adr/003-auth-and-webhook-integrations.md`:
  - ADR formal documentando las decisiones de autenticación híbrida (RS256 vs HS256), mitigación de confusión de algoritmos, degradación segura de privilegios y estrategia de idempotencia con captura de P2002.

## Decisiones de Diseño e Invariantes

1. **Aislamiento Multi-Tenant y Seguridad Criptográfica (CP-2)**:
   - Todo request autenticado valida `tenantId` en la BD (`prisma.tenant.findUnique`). Si el usuario no existe en la BD pero presenta un token firmado válido, se degrada a `OPERATOR` y jamás escala a `ADMIN` o `SUPERVISOR`.
   - Se mitiga por diseño el ataque de *Algorithm Confusion*: `CLERK_JWT_KEY` solo se utiliza como clave pública RSA con `createVerify("RSA-SHA256")`; nunca se introduce como secreto HMAC.
   - En producción, `JWT_SECRET` y `WEBHOOK_SHARED_SECRET` son obligatorios; no existen fallbacks permisivos.
2. **Integridad del Inventory Ledger (CP-1)**:
   - F4.2 no modifica saldos directamente ni hace `UPDATE`/`DELETE` sobre `inventory_transactions`. Toda reserva se delega a `allocateOrder` (que ejecuta transacciones `Serializable` con `SELECT FOR UPDATE`).
   - Si la reserva automática falla por falta de stock, el pedido se conserva en `PENDING` reportando `allocationError` al cliente sin corromper el balance ni las tareas de almacén.
3. **Idempotencia Estricta en Base de Datos (CP-3)**:
   - La restricción `@@unique([tenantId, externalId])` en `sales_orders` garantiza unicidad a nivel de motor PostgreSQL. La concurrencia TOCTOU se resuelve capturando el código Prisma `P2002` y devolviendo el pedido preexistente como `idempotentReplay: true`.
4. **Higiene del Monorepo (CP-6)**:
   - Se eliminaron todos los re-exports huérfanos sin consumidores en `ingest-external-order.ts` y `notify-order-shipped.ts`. Los consumidores importan directamente desde `@wms/shared-types`.

5. **Cero Envars en Código de Dominio / Casos de Uso (Pilar 2 / CP-7)**:
   - Ningún archivo en `apps/api/src/use-cases/**` ni `apps/api/src/ports/**` lee `process.env`. La configuración (`webhookUrl`, `secret`, `isProduction`) se resuelve en la capa de infraestructura/rutas (`orders.ts`, `webhooks.ts`) y se inyecta por parámetros explícitos.

## Resultados de Verificación (salida literal, no parafraseada)

### 1. `pnpm build`
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.9
   • Packages in scope: @wms/api, @wms/db, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 5 packages
   • Remote caching disabled

@wms/shared-types:build: cache hit, replaying logs 5c328c3713381138
@wms/shared-types:build: 
@wms/shared-types:build: > @wms/shared-types@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\shared-types
@wms/shared-types:build: > tsc
@wms/shared-types:build: 
@wms/db:build: cache hit, replaying logs bd1bcfdaabae77ac
@wms/db:build: 
@wms/db:build: > @wms/db@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\db
@wms/db:build: > tsc
@wms/db:build: 
@wms/mobile:build: cache hit, replaying logs 30ca077c4678ac24
@wms/api:build: cache miss, executing 53b4aa80b200a18c
@wms/mobile:build: 
@wms/mobile:build: > @wms/mobile@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\mobile
@wms/mobile:build: > tsc --noEmit
@wms/mobile:build: 
@wms/web:build: cache hit, replaying logs 75b583d11e3aa948
@wms/web:build: 
@wms/web:build: > @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
@wms/web:build: > tsc --noEmit
@wms/web:build: 
@wms/api:build: 
@wms/api:build: > @wms/api@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\api
@wms/api:build: > tsc && tsc-alias
@wms/api:build: 

 Tasks:    5 successful, 5 total
Cached:    4 cached, 5 total
  Time:    4.316s 
EXIT=0
```

### 2. `pnpm --filter @wms/api test:coverage`
```text
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 ↓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests | 3 skipped)
 ✓ src/use-cases/diagnostics/__tests__/diagnostics.test.ts (10 tests) 22ms
 ✓ src/use-cases/inventory/__tests__/cancel-order.test.ts (10 tests) 19ms
 ✓ src/use-cases/inventory/__tests__/allocate-order.test.ts (8 tests) 33ms
 ✓ src/use-cases/inventory/__tests__/create-putaway-task.test.ts (7 tests) 32ms
 ✓ src/use-cases/tasks/__tests__/confirm-task-step.test.ts (15 tests) 28ms
 ✓ src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts (10 tests) 21ms
 ✓ src/use-cases/inventory/__tests__/handle-picking-exception.test.ts (14 tests) 27ms
 ✓ src/use-cases/inventory/__tests__/move-stock.test.ts (8 tests) 20ms
 ✓ src/use-cases/security/__tests__/tenant-context.test.ts (16 tests) 44ms
 ✓ src/routes/__tests__/orders-dispatch.test.ts (4 tests) 76ms
 ✓ src/use-cases/integrations/__tests__/webhooks.test.ts (25 tests) 89ms
 ✓ src/routes/v1/__tests__/diagnostics.test.ts (6 tests) 102ms
 ✓ src/plugins/__tests__/auth.test.ts (25 tests) 216ms

 Test Files  13 passed | 1 skipped (14)
      Tests  158 passed | 3 skipped (161)
   Start at  00:13:33
   Duration  2.83s (transform 1.95s, setup 0ms, collect 9.06s, tests 729ms, environment 5ms, prepare 7.98s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |    99.4 |     91.7 |     100 |    99.4 |                   
 diagnostics       |   99.36 |    93.84 |     100 |   99.36 |                   
  ...tic-errors.ts |     100 |      100 |     100 |     100 |                   
  ...stic-error.ts |   97.29 |    63.63 |     100 |   97.29 | 34                
  ...-sensitive.ts |     100 |      100 |     100 |     100 |                   
 integrations      |     100 |    90.14 |     100 |     100 |                   
  ...rnal-order.ts |     100 |    94.87 |     100 |     100 | 123,200           
  ...er-shipped.ts |     100 |    84.37 |     100 |     100 | ...22,128,152,187 
 inventory         |   98.81 |    88.02 |     100 |   98.81 |                   
  ...cate-order.ts |   98.29 |       80 |     100 |   98.29 | 188-189           
  cancel-order.ts  |   98.64 |       90 |     100 |   98.64 | 214-215           
  ...taway-task.ts |   98.37 |     91.3 |     100 |   98.37 | 166-167           
  ...-exception.ts |   98.91 |    84.09 |     100 |   98.91 | 216,405-406       
  move-stock.ts    |     100 |      100 |     100 |     100 |                   
 security          |     100 |      100 |     100 |     100 |                   
  ...nt-context.ts |     100 |      100 |     100 |     100 |                   
 tasks             |     100 |    94.73 |     100 |     100 |                   
  ...ceipt-line.ts |     100 |    97.43 |     100 |     100 | 83                
  ...-task-step.ts |     100 |    92.85 |     100 |     100 | 106,174,281,305   
-------------------|---------|----------|---------|---------|-------------------
EXIT=0
```

### 3. `pnpm test` (Monorepo completo)
```text
> wms@0.0.1 test C:\Users\santi\Documents\projects\WMS
> turbo run test

   • turbo 2.11.9
   • Packages in scope: @wms/api, @wms/db, @wms/mobile, @wms/shared-types, @wms/web
   • Running test in 5 packages

@wms/mobile:test: 23 passed (23)
@wms/web:test: 11 passed (11)
@wms/api:test: 158 passed (158), 3 skipped (161)

 Tasks: 5 successful, 5 total
 Time: 3.104s
EXIT=0
```
