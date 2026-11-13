-- Migration: 20261113010000_catalog_categories
-- Feature F9.1: Maestro de Producto WMS, Categorías configurables, Búsqueda por SKU y Gestión de Usuarios/Roles

-- 1. Crear tabla categories
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- 2. Índices y constraints de categories
CREATE UNIQUE INDEX "categories_tenantId_code_key" ON "categories"("tenantId", "code");
CREATE INDEX "categories_tenantId_idx" ON "categories"("tenantId");

-- 3. Clave foránea hacia tenants
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Ampliar products con categoryId
ALTER TABLE "products" ADD COLUMN "categoryId" TEXT;

-- 5. Índice y clave foránea de products -> categories
CREATE INDEX "products_tenantId_categoryId_idx" ON "products"("tenantId", "categoryId");
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Row Level Security (RLS) con FORCE ROW LEVEL SECURITY (F7.2)
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories_tenant_isolation_policy" ON "categories";
CREATE POLICY "categories_tenant_isolation_policy" ON "categories"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );
