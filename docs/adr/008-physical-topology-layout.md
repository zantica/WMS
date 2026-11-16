# ADR 008: Topología Física (RACK / SHELVING / FLOOR), Padding de Ceros y Layout con Divulgación Progresiva

- **Estado**: Aceptado
- **Fecha**: 2026-11-16
- **Feature**: `F9.2` — Topología Física (`RACK` / `SHELVING` / `FLOOR`), Alta Estructurada de Ubicaciones y Vista Gráfica del Layout

---

## 1. Contexto

Hasta la versión previa, la entidad `Location` únicamente distinguía su rol operativo funcional (`LocationType`: `RECEIVING`, `STORAGE`, `PACKING`, `DISPATCH`) con un código de texto libre (ej. `A-01-01`). Sin embargo, para operar eficazmente un almacén físico y representar al operario y al supervisor una vista gráfica fiel a la realidad arquitectónica, surgieron las siguientes necesidades y restricciones:

1. **Separación entre Rol Operativo (`LocationType`) y Estructura Física (`StorageType`)**:
   Una ubicación puede ser funcionalmente de `STORAGE` pero físicamente ser un rack vertical de palets (`RACK`), una estantería de baldas para picking manual (`SHELVING`), o una zona de suelo/bahía sin niveles (`FLOOR`).
2. **Invariante de Ordenación Lexicográfica pura equivalente al Orden Físico**:
   En bases de datos relacionales y en memoria, si un operario genera ubicaciones con números simples como `A-1-1`, `A-1-9`, `A-1-10`, `A-1-11`, una consulta `ORDER BY code ASC` o `Array.sort()` ubica `A-1-10` antes que `A-1-2` o `A-1-9`. Para evitar inconsistencias de secuenciación de rutas de picking y putaway, todo segmento numérico debe poseer zero-padding fijo de al menos 2 dígitos (`01`..`99`).
3. **Restricciones Topológicas por Tipo de Almacenamiento**:
   - `RACK` y `SHELVING` exigen obligatoriamente indicar `aisle` (pasillo), `rack` y `level` (entero >= 1).
   - `FLOOR` (bahías en suelo) solo permite nivel `"01"` (`level === "01"`), rechazando cualquier nivel superior (`02`, `03`...) con código tipado `INVALID_STORAGE_TOPOLOGY` (422).
4. **Escalabilidad del Layout Gráfico**:
   Pasillos con cientos o miles de celdas generan colapso de rendimiento si se intentan dibujar simultáneamente en el DOM. Se requiere divulgación progresiva con dos niveles: resumen macro de la nave (`GET /layout/:warehouseId`) y matriz detallada de celdas por pasillo (`GET /layout/:warehouseId/aisles/:aisle`), con colapso de racks si el pasillo excede el umbral de 200 celdas (`AISLE_CELL_COLLAPSE_THRESHOLD = 200`).
5. **Generador Masivo con Auditoría y Rollback Atómico por `batchId`**:
   Los supervisores necesitan previsualizar colisiones antes de escribir (`dryRun: true`), ejecutar commits idempotentes (`skipDuplicates`) con asignación de un `generationBatchId` único, y revertir lotes completos (`DELETE /batches/:batchId`) siempre que no contengan saldos activos (`onHand > 0` o `allocated > 0`), transacciones históricas en `InventoryTransaction`, ni pasos asignados en `TaskStep`.

---

## 2. Decisión

1. **Extensión del Modelo en `@wms/db` y Enums en `@wms/shared-types`**:
   - Se crean los enums `StorageType` (`RACK`, `SHELVING`, `FLOOR`) y `LocationStatus` (`ACTIVE`, `BLOCKED`).
   - Se extienden las columnas de `locations`: `storageType`, `status`, `zone`, `aisle`, `rack`, `level`, `position`, `generationBatchId`, y el flag de compatibilidad `isActive` (sincronizado con `status === 'ACTIVE'`).
   - Se añaden índices compuestos: `@@index([tenantId, warehouseId, zone, aisle])` y `@@index([tenantId, generationBatchId])`.
