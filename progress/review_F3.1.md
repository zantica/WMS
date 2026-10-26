# Reporte de Revisión: `F3.1`

- **VEREDICTO**: APPROVED
- **Fecha**: 2026-10-26

## Evaluación de Checkpoints
- [x] CP-1: Integridad del Inventory Ledger
- [x] CP-2: Aislamiento Multi-Tenant
- [x] CP-3: Contratos de API, Tipado y Monorepo
- [x] CP-4: Verificación Automatizada y Cobertura (>= 80%)

## Resumen de Auditoría
1. **Integridad del Ledger y Concurrencia (`CP-1`)**:
   - `apps/api/src/use-cases/inventory/cancel-order.ts` ejecuta toda la operación dentro de `prisma.$transaction(..., { isolationLevel: "Serializable", timeout: 15_000 })`.
   - Bloquea de forma pesimista las filas de `inventory_balances` mediante `SELECT id, on_hand_qty, allocated_qty FROM inventory_balances WHERE tenant_id = ${tenantId} AND location_id = ${step.locationId} AND product_id = ${step.productId} FOR UPDATE`.
   - Respeta la inmutabilidad del Ledger insertando únicamente asientos `create` con `reason: "ALLOCATION_CANCEL"` y protege contra saldos negativos acotando `toRelease = Math.min(Math.max(0, Number(balance.allocated_qty)), remainingToRelease)`.
2. **Aislamiento Multi-Tenant (`CP-2`)**:
   - Todas las lecturas (`salesOrder.findFirst`, `tasks` incluidas y `$queryRaw` sobre `inventory_balances`) y escrituras filtran por `tenantId`, devolviendo `WmsError("ORDER_NOT_FOUND", ..., 404)` ante pedidos inexistentes o de otro tenant.
3. **Contratos, Validación Zod y TypeScript Estricto (`CP-3`)**:
   - `apps/api/src/routes/orders.ts` expone `POST /api/v1/orders/:id/cancel` validando el cuerpo con `CancelOrderSchema` (Zod) y devolviendo `ApiResponse<CancelOrderResult>`.
   - Cumple con `moduleResolution: "NodeNext"` (imports `.js`), `exactOptionalPropertyTypes: true` (`userId?: string | undefined`, `reason?: string | undefined`) y `noUncheckedIndexedAccess: true` (verificación explícita de `lockedBalances[0]`).
4. **Cobertura de Tests (`CP-4`)**:
   - `apps/api/src/use-cases/inventory/__tests__/cancel-order.test.ts` cubre todas las ramas lógicas (10 ejecuciones de test): `404` por inexistencia o tenant distinto, `409` en estados terminales (`PACKED`, `SHIPPED`, `CANCELLED`), cancelación sin reservas (`PENDING`, `ON_HOLD`), liberación total (`ALLOCATED`), liberación parcial en `PICKING` (`expectedQty - scannedQty` ignorando pasos `COMPLETED`) y protección de no-negatividad en `allocatedQty`.
