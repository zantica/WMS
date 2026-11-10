import { describe, expect, it } from "vitest";
import {
  assertOrderTransition,
  canTransitionOrder,
  isOrderTerminal,
  ORDER_STATUSES,
  planOrderCancellation,
  type OrderStatus,
} from "../sales-order-state-machine.js";
import {
  DomainError,
  InvalidStateTransitionError,
  TerminalStateError,
} from "../../shared/domain-error.js";

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return (error as DomainError).code;
  }
  throw new Error("expected a DomainError");
}

describe("SalesOrder state machine — happy path", () => {
  it("espeja el enum OrderStatus", () => {
    expect([...ORDER_STATUSES]).toEqual([
      "PENDING",
      "ALLOCATED",
      "PICKING",
      "PACKED",
      "SHIPPED",
      "CANCELLED",
      "ON_HOLD",
    ]);
  });

  it.each<[OrderStatus, OrderStatus]>([
    ["PENDING", "ALLOCATED"],
    ["ON_HOLD", "ALLOCATED"],
    ["ALLOCATED", "PICKING"],
    ["ALLOCATED", "PACKED"],
    ["PICKING", "PACKED"],
    ["PICKING", "ON_HOLD"],
    ["PACKED", "SHIPPED"],
  ])("permite %s → %s", (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(true);
    expect(() => assertOrderTransition(from, to)).not.toThrow();
  });

  it.each<[OrderStatus, boolean]>([
    ["PENDING", false],
    ["ON_HOLD", false],
    ["ALLOCATED", true],
    ["PICKING", true],
  ])("cancelar desde %s (libera stock: %s)", (status, releasesStock) => {
    expect(planOrderCancellation(status)).toEqual({ nextStatus: "CANCELLED", releasesStock });
  });

  it("identifica estados terminales", () => {
    expect(isOrderTerminal("SHIPPED")).toBe(true);
    expect(isOrderTerminal("CANCELLED")).toBe(true);
    expect(isOrderTerminal("ON_HOLD")).toBe(false);
  });
});

describe("SalesOrder state machine — romper a propósito", () => {
  it("no se puede cancelar un pedido SHIPPED ni CANCELLED", () => {
    expect(() => planOrderCancellation("SHIPPED")).toThrow(TerminalStateError);
    expect(codeOf(() => planOrderCancellation("CANCELLED"))).toBe("TERMINAL_STATE");
  });

  it("no se puede cancelar un pedido PACKED (igual que cancel-order.ts)", () => {
    expect(() => planOrderCancellation("PACKED")).toThrow(InvalidStateTransitionError);
    expect(codeOf(() => planOrderCancellation("PACKED"))).toBe("INVALID_STATE_TRANSITION");
  });

  it.each<[OrderStatus, OrderStatus]>([
    ["SHIPPED", "PACKED"],
    ["CANCELLED", "PENDING"],
    ["PACKED", "PICKING"],
    ["PICKING", "ALLOCATED"],
    ["ALLOCATED", "PENDING"],
    ["PENDING", "SHIPPED"],
    ["PENDING", "PACKED"],
    ["ALLOCATED", "SHIPPED"],
    ["ON_HOLD", "PICKING"],
  ])("rechaza %s → %s", (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(false);
    expect(() => assertOrderTransition(from, to)).toThrow(DomainError);
  });

  it("todas las transiciones desde estados terminales fallan con TERMINAL_STATE", () => {
    for (const from of ["SHIPPED", "CANCELLED"] as const) {
      for (const to of ORDER_STATUSES) {
        expect(codeOf(() => assertOrderTransition(from, to))).toBe("TERMINAL_STATE");
      }
    }
  });
});
