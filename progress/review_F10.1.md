# Reporte de Revisión Independiente: F10.1 — Capa de Sesión JWT con Bcrypt Salt Rounds, Superuser (`admin@navelo.dev`), Alta de Usuarios con Contraseña y UI en Diseño Atómico

- **VEREDICTO**: `APPROVED`
- **Fecha**: 2026-11-18
- **Revisor**: Subagente `reviewer` (auditor independiente)
- **Feature**: `F10.1` (según `progress/impl_F10.1.md` y `feature_list.json`)

---

## Evaluación de Checkpoints (`CHECKPOINTS.md`)

- [x] **CP-1 (Inventory Ledger)**: Intacto. Ningún cambio en `F10.1` modifica `inventory_transactions`, `inventory_balances` ni los flujos de movimiento/reserva.
- [x] **CP-2 (Multi-Tenancy y Seguridad / RLS)**: `packages/db/prisma/migrations/20261117000000_session_superuser_auth/migration.sql` y `packages/db/src/rls.ts` amplían `users_tenant_isolation_policy` para `app.auth_email` y `app.auth_superuser_check` manteniendo `WITH CHECK` estricto por `app.current_tenant_id`. `PrismaUserRepositoryAdapter.findUserByClerkId` sin `tenantId` ahora utiliza `withAuthClerkLookup(prisma, clerkId, ...)` compatible con `FORCE ROW LEVEL SECURITY`. `authPlugin` aísla `tenantId`, restringe `x-dev-tenant-id` a desarrollo/flag explícito y permite a `SUPERUSER` cambiar de tenant verificado vía `x-tenant-id`.
- [x] **CP-3 (Contratos y Tipado)**: `@wms/shared-types` libre de `@prisma/client` y `@wms/db`; DTOs (`AuthUserDTO`, `LoginInput`, `LoginResponseDTO`, `BootstrapSuperuserInput`, `BootstrapStatusDTO`, `USER_ROLES`, `SESSION_COOKIE_NAME`) e i18n (100% paridad en 5 locales) definidos en `@wms/shared-types`. Validación Zod en `routes/auth.ts` y `routes/users.ts`, errores `WmsError`, respuestas `ApiResponse<T>` e imports ESM `.js`. `pnpm build` compila limpio (6/6 paquetes).
- [x] **CP-4 (Tests y Cobertura)**: Suite ejecutada de forma independiente por el reviewer tras las correcciones con salida `0`. Cobertura global de `use-cases` en `93.59%` Stmts / `87.23%` Branch / `97.01%` Funcs / `93.59%` Lines (`auth/login.ts` `100%` lines / `93.54%` branch, `auth/bootstrap-superuser.ts` `94.44%` lines / `87.5%` branch, `users/manage-users.ts` `97.58%` lines / `98.76%` branch). Cubre Happy Path, Edge Cases, Errores de Dominio y Aislamiento/RBAC.
- [x] **CP-5 (Arquitectura Hexagonal y ADR)**: `PasswordHasherPort` (`apps/api/src/ports/password-hasher.ts`) y `BcryptPasswordHasher` (`apps/api/src/adapters/bcrypt-password-hasher.ts`) desacoplan `bcryptjs`. Casos de uso `auth/` y `users/` sin imports de Fastify/Prisma/React. ADR 009 documentado en `docs/adr/009-session-jwt-bcrypt-atomic-ui.md` y registrado en `docs/adr/README.md`. Diseño Atómico implementado en `apps/web/src/components/{atoms,molecules,organisms,templates}/` sin hex crudos en TSX.
- [x] **CP-6 (Higiene del Código)**: Eliminada `lookupUserByEmailForAuth` de `apps/api/src/plugins/auth.ts` y su test huérfano de `apps/api/src/plugins/__tests__/auth.test.ts`; sin funciones muertas, re-exports huérfanos ni `it.skip` nuevos.
- [x] **CP-7 (SOLID, Cero Envars y Reglas SonarCloud)**: Cero `process.env` en `use-cases/**`, `ports/**` y `adapters/**`. `apps/api/src/server.ts` resuelve e inyecta `jwtSecret` y `clerkPublicKey` tanto en `authPlugin` (`AuthPluginOptions`) como en `authRoutes`, verificado por el test específico en `apps/api/src/routes/__tests__/auth-routes.test.ts` (líneas 259–295). Cero `Math.random()` y sin regex ReDoS.

