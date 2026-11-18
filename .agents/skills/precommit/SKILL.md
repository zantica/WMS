---
name: precommit
description: >-
  Pre-commit and pre-push verification skill for WMS SaaS. Runs the full CI parity checks locally
  (build, unit tests, >=80% coverage, real PostgreSQL 16 integration with fresh migrations and
  non-superuser RLS role app_test, and SonarCloud/SonarQube quality checks) before allowing git commit or git push.
---

# WMS Pre-Commit & Pre-Push Gate Skill (`precommit`)

Usa esta skill **siempre antes de hacer `git commit` o `git push`** (y como paso obligatorio del subagente `committer`) para garantizar en local que los dos pipelines críticos del remoto estarán en verde:

1. **CI `quality-and-unit` + `integration-postgres`** (`.github/workflows/ci.yml`)
2. **SonarCloud / SonarQube (`zantica_WMS`)** (`sonar-project.properties` / `.sonarcloud.properties` + `CHECKPOINTS.md` CP-7)

> **Regla de Oro**: Si cualquiera de las fases falla, **NO** hagas `git commit` ni `git push`. Corrige el fallo, vuelve a ejecutar `precommit` hasta obtener todo en **VERDE**, y recién entonces publica.

---

## Ejecución Rápida (Script Automatizado)

En Windows PowerShell (raíz del repositorio):

```powershell
.\.agents\skills\precommit\scripts\precommit-check.ps1 -CheckSonarApi
```

Flags útiles:
- `-SkipUnit`: Omite `pnpm build` / `pnpm test` / `test:coverage` si ya los acabas de ejecutar y solo quieres validar **Postgres Integration + Sonar**.
- `-CheckSonarApi`: Consulta además el estado actual del Quality Gate público en SonarCloud (`zantica_WMS`) vía API REST.

---

## Protocolo Detallado (4 Fases)

### Fase 1 — Calidad, Build y Unitarios (paridad con CI `quality-and-unit`)
1. **Guardas de repositorio**:
   - Sin `package-lock.json` ni `yarn.lock` en el repo (solo `pnpm-lock.yaml`).
   - Sin archivos `.env`, `.env.local`, `.env.test` o `.env.production` en staging (`git status --short`).
   - `feature_list.json` debe ser JSON válido.
2. **Compilación y tests unitarios**:
   - `pnpm db:generate`
   - `pnpm build`
   - `pnpm test`
   - `pnpm --filter @wms/api test:coverage` (umbral ≥ 80% en `branches`, `functions`, `lines` de `apps/api/src/use-cases/**`).

---

### Fase 2 — Integración PostgreSQL 16 + RLS (paridad exacta con CI `integration-postgres`)
Los tests `*.integration.test.ts` se saltan por defecto en `pnpm test` si no está definido `RUN_PG_INTEGRATION=true`. Esta fase los ejecuta contra una base de datos **fresca** con el rol restringido `app_test` (no-superusuario, sin `BYPASSRLS`):

1. **Asegurar PostgreSQL 16 activo**:
   - `docker compose up -d --wait` (contenedor `wms-postgres` en `127.0.0.1:15432`).
2. **Base de datos limpia `wms_test`**:
   - Recrear `wms_test` (`DROP DATABASE IF EXISTS wms_test; CREATE DATABASE wms_test;`).
   - Aplicar **todas** las migraciones desde cero con `DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:15432/wms_test` usando `pnpm --filter @wms/db migrate:deploy` (nunca `db push`).
   - Si falla una migración (por ejemplo error `55P04` por usar un valor de `ENUM` recién añadido en la misma transacción), **detenerse y corregir la migración**.
3. **Rol no-superusuario `app_test`**:
   - Crear/asegurar `app_test` (`NOSUPERUSER NOBYPASSRLS NOINHERIT`) con permisos `SELECT, INSERT, UPDATE, DELETE` sobre tablas y `USAGE, SELECT` sobre secuencias del esquema `public`.
4. **Ejecutar tests de integración reales**:
   - Con `RUN_PG_INTEGRATION=true` y `DATABASE_URL=postgresql://app_test:app_test@127.0.0.1:15432/wms_test`:
     - `apps/api/src/use-cases/security/__tests__/tenant-rls.integration.test.ts`
     - `apps/api/src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts`
     - `apps/api/src/use-cases/tasks/__tests__/idempotency.integration.test.ts`

---

### Fase 3 — Verificación SonarQube / SonarCloud (`zantica_WMS`)
1. **Barrido estático automático (script `precommit-check.ps1`)**:
   - `typescript:S2245`: Cero usos de `Math.random()` en `apps/` o `packages/` (usar `crypto.randomUUID()`, `crypto.getRandomValues()` o contador determinista).
   - `typescript:S8786`: Detectar regex con cuantificadores super-lineales / ReDoS (ej. `/\/+$/`).
   - `shell:S7688`: En scripts `.sh`, usar `[[ ... ]]` en lugar de `[ ... ]`.
   - `S6505`: En scripts `.sh` y `.github/workflows/*.yml`, `pnpm install` debe incluir `--ignore-scripts`.
   - `githubactions:S7637`: Acciones de terceros en `.github/workflows/*.yml` fijadas por SHA completo de 40 caracteres.
   - **Migraciones SQL (`55P04`)**: Detectar si un mismo `migration.sql` combina `ALTER TYPE ... ADD VALUE` con un uso posterior del nuevo valor en la misma transacción.
   - **Cero `process.env` en lógica de dominio**: Ningún archivo en `use-cases/**` o `ports/**` lee `process.env` ni `import.meta.env`.
2. **Revisión semántica de `git diff` (agente / desarrollador)**:
   - `typescript:S9383`: Sin promesas flotantes sin `await`, `.catch(...)` o `void`.
   - `typescript:S3776` / `S1128` / `S6582`: Sin complejidad cognitiva excesiva, sin imports/variables sin usar, sin código duplicado (CPD según `sonar.cpd.exclusions` en `sonar-project.properties`), sin `console.log` de depuración ni `.only` en tests.
3. **SonarScanner / API SonarCloud (opcional si hay red/token)**:
   - Si `SONAR_TOKEN` está disponible en el entorno y `sonar-scanner` está instalado, ejecutar `sonar-scanner` usando `sonar-project.properties`.
   - Consultar `https://sonarcloud.io/api/qualitygates/project_status?projectKey=zantica_WMS` para confirmar que el último análisis en `main` no dejó deuda pendiente.

---

### Fase 4 — Gate Final
- Si **Fase 1 + Fase 2 + Fase 3** terminan con `exit code 0` y 0 hallazgos bloqueantes:
  - El código está listo para `git commit` (atómico por capa lógica según `.claude/agents/committer.md`) y `git push`.
- Si alguna fase falla:
  - **Abortar `git commit` / `git push`** y corregir primero el fallo reportado.
