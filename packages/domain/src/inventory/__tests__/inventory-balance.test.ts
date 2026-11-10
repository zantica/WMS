import { describe, expect, it } from "vitest";
import { InventoryBalance } from "../inventory-balance.js";
import { Quantity } from "../quantity.js";
import {
  DomainError,
  ExceedsAllocatedError,
  InsufficientStockError,
  InvalidQuantityError,
  InvariantViolationError,
  OverAllocationError,
} from "../../shared/domain-error.js";
import { TX_REASONS } from "../tx-reason.js";

const make = (onHand = 0, allocated = 0) =>
  new InventoryBalance({ id: "b1", tenantId: "t1", locationId: "l1", productId: "p1", onHand, allocated });

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return (error as DomainError).code;
  }
  throw new Error("expected a DomainError");
}

describe("Quantity / InventoryBalance — happy path", () => {
  it("opera con 4 decimales sin errores de coma flotante", () => {
    expect(Quantity.of(0.1).add(Quantity.of(0.2)).value).toBe(0.3);
    expect(Quantity.of(1.2345).value).toBe(1.2345);
    expect(Quantity.of(5).subtract(Quantity.of(2)).value).toBe(3);
    expect(Quantity.of(2).min(Quantity.of(3)).value).toBe(2);
    expect(Quantity.of(3).min(Quantity.of(2)).value).toBe(2);
    expect(Quantity.of(3).isGreaterThan(Quantity.of(2))).toBe(true);
    expect(Quantity.of(2).isLessThan(Quantity.of(3))).toBe(true);
    expect(Quantity.of(2).equals(Quantity.of(2))).toBe(true);
    expect(Quantity.of(2).equals(Quantity.of(3))).toBe(false);
    expect(Quantity.of(2).equals(undefined)).toBe(false);
    expect(Quantity.of(0).isZero()).toBe(true);
  });

  it("recibe, asigna, consume y calcula available = onHand - allocated", () => {
    const balance = make();
    balance.receive(10);
    balance.allocate(6);
    expect(balance.available).toBe(4);
    balance.consume(4);
    expect([balance.onHand, balance.allocated, balance.available]).toEqual([6, 2, 4]);
    balance.release(2);
    expect([balance.onHand, balance.allocated]).toEqual([6, 0]);
    balance.withdraw(6);
    expect(balance.onHand).toBe(0);
  });

  it("releaseUpTo libera min(asignado, pedido) y devuelve lo liberado", () => {
    const balance = make(10, 3);
    expect(balance.releaseUpTo(5)).toBe(3);
    expect(balance.allocated).toBe(0);
    expect(balance.releaseUpTo(2)).toBe(0);
    const other = make(10, 5);
    expect(other.releaseUpTo(2)).toBe(2);
    expect(other.allocated).toBe(3);
  });

  it("adjust fija onHand absoluto respetando lo asignado", () => {
    const balance = make(10, 4);
    balance.adjust(4);
    expect(balance.onHand).toBe(4);
    balance.adjust(20);
    expect(balance.onHand).toBe(20);
  });

  it("expone identidad, igualdad por id y motivos del Ledger", () => {
    expect(make().equals(make())).toBe(true);
    expect(make().equals(undefined)).toBe(false);
    expect(make().tenantId).toBe("t1");
    expect(TX_REASONS).toContain("ALLOCATION_CANCEL");
    expect(TX_REASONS).toHaveLength(8);
  });
});

describe("Quantity / InventoryBalance — romper a propósito", () => {
  it.each([Number.NaN, Infinity, -Infinity, -1, -0.0001, 1.23456, 1e8, 0.00001])(
    "Quantity.of(%s) lanza INVALID_QUANTITY",
    (value) => {
      expect(codeOf(() => Quantity.of(value))).toBe("INVALID_QUANTITY");
    },
  );

  it("Quantity.of rechaza valores no numéricos", () => {
    expect(codeOf(() => Quantity.of("5" as unknown as number))).toBe("INVALID_QUANTITY");
  });

  it("Quantity.positive rechaza cero", () => {
    expect(() => Quantity.positive(0)).toThrow(InvalidQuantityError);
  });

  it("restar más de lo disponible lanza INVALID_QUANTITY (resultado negativo)", () => {
    expect(() => Quantity.of(1).subtract(Quantity.of(2))).toThrow(InvalidQuantityError);
  });

  it("rechaza saldos iniciales inválidos (allocated > onHand, negativos)", () => {
    expect(() => make(5, 6)).toThrow(InvariantViolationError);
    expect(() => make(-1, 0)).toThrow(InvalidQuantityError);
    expect(() => make(5, -1)).toThrow(InvalidQuantityError);
  });

  it("no permite saldo negativo: retirar más que lo disponible", () => {
    const balance = make(5, 0);
    expect(() => balance.withdraw(6)).toThrow(InsufficientStockError);
    expect(balance.onHand).toBe(5);
  });

  it("no permite retirar stock reservado para otros pedidos", () => {
    const balance = make(5, 4);
    expect(codeOf(() => balance.withdraw(2))).toBe("INSUFFICIENT_STOCK");
    expect(balance.onHand).toBe(5);
  });

  it("no permite sobre-asignación", () => {
    const balance = make(5, 4);
    expect(() => balance.allocate(2)).toThrow(OverAllocationError);
    expect(codeOf(() => balance.allocate(2))).toBe("OVER_ALLOCATION");
    expect(balance.allocated).toBe(4);
  });

  it("release y consume mayores que lo asignado lanzan EXCEEDS_ALLOCATED sin mutar", () => {
    const balance = make(10, 2);
    expect(() => balance.release(3)).toThrow(ExceedsAllocatedError);
    expect(() => balance.consume(3)).toThrow(ExceedsAllocatedError);
    expect(codeOf(() => balance.consume(3))).toBe("EXCEEDS_ALLOCATED");
    expect([balance.onHand, balance.allocated]).toEqual([10, 2]);
  });

  it("adjust por debajo de lo asignado rompe la invariante", () => {
    const balance = make(10, 4);
    expect(() => balance.adjust(3)).toThrow(InvariantViolationError);
    expect(() => balance.adjust(-1)).toThrow(InvalidQuantityError);
    expect(balance.onHand).toBe(10);
  });

  it.each([0, -1, Number.NaN, Infinity, 0.00001])("todas las operaciones rechazan cantidad %s", (value) => {
    const balance = make(10, 5);
    for (const op of [
      () => balance.receive(value),
      () => balance.withdraw(value),
      () => balance.allocate(value),
      () => balance.release(value),
      () => balance.consume(value),
    ]) {
      expect(op).toThrow(InvalidQuantityError);
    }
    expect([balance.onHand, balance.allocated]).toEqual([10, 5]);
  });

  it("releaseUpTo rechaza cantidades inválidas y receive no excede el rango Decimal(12,4)", () => {
    expect(() => make(1, 1).releaseUpTo(-1)).toThrow(InvalidQuantityError);
    expect(() => make(99_999_999).receive(1)).toThrow(InvalidQuantityError);
  });
});
