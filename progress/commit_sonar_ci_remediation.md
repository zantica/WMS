# Reporte de Quality Gate y Publicación: Remediación CI PostgreSQL (`25P02`) y SonarCloud (`zantica_WMS`)
- **ESTADO**: PUBLISHED
- **Fecha**: 2026-11-10
- **Rama**: `main`

## 1. Auditoría de Calidad (4 Pilares)
- [x] **Pilar 1 — SOLID**: SRP, OCP, LSP, ISP y DIP verificados en los cambios (`apps/mobile/src/api/client.ts`, `apps/web/src/lib/api-client.ts`, `apps/api/src/use-cases/security/__tests__/tenant-rls.integration.test.ts`).
- [x] **Pilar 2 — Cero Envars / Secretos en Código**: Sin `process.env` en casos de uso/dominio, sin credenciales hardcodeadas ni archivos `.env` en staging.
- [x] **Pilar 3 — Arquitectura Hexagonal & Checkpoints (CP-1 a CP-7 + Reglas SonarCloud)**:
  - `typescript:S2245`: Eliminado `Math.random()` en los generadores de `correlationId` de `@wms/mobile` y `@wms/web` (sustituido por `crypto.randomUUID()` con contador monotónico determinista `fallbackCorrelationSeq`).
  - `typescript:S8786`: Eliminada la expresión regular con backtracking super-lineal `/\/+$/` en `normalizeBaseUrl` de `@wms/mobile` y `@wms/web` (sustituida por recorte lineal $O(n)$ con `charCodeAt(end - 1) === 47`).
  - `shell:S7688` y `shell:S6505`: Sustituidos condicionales `[ ... ]` por `[[ ... ]]` y añadido `--ignore-scripts` a `pnpm install` en `init.sh`.
  - `githubactions:S7637` y `githubactions:S6505`: Fijada la acción `pnpm/action-setup` al SHA completo `b906affcce14559ad1aafd4ab0e942779e9f58b1` y añadido `--ignore-scripts` a `pnpm install --frozen-lockfile` en los dos jobs de `.github/workflows/ci.yml`.
  - Remediación `25P02` en PostgreSQL RLS (`tenant-rls.integration.test.ts`): Aislado el intento de spoofing `WITH CHECK` en su propia transacción `withTenantContext` y añadido borrado ordenado de entidades hijas por tenant en `afterAll`.
  - Reglas SonarCloud incorporadas en `CHECKPOINTS.md` (CP-7), `.claude/agents/reviewer.md`, `.claude/agents/committer.md`, `.claude/agents/leader.md` y `KNOWLEDGE.md` (Bug #7).
- [x] **Pilar 4 — Suite Completa de Tests y Compilación**: `pnpm build`, `pnpm test` y `pnpm --filter @wms/api test:coverage` ejecutados en verde (`exit code 0`).

## 2. Evidencia Ejecutada
```text
$ pnpm build
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 5 packages
   • Remote caching disabled

 Tasks:    5 successful, 5 total
Cached:    2 cached, 5 total
  Time:    7.695s
Exit code: 0

$ pnpm test
> wms@0.0.1 test C:\Users\santi\Documents\projects\WMS
> turbo run test

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/mobile, @wms/shared-types, @wms/web
   • Running test in 5 packages

@wms/api:test:    Test Files  13 passed | 1 skipped (14)
@wms/api:test:         Tests  158 passed | 3 skipped (161)
@wms/web:test:    Test Files  2 passed (2)
@wms/web:test:         Tests  11 passed (11)
@wms/mobile:test: Test Files  3 passed (3)
@wms/mobile:test:      Tests  23 passed (23)

 Tasks:    5 successful, 5 total
Cached:    3 cached, 5 total
  Time:    2.758s
Exit code: 0

$ pnpm --filter @wms/api test:coverage
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 Test Files  13 passed | 1 skipped (14)
      Tests  158 passed | 3 skipped (161)

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
Exit code: 0
```

## 3. Commits Atómicos Creados y Push (si ESTADO = PUBLISHED)
- `cdf63f5` `fix(tests): address transaction abortion issue in PostgreSQL RLS tests and improve cleanup logic`
- `a01e309` `fix(clients): replace Math.random fallback and super-linear trailing-slash regex (SonarCloud S2245, S8786)`
- `d71b8c2` `fix(ci): pin pnpm/action-setup SHA and enforce --ignore-scripts and Bash [[ ]] (SonarCloud S7637, S6505, S7688)`
- `e8e169c` `chore(harness): integrate SonarCloud zero-issue checks into CP-7 and subagent workflows`
- `docs(progress): record SonarCloud and PostgreSQL CI remediation report`
- **Resultado de `git push`**: Publicado en `origin/main` (`cdf63f5..HEAD -> main`).

## 4. Motivo de Rechazo o Bloqueo (si ESTADO = REJECTED | BLOCKED)
- Ninguno.
