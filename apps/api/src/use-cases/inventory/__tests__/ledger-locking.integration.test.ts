// apps/api/src/use-cases/inventory/__tests__/ledger-locking.integration.test.ts
// Suite de integración PostgreSQL real para validar PrismaUnitOfWork,
// SELECT ... FOR UPDATE, aislamiento Serializable, RLS (withTenantContext)
// y ausencia de doble reserva bajo concurrencia real (DOM-2).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, withTenantContext } from "@wms/db";
import { PrismaUnitOfWork } from "../../../adapters/prisma-unit-of-work.js";
import { moveStock } from "../move-stock.js";
import { allocateOrder } from "../allocate-order.js";
import { cancelOrder } from "../cancel-order.js";
import { confirmTaskStep } from "../../tasks/confirm-task-step.js";

const shouldRunPgIntegration =
  process.env["RUN_PG_INTEGRATION"] === "true" ||
  (process.env["CI"] === "true" && Boolean(process.env["DATABASE_URL"]));

describe.runIf(shouldRunPgIntegration)(
  "Integración PostgreSQL 16 — PrismaUnitOfWork, SELECT FOR UPDATE y Concurrencia Serializable (DOM-2)",
  () => {
    let db: PrismaClient;
    let uow: PrismaUnitOfWork;
    const suffix = Date.now().toString(36);
    const tenantId = `tenant-dom2-${suffix}`;
    const warehouseId = `wh-dom2-${suffix}`;
    const storageLocId = `loc-stor-dom2-${suffix}`;
    const packingLocId = `loc-pack-dom2-${suffix}`;
    const productId = `prod-dom2-${suffix}`;

    beforeAll(async () => {
      db = new PrismaClient();
      await db.$connect();
      uow = new PrismaUnitOfWork(db);

      await db.tenant.create({
        data: {
          id: tenantId,
          name: "Tenant DOM-2 Integration",
          slug: `tenant-dom2-${suffix}`,
          apiKey: `key-dom2-${suffix}`,
        },
      });

      await withTenantContext(db, tenantId, async (tx) => {
        await tx.warehouse.create({
          data: {
            id: warehouseId,
            tenantId,
            name: "DOM-2 Warehouse",
          },
        });

        await tx.location.createMany({
          data: [
            {
              id: storageLocId,
              tenantId,
              warehouseId,
              code: `A-01-${suffix}`,
              type: "STORAGE",
              isActive: true,
            },
            {
              id: packingLocId,
              tenantId,
              warehouseId,
              code: `PACK-${suffix}`,
              type: "PACKING",
              isActive: true,
            },
          ],
        });

        await tx.product.create({
          data: {
            id: productId,
            tenantId,
            sku: `SKU-DOM2-${suffix}`,
            name: "DOM-2 Concurrency Item",
            barcode: `BAR-DOM2-${suffix}`,
          },
        });
      });
    });

    afterAll(async () => {
      if (db) {
        try {
          await withTenantContext(db, tenantId, async (tx) => {
            await tx.idempotencyRecord.deleteMany({ where: { tenantId } });
            await tx.taskStep.deleteMany({ where: { task: { tenantId } } });
            await tx.warehouseTask.deleteMany({ where: { tenantId } });
            await tx.inventoryTransaction.deleteMany({ where: { tenantId } });
            await tx.inventoryBalance.deleteMany({ where: { tenantId } });
            await tx.orderLine.deleteMany({ where: { order: { tenantId } } });
            await tx.salesOrder.deleteMany({ where: { tenantId } });
            await tx.product.deleteMany({ where: { tenantId } });
            await tx.location.deleteMany({ where: { tenantId } });
            await tx.warehouse.deleteMany({ where: { tenantId } });
          });
          await db.tenant.deleteMany({ where: { id: tenantId } });
        } finally {
          await db.$disconnect();
        }
      }
    });

    it("impide sobre-reserva bajo concurrencia real (Serializable + SELECT FOR UPDATE)", async () => {
      // Sembrar 5 unidades en STORAGE
      await moveStock({
        tenantId,
        productId,
        toLocationId: storageLocId,
        quantity: 5,
        reason: "INBOUND_RECEIPT",
        unitOfWork: uow,
      });

      const order1Id = `ord-conc-1-${suffix}`;
      const order2Id = `ord-conc-2-${suffix}`;

      await withTenantContext(db, tenantId, async (tx) => {
        await tx.salesOrder.create({
          data: {
            id: order1Id,
            tenantId,
            warehouseId,
            status: "PENDING",
            lines: { create: [{ productId, requestedQty: 4 }] },
          },
        });
        await tx.salesOrder.create({
          data: {
            id: order2Id,
            tenantId,
            warehouseId,
            status: "PENDING",
            lines: { create: [{ productId, requestedQty: 4 }] },
          },
        });
      });

      // Dos allocations concurrentes compiten por las 5 unidades (cada una pide 4)
      const results = await Promise.allSettled([
        allocateOrder({ orderId: order1Id, tenantId, unitOfWork: uow }),
        allocateOrder({ orderId: order2Id, tenantId, unitOfWork: uow }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      // Invariante: allocatedQty <= onHandQty (4 <= 5)
      const balance = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.inventoryBalance.findFirst({
          where: { tenantId, locationId: storageLocId, productId },
        });
      });

      expect(Number(balance?.onHandQty)).toBe(5);
      expect(Number(balance?.allocatedQty)).toBe(4);

      // Intentar mover 2 unidades disponibles falla porque available = 5 - 4 = 1
      await expect(
        moveStock({
          tenantId,
          productId,
          fromLocationId: storageLocId,
          toLocationId: packingLocId,
          quantity: 2,
          reason: "ADJUSTMENT",
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", statusCode: 409 });
    });

    it("completa el flujo allocateOrder -> confirmTaskStep (PICKING) y cancelOrder con releaseUpTo", async () => {
      const order3Id = `ord-pick-${suffix}`;
      const order4Id = `ord-cancel-${suffix}`;

      // Añadir 5 unidades más (total onHand = 10, allocated = 4, available = 6)
      await moveStock({
        tenantId,
        productId,
        toLocationId: storageLocId,
        quantity: 5,
        reason: "INBOUND_RECEIPT",
        unitOfWork: uow,
      });

      await withTenantContext(db, tenantId, async (tx) => {
        await tx.salesOrder.create({
          data: {
            id: order3Id,
            tenantId,
            warehouseId,
            status: "PENDING",
            lines: { create: [{ productId, requestedQty: 3 }] },
          },
        });
        await tx.salesOrder.create({
          data: {
            id: order4Id,
            tenantId,
            warehouseId,
            status: "PENDING",
            lines: { create: [{ productId, requestedQty: 2 }] },
          },
        });
      });

      const task3Id = await allocateOrder({ orderId: order3Id, tenantId, unitOfWork: uow });
      await allocateOrder({ orderId: order4Id, tenantId, unitOfWork: uow });

      const task3 = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.warehouseTask.findFirst({
          where: { id: task3Id, tenantId },
          include: { steps: true },
        });
      });
      const step3Id = task3!.steps[0]!.id;

      // Escaneo parcial: tarea pasa a IN_PROGRESS
      const partialRes = await confirmTaskStep({
        taskId: task3Id,
        stepId: step3Id,
        tenantId,
        scannedCode: `BAR-DOM2-${suffix}`,
        quantity: 1,
        unitOfWork: uow,
      });
      expect(partialRes.taskStatus).toBe("IN_PROGRESS");

      // Escaneo final: tarea COMPLETED y pedido PACKED
      const finalRes = await confirmTaskStep({
        taskId: task3Id,
        stepId: step3Id,
        tenantId,
        scannedCode: `BAR-DOM2-${suffix}`,
        quantity: 2,
        unitOfWork: uow,
      });
      expect(finalRes.taskStatus).toBe("COMPLETED");

      // Cancelar pedido 4 libera 2 unidades
      const cancelRes = await cancelOrder({ orderId: order4Id, tenantId, unitOfWork: uow });
      expect(cancelRes.status).toBe("CANCELLED");
      expect(cancelRes.releasedAllocations[0]?.quantity).toBe(2);
    });
  },
);
