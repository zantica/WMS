# Reporte de Quality Gate y Publicación: F10.1 — Capa de Sesión JWT con Bcrypt Salt Rounds, Superuser (`admin@navelo.dev`), Alta de Usuarios con Contraseña y UI en Diseño Atómico
- **ESTADO**: PUBLISHED
- **Fecha**: 2026-11-18
- **Rama**: main

## 1. Auditoría de Calidad (4 Pilares)
- [x] **Pilar 1 — SOLID**: SRP, OCP, LSP, ISP y DIP verificados en `apps/api/src/ports/password-hasher.ts`, `apps/api/src/adapters/bcrypt-password-hasher.ts`, `apps/api/src/use-cases/auth/`, `apps/api/src/use-cases/users/manage-users.ts`, `apps/api/src/routes/auth.ts`, `apps/api/src/routes/users.ts` y la jerarquía Atomic Design (`atoms/`, `molecules/`, `organisms/`, `templates/`) en `apps/web/src/components/`.
- [x] **Pilar 2 — Cero Envars / Secretos en Código**: Sin `process.env` ni `import.meta.env` en `use-cases/**`, `ports/**`, `adapters/**`, `packages/shared-types/**` ni lógica/UI de `@wms/web`. Toda configuración se inyecta desde los composition roots (`apps/api/src/server.ts`, `apps/web/src/main.tsx`, `packages/db/src/seed.ts`). Sin archivos `.env` en staging, sin `Math.random`, sin `.only` ni `console.log` de depuración.
- [x] **Pilar 3 — Arquitectura Hexagonal & Checkpoints (CP-1 a CP-7)**:
  - CP-1 intacto (`inventory_transactions` / `inventory_balances` sin cambios).
  - CP-2 multi-tenancy y RLS verificados (`users_tenant_isolation_policy` extendida con `app.auth_email` y `app.auth_superuser_check` manteniendo `WITH CHECK` estricto por `tenantId`; `PrismaUserRepositoryAdapter` con `withAuthClerkLookup`, `withAuthEmailLookup`, `withAuthSuperuserCheck` y `withTenantContext`).
  - CP-3 fronteras del monorepo intactas (`@wms/shared-types` libre de Prisma, validación Zod, `ApiResponse<T>`, `WmsError`, imports `.js`).
  - CP-5 ADR 009 documentado en `docs/adr/009-session-jwt-bcrypt-atomic-ui.md` y registrado en `docs/adr/README.md`.
  - CP-6 y CP-7 limpios (sin código muerto, `extractCookieToken` lineal sin ReDoS, `crypto.randomUUID()`, promesas manejadas con `void`/`await`).
- [x] **Pilar 4 — Suite Completa de Tests y Compilación**: `pnpm build`, `pnpm test` y `pnpm --filter @wms/api test:coverage` ejecutados por el committer con `exit code 0`.

## 2. Evidencia Ejecutada
```text
$ pnpm build
Tasks:    6 successful, 6 total (@wms/db, @wms/domain, @wms/shared-types, @wms/mobile, @wms/web, @wms/api)
Exit code: 0

$ pnpm test
- @wms/shared-types: 1 passed (1), 14 passed (14)
- @wms/domain: 5 passed (5), 81 passed (81)
- @wms/mobile: 11 passed (11), 69 passed (69)
- @wms/web: 8 passed (8), 55 passed (55)
- @wms/api: 30 passed | 3 skipped (33), 393 passed | 8 skipped (401) [8 skipped de integración PG sin RUN_PG_INTEGRATION]
Tasks:    8 successful, 8 total
Exit code: 0

$ pnpm --filter @wms/api test:coverage
Test Files  30 passed | 3 skipped (33)
     Tests  393 passed | 8 skipped (401)

File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.59 |    87.23 |   97.01 |   93.59 |
 auth              |   96.87 |    90.14 |     100 |   96.87 |
  ...-superuser.ts |   94.44 |     87.5 |     100 |   94.44 | 118,136-141,150
  login.ts         |     100 |    93.54 |     100 |     100 | 144,155
 users             |   97.58 |    98.76 |     100 |   97.58 |
  manage-users.ts  |   97.58 |    98.76 |     100 |   97.58 | 63-68
Exit code: 0
```

## 3. Commits Atómicos Creados y Push
- `763126a` `feat(shared-types): add session auth, SUPERUSER role and i18n contracts (F10.1)`
- `6a8df8e` `feat(db): add SUPERUSER role, passwordHash, auth RLS policies and seed (F10.1)`
- `5fb2e7a` `feat(api): implement JWT cookie/bearer session, bcrypt hasher, superuser bootstrap and RBAC (F10.1)`
- `deefb54` `feat(web): add atomic design auth/user components, /login and password user management (F10.1)`
- `d0002bb` `docs(progress): record F10.1 reports, ADR 009 and update harness state`
- **Resultado de `git push`**: `To https://github.com/zantica/WMS.git   e724b8e..d0002bb  main -> main`
