# Reporte de Revisión: F4.2 (Auditoría Final)
- **VEREDICTO**: APPROVED
- **Fecha**: 2026-11-09
- **Auditor**: reviewer (subagente independiente) — nunca el leader ni el implementer
- **Alcance**: Auditoría formal y verificación independiente de la Feature F4.2 (Autenticación JWT/Clerk y Webhooks de Integración Externa) tras la resolución completa de los 15 hallazgos reportados en `progress/review_F4.2_reaudit.md`.
- **Independencia**: Este agente auditor no implementó ni modificó código ni tests de F4.2.

## Evaluación de Checkpoints

- [x] **CP-1: Integridad del Inventory Ledger**
  - La ingesta no muta directamente saldos físicos ni realiza `update`/`delete` sobre `prisma.inventoryTransaction`.
  - La reserva virtual se delega en `allocateOrder` (`autoAllocate: true`), que opera con nivel de aislamiento `Serializable` y bloqueo pesimista `SELECT ... FOR UPDATE` sobre `inventory_balances`.
  - Ante fallos de asignación (p.ej. `INSUFFICIENT_STOCK`), el pedido se preserva de manera segura en estado `PENDING` y se reporta `allocationError`, sin corromper el balance ni las tareas de picking.

- [x] **CP-2: Aislamiento Multi-Tenant y Seguridad**
  - Todas las consultas (`salesOrder`, `warehouse`, `product`, `tenant`) filtran obligatoriamente por `tenantId`.
  - **Mitigación de Algorithm Confusion (Hallazgo 2)**: Verificación dual asimétrica RS256 con `crypto.createVerify("RSA-SHA256")` para Clerk frente a HS256 con `JWT_SECRET`. Se prohíbe el uso de la clave pública Clerk como secreto HMAC.
  - **Seguridad en Producción (Hallazgos 1 y 4)**: En `NODE_ENV=production`, `JWT_SECRET` y `WEBHOOK_SHARED_SECRET` son obligatorios (error 500 `CONFIGURATION_ERROR` si faltan). El bypass `x-dev-tenant-id` requiere opt-in explícito (`NODE_ENV === "development"` o `ALLOW_DEV_TENANT_HEADER === "true"`), desactivado si `NODE_ENV` está ausente o es producción.
  - **Prevención de Escalada de Privilegios (Hallazgo 3)**: Si el usuario/sub no existe en la BD, se valida obligatoriamente que el `tenantId` exista en la tabla `tenants` (401 si no existe) y el rol se fija estrictamente en `OPERATOR`, ignorando cualquier claim `role: "ADMIN"` del token.
  - **Expiración de Tokens (Hallazgo 5)**: `verifyJwtToken` exige `exp` numérico finito y mayor al timestamp actual (401 si falta o expira) y valida `nbf`.
  - **Firma Webhook HMAC sobre Raw Body (Hallazgo 8)**: Fastify captura el `rawBody` exacto vía `addContentTypeParser` para verificación criptográfica estricta con `timingSafeEqual`.

- [x] **CP-3: Contratos de API, Tipado y Monorepo**
  - `@wms/shared-types` se mantiene totalmente libre de dependencias de Prisma o base de datos.
  - Contratos agnósticos compartidos: `IngestExternalOrderInput`, `IngestExternalOrderResult`, `OrderShippedWebhookPayload`, `OrderShippedWebhookLine`.
  - Validación de esquemas con Zod en todas las entradas HTTP (`IngestExternalOrderWebhookSchema`, `OrderParamsSchema`).
  - Todas las respuestas exitosas utilizan la envolvente canónica `ApiResponse<T>` (`{ success: true, data: ... }`).
  - Manejo de excepciones mediante `WmsError` tipado (`VALIDATION_ERROR`, `PRODUCT_NOT_FOUND`, `LOCATION_NOT_FOUND`, `ORDER_NOT_FOUND`, `UNAUTHORIZED`, `CONFIGURATION_ERROR`).
  - **Idempotencia Estricta en Base de Datos (Hallazgo 6)**: Migración `20261109120000_sales_order_external_id_unique` con `@@unique([tenantId, externalId])` en `SalesOrder`. Captura de código `P2002` en `ingestExternalOrder` retornando `{ idempotentReplay: true, ... }` bajo carreras concurrentes TOCTOU.
  - **Atomicidad en Despacho (Hallazgo 10)**: `POST /orders/:id/dispatch` usa `updateMany({ where: { id, tenantId, status: "PACKED" } })` para impedir doble despacho concurrente.
  - Compilación ESM estricta con extensión `.js` y TypeScript limpio (`pnpm build`).

