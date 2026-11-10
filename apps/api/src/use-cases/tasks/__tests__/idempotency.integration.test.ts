// apps/api/src/use-cases/tasks/__tests__/idempotency.integration.test.ts
// Suite de integración PostgreSQL real para IdempotencyStore e idempotencia transaccional (F6.1).
// Verifica:
// 1. Reintentos con la misma idempotencyKey devuelven ALREADY_APPLIED con el resultado original.
// 2. No se duplican filas en `inventory_transactions` (Ledger inmutable).
// 3. No se altera el stock en `inventory_balances`.
// 4. Se respetan las restricciones de clave única (tenantId, idempotencyKey) y RLS.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, withTenantContext } from "@wms/db";
import { confirmTaskStep } from "../confirm-task-step.js";
import { confirmReceiptLine } from "../confirm-receipt-line.js";
import { syncTaskBatch } from "../sync-task-batch.js";
import { PrismaIdempotencyStore } from "../../../adapters/prisma-idempotency-store.js";

const shouldRunPgIntegration =
  process.env["RUN_PG_INTEGRATION"] === "true" ||
  (process.env["CI"] === "true" && Boolean(process.env["DATABASE_URL"]));

describe.runIf(shouldRunPgIntegration)(
  "Integración PostgreSQL 16 — IdempotencyStore e Invariantes del Ledger (F6.1)",
  () => {
    let db: PrismaClient;
    const suffix = Date.now().toString(36);
    const tenantId = `tenant-idemp-${suffix}`;
    const warehouseId = `wh-idemp-${suffix}`;
    const receivingLocId = `loc-rec-${suffix}`;
    const storageLocId = `loc-stor-${suffix}`;
    const productId = `prod-idemp-${suffix}`;
    const store = new PrismaIdempotencyStore();

    beforeAll(async () => {
      db = new PrismaClient();
      await db.$connect();

      // Semilla del inquilino
      await db.tenant.create({
        data: {
          id: tenantId,
          name: "Tenant Idempotency Integration",
          slug: `tenant-idemp-${suffix}`,
          apiKey: `key-idemp-${suffix}`,
        },
      });

      // Crear infraestructura dentro del contexto del tenant
      await withTenantContext(db, tenantId, async (tx) => {
        await tx.warehouse.create({
          data: {
            id: warehouseId,
            tenantId,
            name: "Main Idempotency Warehouse",
          },
        });

        await tx.location.createMany({
          data: [
            {
              id: receivingLocId,
              tenantId,
              warehouseId,
              code: `REC-${suffix}`,
              type: "RECEIVING",
            },
            {
              id: storageLocId,
              tenantId,
              warehouseId,
              code: `STOR-${suffix}`,
              type: "STORAGE",
            },
          ],
        });

        await tx.product.create({
          data: {
            id: productId,
            tenantId,
            sku: `SKU-IDEMP-${suffix}`,
            name: "Idempotency Test Item",
            barcode: `BAR-IDEMP-${suffix}`,
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
            await tx.product.deleteMany({ where: { tenantId, id: productId } });
            await tx.location.deleteMany({ where: { tenantId, warehouseId } });
            await tx.warehouse.deleteMany({ where: { tenantId, id: warehouseId } });
          });
          await db.tenant.deleteMany({ where: { id: tenantId } });
        } finally {
          await db.$disconnect();
        }
      }
    });

    it("confirmReceiptLine es idempotente: reintento devuelve ALREADY_APPLIED sin duplicar InventoryTransaction ni alterar InventoryBalance", async () => {
      const receiptTaskId = `task-receipt-${suffix}`;
      const receiptStepId = `step-receipt-${suffix}`;
      const idempotencyKey = `idemp-key-receipt-${suffix}`;

      // 1. Crear tarea de recepción
      await withTenantContext(db, tenantId, async (tx) => {
        await tx.warehouseTask.create({
          data: {
            id: receiptTaskId,
            tenantId,
            type: "RECEIVING",
            status: "IN_PROGRESS",
            steps: {
              create: [
                {
                  id: receiptStepId,
                  sequence: 1,
                  locationId: receivingLocId,
                  productId,
                  expectedQty: 10,
                  scannedQty: 0,
                  status: "PENDING",
                },
              ],
            },
          },
        });
      });

      // 2. Primera confirmación con idempotencyKey (dentro de contexto de tenant)
      const res1 = await withTenantContext(db, tenantId, async (tx) => {
        return await confirmReceiptLine({
          taskId: receiptTaskId,
          tenantId,
          productId,
          scannedQty: 10,
          idempotencyKey,
          idempotencyStore: store,
          tx,
        });
      });

      expect(res1.idempotencyStatus).toBe("APPLIED");
      expect(res1.stepStatus).toBe("COMPLETED");

      // Verificar que se insertó exactamente 1 transacción en el Ledger y el balance es 10
      const initialTxCount = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.inventoryTransaction.count({
          where: { tenantId, productId },
        });
      });
      expect(initialTxCount).toBe(1);

      const initialBalance = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.inventoryBalance.findFirst({
          where: { tenantId, locationId: receivingLocId, productId },
        });
      });
      expect(Number(initialBalance?.onHandQty)).toBe(10);

      // 3. Segunda confirmación (reintento idéntico con la misma idempotencyKey)
      const res2 = await withTenantContext(db, tenantId, async (tx) => {
        return await confirmReceiptLine({
          taskId: receiptTaskId,
          tenantId,
          productId,
          scannedQty: 10,
          idempotencyKey,
          idempotencyStore: store,
          tx,
        });
      });

      expect(res2.idempotencyStatus).toBe("ALREADY_APPLIED");
      expect(res2.stepStatus).toBe("COMPLETED");

      // 4. Comprobar que InventoryTransaction NO se duplicó
      const finalTxCount = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.inventoryTransaction.count({
          where: { tenantId, productId },
        });
      });
      expect(finalTxCount).toBe(1);

      // 5. Comprobar que InventoryBalance NO cambió
      const finalBalance = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.inventoryBalance.findFirst({
          where: { tenantId, locationId: receivingLocId, productId },
        });
      });
      expect(Number(finalBalance?.onHandQty)).toBe(10);
    });

    it("confirmTaskStep (PUTAWAY) es idempotente y no altera los saldos en reintentos", async () => {
      const putawayTaskId = `task-putaway-int-${suffix}`;
      const putawayStepId = `step-putaway-int-${suffix}`;
      const idempotencyKey = `idemp-key-putaway-${suffix}`;

      // 1. Crear tarea de putaway con un paso
      await withTenantContext(db, tenantId, async (tx) => {
        await tx.warehouseTask.create({
          data: {
            id: putawayTaskId,
            tenantId,
            type: "PUTAWAY",
            status: "IN_PROGRESS",
            steps: {
              create: [
                {
                  id: putawayStepId,
                  sequence: 1,
                  locationId: storageLocId,
                  productId,
                  expectedQty: 5,
                  scannedQty: 0,
                  status: "PENDING",
                },
              ],
            },
          },
        });
      });

      // 2. Primera confirmación
      const res1 = await withTenantContext(db, tenantId, async (tx) => {
        return await confirmTaskStep({
          taskId: putawayTaskId,
          stepId: putawayStepId,
          tenantId,
          scannedCode: `BAR-IDEMP-${suffix}`,
          quantity: 5,
          idempotencyKey,
          idempotencyStore: store,
          tx,
        });
      });

      expect(res1.idempotencyStatus).toBe("APPLIED");
      expect(res1.stepStatus).toBe("COMPLETED");

      // Balance en RECEIVING disminuyó en 5, balance en STORAGE aumentó en 5
      const storBal1 = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.inventoryBalance.findFirst({
          where: { tenantId, locationId: storageLocId, productId },
        });
      });
      expect(Number(storBal1?.onHandQty)).toBe(5);

      const txCountBefore = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.inventoryTransaction.count({ where: { tenantId, productId } });
      });

      // 3. Reintento idéntico
      const res2 = await withTenantContext(db, tenantId, async (tx) => {
        return await confirmTaskStep({
          taskId: putawayTaskId,
          stepId: putawayStepId,
          tenantId,
          scannedCode: `BAR-IDEMP-${suffix}`,
          quantity: 5,
          idempotencyKey,
          idempotencyStore: store,
          tx,
        });
      });

      expect(res2.idempotencyStatus).toBe("ALREADY_APPLIED");

      // Transacciones no se duplicaron
      const txCountAfter = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.inventoryTransaction.count({ where: { tenantId, productId } });
      });
      expect(txCountAfter).toBe(txCountBefore);

      // Balance en STORAGE sigue siendo 5
      const storBal2 = await withTenantContext(db, tenantId, async (tx) => {
        return await tx.inventoryBalance.findFirst({
          where: { tenantId, locationId: storageLocId, productId },
        });
      });
      expect(Number(storBal2?.onHandQty)).toBe(5);
    });

    it("syncTaskBatch maneja reintentos en bloque y conflictos de estado (Server-Wins)", async () => {
      const batchTaskId = `task-batch-int-${suffix}`;
      const batchStepId = `step-batch-int-${suffix}`;
      const batchKey = `idemp-key-batch-${suffix}`;

      await withTenantContext(db, tenantId, async (tx) => {
        await tx.warehouseTask.create({
          data: {
            id: batchTaskId,
            tenantId,
            type: "PUTAWAY",
            status: "IN_PROGRESS",
            steps: {
              create: [
                {
                  id: batchStepId,
                  sequence: 1,
                  locationId: storageLocId,
                  productId,
                  expectedQty: 2,
                  scannedQty: 0,
                  status: "PENDING",
                },
              ],
            },
          },
        });
      });

      // 1. Envío inicial
      const batchRes1 = await withTenantContext(db, tenantId, async (tx) => {
        return await syncTaskBatch({
          tenantId,
          items: [
            {
              idempotencyKey: batchKey,
              action: "CONFIRM_STEP",
              occurredAt: "2026-11-10T02:00:00.000Z",
              payload: {
                taskId: batchTaskId,
                stepId: batchStepId,
                scannedCode: `BAR-IDEMP-${suffix}`,
                quantity: 2,
              },
            },
          ],
          idempotencyStore: store,
          tx,
        });
      });

      expect(batchRes1.appliedCount).toBe(1);
      expect(batchRes1.items[0]?.status).toBe("APPLIED");

      // 2. Reintento del mismo batch
      const batchRes2 = await withTenantContext(db, tenantId, async (tx) => {
        return await syncTaskBatch({
          tenantId,
          items: [
            {
              idempotencyKey: batchKey,
              action: "CONFIRM_STEP",
              occurredAt: "2026-11-10T02:00:00.000Z",
              payload: {
                taskId: batchTaskId,
                stepId: batchStepId,
                scannedCode: `BAR-IDEMP-${suffix}`,
                quantity: 2,
              },
            },
          ],
          idempotencyStore: store,
          tx,
        });
      });

      expect(batchRes2.alreadyAppliedCount).toBe(1);
      expect(batchRes2.items[0]?.status).toBe("ALREADY_APPLIED");

      // 3. Envío de nueva mutación sobre el paso que YA está completado (Server-Wins -> CONFLICT)
      const conflictKey = `idemp-key-conflict-${suffix}`;
      const batchRes3 = await withTenantContext(db, tenantId, async (tx) => {
        return await syncTaskBatch({
          tenantId,
          items: [
            {
              idempotencyKey: conflictKey,
              action: "CONFIRM_STEP",
              occurredAt: "2026-11-10T02:05:00.000Z",
              payload: {
                taskId: batchTaskId,
                stepId: batchStepId,
                scannedCode: `BAR-IDEMP-${suffix}`,
                quantity: 2,
              },
            },
          ],
          idempotencyStore: store,
          tx,
        });
      });

      expect(batchRes3.conflictCount).toBe(1);
      expect(batchRes3.items[0]?.status).toBe("CONFLICT");
      expect(batchRes3.items[0]?.error?.message).toMatch(/already (completed|COMPLETED)/i);
    });
  },
);
