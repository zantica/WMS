# Reporte de Revisión: F4.2 (re-auditoría independiente)
- **VEREDICTO**: CHANGES_REQUESTED
- **Fecha**: 2026-11-09
- **Auditor**: reviewer (subagente independiente) — nunca el leader ni el implementer
- **Alcance**: Re-auditoría de F4.2 (Autenticación JWT/Clerk + Webhooks de integración). Sustituye a efectos de cierre a `progress/review_F4.2.md` (firmado por el leader como "fallback por cuota", sin evidencia ejecutada → inválido según harness; se conserva como histórico).
- **Independencia**: este agente no implementó ni completó código/tests de F4.2.

## Evaluación de Checkpoints
- [x] CP-1: Integridad del Inventory Ledger — la ingesta no toca `InventoryBalance`/`InventoryTransaction`; la reserva se delega en `allocateOrder` (ya auditado: Serializable + `FOR UPDATE`). No hay `update/delete` sobre `inventoryTransaction` en los archivos de F4.2.
- [ ] CP-2: Aislamiento Multi-Tenant y Seguridad — las queries de ingesta filtran por `tenantId` (✔), pero la **autenticación es falsificable** (ver hallazgos 1–4): secreto JWT por defecto embebido, aceptación de tenant/rol del token cuando el usuario no existe en BD, tokens sin `exp` válidos para siempre y bypass `x-dev-tenant-id` abierto por defecto si `NODE_ENV` no está definido. Esto permite suplantar cualquier `tenantId` con rol `ADMIN`.
- [ ] CP-3: Contratos de API, Tipado y Monorepo — `pnpm build` limpio (✔), `@wms/shared-types` libre de Prisma (✔), Zod en `/webhooks/orders` (✔), `ApiResponse<T>` (✔), imports `.js` (✔). Falla: idempotencia declarada en el contrato no está garantizada a nivel de esquema (hallazgo 5) y `POST /orders/:id/dispatch` sigue sin validar `params` con Zod.
- [ ] CP-4: Verificación Automatizada y Cobertura — suite en verde ejecutada por mí (137/137, exit 0) y umbral global de `use-cases` ≥ 80% cumplido (✔). Falla el requisito de **escenarios explícitos**: no hay tests de idempotencia concurrente, de fallo a mitad (`allocateOrder` lanzando tras `create`), del bypass `x-dev-tenant-id` en producción, de tokens sin `exp`, ni tests de ruta para `/webhooks/orders` (401 por firma, 400 Zod, 200 replay vs 201 alta, 403 OPERATOR). `notify-order-shipped.ts` queda en **71.42 % de ramas** a nivel de archivo.
- [ ] CP-5: Arquitectura Hexagonal, Puertos y Criterios de Hecho — F4.2 es Hito 4 (CP-5 aplica formalmente a Hitos 5–7), pero: `ingest-external-order.ts` importa `prisma` directamente sin puerto `IdempotencyStore`; no hay test de integración PostgreSQL para la idempotencia; y la decisión de auth (HS256 propio vs JWKS RS256 de Clerk, confianza en claims sin usuario en BD) es no obvia y no tiene ADR.
- [ ] CP-6: Higiene del Código — re-exports huérfanos sin consumidores: `export type { ExternalOrderLineInput, IngestExternalOrderResult }` en `ingest-external-order.ts:20` y `export type { OrderShippedWebhookLine, OrderShippedWebhookPayload }` en `notify-order-shipped.ts:15` (grep: ningún archivo los importa desde esas rutas). `IngestExternalOrderInput` en shared-types no tiene consumidores.

