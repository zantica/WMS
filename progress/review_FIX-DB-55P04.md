# Revisión Independiente `FIX-DB-55P04` — Separación de `ALTER TYPE "UserRole" ADD VALUE` (PostgreSQL `55P04`)

- **Veredicto**: `APPROVED`
- **Fecha**: 2026-11-18
- **Auditor**: Subagente `reviewer`
- **Referencias auditadas**:
  - `progress/impl_FIX-DB-55P04.md`
  - `packages/db/prisma/migrations/20261116235959_add_superuser_role_enum/migration.sql`
  - `packages/db/prisma/migrations/20261117000000_session_superuser_auth/migration.sql`
  - `packages/db/prisma/schema.prisma`
  - `CHECKPOINTS.md`

---

## 1. Hallazgos de Inspección

1. **Aislamiento de `ALTER TYPE ... ADD VALUE` (`20261116235959_add_superuser_role_enum/migration.sql`)**:
   - Contiene únicamente `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERUSER';` (1 línea).
   - Su timestamp `20261116235959` ordena lexicográficamente después de `20261116000000_location_topology` y antes de `20261117000000_session_superuser_auth`, permitiendo que Prisma ejecute y haga `COMMIT` del nuevo valor del enum antes de que la política RLS lo referencie.
2. **Migración RLS y Auth (`20261117000000_session_superuser_auth/migration.sql`)**:
   - Eliminada la sentencia `ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPERUSER';` del archivo.
   - Mantiene intactos `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;`, `CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users"("email");`, `ENABLE/FORCE ROW LEVEL SECURITY` y la política `users_tenant_isolation_policy` con `WITH CHECK` estricto por `app.current_tenant_id`.
3. **Limpieza y consistencia con `schema.prisma`**:
   - Archivo residual `!f[k].trim()).length` eliminado de la raíz del repositorio (`Test-Path -LiteralPath '!f[k].trim()).length'` -> `False`).
   - `prisma validate` OK y `prisma migrate diff` contra la base limpia `wms_test` devuelve `-- This is an empty migration.` (cero *schema drift*).

---

## 2. Evaluación contra `CHECKPOINTS.md` (CP-1 .. CP-7)

- [x] **CP-1: Integridad del Inventory Ledger**: N/A para este fix SQL; sin cambios sobre `InventoryTransaction` ni `InventoryBalance` (y `ledger-locking.integration.test.ts` pasa 2/2 en PostgreSQL 16).
- [x] **CP-2: Aislamiento Multi-Tenant y Seguridad**: Cumplido. `users` conserva `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` y `WITH CHECK` estricto por `app.current_tenant_id`; `tenant-rls.integration.test.ts` valida aislamiento real con el rol no-superusuario `app_test` (`NOSUPERUSER NOBYPASSRLS`).
- [x] **CP-3: Contratos de API, Tipado y Arquitectura Monorepo**: Cumplido en el alcance `@wms/db` (`prisma validate` y `prisma migrate diff` sin drift respecto a `schema.prisma`).
- [x] **CP-4: Verificación Automatizada y Cobertura**: Cumplido en el alcance de la corrección. `precommit-check.ps1 -SkipUnit` ejecutado independientemente por el reviewer con salida `0` (8/8 migraciones aplicadas desde cero en `wms_test` + 3/3 archivos y 8/8 tests de integración PostgreSQL en verde).
- [x] **CP-5: Arquitectura Hexagonal, Puertos y Criterios de Hecho**: Cumplido. Verificación real contra PostgreSQL 16 (`wms_test` limpia + rol `app_test`) ejecutada; separación estándar de migraciones Prisma/PostgreSQL sin requerir nuevo ADR.
- [x] **CP-6: Higiene del Código**: Cumplido. Archivo residual `!f[k].trim()).length` eliminado, sin lockfiles ajenos (`package-lock.json` / `yarn.lock`) ni artefactos muertos.
- [x] **CP-7: Estándar de Calidad Pre-Commit**: Cumplido. Fase 3 de `precommit-check.ps1` (barrido anti-SonarCloud y guarda SQL `55P04`) en verde, y barrido directo de `ADD VALUE` confirma que `20261116235959_add_superuser_role_enum/migration.sql` es la única migración con `ADD VALUE`.

---

## 3. Evidencia Ejecutada por el Reviewer (Salida Literal)

### 3.1 Gate Pre-Commit (PostgreSQL 16 + `migrate:deploy` + Integración RLS/Locking/Idempotency + Barrido `55P04` / Anti-Sonar)

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
┌─────────────────────────────────────────────────────────┐
│  Update available 5.22.0 -> 8.0.0-rc.34                 │
│                                                         │
│  This is a major update - please follow the guide at    │
│  https://pris.ly/d/major-version-upgrade                │
│                                                         │
│  Run the following to update                            │
│    npm i --save-dev prisma@latest                       │
│    npm i @prisma/client@latest                          │
└─────────────────────────────────────────────────────────┘
[OK] Todas las migraciones aplicadas limpiamente en wms_test.

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api

 ✓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests) 178ms
 ✓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests) 293ms
 ✓ src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts (2 tests) 362ms

 Test Files  3 passed (3)
      Tests  8 passed (8)
   Start at  01:25:27
   Duration  1.32s (transform 318ms, setup 0ms, collect 754ms, tests 834ms, environment 1ms, prepare 818ms)

[OK] Suite de integracion PostgreSQL (RLS, FOR UPDATE, Idempotency) en VERDE.

==> Fase 3: Barrido Anti-SonarCloud (CP-7) y validacion de migraciones SQL

==========================================================
  PRECOMMIT PASSED: CI + Postgres RLS + Sonar Checks OK   
==========================================================
```

### 3.2 Verificación Adicional de Limpieza, Consistencia de Schema y Barrido `ADD VALUE`

Comandos ejecutados:
```powershell
Test-Path -LiteralPath '!f[k].trim()).length'
pnpm --filter @wms/db exec prisma validate
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:15432/wms_test"; pnpm --filter @wms/db exec prisma migrate status
$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:15432/wms_test"; pnpm --filter @wms/db exec prisma migrate diff --from-url "postgresql://postgres:postgres@127.0.0.1:15432/wms_test" --to-schema-datamodel prisma/schema.prisma --script
Get-ChildItem -Path packages/db/prisma/migrations -Recurse -Filter "migration.sql" | Select-String -Pattern "ADD\s+VALUE" -CaseSensitive:$false
```

Salidas literales (`Command exited with code 0`):
```text
False
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
The schema at prisma\schema.prisma is valid 🚀
Environment variables loaded from .env
Prisma schema loaded from prisma\schema.prisma
Datasource "db": PostgreSQL database "wms_test", schema "public" at "127.0.0.1:15432"

8 migrations found in prisma/migrations

Database schema is up to date!
```

```text
-- This is an empty migration.
```

```text
packages\db\prisma\migrations\20261116235959_add_superuser_role_enum\migration.sql:1:ALTER TYPE "UserRole" ADD VALUE 
IF NOT EXISTS 'SUPERUSER';
```
