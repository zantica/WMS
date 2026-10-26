# Reporte de Implementación: F3.3 — Flujo móvil de Picking y Packing paso a paso en @wms/mobile
- **Estado**: DONE
- **Fecha**: 2026-10-26

## Archivos Creados / Modificados
- `apps/mobile/src/api/client.ts`: enriquecido `ConfirmTaskStepResponse` con los campos opcionales de re-asignación de `F3.2` (`reallocated`, `orderStatus`, `replacementSteps` mediante `ReplacementStepSummary`) y añadido el método `dispatchOrder(orderId)` (`POST /api/v1/orders/:id/dispatch`) con su tipo `DispatchOrderResponse`.
- `apps/mobile/src/api/__tests__/client.test.ts`: añadido test unitario verificando `dispatchOrder(orderId)` contra `POST /api/v1/orders/:id/dispatch`.
- `apps/mobile/src/workflows/picking.ts`: creado módulo de lógica pura para el flujo de Picking y Packing con `sortPickingStepsByLocation` (`locationCode ASC` + `sequence ASC`), `getNextPickingStep`, `validateLocationScan`, `validateProductScan`, `createInitialDualScanState`, `advanceDualScanState` (máquina de estados de doble escaneo: `AWAITING_LOCATION` → `AWAITING_PRODUCT` → `READY_TO_CONFIRM`) y `formatPickingExceptionFeedback` (formateo en vivo de re-asignaciones a nuevas estanterías `STORAGE` o paso a `ON_HOLD`).
- `apps/mobile/src/workflows/inbound-putaway.ts`: actualizado `resolveTaskExecutionRoute` para que tanto `PICKING` como `PACKING` resuelvan hacia `/tasks/picking/${encodedId}`.
- `apps/mobile/src/workflows/__tests__/inbound-putaway.test.ts`: actualizado el caso de prueba de `resolveTaskExecutionRoute` para cubrir las rutas `/tasks/picking/:id` en tareas `PICKING` y `PACKING`.
- `apps/mobile/src/workflows/__tests__/picking.test.ts`: creada suite de 6 tests unitarios exhaustivos cubriendo el ordenamiento inmutable por `locationCode ASC`, selección del paso `PENDING` activo, validación de ubicación y producto (EAN/barcode y SKU), transiciones completas y errores `INVALID_SCAN` de la máquina de doble escaneo, y formateo de excepciones (`reallocated: true` y `ON_HOLD`).
- `apps/mobile/app/tasks/picking/[taskId].tsx`: creada pantalla guiada de Picking y Packing paso a paso con inicio automático de tareas `PENDING`, recorrido ordenado por `locationCode ASC`, indicador visual de doble validación de escaneo (1º Ubicación `STORAGE` Verificada ✓ → 2º Producto EAN/SKU), selector de cantidad, reporte de excepciones en tiempo real con visualización de reemplazos de `F3.2` y panel de cierre en Mesa de Packing con botón de despacho (`dispatchOrder`).
- `apps/mobile/app/_layout.tsx`: registrada la pantalla `tasks/picking/[taskId]` en el `Stack` de navegación de Expo Router.

## Decisiones de Diseño e Invariantes
- **Fronteras del Monorepo**: `@wms/mobile` importa tipos de dominio (`OrderStatus`, `TaskStepDTO`, `WarehouseTaskDTO`, `WmsErrorCode`) exclusivamente desde `@wms/shared-types`, sin acoplamiento con `@wms/db` ni `@prisma/client`.
- **Doble Validación de Escaneo en Piso**: `advanceDualScanState` obliga a verificar primero el código QR de la estantería `STORAGE` (`AWAITING_LOCATION`) antes de habilitar el escaneo del barcode/SKU del producto (`AWAITING_PRODUCT`), previniendo extracciones de ubicaciones incorrectas antes de invocar `POST /api/v1/tasks/:id/steps/:stepId/confirm`.
- **Integración en Tiempo Real con `F3.2` y Mesa de Packing**: cuando un operario reporta una excepción (`reportException: true`), `formatPickingExceptionFeedback` traduce la respuesta de `@wms/api` en un banner accionable que detalla las nuevas ubicaciones `STORAGE` asignadas (`replacementSteps`) o alerta si el pedido quedó en `ON_HOLD`, recargando inmediatamente el recorrido; al finalizar todas las paradas (`COMPLETED`), habilita la confirmación de despacho (`POST /api/v1/orders/:id/dispatch`).

## Resultados de Verificación
- Verificación estática exhaustiva de tipos (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`) en todos los módulos creados y modificados de `@wms/mobile`.
- Cobertura completa de ramas y funciones en `apps/mobile/src/workflows/picking.ts`, `apps/mobile/src/workflows/inbound-putaway.ts` y `apps/mobile/src/api/client.ts` mediante sus suites en `src/**/__tests__/*.test.ts`.
