# Reporte de Implementación: F9.1 — Maestro de Producto WMS, Categorías configurables, Búsqueda por SKU y Gestión de Usuarios/Roles
- **Estado**: DONE
- **Fecha**: 2026-11-13

## Archivos Creados / Modificados / Eliminados

### Paquete `@wms/shared-types`
- `packages/shared-types/src/index.ts`: Definición de DTOs y tipos de entrada para categorías (`CategoryDTO`, `CreateCategoryInput`, `UpdateCategoryInput`), usuarios de inquilino (`TenantUserDTO`, `CreateTenantUserInput`, `UpdateTenantUserInput`, `ListTenantUsersFilters`), filtros de producto (`ListProductsFilters`, `PaginationMetaDTO`), ampliación retrocompatible de `ProductDTO` y `CreateProductInput` (con `categoryId`, `categoryName`, `categoryCode`, dimensiones y peso), `UpdateProductInput`, y nuevos códigos de error `CATEGORY_NOT_FOUND` y `USER_NOT_FOUND` en `WmsErrorCode`.

### Paquete `@wms/db`
- `packages/db/prisma/schema.prisma`: Modelo `Category` con índice único compuesto `(tenantId, code)` e índice por `tenantId`, relación `categories` en `Tenant` y `category` en `Product` (`categoryId String?` con FK `onDelete: SetNull` e índice compuesto `@@index([tenantId, categoryId])`).
- `packages/db/prisma/migrations/20261113010000_catalog_categories/migration.sql`: Migración DDL SQL creando la tabla `categories`, índices, claves foráneas, columna `categoryId` en `products`, y habilitando PostgreSQL Row Level Security con `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY` y política `categories_tenant_isolation_policy` (`USING` + `WITH CHECK` vía `app.current_tenant_id`).
- `packages/db/src/rls.ts`: Registro declarativo de `"categories"` en el catálogo `RLS_PROTECTED_TABLES`.
- `packages/db/src/seed.ts`: Sembrado idempotente con `upsert` de categorías demo (`ROPA`, `CALZADO`, `ACCESORIOS`), asociación con productos demo y sembrado de usuarios demo con roles `ADMIN`, `SUPERVISOR` y `OPERATOR`.

### Paquete `@wms/api`
- `apps/api/src/ports/catalog-repository.ts`: Puerto hexagonal `CatalogRepositoryPort` desacoplado para persistencia de categorías (`listCategories`, `findCategoryById`, `findCategoryByCode`, `createCategory`, `updateCategory`) y productos (`searchProducts`, `findProductById`, `findProductConflict`, `createProduct`, `updateProduct`).
- `apps/api/src/ports/user-repository.ts`: Puerto hexagonal `UserRepositoryPort` para gestión de usuarios del tenant (`listUsers`, `findUserById`, `findUserByEmail`, `findUserByClerkId`, `createUser`, `updateUser`).
- `apps/api/src/adapters/in-memory-catalog-repository.ts`: Adaptador en memoria de catálogo con soporte para filtrado por `tenantId`, búsqueda por SKU, texto libre `q`, paginación y resolución de categorías.
- `apps/api/src/adapters/prisma-catalog-repository.ts`: Adaptador Prisma de catálogo con inclusión de relación `category` y aislamiento estricto por `tenantId`.
- `apps/api/src/adapters/in-memory-user-repository.ts`: Adaptador en memoria de usuarios de tenant.
- `apps/api/src/adapters/prisma-user-repository.ts`: Adaptador Prisma de usuarios de tenant.
- `apps/api/src/use-cases/catalog/manage-categories.ts`: Casos de uso puros para listar, crear (validación RBAC `ADMIN`/`SUPERVISOR`, normalización `trim().toUpperCase()`, unicidad 409) y actualizar categorías.
- `apps/api/src/use-cases/catalog/manage-products.ts`: Casos de uso puros para búsqueda de catálogo (`searchProducts` con filtros por SKU, barcode, texto `q`, categoría, estado activo/inactivo y paginación), `getProductById`, `createProduct` (validación de categoría activa 404/422 y conflictos de SKU/barcode 409) y `updateProduct`.
- `apps/api/src/use-cases/users/manage-users.ts`: Casos de uso puros para gestión de usuarios (`listTenantUsers` para `ADMIN`/`SUPERVISOR`, `createTenantUser` solo para `ADMIN` con unicidad de email/clerkId, `updateTenantUser` con regla de seguridad que bloquea la auto-desactivación o auto-degradación del administrador actor).
- `apps/api/src/routes/products.ts`: Refactorizado para orquestar los casos de uso a través del puerto `app.catalogRepository` (`GET /`, `GET /:id`, `POST /`, `PATCH /:id`).
- `apps/api/src/routes/categories.ts`: Nuevas rutas montadas en `/api/v1/categories` (`GET /`, `POST /`, `PATCH /:id`).
- `apps/api/src/routes/users.ts`: Nuevas rutas montadas en `/api/v1/users` (`GET /`, `POST /`, `PATCH /:id`).
- `apps/api/src/server.ts`: Registro y decoración de `catalogRepository` y `userRepository` (configurables en `BuildServerOptions`) y montaje de `categoryRoutes` y `userRoutes`.
- `apps/api/src/use-cases/security/__tests__/tenant-context.test.ts`: Actualizado para verificar la migración SQL de categorías y tabla en `RLS_PROTECTED_TABLES`.
- `apps/api/src/use-cases/security/__tests__/tenant-rls.integration.test.ts`: Actualizado con limpieza de `Category` en `afterAll` y aserción de aislamiento cruzado para categorías.
- `apps/api/src/use-cases/catalog/__tests__/manage-categories.test.ts`: 16 tests unitarios cubriendo los 4 escenarios obligatorios.
- `apps/api/src/use-cases/catalog/__tests__/manage-products.test.ts`: 22 tests unitarios cubriendo los 4 escenarios obligatorios.
- `apps/api/src/use-cases/users/__tests__/manage-users.test.ts`: 19 tests unitarios cubriendo los 4 escenarios obligatorios.
- `apps/api/src/routes/__tests__/catalog-users-routes.test.ts`: 14 tests de integración Fastify inject para rutas de categories, products y users.

### Paquete `@wms/web`
- `apps/web/src/lib/api-client.ts`: Actualizado `listProducts` con filtros (`sku`, `q`, `barcode`, `categoryId`, `includeInactive`, `page`, `limit`), y añadidos `updateProduct`, `listCategories`, `createCategory`, `updateCategory`, `listUsers`, `createUser`, `updateUser`.
- `apps/web/src/lib/__tests__/api-client.test.ts`: Tests unitarios añadidos para los nuevos métodos del cliente web.
- `apps/web/src/app/catalog/page.tsx`: Rediseñado bajo el Design System S5 dark-data-dense (P2 / T3, 0 hex crudos) integrando barra de búsqueda reactiva por SKU/nombre/barcode, selector de categoría, toggle de bajas lógicas, selector de categoría en alta de producto, edición/reasignación inline de categorías, alternancia activa/inactiva de producto, panel de gestión de Categorías Operativas WMS y panel de Gobierno de Usuarios y Roles de Tenant.

### Paquete `@wms/mobile`
- `apps/mobile/src/api/client.ts`: Añadido método tipado `searchProducts(filters?: ListProductsFilters): Promise<ProductDTO[]>`.
- `apps/mobile/src/api/__tests__/client.test.ts`: Añadido test unitario para `searchProducts`.
- `apps/mobile/app/(tabs)/scanner.tsx`: En modo consulta rápida (sin tarea activa), consulta en paralelo `client.getInventoryBalances()` y `client.searchProducts({ q: scannedCode })`, renderizando las fichas del Maestro de Producto WMS (SKU, nombre, categoría, barcode, peso unitario y badge de estado activo/inactivo) junto con los saldos en vivo usando exclusivamente tokens de `src/theme/tokens.ts` (0 hex crudos).

---

## Decisiones de Diseño e Invariantes

1. **Aislamiento Multi-Tenant Absoluto**:
   - Cada consulta en `CatalogRepositoryPort` y `UserRepositoryPort` incluye estrictamente `tenantId`.
   - La tabla `"categories"` cuenta con constraint de unicidad compuesto `@@unique([tenantId, code])`, permitiendo que distintos inquilinos utilicen los mismos códigos de categoría (`ROPA`, `CALZADO`, etc.) sin interferencia ni colisión.
   - La tabla `"categories"` está protegida en PostgreSQL con `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY`, denegando por defecto cualquier lectura o mutación sin contexto `app.current_tenant_id`.

2. **Invariantes del Bounded Context de Catálogo y Usuarios**:
   - En `createProduct` y `updateProduct`, no se permite asociar categorías pertenecientes a otro tenant ni categorías marcadas como inactivas.
   - En `updateTenantUser`, se enforcea la regla de seguridad que impide que un administrador actor (`actorUserId === targetUserId`) desactive su propia cuenta o revoque su propio rol `ADMIN`.
   - Cero uso de PRNG inseguro (`Math.random()` reemplazado por `crypto.randomUUID()`).
   - Cero acoplamiento a variables de entorno (`process.env`) dentro de casos de uso o adaptadores; inyección a través de puertos.

3. **Arquitectura Hexagonal Desacoplada**:
   - Los casos de uso (`manage-categories`, `manage-products`, `manage-users`) dependen exclusivamente de interfaces (`CatalogRepositoryPort`, `UserRepositoryPort`), lo que permite probarlos con `InMemoryCatalogRepository` e `InMemoryUserRepository` con 100% de aislamiento y determinismo.

---

## Resultados de Verificación (salida literal, no parafraseada)

### 1. `pnpm build`
```text
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

 Tasks:    6 successful, 6 total
Cached:    1 cached, 6 total
  Time:    8.622s 
```

### 2. `pnpm test`
```text
> wms@0.0.1 test C:\Users\santi\Documents\projects\WMS
> turbo run test

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running test in 6 packages
   • Remote caching disabled

@wms/domain:test:  Test Files  5 passed (5)
@wms/domain:test:       Tests  81 passed (81)

@wms/web:test:  Test Files  2 passed (2)
@wms/web:test:       Tests  13 passed (13)

@wms/mobile:test:  Test Files  9 passed (9)
@wms/mobile:test:       Tests  65 passed (65)

@wms/api:test:  Test Files  21 passed | 3 skipped (24)
@wms/api:test:       Tests  268 passed | 8 skipped (276)

 Tasks:    7 successful, 7 total
  Time:    6.737s 
```

### 3. `pnpm --filter @wms/api test:coverage`
```text
> @wms/api@0.0.1 test:coverage C:\Users\santi\Documents\projects\WMS\apps\api
> vitest run --coverage

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/api
      Coverage enabled with v8

 Test Files  21 passed | 3 skipped (24)
      Tests  268 passed | 8 skipped (276)
   Duration  3.87s

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
-------------------|---------|----------|---------|---------|-------------------
All files          |   93.59 |    88.87 |   95.74 |   93.59 |                   
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
