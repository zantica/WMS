# Guía de Verificación y Testing (WMS)

Tanto el subagente `implementer` como el `reviewer` deben seguir estos pasos de verificación antes de dar por buena cualquier tarea.

---

## 1. Verificación Rápida Pre-Flight
Ejecuta el script de inicialización desde la raíz del repositorio:
- **Linux / macOS / Git Bash**: `./init.sh`
- **Windows PowerShell**: `.\init.ps1`

---

## 2. Suite de Verificación Completa (Sin Base de Datos Externa)

Los tests unitarios de casos de uso utilizan mocks de Prisma y **no requieren PostgreSQL activo**:

```bash
# 1. Compilar todos los paquetes y verificar tipos TypeScript (Shared Types -> DB -> API)
pnpm build

# 2. Ejecutar todos los tests unitarios con Turborepo
pnpm test

# 3. Verificar umbrales de cobertura (>= 80% en use-cases)
pnpm --filter @wms/api test:coverage
```

### Criterio de Éxito de Cobertura (`apps/api/vitest.config.ts`)
Vitest fallará automáticamente si en `apps/api/src/use-cases/**` alguno de estos indicadores cae por debajo del **80%**:
- `lines`: ≥ 80%
- `functions`: ≥ 80%
- `branches`: ≥ 80%

---

## 3. Verificación con Base de Datos Local (Opcional / Integración)

Si hay una instancia PostgreSQL corriendo en `localhost:5432`:

```bash
# 1. Sincronizar cliente y migraciones Prisma
pnpm db:generate
pnpm db:migrate

# 2. Poblar datos de prueba (tenant: demo-tenant, apiKey: demo-api-key-12345)
pnpm --filter @wms/db seed

# 3. Levantar API y verificar healthcheck
curl http://localhost:3001/health
curl http://localhost:3001/api/v1/products -H "x-api-key: demo-api-key-12345"
```

---

## 4. Qué Registrar en los Reportes (`progress/`)

- En `progress/impl_<feature_id>.md` (escrito por `implementer`):
  - Lista exacta de archivos creados/modificados.
  - Salida literal (no parafraseada) de `pnpm build` y `pnpm --filter @wms/api test:coverage`. Si no pudo ejecutarse, el estado es `BLOCKED`.
- En `progress/review_<feature_id>.md` (escrito por `reviewer`):
  - Checklist de [`CHECKPOINTS.md`](../CHECKPOINTS.md) marcada ítem por ítem (`[x]` o `[ ]`).
  - Resultado de su propia ejecución de tests y compilación.
  - Veredicto final: `VEREDICTO: APPROVED`, `VEREDICTO: CHANGES_REQUESTED` o `VEREDICTO: BLOCKED`.

> ⚠️ **Regla de evidencia**: `APPROVED` exige la **salida literal** (resumen de Vitest + tabla de cobertura + código de salida) de una ejecución hecha por el propio `reviewer`. "Verificación estática", "pendiente de ejecución local" o resultados copiados del `impl_*.md` equivalen a `BLOCKED`. El `reviewer` nunca puede ser el `leader` ni el `implementer` (ver [`.claude/agents/leader.md`](../.claude/agents/leader.md)).