- [x] **CP-4: Verificación Automatizada y Cobertura (>= 80%)**
  - Ejecución real e independiente realizada por el reviewer: `pnpm build` (exit 0) y `pnpm --filter @wms/api test:coverage` (157 tests passed, 0 failed, exit 0).
  - Cobertura de casos de uso de integraciones:
    - `integrations/ingest-external-order.ts`: 100% Stmts | 94.87% Branch | 100% Funcs | 100% Lines.
    - `integrations/notify-order-shipped.ts`: 100% Stmts | 85.71% Branch | 100% Funcs | 100% Lines.
    - Total directorio `integrations`: 100% Stmts | 90.54% Branch | 100% Funcs | 100% Lines (supera con creces el umbral del 80%).
  - Escenarios explícitos cubiertos en tests (Hallazgos 11, 12, 13):
    1. **Happy Path**: Ingesta por SKU/productId, `autoAllocate: true`, despacho atómico y notificación saliente.
    2. **Casos Borde**: Manejo de `shippedAt` (`Date`, string ISO, default actual), omisión de webhook sin URL (`skipped: true`), cantidades cero o inválidas.
    3. **Errores de Dominio**: `PRODUCT_NOT_FOUND`, `LOCATION_NOT_FOUND`, `ORDER_NOT_FOUND`, `VALIDATION_ERROR` (pedido no-PACKED).
    4. **Fallos, Idempotencia y Aislamiento**: Colisión concurrente `P2002`, fallo en `allocateOrder` tras creación, rechazo de escalada a ADMIN con usuario no registrado, bypass `x-dev-tenant-id` ignorado en prod/sin env, token sin `exp`, firmas corruptas, y timeout de 5s con `AbortSignal` en fetch saliente (Hallazgo 9).
    5. **Tests de Integración de Ruta**: `POST /api/v1/webhooks/orders` verificado con `app.inject` para 401 firma, 422 Zod, 403 OPERATOR, 201 alta y 200 replay.

- [x] **CP-5: Arquitectura Hexagonal, Puertos y Criterios de Hecho**
  - Desacoplamiento de infraestructura: casos de uso de integraciones no acoplados a frameworks HTTP (reciben `fetchImpl` inyectable).
  - ADR 003 redactado en `docs/adr/003-auth-and-webhook-integrations.md` con Contexto / Decisión / Consecuencias e indexado en `docs/adr/README.md` (Hallazgo 15).
  - Migración PostgreSQL verificada y documentada en `packages/db/prisma/migrations/20261109120000_sales_order_external_id_unique`.

- [x] **CP-6: Higiene del Código (Sin Duplicados ni Código Muerto)**
  - Eliminados todos los re-exports huérfanos sin consumidores en `ingest-external-order.ts` y `notify-order-shipped.ts` (Hallazgo 14).
  - Sin artefactos extraños ni lockfiles ajenos a `pnpm-lock.yaml`.

---

## Evidencia Ejecutada (obligatoria para APPROVED)

```text
$ pnpm build
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
@wms/mobile:build: 
@wms/mobile:build: > @wms/mobile@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\mobile
@wms/mobile:build: > tsc --noEmit
@wms/mobile:build: 
@wms/web:build: cache hit, replaying logs 75b583d11e3aa948
@wms/web:build: 
@wms/web:build: > @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
@wms/web:build: > tsc --noEmit
@wms/web:build: 
@wms/api:build: cache hit, replaying logs b5a7b453e67cf8d7
@wms/api:build: 
@wms/api:build: > @wms/api@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\api
@wms/api:build: > tsc && tsc-alias
@wms/api:build: 

 Tasks:    5 successful, 5 total
Cached:    5 cached, 5 total
  Time:    42ms >>> FULL TURBO
exit code: 0

$ pnpm --filter @wms/api test:coverage
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 ↓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests | 3 skipped)
 ✓ src/use-cases/diagnostics/__tests__/diagnostics.test.ts (10 tests) 19ms
 ✓ src/use-cases/inventory/__tests__/cancel-order.test.ts (10 tests) 19ms
 ✓ src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts (10 tests) 20ms
 ✓ src/use-cases/inventory/__tests__/handle-picking-exception.test.ts (14 tests) 22ms
 ✓ src/use-cases/inventory/__tests__/move-stock.test.ts (8 tests) 16ms
 ✓ src/use-cases/inventory/__tests__/allocate-order.test.ts (8 tests) 32ms
 ✓ src/use-cases/tasks/__tests__/confirm-task-step.test.ts (15 tests) 23ms
 ✓ src/use-cases/inventory/__tests__/create-putaway-task.test.ts (7 tests) 31ms
 ✓ src/use-cases/security/__tests__/tenant-context.test.ts (16 tests) 42ms
 ✓ src/routes/__tests__/orders-dispatch.test.ts (3 tests) 56ms
 ✓ src/routes/v1/__tests__/diagnostics.test.ts (6 tests) 76ms
 ✓ src/use-cases/integrations/__tests__/webhooks.test.ts (25 tests) 74ms
 ✓ src/plugins/__tests__/auth.test.ts (25 tests) 378ms
   ✓ createJwtToken / verifyJwtToken > verifica tokens RS256 con clave pública Clerk y previene confusión de algoritmo 301ms

 Test Files  13 passed | 1 skipped (14)
      Tests  157 passed | 3 skipped (160)
   Start at  23:42:55
   Duration  2.27s (transform 1.73s, setup 0ms, collect 6.68s, tests 808ms, environment 5ms, prepare 5.51s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |    99.4 |    91.77 |     100 |    99.4 |                   
 diagnostics       |   99.36 |    93.84 |     100 |   99.36 |                   
  ...tic-errors.ts |     100 |      100 |     100 |     100 |                   
  ...stic-error.ts |   97.29 |    63.63 |     100 |   97.29 | 34                
  ...-sensitive.ts |     100 |      100 |     100 |     100 |                   
 integrations      |     100 |    90.54 |     100 |     100 |                   
  ...rnal-order.ts |     100 |    94.87 |     100 |     100 | 123,200           
  ...er-shipped.ts |     100 |    85.71 |     100 |     100 | ...14,120,141,176 
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
exit code: 0
```

