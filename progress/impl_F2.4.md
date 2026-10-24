# Reporte de Implementación — `F2.4` (`progress/impl_F2.4.md`)

- **Feature**: `F2.4` — *Flujo móvil de Recepción (Inbound) y Putaway guiado por escaneo de códigos QR/Barras*
- **Hito**: Hito 2 — App Expo + Inbound + Putaway (Cierre del Hito 2)
- **Subagente**: `implementer`
- **Fecha**: 2026-10-24

---

## 1. Resumen de Archivos Creados y Modificados

1. **Módulo de Lógica de Flujo y Errores de Dominio (`@wms/mobile`)**:
   - [`apps/mobile/src/workflows/inbound-putaway.ts`](../apps/mobile/src/workflows/inbound-putaway.ts):
     - `normalizeScanCode(rawCode)`: Normalización `trim().toUpperCase()` para códigos de barras, QR, SKUs y ubicaciones.
     - `getRemainingStepQty(step)`: Cálculo seguro (`Math.max(0, expectedQty - scannedQty)`) de unidades restantes por paso.
     - `matchReceivingStepByScan(steps, scannedCode)`: Identificación automática de la línea de recepción (`RECEIVING`) al escanear `productBarcode`, `productSku` o `productId`, priorizando pasos `PENDING` en orden de `sequence ASC`.
     - `getNextActiveStep(steps)`: Selección determinista del siguiente paso `PENDING` ordenado por `sequence ASC` (que en Putaway sigue el recorrido `locationCode ASC`).
     - `calculateTaskProgress(task)`: Cálculo de avance por pasos (`completedSteps`, `totalSteps`) y por unidades (`expectedUnits`, `scannedUnits`, `remainingUnits`, `percent`).
     - `resolveTaskExecutionRoute(task)`: Resolución de ruta en Expo Router (`/tasks/receiving/[id]`, `/tasks/putaway/[id]` o `/(tabs)/scanner?taskId=[id]`).
     - `formatDomainErrorBanner(error)`: Mapeo de `WmsApiClientError` (`INVALID_SCAN`, `INSUFFICIENT_STOCK`, `WRONG_STEP_SEQUENCE`, `LOCATION_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `TASK_NOT_FOUND`, `UNAUTHORIZED`, `TENANT_MISMATCH`, `NETWORK_ERROR`) en banners estructurados con `title`, `message`, `actionHint` y `severity`.

2. **Pantallas Guiadas de Ejecución en Expo Router**:
   - [`apps/mobile/app/tasks/receiving/[taskId].tsx`](../apps/mobile/app/tasks/receiving/%5BtaskId%5D.tsx):
     - Carga el detalle de la tarea `RECEIVING` mediante `client.getTask(taskId)` y presenta barra de progreso global y listado de líneas.
     - Permite seleccionar manualmente cualquier línea o auto-detectarla al escanear su `barcode`/`sku` en `BarcodeScannerBox`.
     - Incluye selector rápido de cantidad (`-1`, `+1`, `Total Restante`, input numérico) y confirma contra `POST /api/v1/receipts/:taskId/confirm-line` (`client.confirmReceiptLine`).
     - Cuando la recepción concluye y el backend retorna `putawayTaskId`, despliega una tarjeta de finalización con botón directo **"Iniciar Putaway Generado (#putawayTaskId)"** hacia `/tasks/putaway/[putawayTaskId]`.
   - [`apps/mobile/app/tasks/putaway/[taskId].tsx`](../apps/mobile/app/tasks/putaway/%5BtaskId%5D.tsx):
     - Carga la tarea `PUTAWAY` (`client.getTask(taskId)`) e inicia automáticamente la tarea si se encuentra en estado `PENDING` (`client.startTask(taskId)`).
     - Destaca el paso activo (`sequence ASC`) indicando la ubicación `STORAGE` destino (`locationCode`, ej. `A-01-01`), SKU, descripción, EAN y cantidad pendiente.
     - Confirma el escaneo con `POST /api/v1/tasks/:id/steps/:stepId/confirm` (`client.confirmTaskStep`) y ofrece formulario integrado para reportar incidencias (`reportException: true`, `exceptionNote`) en caso de ubicación bloqueada o merma.

3. **Integración de Navegación y Cobertura de Tests**:
   - [`apps/mobile/app/_layout.tsx`](../apps/mobile/app/_layout.tsx): Registro de las pantallas `tasks/receiving/[taskId]` y `tasks/putaway/[taskId]` en el `Stack` principal.
   - [`apps/mobile/app/(tabs)/index.tsx`](../apps/mobile/app/%28tabs%29/index.tsx): Navegación directa desde la bandeja de tareas hacia `/tasks/receiving/[id]` o `/tasks/putaway/[id]` mediante `resolveTaskExecutionRoute(task)` y previsualización ordenada con `getNextActiveStep(task.steps)`.
   - [`apps/mobile/src/workflows/__tests__/inbound-putaway.test.ts`](../apps/mobile/src/workflows/__tests__/inbound-putaway.test.ts): Suite de tests unitarios con Vitest que cubre todas las funciones y ramas de `inbound-putaway.ts`.
   - [`apps/mobile/vitest.config.ts`](../apps/mobile/vitest.config.ts): Inclusión de `src/workflows/**/*.ts` junto con `src/api/**/*.ts` en los umbrales de cobertura ≥80%.

---

## 2. Verificación de Fronteras, Convenciones y Entorno

- **Fronteras del Monorepo**: Verificado que ningún archivo en `apps/mobile` importa `@wms/db` ni `@prisma/client`; únicamente se importa `@wms/shared-types`.
- **ESM (`NodeNext`) y TypeScript Estricto**: Todos los imports relativos usan extensión `.js`, se emplea `import type` para contratos y se cumple con `strict: true`, `noUncheckedIndexedAccess: true` y `exactOptionalPropertyTypes: true`.
- **Nota sobre el entorno Windows**: Al invocar `run_command`, la herramienta reporta `exec: "c:\\Users\\santi\\Documents\\projects\\WMS\\powershell": executable file not found in %PATH%`. Se realizó inspección estática exhaustiva de tipos contra `packages/shared-types/src/index.ts` y `apps/mobile/src/types/expo-shim.d.ts`.
