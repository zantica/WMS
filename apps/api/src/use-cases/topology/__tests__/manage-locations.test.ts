// apps/api/src/use-cases/topology/__tests__/manage-locations.test.ts
// Tests unitarios enfocados para ManageLocationsUseCase (F9.2)

import { describe, it, expect, beforeEach } from "vitest";
import { ManageLocationsUseCase } from "../manage-locations.js";
import { InMemoryTopologyRepository } from "../../../adapters/in-memory-topology-repository.js";
import { WmsError } from "../../../plugins/error-handler.js";

describe("ManageLocationsUseCase", () => {
  let repo: InMemoryTopologyRepository;
  let useCase: ManageLocationsUseCase;

  const TENANT_A = "tenant_alpha";
  const TENANT_B = "tenant_beta";
  const WAREHOUSE_1 = "wh_01";

  beforeEach(() => {
    repo = new InMemoryTopologyRepository();
    useCase = new ManageLocationsUseCase(repo);
  });

  describe("Invariante 1 & Alta Individual: createSingleLocation", () => {
    it("crea una ubicación RACK normalizando el código con zero-padding", async () => {
      const result = await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "a-1-1",
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rack: "1",
        level: "1",
        position: "1",
      });

      expect(result.code).toBe("A-01-01");
      expect(result.storageType).toBe("RACK");
      expect(result.status).toBe("ACTIVE");
      expect(result.isActive).toBe(true);
      expect(result.rack).toBe("01");
      expect(result.level).toBe("01");
      expect(result.position).toBe("01");
    });

    it("genera el código estructurado automáticamente si no se envía código explícito", async () => {
      const result = await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "B",
        rack: "3",
        level: "2",
        position: "5",
      });

      expect(result.code).toBe("B-03-02-05");
    });

    it("rechaza la creación si el código ya existe en el almacén (409 CONFLICT)", async () => {
      await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "A-01-01",
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rack: "01",
        level: "01",
        position: "01",
      });

      await expect(
        useCase.createSingleLocation(TENANT_A, {
          warehouseId: WAREHOUSE_1,
          code: "A-1-1", // normaliza a A-01-01
          type: "STORAGE",
          storageType: "RACK",
          zone: "MAIN",
          aisle: "A",
          rack: "01",
          level: "01",
          position: "01",
        }),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: "CONFLICT",
      });
    });

    it("permite el mismo código en un tenant diferente (aislamiento multi-tenant)", async () => {
      const locA = await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "A-01-01",
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rack: "01",
        level: "01",
        position: "01",
      });

      const locB = await useCase.createSingleLocation(TENANT_B, {
        warehouseId: WAREHOUSE_1,
        code: "A-01-01",
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rack: "01",
        level: "01",
        position: "01",
      });

      expect(locA.id).not.toBe(locB.id);
      expect(locA.code).toBe(locB.code);
    });
  });

  describe("Invariante 2: Matriz de validación por StorageType", () => {
    it("rechaza RACK sin pasillo con 422 INVALID_STORAGE_TOPOLOGY", async () => {
      await expect(
        useCase.createSingleLocation(TENANT_A, {
          warehouseId: WAREHOUSE_1,
          type: "STORAGE",
          storageType: "RACK",
          zone: "MAIN",
          aisle: "", // vacío
          rack: "01",
          level: "01",
          position: "01",
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "INVALID_STORAGE_TOPOLOGY",
      });
    });

    it("rechaza FLOOR con nivel > 1 con 422 INVALID_STORAGE_TOPOLOGY", async () => {
      await expect(
        useCase.createSingleLocation(TENANT_A, {
          warehouseId: WAREHOUSE_1,
          type: "STORAGE",
          storageType: "FLOOR",
          zone: "MAIN",
          rack: "BAHIA_01",
          level: "02", // inválido para suelo
          position: "01",
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "INVALID_STORAGE_TOPOLOGY",
      });
    });

    it("acepta FLOOR con nivel '01' con o sin pasillo", async () => {
      const floorLoc = await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        type: "RECEIVING",
        storageType: "FLOOR",
        zone: "DOCK",
        rack: "PULMON_01",
        level: "01",
        position: "01",
      });

      expect(floorLoc.storageType).toBe("FLOOR");
      expect(floorLoc.level).toBe("01");
    });
  });

  describe("Invariante 5: Generador en bloque (generateBlock)", () => {
    it("en dryRun: true detecta códigos a crear y colisiones sin escribir en BD", async () => {
      // Sembrar una ubicación preexistente
      await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "A-01-01-01",
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rack: "01",
        level: "01",
        position: "01",
      });

      // Solicitar generación de rack 1 a 2, niveles 1 a 2, 2 posiciones por nivel = 8 ubicaciones
      const preview = await useCase.generateBlock(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rackStart: 1,
        rackEnd: 2,
        levelStart: 1,
        levelEnd: 2,
        positionsPerLevel: 2,
        dryRun: true,
      });

      expect(preview.dryRun).toBe(true);
      expect(preview.batchId).toBeNull();
      expect(preview.totalGenerated).toBe(8);
      expect(preview.collisions).toEqual(["A-01-01-01"]);
      expect(preview.creatableCount).toBe(7);
      expect(preview.createdCount).toBe(7);

      // Verificar que NO se escribió en BD (sigue habiendo solo 1)
      const existingInRepo = await repo.findLocationsByBatchId(TENANT_A, "dry");
      expect(existingInRepo.length).toBe(0);
    });

    it("en dryRun: false ejecuta upsert idempotente y asigna generationBatchId", async () => {
      const result = await useCase.generateBlock(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rackStart: 1,
        rackEnd: 1,
        levelStart: 1,
        levelEnd: 2,
        positionsPerLevel: 2,
        dryRun: false,
      });

      expect(result.dryRun).toBe(false);
      expect(result.batchId).toBeTruthy();
      expect(result.totalGenerated).toBe(4);
      expect(result.createdCount).toBe(4);
      expect(result.collisions).toEqual([]);

      // Verificar que se guardaron con ese batchId
      const saved = await repo.findLocationsByBatchId(TENANT_A, result.batchId!);
      expect(saved.length).toBe(4);
      expect(saved.every((l) => l.generationBatchId === result.batchId)).toBe(true);
    });

    it("rechaza solicitud de FLOOR con niveles > 1 en generateBlock", async () => {
      await expect(
        useCase.generateBlock(TENANT_A, {
          warehouseId: WAREHOUSE_1,
          type: "STORAGE",
          storageType: "FLOOR",
          zone: "MAIN",
          rackStart: 1,
          rackEnd: 2,
          levelStart: 1,
          levelEnd: 3, // inválido para FLOOR
          positionsPerLevel: 2,
        }),
      ).rejects.toMatchObject({
        statusCode: 422,
        code: "INVALID_STORAGE_TOPOLOGY",
      });
    });
  });

  describe("Invariante 5: Rollback de lote (deleteBatch)", () => {
    it("elimina exitosamente un lote si sus ubicaciones están libres de stock y transacciones", async () => {
      const block = await useCase.generateBlock(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "B",
        rackStart: 1,
        rackEnd: 1,
        levelStart: 1,
        levelEnd: 1,
        positionsPerLevel: 3,
        dryRun: false,
      });

      const batchId = block.batchId!;
      const delResult = await useCase.deleteBatch(TENANT_A, batchId);

      expect(delResult.batchId).toBe(batchId);
      expect(delResult.deletedCount).toBe(3);

      const remaining = await repo.findLocationsByBatchId(TENANT_A, batchId);
      expect(remaining.length).toBe(0);
    });

    it("rechaza eliminar el lote si alguna ubicación tiene saldo onHand > 0 (409 LOCATION_BATCH_IN_USE)", async () => {
      const block = await useCase.generateBlock(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "C",
        rackStart: 1,
        rackEnd: 1,
        levelStart: 1,
        levelEnd: 1,
        positionsPerLevel: 2,
        dryRun: false,
      });

      const batchId = block.batchId!;
      const targetLoc = block.locations[0]!;

      // Simular saldo en una ubicación del lote
      repo.seedBalances([
        {
          tenantId: TENANT_A,
          warehouseId: WAREHOUSE_1,
          locationId: targetLoc.id,
          productId: "prod_01",
          onHandQty: 10,
          allocatedQty: 0,
        },
      ]);

      await expect(useCase.deleteBatch(TENANT_A, batchId)).rejects.toMatchObject({
        statusCode: 409,
        code: "LOCATION_BATCH_IN_USE",
      });
    });

    it("rechaza eliminar el lote si existe una transacción histórica en el Ledger (409 LOCATION_BATCH_IN_USE)", async () => {
      const block = await useCase.generateBlock(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "D",
        rackStart: 1,
        rackEnd: 1,
        levelStart: 1,
        levelEnd: 1,
        positionsPerLevel: 1,
        dryRun: false,
      });

      const batchId = block.batchId!;
      const targetLoc = block.locations[0]!;

      // Simular transacción en el ledger
      repo.seedTransactions([
        {
          tenantId: TENANT_A,
          locationId: targetLoc.id,
        },
      ]);

      await expect(useCase.deleteBatch(TENANT_A, batchId)).rejects.toMatchObject({
        statusCode: 409,
        code: "LOCATION_BATCH_IN_USE",
      });
    });

    it("lanza 404 LOCATION_NOT_FOUND si el lote no existe", async () => {
      await expect(useCase.deleteBatch(TENANT_A, "batch_inexistente")).rejects.toMatchObject({
        statusCode: 404,
        code: "LOCATION_NOT_FOUND",
      });
    });
  });

  describe("Invariante 3 & 4: Layout Macro y Detalle de Pasillo", () => {
    it("calcula occupancyRate macro correctamente (ocupadas / activas * 100)", async () => {
      // 3 ubicaciones en pasillo 01: 2 activas (1 ocupada, 1 vacía) y 1 bloqueada (con status BLOCKED)
      const loc1 = await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "01-01-01-01",
        type: "STORAGE",
        storageType: "RACK",
        status: "ACTIVE",
        zone: "MAIN",
        aisle: "01",
        rack: "01",
        level: "01",
        position: "01",
      });

      const loc2 = await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "01-01-01-02",
        type: "STORAGE",
        storageType: "RACK",
        status: "ACTIVE",
        zone: "MAIN",
        aisle: "01",
        rack: "01",
        level: "01",
        position: "02",
      });

      const loc3 = await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "01-01-01-03",
        type: "STORAGE",
        storageType: "RACK",
        status: "BLOCKED",
        zone: "MAIN",
        aisle: "01",
        rack: "01",
        level: "01",
        position: "03",
      });

      // Sembrar saldo en loc1
      repo.seedBalances([
        {
          tenantId: TENANT_A,
          warehouseId: WAREHOUSE_1,
          locationId: loc1.id,
          productId: "p1",
          onHandQty: 50,
          allocatedQty: 10,
        },
      ]);

      const summary = await useCase.getWarehouseLayoutSummary(TENANT_A, WAREHOUSE_1);

      expect(summary.totalLocations).toBe(3);
      expect(summary.activeLocations).toBe(2);
      expect(summary.blockedLocations).toBe(1);
      expect(summary.occupiedLocations).toBe(1);
      // Ocupación: 1 ocupada / 2 activas = 50%
      expect(summary.occupancyRate).toBe(50);
      expect(summary.totalOnHand).toBe(50);
      expect(summary.totalAllocated).toBe(10);
      expect(summary.totalAtp).toBe(40);

      // Detalle de pasillo
      const aisleDetail = await useCase.getAisleLayoutDetail(TENANT_A, WAREHOUSE_1, "01", "MAIN");
      expect(aisleDetail.totalLocations).toBe(3);
      expect(aisleDetail.activeLocations).toBe(2);
      expect(aisleDetail.occupancyRate).toBe(50);
      expect(aisleDetail.racks.length).toBe(1);

      const rack = aisleDetail.racks[0]!;
      expect(rack.rack).toBe("01");
      expect(rack.levels.length).toBe(1);
      expect(rack.levels[0]!.positions.length).toBe(3);
    });

    it("invierte verticalmente los niveles en RACK/SHELVING (nivel superior primero)", async () => {
      // Crear Rack con niveles 01, 02 y 03
      await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "A-01-01-01",
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rack: "01",
        level: "01",
        position: "01",
      });
      await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "A-01-02-01",
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rack: "01",
        level: "02",
        position: "01",
      });
      await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "A-01-03-01",
        type: "STORAGE",
        storageType: "RACK",
        zone: "MAIN",
        aisle: "A",
        rack: "01",
        level: "03",
        position: "01",
      });

      const detail = await useCase.getAisleLayoutDetail(TENANT_A, WAREHOUSE_1, "A");
      const rack = detail.racks[0]!;

      // En alzado frontal para RACK, los niveles deben venir ordenados: 03, 02, 01
      const levelOrder = rack.levels.map((l) => l.level);
      expect(levelOrder).toEqual(["03", "02", "01"]);
    });
  });

  describe("Actualización de Ubicación: updateLocation", () => {
    it("permite bloquear o desbloquear una ubicación cambiando status a BLOCKED / ACTIVE", async () => {
      const loc = await useCase.createSingleLocation(TENANT_A, {
        warehouseId: WAREHOUSE_1,
        code: "LOC-ACTIVE-01",
        type: "STORAGE",
        storageType: "RACK",
        status: "ACTIVE",
        zone: "MAIN",
        aisle: "A",
        rack: "01",
        level: "01",
        position: "01",
      });

      const updated = await useCase.updateLocation(TENANT_A, loc.id, {
        status: "BLOCKED",
      });

      expect(updated.status).toBe("BLOCKED");
      expect(updated.isActive).toBe(false);

      const unblocked = await useCase.updateLocation(TENANT_A, loc.id, {
        status: "ACTIVE",
      });
      expect(unblocked.status).toBe("ACTIVE");
      expect(unblocked.isActive).toBe(true);
    });
  });
});
