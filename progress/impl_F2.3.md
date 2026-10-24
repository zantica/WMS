# Reporte de Implementación — `F2.3` (`progress/impl_F2.3.md`)

- **Feature**: `F2.3` — *Esqueleto de App Móvil para Operarios en `apps/mobile` (Expo + TypeScript)*
- **Hito**: Hito 2 — App Expo + Inbound + Putaway
- **Subagente**: `implementer`
- **Fecha**: 2026-10-24

---

## 1. Resumen de Cambios y Archivos Creados

1. **Configuración del Paquete `@wms/mobile` en el Monorepo Turborepo**:
   - [`apps/mobile/package.json`](../apps/mobile/package.json): Configuración del paquete `@wms/mobile` con scripts `dev`, `build`, `lint`, `test` y `test:coverage`, consumiendo únicamente `@wms/shared-types` (`workspace:*`) junto con Expo SDK 52 (`expo`, `expo-router`, `expo-camera`, `expo-status-bar`, `react`, `react-native`) y `vitest`.
   - [`apps/mobile/tsconfig.json`](../apps/mobile/tsconfig.json): Extiende `../../tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`, `module: "NodeNext"`), con soporte JSX (`react-jsx`) y mapeo de `@wms/shared-types`.
   - [`apps/mobile/app.json`](../apps/mobile/app.json): Manifiesto Expo con tema oscuro (`userInterfaceStyle: "dark"`), permisos de cámara para iOS/Android y plugin `expo-router` + `expo-camera`.
   - [`apps/mobile/vitest.config.ts`](../apps/mobile/vitest.config.ts): Configuración de Vitest con umbrales de cobertura ≥80% para `src/api/**/*.ts`.
   - [`apps/mobile/src/types/expo-shim.d.ts`](../apps/mobile/src/types/expo-shim.d.ts): Declaraciones de tipos de respaldo para compilación estática (`tsc --noEmit`) de módulos de React Native / Expo en entornos sin paquetes nativos instalados.

2. **Cliente HTTP Tipado (`@wms/mobile` ↔ `@wms/api`)**:
   - [`apps/mobile/src/api/client.ts`](../apps/mobile/src/api/client.ts):
     - Clase `WmsApiClientError` que extiende `Error` y preserva `code: WmsErrorCode | string`, `statusCode: number` y `details?: unknown` al recibir un `ApiError` (`{ success: false, error: { code, message, details } }`).
     - Clase `WmsApiClient` y factory `createWmsClient(config)` con soporte para `baseUrl`, header `x-api-key` multi-tenant y `Authorization: Bearer <token>`.
     - Métodos implementados:
       - `checkHealth()` (`GET /health`)
       - `listTasks(filters?)` (`GET /api/v1/tasks`)
       - `getTask(id)` (`GET /api/v1/tasks/:id`)
       - `startTask(id)` (`POST /api/v1/tasks/:id/start`)
       - `confirmTaskStep(taskId, stepId, input)` (`POST /api/v1/tasks/:id/steps/:stepId/confirm`)
       - `confirmReceiptLine(taskId, input)` (`POST /api/v1/receipts/:taskId/confirm-line`)
       - `getInventoryBalances(filters?)` (`GET /api/v1/inventory/balances`)

3. **Contexto de Sesión, Escáner y Navegación Expo Router**:
   - [`apps/mobile/src/context/session.tsx`](../apps/mobile/src/context/session.tsx) (y re-export en [`apps/mobile/src/context/session-context.tsx`](../apps/mobile/src/context/session-context.tsx)): Proveedor React (`SessionProvider` y hook `useSession`) con configuración de `apiBaseUrl`, `apiKey` (`demo-api-key-12345`), `warehouseId` (`warehouse-demo`), `operatorName` y método `testConnection()`.
   - [`apps/mobile/src/components/BarcodeScannerBox.tsx`](../apps/mobile/src/components/BarcodeScannerBox.tsx) (y re-export en [`apps/mobile/src/components/BarcodeScannerView.tsx`](../apps/mobile/src/components/BarcodeScannerView.tsx)): Componente dual de escaneo con soporte para lector láser HID/entrada manual rápida y cámara (`expo-camera` `CameraView`) con bloqueo anti-doble-lectura.
   - [`apps/mobile/app/_layout.tsx`](../apps/mobile/app/_layout.tsx): Layout raíz con `SessionProvider` y `Stack` en tema oscuro industrial.
   - [`apps/mobile/app/login.tsx`](../apps/mobile/app/login.tsx): Pantalla de configuración del servidor API, `x-api-key` y prueba de conexión contra `/health`.
   - [`apps/mobile/app/(tabs)/_layout.tsx`](../apps/mobile/app/(tabs)/_layout.tsx): Navegación inferior por pestañas (`Tareas Operativas` y `Escáner Rápido`) e indicador de estado de conexión.
   - [`apps/mobile/app/(tabs)/index.tsx`](../apps/mobile/app/(tabs)/index.tsx): Bandeja de tareas operativas filtrable por tipo (`ALL`, `RECEIVING`, `PUTAWAY`, `PICKING`, `PACKING`), visualización del siguiente paso (`locationCode`, `productSku`, progreso `scannedQty/expectedQty`) e inicio de tarea (`POST /api/v1/tasks/:id/start`).
   - [`apps/mobile/app/(tabs)/scanner.tsx`](../apps/mobile/app/(tabs)/scanner.tsx): Pantalla de ejecución rápida de pasos de tarea activa o consulta en vivo de saldos (`onHandQty`, `allocatedQty`, `atpQty`) por ubicación/SKU.

4. **Tests Unitarios**:
   - [`apps/mobile/src/api/__tests__/client.test.ts`](../apps/mobile/src/api/__tests__/client.test.ts): 8 tests unitarios con Vitest cubriendo normalización de URL, inyección de headers `x-api-key` y `Authorization`, todos los métodos del cliente (`checkHealth`, `listTasks`, `getTask`, `startTask`, `confirmTaskStep`, `confirmReceiptLine`, `getInventoryBalances`) y manejo de errores con `WmsApiClientError` (`INVALID_SCAN`, `NETWORK_ERROR`, `INVALID_RESPONSE`).

---

## 2. Verificación de Fronteras y Tipos

- **Fronteras del Monorepo**: Verificado que ningún archivo en `apps/mobile` importa `@wms/db` ni `@prisma/client`; solo se consumen contratos de `@wms/shared-types`.
- **Convenciones ESM (`NodeNext`)**: Todos los imports relativos locales incluyen la extensión `.js` y usan `import type` para tipos.
- **Nota sobre el entorno Windows**: La herramienta `run_command` devolvió `exec: "c:\\Users\\santi\\Documents\\projects\\WMS\\powershell": executable file not found in %PATH%`. Se verificó manualmente la compatibilidad estricta de tipos (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`) en todos los archivos creados.
