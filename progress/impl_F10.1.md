# Reporte de Implementación: F10.1 — Capa de Sesión JWT con Bcrypt Salt Rounds, Superuser (`admin@navelo.dev`), Alta de Usuarios con Contraseña y UI en Diseño Atómico

- **Estado**: DONE
- **Fecha**: 2026-11-17

## Archivos Creados / Modificados / Eliminados

### Prisma & Base de Datos (`packages/db`)
- `packages/db/package.json`: añadidas dependencias `bcryptjs` y `@types/bcryptjs`.
- `packages/db/prisma/schema.prisma`: extendido `enum UserRole` con `SUPERUSER`, añadido `passwordHash String?` e índice `@@index([email])` en `model User`.
- `packages/db/prisma/migrations/20261117000000_session_superuser_auth/migration.sql` *(creado)*: migración SQL añadiendo `'SUPERUSER'`, columna `"passwordHash"`, índice `"users_email_idx"` y actualizando la política RLS `users_tenant_isolation_policy` para `app.auth_email` y `app.auth_superuser_check` con `WITH CHECK` estricto por `app.current_tenant_id`.
- `packages/db/src/rls.ts`: añadidos `AUTH_EMAIL_LOOKUP_GUC`, `AUTH_SUPERUSER_CHECK_GUC`, `normalizeValidAuthEmail`, `withAuthEmailLookup`, `withAuthSuperuserCheck` y evaluación en `evaluateRlsPolicyPredicate`.
- `packages/db/src/seed.ts`: seed idempotente para Superuser `admin@navelo.dev` (`SUPERUSER`) usando `bcryptjs` y `SEED_SUPERUSER_PASSWORD` (o fallback explícito de dev).

### Contratos Compartidos (`packages/shared-types`)
- `packages/shared-types/src/index.ts`: añadido `USER_ROLES` con `"SUPERUSER"`, `SESSION_COOKIE_NAME`, `AUTH_EMAIL_LOOKUP_GUC`, `AUTH_SUPERUSER_CHECK_GUC`, DTOs `AuthUserDTO`, `LoginInput`, `LoginResponseDTO`, `BootstrapSuperuserInput`, `BootstrapStatusDTO`, y `password?: string` + `tenantId?: string` en `CreateTenantUserInput` y `UpdateTenantUserInput`.
- `packages/shared-types/src/i18n/locales/{es-ES,es-419,en-US,pt-BR,pt-PT}.{json,ts}`: añadidas claves `web.auth.*`, `web.shell.{loginBtn,logoutBtn,sessionRoleLabel}` y `web.users.{kpiSuperusers,passwordLabel,passwordPlaceholder}` con 100% paridad.

### Backend Hexagonal (`apps/api`)
- `apps/api/package.json`: añadidas dependencias `bcryptjs` y `@types/bcryptjs`.
- `apps/api/src/ports/password-hasher.ts` *(creado)*: puerto `PasswordHasherPort`.
- `apps/api/src/adapters/bcrypt-password-hasher.ts` *(creado)*: adaptador `BcryptPasswordHasher` con `saltRounds` inyectado por constructor y `resolveBcryptSaltRounds` (default 12, rango 10..14).
- `apps/api/src/ports/user-repository.ts`, `apps/api/src/adapters/prisma-user-repository.ts`, `apps/api/src/adapters/in-memory-user-repository.ts`: soporte de `passwordHash`, `findUserByEmailForAuth`, `findUserByIdGlobal`, `countSuperusers`, `resolveDefaultTenantId`, `tenantExists` y contexto RLS (`withTenantContext`, `withAuthEmailLookup`, `withAuthClerkLookup` en `findUserByClerkId` global).
- `apps/api/src/plugins/auth.ts`: hook `onRequest` con `AuthPluginOptions` (`jwtSecret`, `clerkPublicKey`) inyectados desde `server.ts`, soporte dual `Authorization: Bearer <JWT>` y cookie `HttpOnly` (`wms_session`), `SUPERUSER` en `VALID_ROLES` y `requireRole`, cambio controlado de tenant vía `x-tenant-id` para `SUPERUSER`, preservación de `x-api-key` y `x-dev-tenant-id` (solo no-prod), y sin funciones duplicadas huérfanas.
- `apps/api/src/use-cases/auth/login.ts` *(creado)*: `loginWithPassword` y `getCurrentSessionUser`.
- `apps/api/src/use-cases/auth/bootstrap-superuser.ts` *(creado)*: `getBootstrapStatus` y `bootstrapSuperuser`.
- `apps/api/src/use-cases/users/manage-users.ts`: hashing opcional de contraseñas vía `PasswordHasherPort` y reglas RBAC `SUPERUSER` vs `ADMIN` (ningún `ADMIN` puede crear/promover/modificar un `SUPERUSER`).
- `apps/api/src/use-cases/catalog/manage-categories.ts`, `apps/api/src/use-cases/diagnostics/list-diagnostic-errors.ts`: habilitado rol `SUPERUSER`.
- `apps/api/src/routes/auth.ts` *(creado)*: endpoints `/api/v1/auth/login`, `/logout`, `/me`, `/bootstrap-status`, `/bootstrap-superuser` con cookie `HttpOnly; SameSite=Lax; Path=/` (`Secure` en prod).
- `apps/api/src/routes/users.ts`, `apps/api/src/server.ts`: validación Zod de `password`/`SUPERUSER`/`tenantId`, inyección de configuración desde *composition root* (`BCRYPT_SALT_ROUNDS`, `JWT_SECRET`, `JWT_EXPIRES_IN_SECONDS`, `BOOTSTRAP_SETUP_SECRET`) sin `process.env` en puertos/adaptadores/use-cases.
- Tests API: `apps/api/src/use-cases/auth/__tests__/auth-use-cases.test.ts` *(creado)*, `apps/api/src/routes/__tests__/auth-routes.test.ts` *(creado)*, y ampliados `auth.test.ts`, `manage-users.test.ts`, `tenant-context.test.ts`, `domain-prisma-parity.test.ts`.

