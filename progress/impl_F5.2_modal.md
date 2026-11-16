# Reporte de Implementación: F5.2 (Mejora Modal de Impresión) — Aislamiento @media print y Edición Interactiva en Vivo

- **Estado**: DONE
- **Fecha**: 2026-11-16

## Archivos Creados / Modificados / Eliminados
- `apps/web/src/components/labels/label-print-modal.tsx`:
  - Renderizado mediante portal DOM `createPortal(..., document.body)` (cuando `typeof document !== "undefined"`) dentro del contenedor raíz semántico `.wms-label-modal-root`.
  - Reemplazo completo de clases Tailwind inexistentes por clases semánticas `.wms-label-modal-*` y `.wms-no-print` acordes al Design System `S5 dark-data-dense` / `P2 Refinada`.
  - Auto-regeneración viva al modificar simbología (`QR` / `CODE128`), presets de tamaño (`70x35`, `50x25`, `100x50`, `custom`), dimensiones en mm, texto legible o EAN comercial.
  - Modificación interactiva de copias por ítem (`-` / `+` e input `1..50`) mediante funciones puras `updateItemCopies` y eliminación de ítems con `removeItemFromQueue`.
  - Previsualización en pantalla con SVG, payload tipado (`LOC:...`, `SKU:...`), dimensiones y badges `×N`, más hoja dedicada `.wms-label-print-sheet` que expande las etiquetas físicas para impresión térmica o A4 vía `expandPrintLabels`.
- `apps/web/src/app/globals.css`:
  - Definición completa de estilos semánticos `.wms-label-modal-*` (backdrop con blur, contenedor modal centrado, toolbar, controles de cantidad, tarjetas de vista previa y hoja de impresión).
  - Reglas `@media print`: `@page { margin: 8mm; size: auto; }`, ocultación de todo el resto de la aplicación (`body > *:not(.wms-label-modal-root) { display: none !important; }`), ocultación de controles de UI (`.wms-no-print { display: none !important; }`) y visualización exclusiva de `.wms-label-print-sheet` sobre fondo blanco puro con `break-inside: avoid`.
- `apps/web/src/components/labels/__tests__/label-print-modal.test.tsx`:
  - Suite de 9 tests unitarios cubriendo renderizado del diálogo, clases de aislamiento `@media print`, opción de EAN comercial, vista previa con payload tipado y SVG, lógica de copias (1..50), eliminación de ítems, resolución de presets en mm y expansión física en hoja de impresión.

## Decisiones de Diseño e Invariantes
- **Aislamiento Estricto de Impresión sin Tailwind**: Al no contar `@wms/web` con Tailwind CSS, todo el control de visibilidad en impresión se delegó a `@media print` en `globals.css` mediante el selector `body > *:not(.wms-label-modal-root)` y `.wms-no-print`. Gracias a `createPortal(..., document.body)`, la modal se desacopla del DOM anidado del catálogo/ubicaciones y se garantiza que solo `.wms-label-print-sheet` sea enviada a la impresora.
- **Desacoplamiento y Funciones Puras**: La lógica de copias (`updateItemCopies`), descarte (`removeItemFromQueue`), presets (`resolvePresetDimensions`) y repetición física (`expandPrintLabels`) se encapsuló en funciones puras exportadas, garantizando testeabilidad unitaria sin acoplamiento a frameworks de renderizado.
- **Compatibilidad SSR / Node**: Si `document.body` no existe (entorno Node o SSR), `LabelPrintModal` devuelve el nodo JSX directamente, garantizando renderizado estático seguro sin fallos.

## Resultados de Verificación (salida literal, no parafraseada)

### `pnpm --filter @wms/web test`
```
> @wms/web@0.0.1 test C:\Users\santi\Documents\projects\WMS\apps\web
> vitest run

The CJS build of Vite's Node API is deprecated. See https://vite.dev/guide/troubleshooting.html#vite-cjs-node-api-deprecated for more details.

 RUN  v2.1.9 C:/Users/santi/Documents/projects/WMS/apps/web

 ✓ src/lib/__tests__/api-client.test.ts (8 tests) 13ms
 ✓ src/lib/__tests__/dashboard-metrics.test.ts (8 tests) 16ms
 ✓ src/components/labels/__tests__/label-print-modal.test.tsx (9 tests) 19ms

 Test Files  3 passed (3)
      Tests  25 passed (25)
   Start at  01:43:15
   Duration  632ms (transform 233ms, setup 0ms, collect 373ms, tests 48ms, environment 1ms, prepare 538ms)
```

### `pnpm build`
```
> wms@0.0.1 build C:\Users\santi\Documents\projects\WMS
> turbo run build

   • turbo 2.11.10
   • Packages in scope: @wms/api, @wms/db, @wms/domain, @wms/mobile, @wms/shared-types, @wms/web
   • Running build in 6 packages
   • Remote caching disabled

@wms/db:build: cache hit, replaying logs 2bc0ac31bf56ff50
@wms/shared-types:build: cache hit, replaying logs 0818b42facbb6825
@wms/mobile:build: cache hit, replaying logs dde5e8caf225fe8c
@wms/domain:build: cache hit, replaying logs 67718cc3de844ab0
@wms/api:build: cache hit, replaying logs 66ba42d7372c4617
@wms/web:build: cache miss, executing 738db71d977729eb
@wms/web:build: > @wms/web@0.0.1 build C:\Users\santi\Documents\projects\WMS\apps\web
@wms/web:build: > tsc --noEmit

 Tasks:    6 successful, 6 total
Cached:    5 cached, 6 total
  Time:    4.202s 
```
