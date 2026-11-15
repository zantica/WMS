# Reporte de Implementación: F5.2 — Puerto `LabelRenderer` (QR + Code128) con Prefijos Tipados y Vista Web de Impresión
- **Estado**: DONE
- **Fecha**: 2026-11-15 (Actualizado tras Review `CHANGES_REQUESTED`)

## Correcciones Aplicadas (Review F5.2)
1. **SonarCloud `S2245` (CP-7)**: Eliminado el uso de `Math.random()` en `generate-location-labels.ts` y `generate-product-labels.ts`. Sustituido por `randomUUID` de `node:crypto` (`randomUUID().substring(0, 8)`), garantizando identificadores criptográficamente seguros y cumplimiento estricto de SonarCloud.
2. **`apps/web/vitest.config.ts` (CP-4)**: Actualizado el glob `include` a `src/**/__tests__/**/*.test.{ts,tsx}` para incluir archivos de test de componentes React (`.tsx`). Verificado que `apps/web/src/components/labels/__tests__/label-print-modal.test.tsx` se ejecuta y pasa en `pnpm --filter @wms/web test` (19 tests pasando).

## Archivos Creados / Modificados / Eliminados

### Paquete `@wms/shared-types`
- `packages/shared-types/src/barcode-payload.ts`: Creado. Esquema de prefijos de entidad (`LOC`, `SKU`, `EAN`, `LPN`, `ORDER`, `TASK`, `USER`), helpers tipados (`buildBarcodePayload`, `buildLocationBarcode`, `buildProductSkuBarcode`, `buildProductEanBarcode`, `parseBarcodePayload`, `validateBarcodePayload`, `extractLocationCode`, `extractProductCode`, `isLocationBarcode`, `isProductBarcode`) y DTOs de contratos (`RenderedLabelDTO`, `GenerateLocationLabelsRequest`, `GenerateProductLabelsRequest`, `LabelBatchResponseDTO`).
- `packages/shared-types/src/index.ts`: Modificado para re-exportar `barcode-payload.js`.

### Aplicación `@wms/api`
- `apps/api/src/ports/label-renderer.ts`: Creado. Puerto hexagonal `LabelRendererPort` para renderizado de etiquetas en SVG (`renderLabel`) y generación aislada de código (`renderBarcodeSvg`).
- `apps/api/src/ports/location-repository.ts`: Creado. Puerto hexagonal `LocationRepositoryPort` para consulta desacoplada de ubicaciones con aislamiento multi-tenant.
- `apps/api/src/ports/catalog-repository.ts`: Modificado para añadir el método por lote `findProductsByIdsOrSkus`.
- `apps/api/src/adapters/pure-code128-renderer.ts`: Creado. Motor en TypeScript puro para generación de código de barras Code 128 (Set B / Auto) conforme a ISO/IEC 15417 con checksum módulo 103, patrones canónicos y renderizado SVG vectorial.
- `apps/api/src/adapters/pure-qr-renderer.ts`: Creado. Motor en TypeScript puro para generación de códigos QR (ISO/IEC 18004) en modo Byte con corrección de error Reed-Solomon sobre GF(256), matrices 2D, timing, finder patterns y formato SVG vectorial.
- `apps/api/src/adapters/svg-label-renderer.ts`: Creado. Adaptador de `LabelRendererPort` que compone etiquetas logísticas completas con dimensiones exactas en mm (`widthMm`, `heightMm`), márgenes, bordes de corte, cabecera de título/subtítulo y código centrado con texto legible.
- `apps/api/src/adapters/in-memory-label-renderer.ts`: Creado. Adaptador InMemory para pruebas desacopladas.
- `apps/api/src/adapters/in-memory-location-repository.ts`: Creado. Adaptador InMemory de `LocationRepositoryPort` con filtrado por `tenantId`.
- `apps/api/src/adapters/prisma-location-repository.ts`: Creado. Adaptador Prisma de `LocationRepositoryPort` con filtrado multi-tenant.
- `apps/api/src/adapters/in-memory-catalog-repository.ts`: Modificado para implementar `findProductsByIdsOrSkus`.
- `apps/api/src/adapters/prisma-catalog-repository.ts`: Modificado para implementar `findProductsByIdsOrSkus`.
- `apps/api/src/use-cases/labels/generate-location-labels.ts`: Creado. Caso de uso para generación en lote de etiquetas de ubicaciones físicas (QR o Code128, dimensiones en mm, prefijo `LOC:`, validación Zod y `randomUUID`).
- `apps/api/src/use-cases/labels/generate-product-labels.ts`: Creado. Caso de uso para generación en lote de etiquetas de productos (Code128 o QR, dimensiones en mm, prefijo `SKU:` o `EAN:`, validación Zod y `randomUUID`).
- `apps/api/src/routes/v1/labels.ts`: Creado. Endpoints Fastify `POST /api/v1/labels/locations` y `POST /api/v1/labels/products` con contrato `ApiResponse<LabelBatchResponseDTO>`.
- `apps/api/src/server.ts`: Modificado para inyectar `locationRepository` y `labelRenderer`, registrar tag OpenAPI `Labels` y montar `labelRoutes` bajo `/api/v1/labels`.
- `apps/api/src/shared/__tests__/barcode-payload.test.ts`: Creado. 14 tests unitarios de helpers de prefijo, parseo, extracción y validación de escaneo.
- `apps/api/src/adapters/__tests__/label-renderer.test.ts`: Creado. 12 tests unitarios de generadores Code128, QR y SvgLabelRendererAdapter.
- `apps/api/src/use-cases/labels/__tests__/generate-labels.test.ts`: Creado. 11 tests unitarios para casos de uso de ubicaciones y productos.
- `apps/api/src/routes/v1/__tests__/labels.test.ts`: Creado. 7 tests de integración Fastify inject para rutas `/labels/locations` y `/labels/products`.

