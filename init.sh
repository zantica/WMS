#!/usr/bin/env bash
# init.sh — Verificación de salud del entorno y línea base de tests para WMS SaaS
set -euo pipefail

echo "=================================================="
echo "🚀 WMS Harness — Pre-Flight Check (init.sh)"
echo "=================================================="

# 1. Verificar Node y pnpm
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Error: Node.js no está instalado o no está en el PATH."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ Error: pnpm no está instalado. Instálalo con: npm install -g pnpm"
  exit 1
fi

echo "✓ Node: $(node -v) | pnpm: $(pnpm -v)"

# 2. Verificar node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 Instalando dependencias con pnpm install..."
  pnpm install
fi

# 3. Generar cliente Prisma si hace falta
echo "🔧 Verificando cliente Prisma (@wms/db)..."
pnpm db:generate

# 4. Compilación TypeScript y tests base
echo "🧪 Ejecutando compilación y suite de tests base..."
pnpm test

echo "=================================================="
echo "✅ Entorno WMS verificado y listo para trabajar."
echo "=================================================="