## Evidencia Ejecutada (obligatoria para APPROVED)
```text
$ pnpm build
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.9
   • Packages in scope: @wms/api, @wms/db, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 5 packages
   • Remote caching disabled

@wms/shared-types:build: cache hit, replaying logs 35edeb4f285854d7
@wms/db:build: cache hit, replaying logs b2c1da7cc7278dbe
@wms/mobile:build: cache miss, executing 53b995c046971d88
@wms/web:build: cache miss, executing 4a61a8b90e0fc6c6
@wms/api:build: cache hit, replaying logs 5655ebcc55ded5f8
@wms/api:build: > @wms/api@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\api
@wms/api:build: > tsc && tsc-alias
@wms/mobile:build: > tsc --noEmit
@wms/web:build: > tsc --noEmit

 Tasks:    5 successful, 5 total
Cached:    3 cached, 5 total
  Time:    3.271s

 WARNING  no output files found for task @wms/mobile#build. Please check your `outputs` key in `turbo.json`
EXIT=0

$ pnpm --filter @wms/api test:coverage
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 ✓ src/use-cases/diagnostics/__tests__/diagnostics.test.ts (10 tests) 19ms
 ✓ src/use-cases/inventory/__tests__/cancel-order.test.ts (10 tests) 17ms
 ✓ src/use-cases/inventory/__tests__/handle-picking-exception.test.ts (14 tests) 20ms
 ✓ src/use-cases/integrations/__tests__/webhooks.test.ts (15 tests) 22ms
 ✓ src/use-cases/inventory/__tests__/move-stock.test.ts (8 tests) 18ms
 ✓ src/use-cases/tasks/__tests__/confirm-task-step.test.ts (15 tests) 23ms
 ✓ src/use-cases/inventory/__tests__/allocate-order.test.ts (8 tests) 31ms
 ✓ src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts (10 tests) 20ms
 ✓ src/use-cases/inventory/__tests__/create-putaway-task.test.ts (7 tests) 32ms
 ✓ src/use-cases/security/__tests__/tenant-context.test.ts (16 tests) 43ms
 ✓ src/plugins/__tests__/auth.test.ts (18 tests) 72ms
 ✓ src/routes/v1/__tests__/diagnostics.test.ts (6 tests) 89ms

 Test Files  12 passed (12)
      Tests  137 passed (137)
   Start at  23:21:19
   Duration  2.10s (transform 1.48s, setup 0ms, collect 5.13s, tests 406ms, environment 5ms, prepare 4.62s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |    99.2 |    90.74 |     100 |    99.2 |
 diagnostics       |   99.36 |    93.84 |     100 |   99.36 |
  ...tic-errors.ts |     100 |      100 |     100 |     100 |
  ...stic-error.ts |   97.29 |    63.63 |     100 |   97.29 | 34
  ...-sensitive.ts |     100 |      100 |     100 |     100 |
 integrations      |   98.76 |    83.87 |     100 |   98.76 |
  ...rnal-order.ts |     100 |    94.11 |     100 |     100 | 133,151
  ...er-shipped.ts |   97.27 |    71.42 |     100 |   97.27 | 49-50,103
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
> Nota: la cobertura solo incluye `src/use-cases/**` (`vitest.config.ts`); `plugins/auth.ts` y `routes/webhooks.ts` no se miden.

## Hallazgos / Correcciones Requeridas

### Críticos (seguridad — bloquean el cierre)
1. `[apps/api/src/plugins/auth.ts:107-114]` **Secreto JWT por defecto embebido** (`"wms-dev-jwt-secret"`) sin guardia de entorno. Si `JWT_SECRET`/`CLERK_JWT_KEY` no están definidos en producción, cualquiera puede firmar tokens válidos. **Corrección**: en `NODE_ENV=production` (o siempre salvo `test`) fallar en el arranque si no hay secreto; nunca usar fallback fuera de tests.
2. `[apps/api/src/plugins/auth.ts:111]` **Confusión Clerk/HS256**: Clerk emite tokens **RS256** y `CLERK_JWT_KEY` es su **clave pública PEM**. Usarla como secreto HMAC (a) no verifica tokens reales de Clerk y (b) permite que cualquiera con la clave pública (pública por definición) forje tokens HS256 válidos — ataque clásico de *algorithm confusion*. **Corrección**: verificar RS256 contra JWKS/PEM de Clerk (`crypto.verify` / `jose`) y no reutilizar `CLERK_JWT_KEY` como secreto HMAC; documentarlo en un ADR.
3. `[apps/api/src/plugins/auth.ts:346-363]` **Confianza en claims cuando el usuario no existe en BD**: si `sub` no está en `users` (o no hay `sub`), se acepta `tenantId` y `role` (incluido `ADMIN`) directamente del token. Combinado con 1/2 es suplantación total de tenant + escalada de privilegios. **Corrección**: rechazar (401) si el usuario no existe, o como mínimo ignorar `role` del token (forzar `OPERATOR`) y exigir que el tenant exista; cubrirlo con test.
4. `[apps/api/src/plugins/auth.ts:346-349]` **Bypass `x-dev-tenant-id` abierto por defecto**: se activa con `NODE_ENV !== "production"`, es decir, también cuando `NODE_ENV` no está definido (caso habitual en despliegues mal configurados). **Corrección**: activarlo solo con opt-in explícito (`NODE_ENV === "development"` o `ALLOW_DEV_TENANT_HEADER=true`) y añadir test que demuestre que se ignora en producción / sin variable.
5. `[apps/api/src/plugins/auth.ts:218-225]` **Tokens sin `exp` nunca caducan** (se devuelve `exp: 0` y se aceptan). Tampoco se validan `nbf`, `iss` ni `aud`. **Corrección**: exigir `exp` numérico (401 si falta), validar `nbf` e `iss`/`aud` configurables; test para token sin `exp`.

### Mayores (corrección funcional / idempotencia)
6. `[packages/db/prisma/schema.prisma:221]` + `[ingest-external-order.ts:64-168]` **Idempotencia no garantizada bajo concurrencia**: solo existe `@@index([tenantId, externalId])`, no `@@unique`. El patrón `findFirst` → `create` es TOCTOU: dos reintentos simultáneos (Shopify reintenta) crean pedidos duplicados. **Corrección**: migración `@@unique([tenantId, externalId])` y capturar `P2002` en el caso de uso devolviendo el pedido existente con `idempotentReplay: true`; test de la rama de colisión.
7. `[ingest-external-order.ts:146-184]` **Fallo a mitad no tratado**: si `allocateOrder` lanza (p.ej. `INSUFFICIENT_STOCK`) tras el `create`, el pedido queda `PENDING`, el cliente recibe 409 y el reintento devuelve `200 replay` sin reserva ni aviso. Además el `status: "ALLOCATED"` se fija a mano. **Corrección**: decidir y documentar semántica (pedido creado + `allocationError` en el resultado, o crear+reservar atómicamente) y testear el escenario.
8. `[apps/api/src/routes/webhooks.ts:57-62]` La firma HMAC entrante se verifica sobre `JSON.stringify(request.body)` (cuerpo re-serializado), por lo que firmas reales de proveedores sobre el raw body fallarán o, peor, se acepta cualquier serialización equivalente. Ya reconocido en `impl_F4.2.md`, pero no debe cerrarse como `done` sin `contentTypeParser` raw o issue/ADR que lo acote. Además, si `WEBHOOK_SHARED_SECRET` no está definido la firma se omite silenciosamente.
9. `[apps/api/src/use-cases/integrations/notify-order-shipped.ts:136-147]` `fetch` saliente **sin timeout** (`AbortSignal.timeout`) y awaited dentro del handler de dispatch: un endpoint externo lento cuelga `POST /orders/:id/dispatch`. Secreto saliente por defecto `"wms-dev-webhook-secret"` (l.46-51) con el mismo problema que el hallazgo 1.
10. `[apps/api/src/routes/orders.ts:192-195]` El `update` a `SHIPPED` filtra solo por `id` (sin `tenantId` ni condición `status: "PACKED"`): dos dispatch concurrentes envían dos webhooks `order.shipped`. **Corrección**: `updateMany({ where: { id, tenantId, status: "PACKED" } })` y comprobar `count === 1`; validar `params` con Zod.

### Tests faltantes (CP-4)
11. `[apps/api/src/use-cases/integrations/__tests__/webhooks.test.ts]` Añadir: colisión concurrente/`P2002` (idempotencia real), `allocateOrder` rechazando tras `create`, ramas de `notify-order-shipped.ts` 49-50 (secreto desde env/por defecto) y 103 (`shippedAt` string/ausente) para superar 80 % de ramas en el archivo.
12. `[apps/api/src/plugins/__tests__/auth.test.ts]` Añadir: token sin `exp`, `x-dev-tenant-id` ignorado con `NODE_ENV=production` y sin `NODE_ENV`, token con `sub` inexistente y `role: "ADMIN"` (debe no escalar), header/payload base64 corrupto, ausencia de secreto en producción.
13. Falta test de ruta (`app.inject`) para `POST /api/v1/webhooks/orders`: 401 firma inválida, 400 Zod, 403 OPERATOR, 201 alta y 200 replay.

### Menores (CP-5 / CP-6)
14. `[ingest-external-order.ts:20]`, `[notify-order-shipped.ts:15]` Eliminar re-exports de tipos sin consumidores.
15. Registrar ADR en `docs/adr/` para la estrategia de autenticación (Clerk RS256/JWKS vs HS256 local, política ante usuario inexistente, bypass de desarrollo) y la estrategia de idempotencia de webhooks.
