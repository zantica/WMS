-- AlterTable sales_orders: make (tenantId, externalId) strictly unique
DROP INDEX IF EXISTS "sales_orders_tenantId_externalId_idx";
CREATE UNIQUE INDEX "sales_orders_tenantId_externalId_key" ON "sales_orders"("tenantId", "externalId");
