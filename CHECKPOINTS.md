# CHECKPOINTS.md — Criterios Objetivos de Aceptación y Calidad (WMS)

Todo cambio de código evaluado por el subagente `reviewer` (o verificado tras un fix directo) debe cumplir estos puntos de control antes de marcar cualquier tarea como `"done"` en [`feature_list.json`](./feature_list.json).

> **Regla de evidencia**: un checkpoint solo se marca `[x]` si es verificable con código leído o con una ejecución real pegada en el reporte. El reviewer debe ser un agente distinto del implementer y del leader (ver [`.claude/agents/leader.md`](./.claude/agents/leader.md)).

---

## CP-1: Integridad del Inventory Ledger (Bounded Context B) ⚠️ CRÍTICO
- [ ] **Inmutabilidad absoluta**: Ningún código ejecuta `update`, `updateMany`, `delete` ni `deleteMany` sobre `prisma.inventoryTransaction`.
- [ ] **Atomicidad SQL**: Todo movimiento físico o reserva que altere `InventoryBalance` e `InventoryTransaction` ocurre dentro de `prisma.$transaction(..., { isolationLevel: "Serializable" })`.
- [ ] **Bloqueo pesimista (`SELECT ... FOR UPDATE`)**: Antes de descontar `onHandQty` o incrementar `allocatedQty`, se bloquea la fila en `inventory_balances` mediante `FOR UPDATE` filtrando por `tenant_id`, `location_id` y `product_id`.
- [ ] **Regla de Oro (No-Negatividad)**: Se verifica explícitamente que `onHandQty >= 0` y `ATP (onHandQty - allocatedQty) >= 0` antes de confirmar la operación; en caso contrario se lanza `WmsError("INSUFFICIENT_STOCK", ..., 409)`.

## CP-2: Aislamiento Multi-Tenant y Seguridad
- [ ] **Filtro `tenantId` obligatorio**: Todas las consultas (`findMany`, `findFirst`, `findUnique`, `update`, `$queryRaw`) incluyen `tenantId: request.tenantId`.
- [ ] **Sin fugas entre tenants**: Un recurso perteneciente a otro `tenantId` devuelve `404` (`*_NOT_FOUND`) o `403` (`TENANT_MISMATCH`), nunca datos cruzados.
- [ ] **Autenticación**: Los endpoints nuevos (salvo `/health` y `/docs`) pasan por el hook de autenticación (`request.tenantId` garantizado).

## CP-3: Contratos de API, Tipado y Arquitectura Monorepo
- [ ] **Fronteras de paquetes**:
  - `@wms/shared-types` **no importa nada de `@prisma/client` ni `@wms/db`**.
  - Los DTOs de entrada/salida compartidos entre `api`, `web` y `mobile` están definidos en `@wms/shared-types`.
- [ ] **Validación y Envolventes**:
  - Todas las entradas HTTP (`body`, `params`, `querystring`) se validan con esquemas **Zod**.
  - Las respuestas exitosas devuelven `{ success: true, data: ... }` (`ApiResponse<T>`).
  - Los errores de negocio usan `throw new WmsError(code, message, statusCode, details)`.
- [ ] **TypeScript Estricto & ESM**:
  - Compilación limpia (`pnpm build` sin errores con `strict`, `noUncheckedIndexedAccess` y `exactOptionalPropertyTypes`).
  - Imports relativos locales usan extensión `.js` (requerido por `moduleResolution: "NodeNext"`).

## CP-4: Verificación Automatizada y Cobertura
- [ ] **Suite de tests en verde, ejecutada por el reviewer**: `pnpm test` / `pnpm --filter @wms/api test:coverage` finalizan con código de salida `0` **en una ejecución realizada por el propio reviewer**, y su salida literal (resumen de Vitest + tabla de cobertura) está pegada en `progress/review_<feature_id>.md`. Sin esa evidencia el veredicto solo puede ser `BLOCKED`.
- [ ] **Cobertura de casos de uso**: Los casos de uso en `apps/api/src/use-cases/**` mantienen **≥ 80%** en ramas (*branches*), funciones y líneas (`pnpm --filter @wms/api test:coverage`).
- [ ] **Tests de Happy Path y todos los demás escenarios**: Toda nueva feature incluye tests explícitos para:
  1. **Happy Path** (flujo principal exitoso de principio a fin).
  2. **Casos Borde (Edge Cases)** (listas vacías, límites de lote, formatos especiales, valores cero/extremos).
  3. **Errores de Dominio y Validación** (`WmsError`, estados inválidos, datos malformados).
  4. **Fallos, Idempotencia y Aislamiento** (reintentos duplicados, fallos a mitad de lote, rollback transaccional y rechazo de acceso entre distintos `tenantId`).