---

## Verificación de Correcciones Solicitadas

1. **Inyección de `jwtSecret` / `clerkPublicKey` en `authPlugin`**: Verificado en `apps/api/src/server.ts:196-199`, `apps/api/src/plugins/auth.ts:421-453` y cubierto por el nuevo test `buildServer({ jwtSecret })` en `apps/api/src/routes/__tests__/auth-routes.test.ts:259-295`.
2. **Contexto RLS en `PrismaUserRepositoryAdapter.findUserByClerkId` sin `tenantId`**: Verificado en `apps/api/src/adapters/prisma-user-repository.ts:145-150` usando `withAuthClerkLookup`.
3. **Eliminación de código muerto `lookupUserByEmailForAuth`**: Verificado en `apps/api/src/plugins/auth.ts` y `apps/api/src/plugins/__tests__/auth.test.ts`.

---

## Evidencia Ejecutada (salidas literales del reviewer)

### 1. `pnpm build` (exit code `0`)
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build


   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

@wms/db:build: cache hit, replaying logs 4a557aeded75b74c
@wms/db:build: 
@wms/db:build: > @wms/db@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\db
@wms/db:build: > tsc
@wms/db:build: 
@wms/domain:build: cache hit, replaying logs 67718cc3de844ab0
@wms/domain:build: 
@wms/domain:build: > @wms/domain@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\domain
@wms/domain:build: > tsc
@wms/domain:build: 
@wms/shared-types:build: cache hit, replaying logs 49a9311585fb5c19
@wms/shared-types:build: 
@wms/shared-types:build: > @wms/shared-types@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\shared-types
@wms/shared-types:build: > tsc
@wms/shared-types:build: 
@wms/mobile:build: cache hit, replaying logs baf2a22012c0ee2a
@wms/mobile:build: 
@wms/mobile:build: > @wms/mobile@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\mobile
@wms/mobile:build: > tsc --noEmit
@wms/mobile:build: 
@wms/web:build: cache hit, replaying logs 9966f98f2cfdb56f
@wms/web:build: 
@wms/web:build: > @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
@wms/web:build: > tsc --noEmit && vite build
@wms/web:build: 
@wms/web:build: vite v5.4.21 building for production...
@wms/web:build: transforming...
@wms/web:build: ✓ 88 modules transformed.
@wms/web:build: rendering chunks...
@wms/web:build: computing gzip size...
@wms/web:build: dist/index.html                   1.28 kB │ gzip:   0.66 kB
@wms/web:build: dist/assets/index-Dn2ivuf4.css   37.21 kB │ gzip:   6.41 kB
@wms/web:build: dist/assets/index-tnAMprXF.js   479.50 kB │ gzip: 128.49 kB
@wms/web:build: ✓ built in 2.30s
@wms/api:build: cache hit, replaying logs aa0db5430448c6e3
@wms/api:build: 
@wms/api:build: > @wms/api@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\api
@wms/api:build: > tsc && tsc-alias
@wms/api:build: 

 Tasks:    6 successful, 6 total
Cached:    6 cached, 6 total
  Time:    87ms >>> FULL TURBO
