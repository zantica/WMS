# Reporte de Implementación: `FIX-LABEL-PAYLOAD` — Generación de Etiquetas sin Prefijos Extra y Resiliencia en Escaneo

- **Estado**: DONE
- **Fecha**: 2026-11-17

## Archivos Creados / Modificados / Eliminados
- `apps/api/src/use-cases/labels/generate-location-labels.ts`: Eliminado el uso de `buildLocationBarcode`; el `payload` (para `barcodePayload` y `humanReadableText`) ahora usa el código limpio en mayúsculas (`loc.code.trim().toUpperCase()`), sin prefijo `LOC:`.
- `apps/api/src/use-cases/labels/generate-product-labels.ts`: Eliminados `buildBarcodePayload` y `buildProductSkuBarcode`; el `payload` (para `barcodePayload` y `humanReadableText`) usa `prod.barcode.trim()` cuando `useBarcodeAsPayload && prod.barcode?.trim()`, o `prod.sku.trim()` en caso contrario, sin prefijos `SKU:` ni `EAN:`.
- `apps/api/src/use-cases/labels/__tests__/generate-labels.test.ts`: Actualizadas aserciones para verificar `barcodePayload`, `humanReadableText` y SVG sin `LOC:`, `SKU:` ni `EAN:`.
- `apps/api/src/routes/v1/__tests__/labels.test.ts`: Actualizadas aserciones HTTP (`POST /api/v1/labels/locations` y `/products`) para verificar `barcodePayload`, `humanReadableText` y SVG sin prefijos.
- `apps/api/src/use-cases/tasks/confirm-task-step.ts`: Integrado `parseBarcodePayload(scannedCode)` de `@wms/shared-types` para aceptar códigos limpios y códigos heredados con prefijo (`SKU:`, `EAN:`, `LOC:`) respetando entidad esperada, trim y case-insensitivity.
- `apps/api/src/use-cases/tasks/confirm-receipt-line.ts`: Integrado `parseBarcodePayload(barcode)` de `@wms/shared-types` para aceptar tanto códigos limpios como prefijos `SKU:` / `EAN:` (rechazando prefijos de otra entidad como `LOC:`).
- `apps/mobile/src/workflows/picking.ts`: Actualizado `validateLocationScan` con `extractLocationCode` y `validateProductScan` con `extractProductCode` (de `@wms/shared-types`) junto con `normalizeScanCode`.
- `apps/mobile/src/workflows/inbound-putaway.ts`: Actualizado `matchReceivingStepByScan` con `extractProductCode` (de `@wms/shared-types`) junto con `normalizeScanCode`.
- `apps/mobile/app/(tabs)/scanner.tsx`: En `handleScan` (modo consulta rápida), extraído el código limpio mediante `parseBarcodePayload(scannedCode).value || scannedCode` antes de consultar `client.searchProducts` y filtrar `allBalances`.
- `apps/api/src/use-cases/tasks/__tests__/confirm-task-step.test.ts`: Añadidos tests para escaneo resiliente con/sin prefijos (`sku:`, `EAN:`, `loc:`) y rechazo de prefijos de entidad cruzada o vacíos.
- `apps/api/src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts`: Añadidos tests para validación de `barcode` con prefijo (`EAN:`, `sku:`) y rechazo de `LOC:`.
- `apps/mobile/src/workflows/__tests__/picking.test.ts`: Añadidos tests para `validateLocationScan`, `validateProductScan` y `advanceDualScanState` con y sin prefijos (`LOC:`, `SKU:`, `EAN:`).
- `apps/mobile/src/workflows/__tests__/inbound-putaway.test.ts`: Añadidos tests para `matchReceivingStepByScan` con y sin prefijos (`EAN:`, `sku:`, vacío tras prefijo).

