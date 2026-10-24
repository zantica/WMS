# init.ps1 — Verificación de salud del entorno y línea base de tests para WMS SaaS (Windows PowerShell)
$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "🚀 WMS Harness — Pre-Flight Check (init.ps1)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Verificar Node y pnpm
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Error: Node.js no está instalado o no está en el PATH."
    exit 1
}
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error "❌ Error: pnpm no está instalado. Instálalo con: npm install -g pnpm"
    exit 1
}

$nodeVer = node -v
$pnpmVer = pnpm -v
Write-Host "✓ Node: $nodeVer | pnpm: $pnpmVer" -ForegroundColor Green

# 2. Verificar node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Instalando dependencias con pnpm install..." -ForegroundColor Yellow
    pnpm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# 3. Generar cliente Prisma
Write-Host "🔧 Verificando cliente Prisma (@wms/db)..." -ForegroundColor Yellow
pnpm db:generate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. Ejecutar tests base
Write-Host "🧪 Ejecutando compilación y suite de tests base..." -ForegroundColor Yellow
pnpm test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==================================================" -ForegroundColor Green
Write-Host "✅ Entorno WMS verificado y listo para trabajar." -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