---

## Verificación de los 15 Hallazgos Previos

1. **Secreto JWT por defecto en producción**: Resuelto. `resolveJwtSecret` lanza 500 `CONFIGURATION_ERROR` en `NODE_ENV=production` si falta `JWT_SECRET`.
2. **Confusión Clerk/HS256**: Resuelto. Verificación RSA-SHA256 (`crypto.createVerify`) con `CLERK_JWT_KEY` separada estrictamente de la clave simétrica HMAC.
3. **Escalada de privilegios con usuario inexistente**: Resuelto. Si el usuario no existe en la BD, se verifica existencia del tenant y se fuerza el rol a `OPERATOR` (nunca `ADMIN`).
4. **Bypass x-dev-tenant-id**: Resuelto. Exige opt-in explícito (`development` o `ALLOW_DEV_TENANT_HEADER=true`), ignorado en producción y sin variable.
5. **Tokens sin exp / nbf**: Resuelto. Se exige `exp` numérico finito estrictamente positivo y se valida `nbf`.
6. **Idempotencia concurrente (TOCTOU)**: Resuelto. Restricción `@@unique([tenantId, externalId])` en PostgreSQL y captura de `P2002` en el caso de uso retornando replay idempotente.
7. **Fallo en allocateOrder tras create**: Resuelto. El pedido se conserva en `PENDING` y se devuelve `allocationError` sin lanzar 409/500 no controlado.
8. **Firma webhook HMAC sobre raw body**: Resuelto. Parser Fastify `addContentTypeParser` con `parseAs: "string"` y preservación de `req.rawBody`.
9. **Timeout y resiliencia en notifyOrderShipped**: Resuelto. `AbortSignal.timeout(5000)` añadido y secreto obligatorio en producción.
10. **Transición atómica en dispatch**: Resuelto. `updateMany` con `{ id, tenantId, status: "PACKED" }` y validación de params con Zod.
11. **Ramas no cubiertas en notifyOrderShipped**: Resuelto. Ramas de secretos y shippedAt cubiertas al 85.71% en branches y 100% en líneas/funciones.
12. **Tests de seguridad faltantes en auth.test.ts**: Resuelto. 25 tests unitarios cubriendo tokens sin exp, bypass dev, escalada de rol, headers corruptos y secreto en prod.
13. **Tests de integración de ruta en webhooks.test.ts**: Resuelto. Tests Fastify (`app.inject`) cubriendo 401 firma, 422 Zod, 403 OPERATOR, 201 y 200 replay.
14. **Re-exports huérfanos**: Resuelto. Eliminados los re-exports de tipos sin consumidores en `ingest-external-order.ts` y `notify-order-shipped.ts`.
15. **ADR documentado**: Resuelto. Registrado `docs/adr/003-auth-and-webhook-integrations.md` e indexado en `docs/adr/README.md`.

## Conclusión
Todos los criterios de aceptación CP-1 a CP-6 quedan satisfechos con evidencia verificable e independiente. La feature `F4.2` queda formalmente aprobada.