2. **Normalización Pura de Códigos (`normalizeLocationCode` / `formatStructuredLocationCode`)**:
   - Se exportan funciones puras en `@wms/shared-types` que garantizan `01`..`NN` en cualquier segmento numérico y validan contra `/^[A-Z0-9\-_]+$/`.
   - Se verifica mediante test unitario estricto que `A-01-01-01 < A-01-01-09 < A-01-01-10 < A-01-01-11 < A-01-01-12` tanto con `<` como con `.localeCompare()`.
3. **Definición Canónica de Ocupación %**:
   - `occupancyRate` (%) = `activeLocations === 0 ? 0 : Math.round((occupiedLocations / activeLocations) * 100)`.
   - Las ubicaciones con `status === 'BLOCKED'` no cuentan como capacidad activa disponible.
4. **Puerto Hexagonal `TopologyRepositoryPort`**:
   - Definido en `apps/api/src/ports/topology-repository.ts` con implementaciones `PrismaTopologyRepository` e `InMemoryTopologyRepository`.
   - Soporta consulta macro del almacén, detalle de pasillo con niveles invertidos de mayor a menor para alzado frontal en RACK/SHELVING y nivel 01 en planta para FLOOR, y validación estricta de rollback por lote.
5. **Generador Estructurado y Rollback**:
   - Endpoint `POST /api/v1/locations/generate-block` con modo `dryRun` (no escribe en BD, lista colisiones y ubicaciones creables) y modo commit con `generationBatchId`.
   - Endpoint `DELETE /api/v1/locations/batches/:batchId` con verificación de seguridad cruzada (rechaza con 409 `LOCATION_BATCH_IN_USE` si hay saldos > 0, `InventoryTransaction` o `TaskStep`).
6. **Vista Gráfica Web (`apps/web/src/app/locations/page.tsx`)**:
   - Diseñada bajo `S5 dark-data-dense`, paleta `P2` y tipografía `T3` con **0 colores hex crudos**.
   - Selector de escala / densidad, leyenda térmica de 4 estados (`VACÍA`, `OCUPADA`, `RESERVADA 100%`, `BLOQUEADA`), colapso de racks para pasillos > 200 celdas e integración directa con `LabelPrintModal`.

---

## 3. Consecuencias

### Positivas
- **Secuenciación Determinista**: `ORDER BY code ASC` en cualquier consulta coincide de forma idéntica con el orden físico real de avance por los pasillos.
- **Divulgación Progresiva y Alto Rendimiento**: La API no sobrecarga el cliente con miles de celdas; el supervisor examina la nave a nivel macro y profundiza bajo demanda a nivel de pasillo.
- **Seguridad e Integridad del Ledger**: Es imposible eliminar accidentalmente ubicaciones con saldos de stock o transacciones históricas en el Ledger, preservando el principio de inmutabilidad bancaria del WMS.
- **Trazabilidad de Creación**: Cada lote generado queda auditado bajo un `generationBatchId` identificable.

### Negativas / Riesgos
- Las ubicaciones legadas creadas sin coordenadas estructuradas mantendrán valores por defecto (`zone = 'MAIN'`, `rack = '01'`, etc.) hasta ser migradas o actualizadas.
- Ocupación volumétrica o pesaje (`maxVolume`, `maxPallets`) queda reservada para slotting algorítmico en fases posteriores.

### Verificación
- `apps/api/src/shared/__tests__/topology.test.ts`: 15 tests unitarios puros (Invariante 1, 2, 3, ATP y Visual Resolvers).
- `apps/api/src/use-cases/topology/__tests__/manage-locations.test.ts`: 17 tests unitarios del caso de uso (Invariante 1 a 5, multi-tenancy y rollback).
- `apps/api/src/routes/__tests__/locations-topology-routes.test.ts`: 10 tests de integración HTTP Fastify.
- `apps/web/src/lib/__tests__/api-client.test.ts` y `dashboard-metrics.test.ts`: tests del cliente web y métricas.
- `apps/web/src/app/locations/__tests__/locations-page.test.tsx`: test de renderizado sin hex crudos.
