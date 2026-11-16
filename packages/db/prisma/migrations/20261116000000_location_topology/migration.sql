-- Migration: 20261116000000_location_topology
-- Feature F9.2: Topología Física (RACK / SHELVING / FLOOR), Alta Estructurada y Layout

-- 1. Crear Enums de topología y estado
CREATE TYPE "StorageType" AS ENUM ('RACK', 'SHELVING', 'FLOOR');
CREATE TYPE "LocationStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- 2. Extender tabla locations con coordenadas de topología física y lote de generación
ALTER TABLE "locations" ADD COLUMN "storageType" "StorageType" NOT NULL DEFAULT 'RACK';
ALTER TABLE "locations" ADD COLUMN "status" "LocationStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "locations" ADD COLUMN "zone" TEXT NOT NULL DEFAULT 'MAIN';
ALTER TABLE "locations" ADD COLUMN "aisle" TEXT;
ALTER TABLE "locations" ADD COLUMN "rack" TEXT NOT NULL DEFAULT '01';
ALTER TABLE "locations" ADD COLUMN "level" TEXT NOT NULL DEFAULT '01';
ALTER TABLE "locations" ADD COLUMN "position" TEXT NOT NULL DEFAULT '01';
ALTER TABLE "locations" ADD COLUMN "generationBatchId" TEXT;

-- 3. Índices compuestos para consulta rápida de layout y rollback por lote
CREATE INDEX "locations_tenantId_warehouseId_zone_aisle_idx" ON "locations"("tenantId", "warehouseId", "zone", "aisle");
CREATE INDEX "locations_tenantId_generationBatchId_idx" ON "locations"("tenantId", "generationBatchId");