### Frontend Atomic Design (`apps/web`) & ADR
- `apps/web/src/styles/globals.css`: clases semánticas S5/P2 para átomos, moléculas, `SessionUserChip` y `AuthTemplate`.
- `apps/web/src/components/atoms/{Button,Input,Select,Badge,Alert,Label}.tsx` *(creados)*.
- `apps/web/src/components/molecules/{FormField,PasswordField,UserRoleBadge,SessionUserChip}.tsx` *(creados)*.
- `apps/web/src/components/organisms/{LoginForm,BootstrapSuperuserForm,CreateUserPanel,UsersTable}.tsx` *(creados)*.
- `apps/web/src/components/templates/AuthTemplate.tsx` *(creado)*.
- `apps/web/src/lib/api-client.ts`, `apps/web/src/lib/dashboard-metrics.ts`, `apps/web/src/context/supervisor-session.tsx`: soporte `credentials: "include"`, endpoints de auth, `currentUser`, `login`, `logout`, `bootstrapSuperuser`, `refreshSessionUser` y `superuserCount`.
- `apps/web/src/pages/login-page.tsx` *(creado)*, `apps/web/src/pages/users-page.tsx`, `apps/web/src/components/dashboard-shell.tsx`, `apps/web/src/App.tsx`: ruta `/login`, chip de sesión en barra superior y refactor de `/users` en Diseño Atómico.
- Tests Web: `apps/web/src/components/__tests__/atomic-auth-ui.test.tsx` *(creado)*, y ampliados `api-client.test.ts`, `dashboard-metrics.test.ts`, `app-router.test.tsx`.
- ADR: `docs/adr/009-session-jwt-bcrypt-atomic-ui.md` *(creado)* y registro en `docs/adr/README.md`.

## Decisiones de Diseño e Invariantes
- **RLS Multi-Tenant (CP-2)**: `users_tenant_isolation_policy` mantiene `WITH CHECK` estricto sobre `app.current_tenant_id` e introduce `app.auth_email` y `app.auth_superuser_check` únicamente para lectura acotada en login y detección de bootstrap, sin exponer usuarios de otros tenants.
- **Ledger Inmutable (CP-1)**: Intacto; ninguna modificación toca `inventory_transactions` ni `inventory_balances`.
- **Hexagonal y CP-7**: `PasswordHasherPort` desacopla `bcryptjs` de los casos de uso; toda variable de entorno (`BCRYPT_SALT_ROUNDS`, `JWT_SECRET`, `BOOTSTRAP_SETUP_SECRET`) se resuelve exclusivamente en `apps/api/src/server.ts`. Cero `Math.random()`, cero hex crudos en `.tsx`, cero `passwordHash` expuesto en DTOs.

## Resultados de Verificación (salida literal, no parafraseada)

- `pnpm build`: exit code `0`
```text
 Tasks:    6 successful, 6 total
Cached:    5 cached, 6 total
  Time:    7.604s
```

- `pnpm --filter @wms/api test:coverage`: exit code `0`
```text
 Test Files  30 passed | 3 skipped (33)
      Tests  393 passed | 8 skipped (401)
   Start at  00:17:40
   Duration  7.08s (transform 7.27s, setup 0ms, collect 32.27s, tests 6.07s, environment 14ms, prepare 19.85s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.59 |    87.25 |   97.01 |   93.59 |                   
 auth              |   96.87 |    90.14 |     100 |   96.87 |                   
  ...-superuser.ts |   94.44 |     87.5 |     100 |   94.44 | 118,136-141,150   
  login.ts         |     100 |    93.54 |     100 |     100 | 144,155           
 users             |   97.58 |    98.76 |     100 |   97.58 |                   
  manage-users.ts  |   97.58 |    98.76 |     100 |   97.58 | 63-68             
-------------------|---------|----------|---------|---------|-------------------
```
*(Nota: los 3 archivos omitidos corresponden a los tests de integración contra PostgreSQL real `idempotency.integration.test.ts`, `ledger-locking.integration.test.ts` y `tenant-rls.integration.test.ts`, omitidos cuando no hay instancia PG de integración configurada).*

- `pnpm --filter @wms/web test`: exit code `0`
```text
 Test Files  8 passed (8)
      Tests  55 passed (55)
   Start at  00:12:07
   Duration  2.10s (transform 2.14s, setup 0ms, collect 6.03s, tests 397ms, environment 4ms, prepare 4.09s)
```

- `pnpm --filter @wms/shared-types test`: exit code `0`
```text
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  00:12:11
   Duration  1.03s (transform 245ms, setup 0ms, collect 317ms, tests 39ms, environment 0ms, prepare 226ms)
```
