-- Migration: 20261031010000_tenant_rls
-- Feature F7.2: PostgreSQL Row Level Security (RLS) with FORCE ROW LEVEL SECURITY
-- Defensa en profundidad multi-tenant mediante current_setting('app.current_tenant_id', true).
--
-- Reglas invariantes:
-- 1. Denegación por defecto: cuando current_setting('app.current_tenant_id', true) es NULL o '',
--    NULLIF(current_setting('app.current_tenant_id', true), '') evalúa a NULL y toda comparación
--    de igualdad (=) devuelve UNKNOWN/FALSE. Ninguna fila es visible ni insertable sin contexto.
-- 2. FORCE ROW LEVEL SECURITY activo en todas las tablas protegidas para que incluso el propietario
--    de las tablas (salvo superusuarios explícitos con BYPASSRLS) esté sujeto a las políticas.
-- 3. La tabla `tenants` permanece accesible para el lookup inicial de API Key en el borde de autenticación;
--    `users` permite el lookup puntual de handshake por `clerkId` solo cuando se establece
--    transaccionalmente `app.auth_clerk_id` con `SET LOCAL`, manteniendo `WITH CHECK` estricto por tenant.

-- ─────────────────────────────────────────────────────────────
-- 1. TABLA: users (con soporte acotado para resolución inicial de auth por clerkId)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_tenant_isolation_policy" ON "users";
CREATE POLICY "users_tenant_isolation_policy" ON "users"
  FOR ALL
  USING (
    (
      NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
      AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    )
    OR (
      NULLIF(current_setting('app.auth_clerk_id', true), '') IS NOT NULL
      AND "clerkId" = NULLIF(current_setting('app.auth_clerk_id', true), '')
    )
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

-- ─────────────────────────────────────────────────────────────
-- 2. TABLA: warehouses
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warehouses" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouses_tenant_isolation_policy" ON "warehouses";
CREATE POLICY "warehouses_tenant_isolation_policy" ON "warehouses"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

-- ─────────────────────────────────────────────────────────────
-- 3. TABLA: locations
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "locations" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locations_tenant_isolation_policy" ON "locations";
CREATE POLICY "locations_tenant_isolation_policy" ON "locations"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

-- ─────────────────────────────────────────────────────────────
-- 4. TABLA: products
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_tenant_isolation_policy" ON "products";
CREATE POLICY "products_tenant_isolation_policy" ON "products"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

-- ─────────────────────────────────────────────────────────────
-- 5. TABLA: inventory_transactions (Ledger Inmutable)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "inventory_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_transactions" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_transactions_tenant_isolation_policy" ON "inventory_transactions";
CREATE POLICY "inventory_transactions_tenant_isolation_policy" ON "inventory_transactions"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

-- ─────────────────────────────────────────────────────────────
-- 6. TABLA: inventory_balances (Proyección / Snapshot con SELECT FOR UPDATE)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "inventory_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_balances" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_balances_tenant_isolation_policy" ON "inventory_balances";
CREATE POLICY "inventory_balances_tenant_isolation_policy" ON "inventory_balances"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

-- ─────────────────────────────────────────────────────────────
-- 7. TABLA: sales_orders
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales_orders" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_orders_tenant_isolation_policy" ON "sales_orders";
CREATE POLICY "sales_orders_tenant_isolation_policy" ON "sales_orders"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

-- ─────────────────────────────────────────────────────────────
-- 8. TABLA HIJA: order_lines (aislada a través de sales_orders.tenantId)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_lines" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_lines_tenant_isolation_policy" ON "order_lines";
CREATE POLICY "order_lines_tenant_isolation_policy" ON "order_lines"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "sales_orders" so
      WHERE so."id" = "order_lines"."orderId"
        AND so."tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    )
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "sales_orders" so
      WHERE so."id" = "order_lines"."orderId"
        AND so."tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 9. TABLA: warehouse_tasks
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "warehouse_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warehouse_tasks" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "warehouse_tasks_tenant_isolation_policy" ON "warehouse_tasks";
CREATE POLICY "warehouse_tasks_tenant_isolation_policy" ON "warehouse_tasks"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );

-- ─────────────────────────────────────────────────────────────
-- 10. TABLA HIJA: task_steps (aislada a través de warehouse_tasks.tenantId)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "task_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_steps" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_steps_tenant_isolation_policy" ON "task_steps";
CREATE POLICY "task_steps_tenant_isolation_policy" ON "task_steps"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "warehouse_tasks" wt
      WHERE wt."id" = "task_steps"."taskId"
        AND wt."tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    )
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "warehouse_tasks" wt
      WHERE wt."id" = "task_steps"."taskId"
        AND wt."tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
    )
  );