## CP-5: Arquitectura Hexagonal, Puertos y Criterios de Hecho (Hitos 5–7)
- [ ] **Desacoplamiento de infraestructura**: Los nuevos casos de uso y motores de dominio no importan directamente `Fastify`, `React`, `Expo` ni adaptadores concretos; reciben sus dependencias a través de interfaces/puertos (`ports/`).
- [ ] **Puertos y Adaptadores explícitos**: Todo acceso externo nuevo (`DiagnosticsStore`, `TenantContextPort`, `IdempotencyStore`, `ColumnMapper`, `LabelRenderer`, `OfflineQueueStorage`) define su interfaz de puerto y su adaptador concreto en el borde.
- [ ] **TDD y Pruebas de Fallo**: Tests unitarios con puertos simulados cubriendo camino feliz, reintentos duplicados, cortes parciales y aislamiento de tenant.
- [ ] **Tests de integración con PostgreSQL**: Las features que involucren escrituras, bloqueos, idempotencia o políticas RLS incluyen verificación contra esquema/base de datos PostgreSQL.
- [ ] **ADR documentado**: Si la feature introduce decisiones arquitectónicas no obvias (ej. conflictos offline, diseño RLS), existe su documento en `docs/adr/` siguiendo [`docs/adr/000-template.md`](./docs/adr/000-template.md) y registrado en el índice [`docs/adr/README.md`](./docs/adr/README.md).

## CP-6: Higiene del Código (Sin Duplicados ni Código Muerto)
- [ ] **Sustitución = eliminación**: Si un componente, módulo o caso de uso se sustituye o renombra, el antiguo se elimina **en la misma feature** y se actualizan todos sus imports.
- [ ] **Sin re-exports huérfanos**: No se añaden archivos "de compatibilidad" (alias/re-exports) sin al menos un consumidor real en el repositorio.
- [ ] **Sin código muerto nuevo**: No quedan funciones, archivos, rutas o tests deshabilitados (`it.skip`, código comentado) introducidos por la feature sin justificación escrita en el `impl_*.md`.
- [ ] **Sin artefactos ajenos al toolchain**: No se versionan lockfiles de otros gestores (`package-lock.json`, `yarn.lock`); el único lockfile válido es `pnpm-lock.yaml`.

## CP-7: Estándar de Calidad Pre-Commit (SOLID, Cero Variables de Entorno y Reglas SonarCloud)
- [ ] **Principios SOLID**:
  - **S (Single Responsibility)**: Cada caso de uso, adaptador o módulo tiene una única responsabilidad bien delimitada (las rutas HTTP solo validan entrada y delegan; los adaptadores solo traducen a infraestructura).
  - **O (Open/Closed)**: La lógica de negocio es extensible mediante nuevos adaptadores o estrategias sin modificar los casos de uso existentes.
  - **L (Liskov Substitution)**: Los adaptadores en memoria/fakes y los adaptadores reales (Prisma/SQL/UI) son intercambiables respetando el contrato e invariantes de su puerto.
  - **I (Interface Segregation)**: Los puertos (`ports/`) son interfaces pequeñas y cohesivas, sin métodos innecesarios para sus consumidores.
  - **D (Dependency Inversion)**: Los casos de uso y el dominio dependen de abstracciones (`ports/`), nunca de implementaciones concretas.
- [ ] **Cero Variables de Entorno (`process.env`) y Secretos en el Código**:
  - Ningún caso de uso (`use-cases/**`), puerto (`ports/**`), motor de dominio ni lógica de negocio de cliente lee `process.env.*` directamente; toda configuración se resuelve únicamente en el punto de entrada (*composition root*) y se inyecta de forma tipada.
  - No existen credenciales, API keys reales, tokens JWT ni cadenas de conexión hardcodeadas en el código fuente, ni archivos `.env` en staging de Git.
- [ ] **Prevención de Vulnerabilidades y Code Smells de SonarCloud (`Zero Sonar Issues`)**:
  - **Sin PRNG inseguro (`typescript:S2245`)**: Prohibido usar `Math.random()` en cualquier paquete (`api`, `web`, `mobile`); usar `crypto.randomUUID()`, `crypto.getRandomValues()` o contadores monotónicos deterministas.
  - **Sin Regex super-lineales / ReDoS (`typescript:S8786`)**: Prohibidas las expresiones regulares con cuantificadores ambiguos o sin anclaje inicial (ej. `/\/+$/`); usar operaciones lineales de string (`endsWith`, `slice`, bucles $O(n)$).
  - **Sin promesas flotantes (`typescript:S9383`)**: Toda promesa debe llevar `await`, `.catch(...)` o prefijo explícito `void`.
  - **Higiene en Shell y GitHub Actions (`shell:S7688`, `S6505`, `githubactions:S7637`)**: En scripts Bash usar siempre `[[ ... ]]` en lugar de `[ ... ]`; en `pnpm install` de scripts/CI incluir `--ignore-scripts`; en GitHub Actions fijar acciones de terceros por su SHA completo de commit.