### Aplicación `@wms/web`
- `apps/web/vitest.config.ts`: Modificado para incluir tests `.tsx` en el patrón de ejecución (`src/**/__tests__/**/*.test.{ts,tsx}`).
- `apps/web/src/lib/api-client.ts`: Modificado para añadir `generateLocationLabels` y `generateProductLabels`.
- `apps/web/src/components/labels/label-print-modal.tsx`: Creado. Componente modal de configuración y previsualización de cuadrícula de etiquetas logísticas (con selector de simbología QR/Code128, selector de dimensiones estándar 70x35mm / 50x25mm / 100x50mm / custom, toggle de texto legible y botón de impresión `window.print`).
- `apps/web/src/app/globals.css`: Modificado con reglas `@media print` para ocultar la interfaz web y formatear limpiamente la cuadrícula de etiquetas con `page-break-inside: avoid`.
- `apps/web/src/app/catalog/page.tsx`: Modificado para incluir selección múltiple de productos (checkboxes individuales y seleccionar todos) y botón de barra de herramientas `🏷️ Imprimir Etiquetas (N)` que abre el modal.
- `apps/web/src/app/locations/page.tsx`: Modificado para incluir botón `🏷️ Imprimir Etiquetas` que abre el modal para ubicaciones del almacén.
- `apps/web/src/lib/__tests__/api-client.test.ts`: Modificado con tests para `generateLocationLabels` y `generateProductLabels`.
- `apps/web/src/components/labels/__tests__/label-print-modal.test.tsx`: Creado con 3 tests de renderizado y configuración del modal.

## Decisiones de Diseño e Invariantes
- **Multi-Tenancy Estricto**: Todo caso de uso (`generateLocationLabels`, `generateProductLabels`) y repositorio (`LocationRepositoryPort`, `CatalogRepositoryPort`) filtra obligatoriamente por `tenantId`. Consultar IDs o códigos pertenecientes a otro tenant produce `404 LOCATION_NOT_FOUND` / `404 PRODUCT_NOT_FOUND`, previniendo cross-tenant leak.
- **Invariante del Ledger**: La generación e impresión de etiquetas es una operación de consulta y renderizado vectorial de metadatos del catálogo/topología. No muta saldos de stock ni interfiere con las transacciones contables del Ledger.
- **Arquitectura Hexagonal Desacoplada**: El dominio y los casos de uso dependen exclusivamente del puerto `LabelRendererPort` y los puertos de repositorio. Los generadores de Code 128 (Set B) y QR Code (ISO/IEC 18004) están implementados en TypeScript puro sin dependencias externas ni código binario, garantizando portabilidad universal, vectores SVG escalables y cero vulnerabilidades de cadena de suministro.
- **Seguridad Criptográfica y CP-7**: Identificadores de etiquetas generados con `randomUUID` de `node:crypto` eliminando completamente generadores pseudoaleatorios (`Math.random()`), cumpliendo SonarCloud S2245.

