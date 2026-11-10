-- Migration: 20261110120000_idempotency_records
-- Feature F6.1: Puerto IdempotencyStore y persistencia transaccional única por (tenantId, idempotencyKey)

CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "requestHash" TEXT,
    "responseStatus" INTEGER NOT NULL DEFAULT 200,
    "responseBody" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- Constraint único por inquilino y clave de idempotencia
CREATE UNIQUE INDEX "idempotency_records_tenantId_idempotencyKey_key" ON "idempotency_records"("tenantId", "idempotencyKey");

-- Índice para consultas y limpiezas por fecha de creación dentro del inquilino
CREATE INDEX "idempotency_records_tenantId_createdAt_idx" ON "idempotency_records"("tenantId", "createdAt");

-- Relación de clave foránea con cascada al borrar el tenant
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security (RLS) con FORCE ROW LEVEL SECURITY (F7.2)
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "idempotency_records_tenant_isolation_policy" ON "idempotency_records";
CREATE POLICY "idempotency_records_tenant_isolation_policy" ON "idempotency_records"
  FOR ALL
  USING (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  )
  WITH CHECK (
    NULLIF(current_setting('app.current_tenant_id', true), '') IS NOT NULL
    AND "tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')
  );
