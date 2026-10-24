# Convenciones de Código y Estilo (WMS)

## 1. TypeScript y Sistema de Módulos (ESM)
- El proyecto utiliza `module: "NodeNext"` y `moduleResolution: "NodeNext"` con TypeScript estricto (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).
- **Imports locales con `.js`**: Todo import relativo entre archivos TypeScript debe incluir la extensión `.js`:
  ```ts
  // Correcto
  import { WmsError } from "../../plugins/error-handler.js";
  // Incorrecto (fallará en runtime/build NodeNext)
  import { WmsError } from "../../plugins/error-handler";
  ```
- **Imports de tipos**: Usa `import type { ... }` cuando importes únicamente interfaces o tipos.

## 2. Estructura de `@wms/api`
- **`src/routes/*.ts`**: Plugins de Fastify (`FastifyPluginAsync`) enfocados en:
  1. Validar `request.body`, `request.params` y `request.query` con **Zod**.
  2. Invocar casos de uso (`src/use-cases/**`) o consultas Prisma acotadas por `request.tenantId`.
  3. Devolver respuestas envueltas en `ApiResponse<T>`:
     ```ts
     return reply.status(200).send({ success: true, data: result });
     ```
- **`src/use-cases/<contexto>/*.ts`**: Lógica de dominio pura y transaccional.
  - Reciben parámetros tipados explícitamente (incluyendo siempre `tenantId`).
  - No dependen de objetos HTTP (`FastifyRequest` / `FastifyReply`).
  - Ante violaciones de reglas de negocio, lanzan `WmsError`:
    ```ts
    throw new WmsError("INSUFFICIENT_STOCK", "Stock insuficiente", 409);
    ```

## 3. Manejo de Errores (`WmsError`)
- Nunca devuelvas errores HTTP manuales inconsistentes desde los casos de uso; lanza `WmsError` usando un código tipado en `WmsErrorCode` (`@wms/shared-types`).
- Si necesitas un nuevo código de error de dominio, agrégalo primero a `WmsErrorCode` en [`packages/shared-types/src/index.ts`](../packages/shared-types/src/index.ts).
- Códigos de estado estándar:
  - `400` / `422`: `VALIDATION_ERROR`, `INVALID_SCAN`, `WRONG_STEP_SEQUENCE`
  - `401` / `403`: `UNAUTHORIZED`, `TENANT_MISMATCH`
  - `404`: `PRODUCT_NOT_FOUND`, `LOCATION_NOT_FOUND`, `ORDER_NOT_FOUND`, `TASK_NOT_FOUND`
  - `409`: `INSUFFICIENT_STOCK`, `ORDER_ALREADY_ALLOCATED`

## 4. Manejo de Decimales con Prisma
- En PostgreSQL/Prisma, las cantidades (`onHandQty`, `allocatedQty`, `quantity`, `requestedQty`) son `Decimal(12, 4)`.
- Al serializar hacia DTOs (`@wms/shared-types`) o operar en TypeScript, conviértelos explícitamente con `Number(...)`.

## 5. Convenciones de Tests (Vitest)
- Ubicación: `src/use-cases/<contexto>/__tests__/<nombre>.test.ts`.
- Los tests unitarios de casos de uso mockean `@wms/db` (`vi.mock("@wms/db", ...)`) simulando `prisma.$transaction` para verificar:
  1. Validaciones previas de entrada.
  2. Comportamiento ante stock insuficiente o estados inválidos.
  3. Que en caso de excepción no se inserte ningún registro en `inventoryTransaction` (atomicidad).
