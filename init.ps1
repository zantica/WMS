# init.ps1 - Verificacion de salud del entorno y linea base de tests para WMS SaaS (Windows PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "[WMS Harness] Pre-Flight Check (init.ps1)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Asegurar que PowerShell y Node/pnpm estan en PATH si el entorno no los incluyo
$psHomeDir = "$env:SystemRoot\System32\WindowsPowerShell\v1.0"
if ($env:PATH -notlike "*$psHomeDir*") {
    $env:PATH = "$psHomeDir;$env:PATH"
}

# 2. Verificar Node y pnpm
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] Node.js no esta instalado o no esta en el PATH."
    exit 1
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error "[ERROR] pnpm no esta instalado. Instalalo con: npm install -g pnpm"
    exit 1
}

$nodeVer = node -v
$pnpmVer = pnpm -v
Write-Host "[OK] Node: $nodeVer | pnpm: $pnpmVer" -ForegroundColor Green

# 3. Verificar node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "[*] Instalando dependencias con pnpm install..." -ForegroundColor Yellow
    pnpm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# 4. Generar cliente Prisma
Write-Host "[*] Verificando cliente Prisma (@wms/db)..." -ForegroundColor Yellow
$prismaGenerated = Test-Path "node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/index.js"
if (-not $prismaGenerated) {
    # Check alternative path
    $prismaGenerated = Test-Path "packages/db/node_modules/.prisma/client/index.js"
}

try {
    pnpm db:generate
} catch {
    if ($prismaGenerated) {
        Write-Warning "[WARN] El cliente Prisma ya esta generado pero el archivo DLL esta bloqueado por un proceso Node en ejecucion (EPERM en Windows). Se continua usando el cliente generado."
    } else {
        Write-Error "[ERROR] Fallo la generacion de Prisma y no existe un cliente previo."
        exit 1
    }
}

# 5. Ejecutar tests base
Write-Host "[*] Ejecutando compilacion y suite de tests base..." -ForegroundColor Yellow
pnpm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==================================================" -ForegroundColor Green
Write-Host "[OK] Entorno WMS verificado y listo para trabajar." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