## Decisiones de Diseño e Invariantes
- **Compatibilidad hacia atrás sin romper `@wms/shared-types`**: Se mantuvieron intactos `packages/shared-types/src/barcode-payload.ts` y `apps/api/src/shared/__tests__/barcode-payload.test.ts`, reutilizando `parseBarcodePayload`, `extractLocationCode` y `extractProductCode` en la capa de casos de uso y workflows móviles.
- **Seguridad de entidad en prefijos heredados**: En `confirmTaskStep` y `confirmReceiptLine`, cuando un código escaneado sí incluye prefijo explícito, `LOC:` solo puede validar `locationCode` y `SKU:`/`EAN:` solo pueden validar `productSku`/`productBarcode`, evitando colisiones accidentales y rechazando valores vacíos tras el prefijo (`"LOC:   "`).
- **Multi-tenancy y Ledger intactos**: No se alteraron consultas ni transacciones `Serializable` del Ledger; toda validación ocurre dentro de las fronteras existentes por `tenantId`.

## Resultados de Verificación (salida literal, no parafraseada)
- `pnpm build`: exit code `0` (`Tasks: 6 successful, 6 total`, `4 cached, 6 total`, `Time: 7.499s`).
- `pnpm --filter @wms/mobile test`: exit code `0` (`Test Files  11 passed (11)`, `Tests  69 passed (69)`).
- `pnpm --filter @wms/api test:coverage`: exit code `0` (`Test Files  28 passed | 3 skipped (31)`, `Tests  368 passed | 8 skipped (376)`; los 3 skipped corresponden a suites de integración PostgreSQL sin BD activa). Tabla de cobertura de `use-cases`:
```text
 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.25 |    86.42 |   96.66 |   93.25 |                   
 catalog           |   99.16 |    92.17 |     100 |   99.16 |                   
  ...categories.ts |   99.05 |    96.77 |     100 |   99.05 | 124               
  ...e-products.ts |    99.2 |    90.47 |     100 |    99.2 | 233,294           
 diagnostics       |   99.36 |    93.84 |     100 |   99.36 |                   
  ...tic-errors.ts |     100 |      100 |     100 |     100 |                   
  ...stic-error.ts |   97.29 |    63.63 |     100 |   97.29 | 34                
  ...-sensitive.ts |     100 |      100 |     100 |     100 |                   
 integrations      |     100 |    90.14 |     100 |     100 |                   
  ...rnal-order.ts |     100 |    94.87 |     100 |     100 | 123,200           
  ...er-shipped.ts |     100 |    84.37 |     100 |     100 | ...22,128,152,187 
 inventory         |    98.1 |       90 |     100 |    98.1 |                   
  ...cate-order.ts |     100 |       92 |     100 |     100 | 80,95             
  cancel-order.ts  |   99.16 |     93.1 |     100 |   99.16 | 111               
  ...taway-task.ts |   98.37 |     91.3 |     100 |   98.37 | 166-167           
  ...-exception.ts |    95.9 |    83.72 |     100 |    95.9 | ...00,160,280-281 
  move-stock.ts    |     100 |       95 |     100 |     100 | 111               
 labels            |    92.5 |    83.01 |     100 |    92.5 |                   
  ...ion-labels.ts |    92.3 |       84 |     100 |    92.3 | 23-28             
  ...uct-labels.ts |   92.68 |    82.14 |     100 |   92.68 | 23-28             
 security          |     100 |      100 |     100 |     100 |                   
  ...nt-context.ts |     100 |      100 |     100 |     100 |                   
 tasks             |   82.91 |    81.39 |   81.81 |   82.91 |                   
  ...ceipt-line.ts |   85.16 |    89.23 |      60 |   85.16 | ...61-262,265-285 
  ...-task-step.ts |   83.14 |    83.83 |     100 |   83.14 | ...28-333,445-455 
  ...task-batch.ts |   80.59 |    66.66 |     100 |   80.59 | ...08,224-232,296 
 topology          |      88 |     61.9 |     100 |      88 |                   
  ...-locations.ts |      88 |     61.9 |     100 |      88 | ...47-348,354-359 
 users             |     100 |      100 |     100 |     100 |                   
  manage-users.ts  |     100 |      100 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------
```