## Resultados de Verificación (salida literal, no parafraseada)

### `pnpm build`
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build


   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

@wms/db:build: cache hit, replaying logs 2bc0ac31bf56ff50
@wms/db:build: 
@wms/db:build: > @wms/db@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\db
@wms/db:build: > tsc
@wms/db:build: 
@wms/shared-types:build: cache hit, replaying logs 0818b42facbb6825
@wms/shared-types:build: 
@wms/shared-types:build: > @wms/shared-types@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\shared-types
@wms/shared-types:build: > tsc
@wms/shared-types:build: 
@wms/web:build: cache miss, executing 2c20bd99f2627d24
@wms/mobile:build: cache hit, replaying logs dde5e8caf225fe8c
@wms/mobile:build: 
@wms/mobile:build: > @wms/mobile@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\mobile
@wms/mobile:build: > tsc --noEmit
@wms/mobile:build: 
@wms/domain:build: cache hit, replaying logs 67718cc3de844ab0
@wms/domain:build: 
@wms/domain:build: > @wms/domain@0.0.1 build C:\Users\santi\Documents\projects\WMS\packages\domain
@wms/domain:build: > tsc
@wms/domain:build: 
@wms/api:build: cache miss, executing 66ba42d7372c4617
@wms/web:build: 
@wms/web:build: > @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
@wms/web:build: > tsc --noEmit
@wms/web:build: 
@wms/api:build: 
@wms/api:build: > @wms/api@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\api
@wms/api:build: > tsc && tsc-alias
@wms/api:build: 

 Tasks:    6 successful, 6 total
Cached:    4 cached, 6 total
  Time:    5.502s 
