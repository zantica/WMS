// apps/api/src/use-cases/inventory/__tests__/move-stock.test.ts
// Tests del caso de uso más crítico del sistema usando InMemoryUnitOfWork + @wms/domain.
// Suites: Happy Path y "Romper a propósito" (available, saldos negativos, decimales,
// aislamiento multi-tenant y rollback transaccional).

import { describe, it, expect, beforeEach } from "vitest";
import { WmsError } from "../../../plugins/error-handler.js";
import { InMemoryUnitOfWork } from "../../../adapters/in-memory-unit-of-work.js";
import { runWithAmbientTenantScope } from "../../security/tenant-context.js";
import { moveStock } from "../move-stock.js";

describe("moveStock — Inventory Ledger Use Case (InMemoryUnitOfWork + @wms/domain)", () => {
  let uow: InMemoryUnitOfWork;

  const BASE_PARAMS = {
    tenantId: "tenant-1",
    productId: "product-1",
    quantity: 5,
    reason: "PUTAWAY" as const,
    referenceId: "receipt-1",
    userId: "user-1",
  };

  beforeEach(() => {
    uow = new InMemoryUnitOfWork({
      balances: [
        {
          id: "bal-rec-1",
          tenantId: "tenant-1",
          locationId: "loc-receiving",
          productId: "product-1",
          onHandQty: 10,
          allocatedQty: 0,
        },
        {
          id: "bal-stor-1",
          tenantId: "tenant-1",
          locationId: "loc-storage",
          productId: "product-1",
          onHandQty: 10,
          allocatedQty: 6, // available = 4
        },
        {
          id: "bal-other-tenant",
          tenantId: "tenant-2",
          locationId: "loc-receiving",
          productId: "product-1",
          onHandQty: 50,
          allocatedQty: 0,
        },
      ],
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe("Happy Path", () => {
    it("crea balance en toLocation sin origen (INBOUND_RECEIPT → RECEIVING)", async () => {
      await moveStock({
        ...BASE_PARAMS,
        fromLocationId: undefined,
        toLocationId: "loc-new-receiving",
        reason: "INBOUND_RECEIPT",
        unitOfWork: uow,
      });

      const dest = uow.state.balances.find(
        (b) => b.locationId === "loc-new-receiving" && b.tenantId === "tenant-1",
      );
      expect(dest?.onHandQty).toBe(5);
      expect(dest?.allocatedQty).toBe(0);

      expect(uow.state.transactions).toHaveLength(1);
      expect(uow.state.transactions[0]).toMatchObject({
        tenantId: "tenant-1",
        productId: "product-1",
        fromLocationId: null,
        toLocationId: "loc-new-receiving",
        quantity: 5,
        reason: "INBOUND_RECEIPT",
      });
    });

    it("mueve stock de origen a destino actualizando ambos saldos y registrando Ledger", async () => {
      await moveStock({
        ...BASE_PARAMS,
        fromLocationId: "loc-receiving",
        toLocationId: "loc-storage",
        quantity: 5,
        reason: "PUTAWAY",
        notes: "Putaway completo",
        unitOfWork: uow,
      });

      const fromBal = uow.state.balances.find((b) => b.id === "bal-rec-1");
      const toBal = uow.state.balances.find((b) => b.id === "bal-stor-1");
      expect(fromBal?.onHandQty).toBe(5);
      expect(toBal?.onHandQty).toBe(15);

      expect(uow.state.transactions).toHaveLength(1);
      expect(uow.state.transactions[0]).toMatchObject({
        tenantId: "tenant-1",
        fromLocationId: "loc-receiving",
        toLocationId: "loc-storage",
        quantity: 5,
        reason: "PUTAWAY",
        notes: "Putaway completo",
      });
    });

    it("permite mover exactamente el saldo disponible (onHand - allocated)", async () => {
      await moveStock({
        ...BASE_PARAMS,
        fromLocationId: "loc-storage",
        toLocationId: "loc-receiving",
        quantity: 4, // onHand 10 - allocated 6 = 4
        reason: "ADJUSTMENT",
        unitOfWork: uow,
      });

      const stor = uow.state.balances.find((b) => b.id === "bal-stor-1");
      expect(stor?.onHandQty).toBe(6);
      expect(stor?.allocatedQty).toBe(6);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe("Romper a propósito — Validaciones, Invariantes, Rollback y Multi-Tenant", () => {
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.12345])(
      "rechaza cantidad inválida (%s) con VALIDATION_ERROR (422)",
      async (badQty) => {
        await expect(
          moveStock({
            ...BASE_PARAMS,
            quantity: badQty,
            fromLocationId: "loc-receiving",
            unitOfWork: uow,
          }),
        ).rejects.toMatchObject({
          code: "VALIDATION_ERROR",
          statusCode: 422,
        });

        expect(uow.state.transactions).toHaveLength(0);
      },
    );

    it("lanza INSUFFICIENT_STOCK (409) si la ubicación origen no tiene balance", async () => {
      await expect(
        moveStock({
          ...BASE_PARAMS,
          fromLocationId: "loc-empty",
          toLocationId: "loc-receiving",
          quantity: 1,
          unitOfWork: uow,
        }),
      ).rejects.toThrow(WmsError);

      await expect(
        moveStock({
          ...BASE_PARAMS,
          fromLocationId: "loc-empty",
          toLocationId: "loc-receiving",
          quantity: 1,
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", statusCode: 409 });

      expect(uow.state.transactions).toHaveLength(0);
    });

    it("respeta available: rechaza retirar stock reservado (onHand=10, allocated=6, pide 5)", async () => {
      await expect(
        moveStock({
          ...BASE_PARAMS,
          fromLocationId: "loc-storage",
          toLocationId: "loc-receiving",
          quantity: 5, // available es solo 4
          reason: "PUTAWAY",
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK",
        statusCode: 409,
      });

      const stor = uow.state.balances.find((b) => b.id === "bal-stor-1");
      expect(stor?.onHandQty).toBe(10);
      expect(uow.state.transactions).toHaveLength(0);
    });

    it("hace rollback completo de saldos si falla el registro en el Ledger", async () => {
      const failingUow = new InMemoryUnitOfWork({
        balances: uow.state.balances,
      });
      const origExecute = failingUow.execute.bind(failingUow);
      failingUow.execute = (tid, work, opts) =>
        origExecute(
          tid,
          async (repos) => {
            repos.inventory.recordTransaction = async () => {
              throw new Error("DB constraint violation");
            };
            return work(repos);
          },
          opts,
        );

      await expect(
        moveStock({
          ...BASE_PARAMS,
          fromLocationId: "loc-receiving",
          toLocationId: "loc-storage",
          quantity: 5,
          unitOfWork: failingUow,
        }),
      ).rejects.toThrow("DB constraint violation");

      // Rollback intacto: el saldo en origen y destino no cambió
      expect(
        failingUow.state.balances.find((b) => b.id === "bal-rec-1")?.onHandQty,
      ).toBe(10);
      expect(
        failingUow.state.balances.find((b) => b.id === "bal-stor-1")?.onHandQty,
      ).toBe(10);
    });

    it("aísla tenants: tenant-1 no puede mover stock perteneciente a tenant-2", async () => {
      await expect(
        moveStock({
          ...BASE_PARAMS,
          tenantId: "tenant-1",
          fromLocationId: "loc-receiving",
          quantity: 20, // tenant-1 solo tiene 10, tenant-2 tiene 50
          unitOfWork: uow,
        }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK", statusCode: 409 });

      expect(
        uow.state.balances.find((b) => b.id === "bal-other-tenant")?.onHandQty,
      ).toBe(50);
    });

    it("rechaza cruce de tenant activo en AsyncLocalStorage (TENANT_MISMATCH 403)", async () => {
      await expect(
        runWithAmbientTenantScope({ tenantId: "tenant-2", scope: {} }, () =>
          moveStock({
            ...BASE_PARAMS,
            tenantId: "tenant-1",
            fromLocationId: "loc-receiving",
            quantity: 1,
            unitOfWork: uow,
          }),
        ),
      ).rejects.toMatchObject({ code: "TENANT_MISMATCH", statusCode: 403 });
    });
  });
});
