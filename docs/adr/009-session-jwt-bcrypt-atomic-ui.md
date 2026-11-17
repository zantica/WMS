# ADR 009: Capa de Sesión JWT con Bcrypt Salt Rounds, Superuser (`admin@navelo.dev`) y Diseño Atómico

- **Estado**: Aceptado
- **Fecha**: 2026-11-17
- **Feature**: `F10.1` — Capa de Sesión JWT con Bcrypt Salt Rounds, Superuser (`admin@navelo.dev`), Alta de Usuarios con Contraseña y UI en Diseño Atómico

---

## 1. Contexto

El sistema WMS soportaba previamente autenticación máquina-a-máquina (`x-api-key`) y tokens JWT emitidos por Clerk (`RS256` / `HS256`), pero carecía de:
1. Un flujo propio de inicio de sesión con contraseña (`email` + `password`) y cookie `HttpOnly` (`wms_session`) compatible con SPA (`@wms/web`) y clientes HTTP.
2. Una cuenta raíz global (`SUPERUSER`, por defecto `admin@navelo.dev`) capaz de administrar múltiples tenants sin quedar bloqueada ni expuesta por la política `FORCE ROW LEVEL SECURITY` de `users`.
3. Una arquitectura de componentes UI escalable en `@wms/web` para formularios de acceso y gobierno RBAC.

**Alternativas consideradas**:
- *Almacenar JWT en `localStorage` exclusivamente*: descartado como único mecanismo por exposición a XSS; se adopta cookie `HttpOnly; SameSite=Lax` + soporte dual de `Authorization: Bearer <JWT>`.
- *Desactivar RLS en `users` para el login*: descartado por violar el principio de defensa en profundidad (ADR 002); se amplía la política RLS con `app.auth_email` y `app.auth_superuser_check` acotados a lectura (`SELECT`), manteniendo `WITH CHECK` estricto por `app.current_tenant_id`.
- *Acoplar `bcryptjs` y `process.env` directamente en casos de uso*: descartado por CP-5 y CP-7; se introduce el puerto `PasswordHasherPort` con adaptador `BcryptPasswordHasher` parametrizado desde el *composition root*.

---

## 2. Decisión

1. **Esquema y RLS (`@wms/db`)**:
   - Se extiende `enum UserRole` con `SUPERUSER` y se añade `passwordHash String?` + índice `users_email_idx` en `packages/db/prisma/schema.prisma` y migración `20261117000000_session_superuser_auth`.
   - En `packages/db/src/rls.ts`, `users_tenant_isolation_policy` permite `SELECT` controlado mediante `SET LOCAL app.auth_email` (`withAuthEmailLookup`) y `SET LOCAL app.auth_superuser_check = 'true'` (`withAuthSuperuserCheck`), manteniendo `WITH CHECK` estricto por `app.current_tenant_id`.
   - `packages/db/src/seed.ts` asegura de forma idempotente al Superuser `admin@navelo.dev` usando `bcryptjs` y fallback explícito solo de desarrollo.
2. **Arquitectura Hexagonal y Sesión (`@wms/api`)**:
   - Puerto `apps/api/src/ports/password-hasher.ts` (`PasswordHasherPort`) y adaptador `apps/api/src/adapters/bcrypt-password-hasher.ts` (`BcryptPasswordHasher`) con `saltRounds` inyectados desde `server.ts` (`BCRYPT_SALT_ROUNDS`, default `12`, validado en rango `10..14`).
   - `apps/api/src/plugins/auth.ts` valida en `onRequest` tanto `Authorization: Bearer <token>` como cookie `HttpOnly` `wms_session` (con prioridad sobre `x-api-key`), admite `SUPERUSER` con acceso global (`requireRole` y cambio de contexto `x-tenant-id`) y preserva `x-dev-tenant-id` solo en no-producción.
   - Casos de uso en `apps/api/src/use-cases/auth/` (`login.ts`, `bootstrap-superuser.ts`) y `apps/api/src/use-cases/users/manage-users.ts` expuestos en `/api/v1/auth/*` y `/api/v1/users/*`.
3. **Contratos e UI en Diseño Atómico (`@wms/shared-types` & `@wms/web`)**:
   - Contratos `AuthUserDTO`, `LoginInput`, `LoginResponseDTO`, `BootstrapSuperuserInput`, `BootstrapStatusDTO`, `USER_ROLES` y claves i18n con paridad 100% en los 5 locales (`es-ES`, `es-419`, `en-US`, `pt-BR`, `pt-PT`).
   - Jerarquía `apps/web/src/components/{atoms,molecules,organisms,templates}/` siguiendo el Design System `S5 dark-data-dense` / `P2 Refinada` / `T3` sin hex crudos en `.tsx`, integrada en `/login`, `/users` y `DashboardShell`.

---

## 3. Consecuencias

- **Positivas**: Sesión web segura con cookie `HttpOnly`, rotación/configuración limpia de `BCRYPT_SALT_ROUNDS` sin `process.env` en lógica de negocio, aislamiento RBAC estricto (`ADMIN` no puede escalar ni modificar `SUPERUSER`) y componentes UI reutilizables.
- **Negativas / Riesgos**: El hashing Bcrypt (`12` rounds) añade ~200–350ms de latencia intencional en `login` y alta con contraseña; en tests unitarios de casos de uso se inyecta un fake determinista del puerto `PasswordHasherPort` para mantener la suite rápida.
- **Verificación**:
  - `apps/api/src/use-cases/auth/__tests__/auth-use-cases.test.ts` (Bcrypt real + casos de uso auth/bootstrap).
  - `apps/api/src/routes/__tests__/auth-routes.test.ts` (endpoints `/api/v1/auth/*`, cookie `HttpOnly` y `/api/v1/users`).
  - `apps/api/src/plugins/__tests__/auth.test.ts`, `manage-users.test.ts`, `tenant-context.test.ts`, `domain-prisma-parity.test.ts`.
  - `apps/web/src/components/__tests__/atomic-auth-ui.test.tsx`, `api-client.test.ts`, `app-router.test.tsx`.