```
Exit code: 0

### `pnpm --filter @wms/api test:coverage`
```text
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage


 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 ✓ src/use-cases/users/__tests__/manage-users.test.ts (19 tests) 18ms
 ✓ src/use-cases/inventory/__tests__/create-putaway-task.test.ts (7 tests) 33ms
 ✓ src/use-cases/catalog/__tests__/manage-products.test.ts (22 tests) 41ms
 ✓ src/use-cases/diagnostics/__tests__/diagnostics.test.ts (10 tests) 21ms
 ✓ src/use-cases/tasks/__tests__/confirm-receipt-line.test.ts (11 tests) 26ms
 ✓ src/use-cases/tasks/__tests__/sync-task-batch.test.ts (10 tests) 24ms
 ↓ src/use-cases/tasks/__tests__/idempotency.integration.test.ts (3 tests | 3 skipped)
 ✓ src/use-cases/inventory/__tests__/handle-picking-exception.test.ts (13 tests) 49ms
 ✓ src/use-cases/tasks/__tests__/confirm-task-step.test.ts (19 tests) 42ms
 ✓ src/use-cases/security/__tests__/tenant-context.test.ts (16 tests) 56ms
 ✓ src/use-cases/catalog/__tests__/manage-categories.test.ts (16 tests) 34ms
 ✓ src/use-cases/inventory/__tests__/cancel-order.test.ts (10 tests) 28ms
 ✓ src/use-cases/inventory/__tests__/move-stock.test.ts (13 tests) 25ms
 ✓ src/plugins/__tests__/auth.test.ts (25 tests) 293ms
 ↓ src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts (2 tests | 2 skipped)
 ✓ src/shared/__tests__/barcode-payload.test.ts (14 tests) 14ms
 ↓ src/use-cases/security/__tests__/tenant-rls.integration.test.ts (3 tests | 3 skipped)
 ✓ src/use-cases/inventory/__tests__/allocate-order.test.ts (13 tests) 42ms
 ✓ src/routes/v1/__tests__/diagnostics.test.ts (6 tests) 165ms
 ✓ src/routes/__tests__/tasks-sync-batch.test.ts (5 tests) 150ms
 ✓ src/use-cases/integrations/__tests__/webhooks.test.ts (25 tests) 187ms
 ✓ src/use-cases/labels/__tests__/generate-labels.test.ts (11 tests) 24ms
 ✓ src/adapters/__tests__/label-renderer.test.ts (12 tests) 16ms
 ✓ src/ports/__tests__/idempotency-store.test.ts (5 tests) 10ms
 ✓ src/__tests__/domain-prisma-parity.test.ts (5 tests) 6ms
 ✓ src/routes/__tests__/orders-dispatch.test.ts (4 tests) 79ms
 ✓ src/routes/__tests__/catalog-users-routes.test.ts (14 tests) 709ms
 ✓ src/routes/v1/__tests__/labels.test.ts (7 tests) 444ms

 Test Files  25 passed | 3 skipped (28)
      Tests  312 passed | 8 skipped (320)
   Start at  06:35:17
   Duration  4.53s (transform 3.70s, setup 0ms, collect 18.25s, tests 2.54s, environment 11ms, prepare 12.54s)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.53 |    88.43 |   95.91 |   93.53 |                   
 catalog           |   98.95 |    92.22 |     100 |   98.95 |                   
  ...categories.ts |   99.05 |    96.77 |     100 |   99.05 | 124               
  ...e-products.ts |   98.89 |    89.83 |     100 |   98.89 | 146,207           
 diagnostics       |   99.36 |    93.84 |     100 |   99.36 |                   
  ...tic-errors.ts |     100 |      100 |     100 |     100 |                   
  ...stic-error.ts |   97.29 |    63.63 |     100 |   97.29 | 34                
  ...-sensitive.ts |     100 |      100 |     100 |     100 |                   
 integrations      |     100 |    90.14 |     100 |     100 |                   
  ...rnal-order.ts |     100 |    94.87 |     100 |     100 | 123,200           
  ...er-shipped.ts |     100 |    84.37 |     100 |     100 | ...22,128,152,187 
 inventory         |    98.1 |    89.85 |     100 |    98.1 |                   
  ...cate-order.ts |     100 |       92 |     100 |     100 | 80,95             
  cancel-order.ts  |   99.16 |     93.1 |     100 |   99.16 | 111               
  ...taway-task.ts |   98.37 |     91.3 |     100 |   98.37 | 166-167           
  ...-exception.ts |    95.9 |    83.72 |     100 |    95.9 | ...00,160,280-281 
  move-stock.ts    |     100 |    94.44 |     100 |     100 | 111               
 labels            |   92.63 |    83.33 |     100 |   92.63 |                   
  ...ion-labels.ts |    92.3 |       84 |     100 |    92.3 | 24-29             
  ...uct-labels.ts |   92.94 |    82.75 |     100 |   92.94 | 25-30             
 security          |     100 |      100 |     100 |     100 |                   
  ...nt-context.ts |     100 |      100 |     100 |     100 |                   
 tasks             |   82.04 |     80.9 |   77.77 |   82.04 |                   
  ...ceipt-line.ts |   83.68 |    89.47 |      50 |   83.68 | ...38-239,242-262 
  ...-task-step.ts |   82.14 |    83.51 |     100 |   82.14 | ...04-309,421-431 
  ...task-batch.ts |   80.59 |    66.66 |     100 |   80.59 | ...08,224-232,296 
 users             |     100 |      100 |     100 |     100 |                   
  manage-users.ts  |     100 |      100 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------
```
Exit code: 0
Use-cases: 93.53% global, 92.63% en labels.

### `pnpm --filter @wms/web test`
```text
> @wms/web@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\web
> vitest run

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web

 ✓ src/lib/__tests__/api-client.test.ts (8 tests) 14ms
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 17ms
 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (3 tests) 15ms

 Test Files  3 passed (3)
      Tests  19 passed (19)
   Start at  06:35:27
   Duration  720ms (transform 224ms, setup 0ms, collect 400ms, tests 46ms, environment 1ms, prepare 666ms)
```
Exit code: 0
