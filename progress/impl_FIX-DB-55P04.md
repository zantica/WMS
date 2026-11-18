# Implementación `FIX-DB-55P04` — Separación de `ALTER TYPE "UserRole" ADD VALUE` para evitar error PostgreSQL `55P04`

- **Estado**: `DONE`
- **Fecha**: 2026-11-18
- **Alcance**: Migraciones de `@wms/db` + limpieza de archivo residual en raíz del repositorio + verificación PostgreSQL 16 (Fases 2 y 3 de `precommit-check.ps1`).

---

## 1. Archivos Creados, Modificados y Eliminados

1. **Creado**: `packages/db/prisma/migrations/20261116235959_add_superuser_role_enum/migration.sql`
   - Contiene únicamente `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERUSER';` para ejecutar la extensión del enum en su propia transacción antes de `20261117000000_session_superuser_auth`.
2. **Modificado**: `packages/db/prisma/migrations/20261117000000_session_superuser_auth/migration.sql`
   - Eliminada la sentencia `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERUSER';` (y su cabecera de sección), dejando el resto de la migración (`users.passwordHash`, índice `users_email_idx` y política RLS con `'SUPERUSER'`) intacto.
3. **Eliminado**: `!f[k].trim()).length` (archivo residual en la raíz del repositorio).

---

## 2. Decisiones de Diseño

- Se eligió el timestamp `20261116235959` (`20261116235959_add_superuser_role_enum`), estrictamente posterior a `20261116000000_location_topology` y estrictamente anterior en orden lexicográfico a `20261117000000_session_superuser_auth`.
- Al aislar `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERUSER';` en una migración previa dedicada, Prisma aplica dicha migración y hace commit de la transacción antes de ejecutar la política RLS que referencia `'SUPERUSER'`, eliminando el error PostgreSQL `55P04` (`unsafe use of new value "SUPERUSER" of enum type "UserRole"`).

---

## 3. Verificación (Salida Literal)

Comando ejecutado:
```powershell
& .\.agents\skills\precommit\scripts\precommit-check.ps1 -SkipUnit
```

Salida literal (`Command exited with code 0`):
```text
==========================================================
  WMS Pre-Commit & Pre-Push Gate (CI + PG + SonarCloud)   
==========================================================

==> Fase 1: Guardas de repositorio y validacion de JSON
[OK] feature_list.json es JSON valido.
[SKIP] Fase 1b omitida por -SkipUnit.

==> Fase 2: Integracion PostgreSQL 16 (BD limpia wms_test + migrate:deploy + rol app_test)
 Container wms-postgres  Running
 Container wms-postgres  Waiting
 Container wms-postgres  Healthy
[OK] Contenedor wms-postgres saludable.

> @wms/db@0.0.1 migrate:deploy C:\Users\santi\Documents\projects\WMS\packages\db
> prisma migrate deploy

Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "wms_test", schema "public" at "127.0.0.1:15432"

8 migrations found in prisma/migrations

Applying migration `20261001000000_init`
Applying migration `20261031010000_tenant_rls`
Applying migration `20261109120000_sales_order_external_id_unique`
Applying migration `20261110120000_idempotency_records`
Applying migration `20261113010000_catalog_categories`
Applying migration `20261116000000_location_topology`
Applying migration `20261116235959_add_superuser_role_enum`
Applying migration `20261117000000_session_superuser_auth`

The following migration(s) have been applied:

migrations/
  └─ 20261001000000_init/
    └─ migration.sql
  └─ 20261031010000_tenant_rls/
    └─ migration.sql
  └─ 20261109120000_sales_order_external_id_unique/
    └─ migration.sql
  └─ 20261110120000_idempotency_records/
    └─ migration.sql
  └─ 20261113010000_catalog_categories/
    └─ migration.sql
  └─ 20261116000000_location_topology/
    └─ migration.sql
  └─ 20261116235959_add_superuser_role_enum/
    └─ migration.sql
  └─ 20261117000000_session_superuser_auth/
    └─ migration.sql
      
All migrations have been successfully applied.
[OK] Todas las migraciones aplicadas limpiamente en wms_test.

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api

 ✓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests) 175ms
 ✓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests) 287ms
 ✓ src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts (2 tests) 340ms

 Test Files  3 passed (3)
      Tests  8 passed (8)
   Start at  01:24:30
   Duration  1.34s (transform 319ms, setup 0ms, collect 764ms, tests 802ms, environment 1ms, prepare 759ms)

[OK] Suite de integracion PostgreSQL (RLS, FOR UPDATE, Idempotency) en VERDE.

==> Fase 3: Barrido Anti-SonarCloud (CP-7) y validacion de migraciones SQL

==========================================================
  PRECOMMIT PASSED: CI + Postgres RLS + Sonar Checks OK   
==========================================================
```

Comprobación final de limpieza y git:
```text
 M packages/db/prisma/migrations/20261117000000_session_superuser_auth/migration.sql
?? packages/db/prisma/migrations/20261116235959_add_superuser_role_enum/
False
```
(`Test-Path -LiteralPath '!f[k].trim()).length'` devolvió `False`).
