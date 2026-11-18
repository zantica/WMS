# .agents/skills/precommit/scripts/precommit-check.ps1
# Gate local pre-commit / pre-push para WMS SaaS:
#   1. Build, lint/typecheck, tests unitarios y cobertura >= 80%
#   2. Integración real PostgreSQL 16 (migraciones desde cero + rol app_test sin BYPASSRLS)
#   3. Barrido estático Anti-SonarCloud (CP-7) + guarda de migraciones ENUM (55P04)

param(
    [switch]$SkipUnit,
    [switch]$CheckSonarApi
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")).Path
Push-Location $RepoRoot

$Failures = [System.Collections.Generic.List[string]]::new()

function Write-Step($msg) {
    Write-Host "`n==> $msg" -ForegroundColor Cyan
}

function Add-Failure($msg) {
    $Failures.Add($msg)
    Write-Host "[FAIL] $msg" -ForegroundColor Red
}

try {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  WMS Pre-Commit & Pre-Push Gate (CI + PG + SonarCloud)   " -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan

    # ------------------------------------------------------------------
    # FASE 1: Guardas de repositorio, Build, Unit Tests y Cobertura
    # ------------------------------------------------------------------
    Write-Step "Fase 1: Guardas de repositorio y validacion de JSON"
    foreach ($lock in @("package-lock.json", "yarn.lock")) {
        if (Test-Path $lock) {
            Add-Failure "Se encontro '$lock' en la raiz. Solo se permite pnpm-lock.yaml."
        }
    }

    $stagedFiles = git diff --cached --name-only 2>$null
    if ($stagedFiles) {
        foreach ($f in $stagedFiles) {
            if ($f -match '(^|/)\.env(\.|$)' -and $f -notmatch '\.env\.example$') {
                Add-Failure "Archivo de entorno en staging: $f"
            }
        }
    }

    try {
        $null = Get-Content "feature_list.json" -Raw | ConvertFrom-Json
        Write-Host "[OK] feature_list.json es JSON valido." -ForegroundColor Green
    } catch {
        Add-Failure "feature_list.json tiene JSON invalido: $_"
    }

    if (-not $SkipUnit) {
        Write-Step "Fase 1b: Prisma generate, pnpm build, pnpm test y test:coverage"
        pnpm db:generate
        if ($LASTEXITCODE -ne 0) { Add-Failure "pnpm db:generate fallo (exit $LASTEXITCODE)" }

        pnpm build
        if ($LASTEXITCODE -ne 0) { Add-Failure "pnpm build fallo (exit $LASTEXITCODE)" }

        pnpm test
        if ($LASTEXITCODE -ne 0) { Add-Failure "pnpm test fallo (exit $LASTEXITCODE)" }

        pnpm --filter @wms/api test:coverage
        if ($LASTEXITCODE -ne 0) { Add-Failure "pnpm --filter @wms/api test:coverage fallo o bajo del 80% (exit $LASTEXITCODE)" }
    } else {
        Write-Host "[SKIP] Fase 1b omitida por -SkipUnit." -ForegroundColor Yellow
    }

    # ------------------------------------------------------------------
    # FASE 2: Integracion PostgreSQL 16 (paridad exacta con .github/workflows/ci.yml)
    # ------------------------------------------------------------------
    Write-Step "Fase 2: Integracion PostgreSQL 16 (BD limpia wms_test + migrate:deploy + rol app_test)"

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Add-Failure "Docker no esta disponible en PATH para levantar PostgreSQL 16."
    } else {
        docker compose up -d --wait | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Add-Failure "docker compose up -d --wait fallo."
        } else {
            Write-Host "[OK] Contenedor wms-postgres saludable." -ForegroundColor Green

            docker exec wms-postgres psql -U postgres -c "DROP DATABASE IF EXISTS wms_test;" | Out-Null
            docker exec wms-postgres psql -U postgres -c "CREATE DATABASE wms_test;" | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Add-Failure "No se pudo recrear la base de datos limpia wms_test."
            } else {
                $prevDbUrl = $env:DATABASE_URL
                $prevRunPg = $env:RUN_PG_INTEGRATION
                try {
                    $env:DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:15432/wms_test"
                    pnpm --filter @wms/db migrate:deploy
                    if ($LASTEXITCODE -ne 0) {
                        Add-Failure "prisma migrate:deploy fallo sobre BD limpia wms_test (exit $LASTEXITCODE)."
                    } else {
                        Write-Host "[OK] Todas las migraciones aplicadas limpiamente en wms_test." -ForegroundColor Green

                        $roleSql = @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_test') THEN
    CREATE ROLE app_test LOGIN PASSWORD 'app_test' NOSUPERUSER NOBYPASSRLS NOINHERIT;
  END IF;
END `$`$;
GRANT CONNECT ON DATABASE wms_test TO app_test;
GRANT USAGE ON SCHEMA public TO app_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_test;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_test;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_test;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_test;
"@
                        $roleSql | docker exec -i wms-postgres psql -U postgres -d wms_test | Out-Null
                        if ($LASTEXITCODE -ne 0) {
                            Add-Failure "No se pudo configurar el rol no-superusuario app_test."
                        } else {
                            $env:DATABASE_URL = "postgresql://app_test:app_test@127.0.0.1:15432/wms_test"
                            $env:RUN_PG_INTEGRATION = "true"
                            pnpm --filter @wms/api exec vitest run `
                                src/use-cases/security/__tests__/tenant-rls.integration.test.ts `
                                src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts `
                                src/use-cases/tasks/__tests__/idempotency.integration.test.ts `
                                --reporter=basic
                            if ($LASTEXITCODE -ne 0) {
                                Add-Failure "Fallo la suite de integracion PostgreSQL con rol app_test (exit $LASTEXITCODE)."
                            } else {
                                Write-Host "[OK] Suite de integracion PostgreSQL (RLS, FOR UPDATE, Idempotency) en VERDE." -ForegroundColor Green
                            }
                        }
                    }
                } finally {
                    $env:DATABASE_URL = $prevDbUrl
                    $env:RUN_PG_INTEGRATION = $prevRunPg
                }
            }
        }
    }

    # ------------------------------------------------------------------
    # FASE 3: Barrido Estatico Anti-SonarCloud (CP-7) & SQL ENUM Check
    # ------------------------------------------------------------------
    Write-Step "Fase 3: Barrido Anti-SonarCloud (CP-7) y validacion de migraciones SQL"

    $tsFiles = Get-ChildItem -Path "apps", "packages" -Recurse -Include *.ts, *.tsx -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch '\\(node_modules|dist|build|coverage|\.turbo)\\' }

    # 3.1 typescript:S2245 (Math.random)
    $mathRandomHits = $tsFiles | Select-String -Pattern '\bMath\.random\s*\('
    if ($mathRandomHits) {
        foreach ($h in $mathRandomHits) {
            Add-Failure "Sonar typescript:S2245 (Math.random) en $($h.Path):$($h.LineNumber)"
        }
    }

    # 3.2 typescript:S8786 (Regex super-lineal tipica como /\/+$/)
    $redosHits = $tsFiles | Select-String -Pattern '/\\/\+\$/'
    if ($redosHits) {
        foreach ($h in $redosHits) {
            Add-Failure "Sonar typescript:S8786 (regex super-lineal) en $($h.Path):$($h.LineNumber)"
        }
    }

    # 3.3 No process.env en use-cases o ports
    $domainFiles = $tsFiles | Where-Object { $_.FullName -match '\\(use-cases|ports)\\' -and $_.FullName -notmatch '__tests__|\.test\.|\.spec\.' }
    $envHits = $domainFiles | Select-String -Pattern '\b(process\.env|import\.meta\.env)\b'
    if ($envHits) {
        foreach ($h in $envHits) {
            Add-Failure "Pilar 2 (process.env en dominio/puertos) en $($h.Path):$($h.LineNumber)"
        }
    }

    # 3.4 .only en tests
    $testFiles = $tsFiles | Where-Object { $_.Name -match '\.(test|spec)\.(ts|tsx)$' }
    $onlyHits = $testFiles | Select-String -Pattern '\b(it|describe|test)\.only\s*\('
    if ($onlyHits) {
        foreach ($h in $onlyHits) {
            Add-Failure "Test con .only en $($h.Path):$($h.LineNumber)"
        }
    }

    # 3.5 Migraciones SQL: ALTER TYPE ... ADD VALUE usado en el mismo archivo (PG 55P04)
    $migrationFiles = Get-ChildItem -Path "packages/db/prisma/migrations" -Recurse -Filter "migration.sql" -ErrorAction SilentlyContinue
    foreach ($mf in $migrationFiles) {
        $sqlText = Get-Content $mf.FullName -Raw
        $addEnumMatches = [regex]::Matches($sqlText, "ALTER\s+TYPE\s+""[^""]+""\s+ADD\s+VALUE(?:\s+IF\s+NOT\s+EXISTS)?\s+'([^']+)'", "IgnoreCase")
        foreach ($m in $addEnumMatches) {
            $enumVal = $m.Groups[1].Value
            $afterAlter = $sqlText.Substring($m.Index + $m.Length)
            if ($afterAlter -match "'$([regex]::Escape($enumVal))'") {
                Add-Failure "PostgreSQL 55P04 en $($mf.FullName): el valor de enum '$enumVal' se usa en la misma transaccion donde se anade."
            }
        }
    }

    # 3.6 SonarCloud API (opcional)
    if ($CheckSonarApi) {
        try {
            $sonarResp = Invoke-RestMethod -Uri "https://sonarcloud.io/api/qualitygates/project_status?projectKey=zantica_WMS" -TimeoutSec 10
            $qgStatus = $sonarResp.projectStatus.status
            Write-Host "[INFO] SonarCloud Quality Gate actual (remoto): $qgStatus" -ForegroundColor Yellow
            if ($qgStatus -ne "OK") {
                Write-Host "[WARN] El Quality Gate remoto en SonarCloud esta en '$qgStatus'." -ForegroundColor Yellow
            }
        } catch {
            Write-Host "[WARN] No se pudo consultar la API de SonarCloud: $_" -ForegroundColor Yellow
        }
    }

    if ($Failures.Count -eq 0) {
        Write-Host "`n==========================================================" -ForegroundColor Green
        Write-Host "  PRECOMMIT PASSED: CI + Postgres RLS + Sonar Checks OK   " -ForegroundColor Green
        Write-Host "==========================================================" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "`n==========================================================" -ForegroundColor Red
        Write-Host "  PRECOMMIT FAILED ($($Failures.Count) bloqueos)          " -ForegroundColor Red
        Write-Host "==========================================================" -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}
