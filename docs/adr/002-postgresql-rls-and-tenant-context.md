# ADR 002: PostgreSQL Row Level Security (`FORCE RLS`) y Puerto `TenantContextPort`

- **Estado**: Aceptado
- **Fecha**: 2026-10-31
- **Feature**: `F7.2` — PostgreSQL Row Level Security (RLS) con `FORCE RLS` y Puerto `TenantContext`

---

## 1. Contexto

El sistema WMS SaaS opera bajo un modelo multi-tenant en una base de datos PostgreSQL compartida. Aunque todos los casos de uso y rutas filtran explícitamente por `tenantId` en la capa de aplicación, una omisión accidental en una consulta futura o en una sentencia `$queryRaw` no debe jamás exponer ni mutar datos de otro tenant.

Al mismo tiempo, implementar Row Level Security (RLS) en un WMS transaccional presenta cuatro retos técnicos no triviales:

1. **Propietario de tablas y `FORCE ROW LEVEL SECURITY`**: En PostgreSQL, el usuario propietario de las tablas (normalmente el usuario de migración/aplicación en despliegues estándar) ignora las políticas RLS a menos que se active explícitamente `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.
2. **Pool de conexiones de Prisma y riesgo de contaminación entre peticiones**: Ejecutar `SET app.current_tenant_id = '...'` a nivel de sesión dejaría el `tenantId` adherido a la conexión del pool tras finalizar la petición HTTP, filtrando el contexto al siguiente request.
3. **Convivencia con `IsolationLevel.Serializable` y `SELECT ... FOR UPDATE`**: Los casos de uso críticos del Ledger (`moveStock`, `allocateOrder`, `cancelOrder`, `handlePickingException`, `createPutawayTask`) requieren transacciones `Serializable` y bloqueos pesimistas por fila. Abrir transacciones interactivas anidadas sobre Prisma crearía deadlocks o conexiones paralelas sin el GUC configurado.
4. **Resolución inicial de Autenticación (Handshake)**: Cuando llega una petición con `x-api-key` o `Authorization: Bearer <jwt>`, el servidor necesita identificar primero a qué `tenantId` pertenece la API key (`tenants`) o el `clerkId` (`users`) antes de poder fijar `app.current_tenant_id`.

---

## 2. Decisión

### 2.1 Políticas RLS con Denegación por Defecto (`USING` + `WITH CHECK` + `FORCE RLS`)
- En la migración `packages/db/prisma/migrations/20261031010000_tenant_rls/migration.sql` (y en el helper idempotente `applyTenantRlsPolicies` de `@wms/db`), se habilita `ENABLE ROW LEVEL SECURITY` y `FORCE ROW LEVEL SECURITY` sobre todas las tablas multi-tenant:
  - Tablas con columna directa `"tenantId"`: `users`, `warehouses`, `locations`, `products`, `inventory_transactions`, `inventory_balances`, `sales_orders`, `warehouse_tasks`.
  - Tablas hijas sin columna `tenantId` propia (`order_lines`, `task_steps`): protegidas mediante subconsulta `EXISTS` hacia su tabla padre (`sales_orders` y `warehouse_tasks` respectivamente) verificando `parent."tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')`.
- **Denegación estricta cuando el contexto está vacío**:
  - Todas las políticas evalúan `NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL AND ...`.
  - Si `app.current_tenant_id` no fue configurado (`NULL`) o fue configurado como cadena vacía (`''`), el predicado evalúa a `FALSE` tanto en lecturas (`USING`) como en escrituras (`WITH CHECK`). Nunca hay *fallback* a permitir acceso.

### 2.2 Propagación Transaccional con `SET LOCAL` (`set_config(..., true)`)
- El adaptador `PrismaTenantContextAdapter` y el helper `withTenantContext(client, tenantId, fn, options)` abren una transacción interactiva y ejecutan inmediatamente:
  ```sql
  SELECT set_config('app.current_tenant_id', $1, true);
  ```
- El tercer parámetro `is_local = true` equivale a `SET LOCAL`: PostgreSQL vincula el valor exclusivamente a la transacción actual y lo revierte automáticamente al ejecutarse `COMMIT` o `ROLLBACK`. De este modo, **ninguna conexión devuelta al pool de Prisma conserva jamás el `tenantId` de una transacción anterior**.

### 2.3 Reutilización de Transacción y Compatibilidad con `Serializable` + `SELECT ... FOR UPDATE`
- `withTenantContext` almacena el par `{ tenantId, tx }` en un `AsyncLocalStorage` durante la vida de la transacción.
- Si dentro de `withTenantContext(prisma, "tenant-a", async (tx) => { await moveStock(...); })` un caso de uso del Ledger (`moveStock`, `allocateOrder`, `cancelOrder`, `handlePickingException`, `createPutawayTask`) es invocado:
  1. Detecta la transacción activa (`params.tx` o `getActiveTenantStore()`).
  2. Verifica que el `tenantId` del caso de uso coincida exactamente con el `tenantId` de la transacción activa; si difiere, aborta inmediatamente con `WmsError("TENANT_MISMATCH", ..., 403)`.
  3. Reutiliza el mismo `TransactionClient` (`Serializable`) conservando intacto el `SET LOCAL app.current_tenant_id` y los bloqueos `SELECT ... FOR UPDATE`.

### 2.4 Resolución Inicial de Auth Controlada y Acotada
- **API Key (`x-api-key`)**: La tabla maestra `tenants` actúa como directorio de bootstrap y permite el lookup puntual `WHERE "apiKey" = $1` para obtener `tenant.id`. Ningún dato operativo de almacén vive en `tenants`.
- **JWT (`Authorization: Bearer <token>`)**: Cuando un JWT incluye `sub` (`clerkId`) pero necesita resolver el usuario en `users` antes de conocer su `tenantId`, `lookupUserByClerkIdForAuth` abre una transacción corta de lectura que fija `SELECT set_config('app.auth_clerk_id', clerkId, true)` (`SET LOCAL`).
  - La política `USING` de `users` permite seleccionar únicamente la fila cuyo `"clerkId"` coincide con `app.auth_clerk_id`, mientras que su cláusula `WITH CHECK` sigue exigiendo siempre `app.current_tenant_id` para cualquier `INSERT` o `UPDATE`.

---

## 3. Consecuencias

- **Positivas**:
  - Defensa en profundidad real en el motor PostgreSQL: ni lecturas (`SELECT`) ni escrituras (`INSERT`/`UPDATE`/`DELETE`) pueden cruzar fronteras de tenant aunque existiera un bug en el filtro `WHERE` de una consulta.
  - Cero fugas de estado en el pool de conexiones gracias a `set_config(..., true)` (`SET LOCAL`).
  - Los casos de uso del Ledger siguen siendo 100% compatibles tanto con tests unitarios mockeados como con transacciones `Serializable` reales envueltas en `withTenantContext`.
- **Trade-offs**:
  - En despliegues productivos, la cuenta de aplicación de PostgreSQL no debe tener el atributo `SUPERUSER` ni `BYPASSRLS` para que `FORCE ROW LEVEL SECURITY` se aplique sin excepción.
