# Reporte de Implementación: F9.4 — Generación Automática de SKU por Categoría y Código de Barras en Alta de Producto

- **Estado**: DONE
- **Fecha**: 2026-11-17

## Archivos Creados / Modificados / Eliminados

- `packages/shared-types/src/index.ts`: Modificada la interfaz `CreateProductInput` para hacer `sku?: string | undefined;` opcional en la creación de productos.
- `apps/api/src/adapters/in-memory-catalog-repository.ts`: Actualizada persistencia de `createProduct` para normalizar `sku` opcional con fallback a string vacío antes de guardar.
- `apps/api/src/adapters/prisma-catalog-repository.ts`: Normalizado `sku` opcional con fallback seguro en `prisma.product.create`.
- `apps/api/src/routes/products.ts`: Actualizado `CreateProductSchema` en Zod con `sku: z.string().trim().min(1).max(100).optional();` y `barcode: z.string().trim().max(50).optional();`.
- `apps/api/src/use-cases/catalog/manage-products.ts`:
  - Implementada función `calculateEan13Checksum` usando el algoritmo de ponderación módulo 10 estándar de GS1.
  - Implementada función `generateEan13Barcode` utilizando `node:crypto` (`randomInt`) con prefijo interno restringido `20` (cumplimiento SonarCloud CP-7, sin `Math.random()`).
  - Actualizado caso de uso `createProduct` con autogeneración inteligente:
    - Si no se proporciona SKU o viene vacío, genera formato `{PREFIX}-{XXX}` con padding de 3 dígitos (código de categoría si está asociada o `GEN` por defecto) resolviendo colisiones secuencialmente (`001`, `002`, etc.) contra el tenant.
    - Si no se proporciona Barcode o viene vacío, autogenera EAN-13 válido libre de colisiones en el tenant.
    - Si se proporcionan SKU y/o Barcode explícitos, se validan y respetan garantizando unicidad en el tenant.
- `apps/api/src/use-cases/catalog/__tests__/manage-products.test.ts`: Añadidos 10 nuevos tests unitarios exhaustivos para autogeneración de SKU con categoría, secuencia consecutiva, salto de colisiones preexistentes, SKU sin categoría (`GEN-001`), autogeneración de Barcode EAN-13 con checksum, respeto de datos manuales y validación de funciones auxiliares EAN-13.
- `apps/api/src/routes/__tests__/catalog-users-routes.test.ts`: Añadido test de integración Fastify para `POST /api/v1/products` sin `sku` ni `barcode`.
- `apps/web/src/app/catalog/page.tsx`:
  - Ajustado `handleCreateProduct` para no enviar `sku` ni `barcode` si están vacíos tras `trim()`.
  - Actualizado formulario UI para indicar que el SKU y el código de barras son opcionales y se autogeneran automáticamente si se dejan vacíos.
- `apps/web/src/lib/__tests__/api-client.test.ts`: Añadido test unitario para llamadas al cliente API sin `sku` ni `barcode`.

## Decisiones de Diseño e Invariantes

- **Aislamiento Multi-Tenant (CP-2)**: Toda comprobación de unicidad y salto de colisiones para SKU y código de barras se realiza estrictamente acotada al `tenantId` actual mediante `findProductConflict`.
- **Seguridad Criptográfica y Regla SonarCloud (CP-7)**: La generación de dígitos para los códigos de barras internos EAN-13 se realiza de forma no determinista y segura mediante `crypto.randomInt` de `node:crypto`, sin utilizar `Math.random()`.
- **Integridad y Contratos (CP-3)**: Tipado unificado en `@wms/shared-types` con compatibilidad hacia atrás en API y Frontend.

## Resultados de Verificación (salida literal, no parafraseada)

- `pnpm build`:
```text
Tasks:    6 successful, 6 total
Cached:    2 cached, 6 total
Time:    9.067s
```

- `pnpm --filter @wms/api test:coverage`:
```text
Test Files  28 passed | 3 skipped (31)
Tests  365 passed | 8 skipped (373)
Duration  5.29s

% Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.17 |    86.39 |   96.55 |   93.17 |                   
 catalog           |   99.16 |    92.17 |     100 |   99.16 |                   
  ...categories.ts |   99.05 |    96.77 |     100 |   99.05 | 124               
  ...e-products.ts |    99.2 |    90.47 |     100 |    99.2 | 233,294           
 diagnostics       |   99.36 |    93.93 |     100 |   99.36 |                   
 integrations      |     100 |    90.14 |     100 |     100 |                   
 inventory         |    98.1 |    89.85 |     100 |    98.1 |                   
 labels            |   92.63 |    83.33 |     100 |   92.63 |                   
 security          |     100 |      100 |     100 |     100 |                   
 tasks             |   82.04 |     80.9 |   77.77 |   82.04 |                   
 topology          |      88 |     61.9 |     100 |      88 |                   
 users             |     100 |      100 |     100 |     100 |                   
-------------------|---------|----------|---------|---------|-------------------
```

- `pnpm --filter @wms/web test`:
```text
Test Files  4 passed (4)
Tests  29 passed (29)
Duration  743ms
```