```

### 2. `pnpm --filter @wms/api test:coverage` (exit code `0`)
```text
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 ✓ src/use-cases/diagnostics/__tests__/diagnostics.test.ts (10 tests) 20ms
 ✓ src/use-cases/users/__tests__/manage-users.test.ts (22 tests) 22ms
 ✓ src/use-cases/topology/__tests__/manage-locations.test.ts (17 tests) 40ms
 ✓ src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts (12 tests) 21ms
 ✓ src/use-cases/catalog/__tests__/manage-products.test.ts (32 tests) 50ms
 ✓ src/use-cases/tasks/__tests__/sync-task-batch.test.ts (10 tests) 22ms
 ↓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests | 3 skipped)
 ✓ src/use-cases/tasks/__tests__/confirm-task-step.test.ts (21 tests) 48ms
 ✓ src/use-cases/inventory/__tests__/handle-picking-exception.test.ts (13 tests) 47ms
 ✓ src/use-cases/security/__tests__/tenant-context.test.ts (16 tests) 56ms
 ✓ src/use-cases/auth/__tests__/auth-use-cases.test.ts (12 tests) 550ms
   ✓ F10.1 — Casos de Uso de Auth, Bcrypt Salt Rounds y Bootstrap Superuser > BcryptPasswordHasher & resolveBcryptSaltRounds > hashea y verifica contraseñas reales con BcryptPasswordHasher (10 rounds) 531ms
 ✓ src/shared/__tests__/topology.test.ts (15 tests) 32ms
 ✓ src/use-cases/inventory/__tests__/create-putaway-task.test.ts (7 tests) 35ms
 ✓ src/use-cases/inventory/__tests__/cancel-order.test.ts (10 tests) 24ms
 ✓ src/use-cases/catalog/__tests__/manage-categories.test.ts (16 tests) 36ms
 ✓ src/use-cases/integrations/__tests__/webhooks.test.ts (25 tests) 169ms
 ✓ src/routes/__tests__/tasks-sync-batch.test.ts (5 tests) 220ms
 ✓ src/use-cases/labels/__tests__/generate-labels.test.ts (11 tests) 24ms
 ✓ src/use-cases/inventory/__tests__/move-stock.test.ts (13 tests) 29ms
 ✓ src/use-cases/inventory/__tests__/allocate-order.test.ts (13 tests) 40ms
 ✓ src/adapters/__tests__/label-renderer.test.ts (15 tests) 29ms
 ↓ src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts (2 tests | 2 skipped)
 ↓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests | 3 skipped)
 ✓ src/plugins/__tests__/auth.test.ts (27 tests) 1338ms
   ✓ createJwtToken / verifyJwtToken > verifica tokens RS256 con clave pública Clerk y previene confusión de algoritmo 1086ms
 ✓ src/shared/__tests__/barcode-payload.test.ts (14 tests) 14ms
 ✓ src/routes/v1/__tests__/diagnostics.test.ts (6 tests) 193ms
 ✓ src/ports/__tests__/idempotency-store.test.ts (5 tests) 14ms
 ✓ src/__tests__/domain-prisma-parity.test.ts (6 tests) 10ms
 ✓ src/routes/__tests__/orders-dispatch.test.ts (4 tests) 94ms
 ✓ src/routes/__tests__/auth-routes.test.ts (4 tests) 678ms
   ✓ Rutas HTTP de Sesión JWT, Cookie HttpOnly y Superuser (F10.1) > flujo completo: bootstrap-status -> bootstrap-superuser -> cookie HttpOnly wms_session -> /me -> logout 520ms
 ✓ src/routes/__tests__/locations-topology-routes.test.ts (10 tests) 916ms
   ✓ Rutas HTTP de Topología Física y Layout (F9.2) > POST /api/v1/locations (Alta individual estructurada) > crea una ubicación RACK normalizando el código con zero-padding 579ms
 ✓ src/routes/__tests__/catalog-users-routes.test.ts (15 tests) 1225ms
   ✓ Rutas HTTP de Catálogo, Categorías y Usuarios (F9.1) > Rutas de Categorías (/api/v1/categories) > POST /api/v1/categories — crea categoría con rol ADMIN 752ms
 ✓ src/routes/v1/__tests__/labels.test.ts (7 tests) 711ms
   ✓ Rutas HTTP de Etiquetas (POST /api/v1/labels/locations y /products) > POST /api/v1/labels/locations > genera etiquetas QR para ubicaciones con status 200 y formato ApiResponse<LabelBatchResponseDTO> 492ms

 Test Files  30 passed | 3 skipped (33)
      Tests  393 passed | 8 skipped (401)
   Start at  00:18:26
   Duration  6.50s (transform 6.38s, setup 0ms, collect 29.81s, tests 6.71s, environment 15ms, prepare 17.62s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.59 |    87.23 |   97.01 |   93.59 |                   
 auth              |   96.87 |    90.14 |     100 |   96.87 |                   
  ...-superuser.ts |   94.44 |     87.5 |     100 |   94.44 | 118,136-141,150   
  login.ts         |     100 |    93.54 |     100 |     100 | 144,155           
 catalog           |   99.17 |    92.17 |     100 |   99.17 |                   
  ...categories.ts |   99.09 |    96.77 |     100 |   99.09 | 128               
  ...e-products.ts |    99.2 |    90.47 |     100 |    99.2 | 233,294           
 diagnostics       |   99.36 |    93.84 |     100 |   99.36 |                   
  ...tic-errors.ts |     100 |      100 |     100 |     100 |                   
  ...stic-error.ts |   97.29 |    63.63 |     100 |   97.29 | 34                
  ...-sensitive.ts |     100 |      100 |     100 |     100 |                   
 integrations      |     100 |    90.14 |     100 |     100 |                   
  ...rnal-order.ts |     100 |    94.87 |     100 |     100 | 123,200           
  ...er-shipped.ts |     100 |    84.37 |     100 |     100 | ...22,128,152,187 
 inventory         |    98.1 |       90 |     100 |    98.1 |                   
  ...cate-order.ts |     100 |       92 |     100 |     100 | 80,95             
  cancel-order.ts  |   99.16 |    93.1 |     100 |   99.16 | 111               
  ...taway-task.ts |   98.37 |    91.3 |     100 |   98.37 | 166-167           
  ...-exception.ts |    95.9 |    83.72 |     100 |    95.9 | ...00,160,280-281 
  move-stock.ts    |     100 |       95 |     100 |     100 | 111               
 labels            |   92.68 |    83.63 |     100 |   92.68 |                   
  ...ion-labels.ts |    92.3 |       84 |     100 |    92.3 | 23-28             
  ...uct-labels.ts |   93.02 |    83.33 |     100 |   93.02 | 23-28             
 security          |     100 |      100 |     100 |     100 |                   
  ...nt-context.ts |     100 |      100 |     100 |     100 |                   
 tasks             |   82.91 |    81.39 |   81.81 |   82.91 |                   
  ...ceipt-line.ts |   85.16 |    89.23 |      60 |   85.16 | ...61-262,265-285 
  ...-task-step.ts |   83.14 |    83.83 |     100 |   83.14 | ...28-333,445-455 
  ...task-batch.ts |   80.59 |    66.66 |     100 |   80.59 | ...08,224-232,296 
 topology          |      88 |     61.9 |     100 |      88 |                   
  ...-locations.ts |      88 |     61.9 |     100 |      88 | ...47-348,354-359 
 users             |   97.58 |    98.76 |     100 |   97.58 |                   
  manage-users.ts  |   97.58 |    98.76 |     100 |   97.58 | 63-68             
-------------------|---------|----------|---------|---------|-------------------
```

### 3. `pnpm --filter @wms/web test` (exit code `0`)
```text
> @wms/web@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\web
> vitest run


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web

 ✓ src/lib/__tests__/api-client.test.ts (11 tests) 24ms
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 24ms
 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (9 tests) 30ms
 ✓ src/pages/__tests__/locations-page.test.tsx (2 tests) 38ms
 ✓ src/components/__tests__/dashboard-shell.test.tsx (4 tests) 37ms
 ✓ src/context/__tests__/locale-context.test.tsx (6 tests) 71ms
 ✓ src/components/__tests__/atomic-auth-ui.test.tsx (5 tests) 53ms
 ✓ src/__tests__/app-router.test.tsx (10 tests) 109ms

 Test Files  8 passed (8)
      Tests  55 passed (55)
   Start at  00:13:35
   Duration  1.70s (transform 1.48s, setup 0ms, collect 4.66s, tests 385ms, environment 3ms, prepare 2.84s)
```

### 4. `pnpm --filter @wms/shared-types test` (exit code `0`)
```text
> @wms/shared-types@0.0.1 test C:\Users\santi\Documents\projects\WMS\packages\shared-types
> vitest run


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/packages/shared-types

 ✓ src/i18n/__tests__/i18n.test.ts (14 tests) 36ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  00:13:40
   Duration  887ms (transform 209ms, setup 0ms, collect 273ms, tests 36ms, environment 0ms, prepare 273ms)
```

---

## Hallazgos / Correcciones Requeridas

Ninguno. Todos los hallazgos previos han sido resueltos y verificados contra código y ejecución real.
