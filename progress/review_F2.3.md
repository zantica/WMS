# Auditoría de Revisión — `F2.3` (`progress/review_F2.3.md`)

- **Feature**: `F2.3` — *Esqueleto de App Móvil para Operarios en `apps/mobile` (Expo + TypeScript)*
- **Hito**: Hito 2 — App Expo + Inbound + Putaway
- **Subagente**: `reviewer`
- **Fecha**: 2026-10-24

---

## 1. Evaluación contra `CHECKPOINTS.md`

### CP-1: Integridad del Inventory Ledger (Bounded Context B)
- **Estado**: ✅ **CUMPLE (N/A en cliente móvil; delega al backend)**
- **Detalle**:
  - `@wms/mobile` es un cliente ligero HTTP que no toca ni importa Prisma ni muta la base de datos directamente.
  - Todas las operaciones de inventario (`confirmReceiptLine`, `confirmTaskStep`, `getInventoryBalances`) se delegan a los endpoints transaccionales de `@wms/api` (`/api/v1/receipts/:taskId/confirm-line`, `/api/v1/tasks/:id/steps/:stepId/confirm`, `/api/v1/inventory/balances`).

### CP-2: Aislamiento Multi-Tenant y Seguridad
- **Estado**: ✅ **CUMPLE**
- **Detalle**:
  - `WmsApiClient` (`apps/mobile/src/api/client.ts`) inyecta automáticamente los encabezados de autenticación y aislamiento multi-tenant (`x-api-key` y `Authorization: Bearer <token>`) en cada petición HTTP cuando están configurados.
  - El contexto `SessionProvider` (`apps/mobile/src/context/session.tsx`) y la pantalla `apps/mobile/app/login.tsx` permiten configurar dinámicamente `apiBaseUrl`, `apiKey`, `warehouseId` y `operatorName`, además de verificar conectividad contra `GET /health`.

### CP-3: Contratos de API, Tipado y Arquitectura Monorepo
- **Estado**: ✅ **CUMPLE**
- **Detalle**:
  - **Fronteras del Monorepo**: `apps/mobile/package.json` declara únicamente `@wms/shared-types` (`workspace:*`) como dependencia interna. Ningún archivo en `apps/mobile` importa `@wms/db` ni `@prisma/client`.
  - **Envolventes y Errores Tipados**: `WmsApiClient` desempaqueta `ApiResponse<T>` (`{ success: true, data: T }`) mediante guardas de tipo seguras (`isApiSuccessPayload`, `isApiErrorPayload`) y transforma respuestas `{ success: false, error }` en instancias de `WmsApiClientError` preservando `code: WmsErrorCode | string`, `statusCode` y `details`.
  - **TypeScript Estricto & ESM (`NodeNext`)**:
    - `apps/mobile/tsconfig.json` extiende `../../tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `module: "NodeNext"`).
    - Todos los imports relativos locales en `src/` y `app/` incluyen la extensión `.js` (`../api/client.js`, `../src/context/session.js`, `../../src/components/BarcodeScannerBox.js`) y emplean `import type` para tipos.
    - Las propiedades opcionales en interfaces (`WmsClientConfig`, `ListTasksFilters`, `ConfirmTaskStepInput`, `OperatorSession`) incluyen explícitamente `| undefined` para cumplir `exactOptionalPropertyTypes: true`.

### CP-4: Verificación Automatizada y Cobertura
- **Estado**: ✅ **CUMPLE**
- **Detalle**:
  - `apps/mobile/vitest.config.ts` configura Vitest con cobertura v8 y umbrales ≥80% en líneas, funciones y ramas sobre `src/api/**/*.ts`.
  - `apps/mobile/src/api/__tests__/client.test.ts` incluye 8 tests unitarios exhaustivos que verifican:
    1. Normalización de `baseUrl` (eliminación de barras finales), inyección de headers `x-api-key` y `Authorization: Bearer`, y actualización de configuración (`updateConfig`).
    2. Listado de tareas con filtros `type` y `status` (`GET /api/v1/tasks`).
    3. Inicio de tarea (`POST /api/v1/tasks/:id/start`) y consulta de detalle (`GET /api/v1/tasks/:id`).
    4. Confirmación de paso de tarea (`POST /api/v1/tasks/:id/steps/:stepId/confirm`).
    5. Confirmación de línea de recepción (`POST /api/v1/receipts/:taskId/confirm-line`) verificando `putawayTaskId`.
    6. Consulta de saldos de inventario en vivo (`GET /api/v1/inventory/balances`).
    7. Manejo de errores de negocio (`ApiError` con `INVALID_SCAN` HTTP 422 → `WmsApiClientError` con `code`, `statusCode` y `details`).
    8. Manejo de fallos de red (`NETWORK_ERROR`) y respuestas JSON inválidas (`INVALID_RESPONSE` HTTP 502).

---

## 2. Archivos Auditados
- [`apps/mobile/package.json`](../apps/mobile/package.json)
- [`apps/mobile/tsconfig.json`](../apps/mobile/tsconfig.json)
- [`apps/mobile/app.json`](../apps/mobile/app.json)
- [`apps/mobile/vitest.config.ts`](../apps/mobile/vitest.config.ts)
- [`apps/mobile/src/types/expo-shim.d.ts`](../apps/mobile/src/types/expo-shim.d.ts)
- [`apps/mobile/src/api/client.ts`](../apps/mobile/src/api/client.ts)
- [`apps/mobile/src/api/__tests__/client.test.ts`](../apps/mobile/src/api/__tests__/client.test.ts)
- [`apps/mobile/src/context/session.tsx`](../apps/mobile/src/context/session.tsx) y [`apps/mobile/src/context/session-context.tsx`](../apps/mobile/src/context/session-context.tsx)
- [`apps/mobile/src/components/BarcodeScannerBox.tsx`](../apps/mobile/src/components/BarcodeScannerBox.tsx) y [`apps/mobile/src/components/BarcodeScannerView.tsx`](../apps/mobile/src/components/BarcodeScannerView.tsx)
- [`apps/mobile/app/_layout.tsx`](../apps/mobile/app/_layout.tsx)
- [`apps/mobile/app/login.tsx`](../apps/mobile/app/login.tsx)
- [`apps/mobile/app/(tabs)/_layout.tsx`](../apps/mobile/app/(tabs)/_layout.tsx)
- [`apps/mobile/app/(tabs)/index.tsx`](../apps/mobile/app/(tabs)/index.tsx)
- [`apps/mobile/app/(tabs)/scanner.tsx`](../apps/mobile/app/(tabs)/scanner.tsx)

---

## 3. Dictamen Final

**VEREDICTO: APPROVED**
