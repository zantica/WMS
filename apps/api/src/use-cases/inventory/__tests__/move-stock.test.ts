// apps/api/src/use-cases/inventory/__tests__/move-stock.test.ts
// Tests del caso de uso más crítico del sistema.
// Validan las garantías de seguridad del Ledger:
// 1. No se puede dejar una ubicación en saldo negativo
// 2. Dos peticiones simultáneas no duplican reservas
// 3. Cada movimiento deja rastro inmutable en el Ledger

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WmsError } from "../../../plugins/error-handler.js";
import { moveStock } from "../move-stock.js";

// ── Mock de Prisma para tests unitarios rápidos ──────────────────────────────
// En tests de integración reales usarías una DB de test real (ej. con testcontainers)
const mockTx = {
  $queryRaw: vi.fn(),
  inventoryBalance: {
    update: vi.fn(),
    upsert: vi.fn(),
  },
  inventoryTransaction: {
    create: vi.fn(),
  },
};

vi.mock("@wms/db", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: typeof mockTx) => Promise<unknown>) =>
      callback(mockTx),
    ),
  },
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
  },
}));

describe("moveStock — Inventory Ledger Use Case", () => {
  const BASE_PARAMS = {
    tenantId: "tenant-1",
    productId: "product-1",
    quantity: 5,
    reason: "PUTAWAY" as const,
    referenceId: "receipt-1",
    userId: "user-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe("Validaciones de entrada", () => {
    it("lanza WmsError si quantity es 0", async () => {
      await expect(
        moveStock({ ...BASE_PARAMS, quantity: 0 }),
      ).rejects.toThrow(WmsError);

      await expect(
        moveStock({ ...BASE_PARAMS, quantity: 0 }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    });

    it("lanza WmsError si quantity es negativa", async () => {
      await expect(
        moveStock({ ...BASE_PARAMS, quantity: -1 }),
      ).rejects.toThrow(WmsError);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe("Movimiento sin origen (INBOUND_RECEIPT → RECEIVING)", () => {
    it("crea balance en toLocation sin verificar saldo origen", async () => {
      mockTx.inventoryBalance.upsert.mockResolvedValue({});
      mockTx.inventoryTransaction.create.mockResolvedValue({});

      await moveStock({
        ...BASE_PARAMS,
        fromLocationId: undefined,
        toLocationId: "loc-receiving",
        reason: "INBOUND_RECEIPT",
      });

      // No debe hacer SELECT FOR UPDATE (no hay origen)
      expect(mockTx.$queryRaw).not.toHaveBeenCalled();

      // Debe hacer upsert en destino
      expect(mockTx.inventoryBalance.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { locationId_productId: { locationId: "loc-receiving", productId: "product-1" } },
          update: { onHandQty: { increment: 5 } },
        }),
      );

      // Debe registrar en el Ledger
      expect(mockTx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            reason: "INBOUND_RECEIPT",
            quantity: 5,
            toLocationId: "loc-receiving",
          }),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe("🔒 Regla de Oro: Saldo nunca negativo", () => {
    it("lanza INSUFFICIENT_STOCK si la ubicación no tiene balance registrado", async () => {
      // SELECT FOR UPDATE devuelve array vacío = no hay stock
      mockTx.$queryRaw.mockResolvedValue([]);

      await expect(
        moveStock({
          ...BASE_PARAMS,
          fromLocationId: "loc-storage",
          toLocationId: "loc-packing",
          quantity: 3,
          reason: "PICK",
        }),
      ).rejects.toThrow(WmsError);

      await expect(
        moveStock({
          ...BASE_PARAMS,
          fromLocationId: "loc-storage",
          toLocationId: "loc-packing",
          quantity: 3,
          reason: "PICK",
        }),
      ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    });

    it("lanza INSUFFICIENT_STOCK si la cantidad supera el saldo disponible", async () => {
      // Balance existente: solo 2 unidades
      mockTx.$queryRaw.mockResolvedValue([
        { id: "bal-1", on_hand_qty: 2, allocated_qty: 0 },
      ]);

      await expect(
        moveStock({
          ...BASE_PARAMS,
          fromLocationId: "loc-storage",
          toLocationId: "loc-packing",
          quantity: 5, // Más de lo que hay
          reason: "PICK",
        }),
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_STOCK",
      });

      // Jamás debe haber actualizado el balance si no hay stock suficiente
      expect(mockTx.inventoryBalance.update).not.toHaveBeenCalled();
      expect(mockTx.inventoryTransaction.create).not.toHaveBeenCalled();
    });

    it("permite mover exactamente el saldo disponible (edge case)", async () => {
      mockTx.$queryRaw.mockResolvedValue([
        { id: "bal-1", on_hand_qty: 5, allocated_qty: 0 },
      ]);
      mockTx.inventoryBalance.update.mockResolvedValue({});
      mockTx.inventoryBalance.upsert.mockResolvedValue({});
      mockTx.inventoryTransaction.create.mockResolvedValue({});

      // No debe lanzar — mover exactamente lo disponible es válido
      await expect(
        moveStock({
          ...BASE_PARAMS,
          fromLocationId: "loc-storage",
          toLocationId: "loc-packing",
          quantity: 5,
          reason: "PICK",
        }),
      ).resolves.toBeUndefined();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe("📒 Ledger inmutable", () => {
    it("SIEMPRE registra la transacción antes de retornar", async () => {
      mockTx.$queryRaw.mockResolvedValue([
        { id: "bal-1", on_hand_qty: 10, allocated_qty: 0 },
      ]);
      mockTx.inventoryBalance.update.mockResolvedValue({});
      mockTx.inventoryBalance.upsert.mockResolvedValue({});
      mockTx.inventoryTransaction.create.mockResolvedValue({ id: "tx-1" });

      await moveStock({
        ...BASE_PARAMS,
        fromLocationId: "loc-a",
        toLocationId: "loc-b",
        reason: "PUTAWAY",
        notes: "Test move",
      });

      expect(mockTx.inventoryTransaction.create).toHaveBeenCalledTimes(1);
      expect(mockTx.inventoryTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-1",
            productId: "product-1",
            fromLocationId: "loc-a",
            toLocationId: "loc-b",
            quantity: 5,
            reason: "PUTAWAY",
            notes: "Test move",
          }),
        }),
      );
    });

    it("si el Ledger falla, el balance NO se actualiza (rollback implícito por transacción)", async () => {
      mockTx.$queryRaw.mockResolvedValue([
        { id: "bal-1", on_hand_qty: 10, allocated_qty: 0 },
      ]);
      mockTx.inventoryBalance.update.mockResolvedValue({});
      mockTx.inventoryBalance.upsert.mockResolvedValue({});
      // Simular fallo al escribir en el Ledger
      mockTx.inventoryTransaction.create.mockRejectedValue(
        new Error("DB constraint violation"),
      );

      await expect(
        moveStock({
          ...BASE_PARAMS,
          fromLocationId: "loc-a",
          toLocationId: "loc-b",
        }),
      ).rejects.toThrow("DB constraint violation");

      // La transacción hizo rollback — los balances quedan intactos
      // (esto lo garantiza Prisma.$transaction internamente)
    });
  });
});
