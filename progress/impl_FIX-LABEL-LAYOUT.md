# Reporte de Implementación: FIX-LABEL-LAYOUT — Mejora visual y metadatos de etiquetas QR/Code128

- **Estado**: DONE
- **Fecha**: 2026-11-17

## Archivos Creados / Modificados / Eliminados
- `apps/api/src/use-cases/labels/generate-product-labels.ts`: Cuando `useBarcodeAsPayload === true` y `prod.barcode?.trim()` existe, el `payload` usa el barcode limpio y `subtitle` muestra `SKU: ${prod.sku.trim()}` junto a `Cat: ...` sin repetir `EAN: ...`. Cuando se usa SKU como payload, mantiene `Cat: ... • EAN: ...`.
- `apps/web/src/components/labels/label-print-modal.tsx`: Cambiado estado inicial de `useBarcodeAsPayload` a `useState<boolean>(entityType === "PRODUCT")` para mostrar por defecto el barcode comercial en impresión de productos (con fallback automático a SKU si no tiene barcode).
- `apps/api/src/adapters/svg-label-renderer.ts`: Ajustado `qrSizeMm` en QR apaisado a `Math.min(contentHeightMm - 2, contentWidthMm * 0.36)`; añadido helper puro `wrapSvgText` (sin backtracking super-lineal, SonarCloud safe) con `<tspan x="..." dy="...">` para título (hasta 2 líneas, `3.4`/`3.9`) y subtítulo dinámico (hasta 3 líneas, `2.4`/`2.9`); añadido ajuste `fitSvgSingleLine` para código legible inferior y para títulos/subtítulos/código en layout `CODE128` y QR vertical.
- `apps/api/src/use-cases/labels/__tests__/generate-labels.test.ts`: Añadida aserción explícita de `SKU:` (sin `EAN:`) en `subtitle` cuando `useBarcodeAsPayload: true` y verificación de `Cat: ... • EAN: ...` cuando usa SKU.
- `apps/api/src/adapters/__tests__/label-renderer.test.ts`: Añadidos tests para QR `70x35` con múltiples `<tspan>` sin pérdida de texto, escalado de `font-size` del código legible largo, ajuste/truncado en `CODE128` estrecho (`50x25`) y casos borde de `wrapSvgText`.
- `apps/web/src/components/labels/__tests__/label-print-modal.test.tsx`: Añadida aserción de que el checkbox `"Usar EAN comercial si existe"` inicia marcado (`checked=""`) para `entityType="PRODUCT"`.

## Decisiones de Diseño e Invariantes
- **Multi-tenancy & Contratos**: Se mantiene `useBarcodeAsPayload` opcional (`false` por defecto en `generateProductLabels`) para preservar retrocompatibilidad del caso de uso y la API; el aislamiento `tenantId` permanece intacto.
- **Renderizado SVG Puro (Hexagonal + SonarCloud Safe)**: `wrapSvgText` y `fitSvgSingleLine` operan sobre texto sin escapar (aplicando `escapeXml` por línea final para no romper entidades XML al dividir o truncar) y usan `split(/\s/)` sin cuantificadores repetitivos ni backtracking super-lineal. En `fitSvgSingleLine` se redondea hacia abajo a 2 decimales (`Math.floor(rawScaled * 100) / 100`) para evitar truncados espúreos cuando el código sí cabe al escalar.

## Resultados de Verificación (salida literal, no parafraseada)
- `pnpm build`: exit code 0 — `Tasks: 6 successful, 6 total` (`@wms/db`, `@wms/domain`, `@wms/shared-types`, `@wms/web`, `@wms/api`, `@wms/mobile`).
- `pnpm --filter @wms/web test`: exit code 0 — `Test Files  7 passed (7)`, `Tests  48 passed (48)`.
- `pnpm --filter @wms/api test:coverage`: exit code 0 — `Test Files  28 passed | 3 skipped (31)` (3 suites de integración PostgreSQL omitidas sin DB activa), `Tests  371 passed | 8 skipped (379)`.
  - Cobertura `use-cases`: `All files: 93.26% Stmts | 86.47% Branch | 96.66% Funcs | 93.26% Lines` (`labels/generate-product-labels.ts`: `93.02% Stmts | 83.33% Branch | 100% Funcs | 93.02% Lines`).
