import { describe, expect, it } from "vitest";
import {
  DomainError,
  ExceedsAllocatedError,
  InsufficientStockError,
  InvalidQuantityError,
  InvalidStateTransitionError,
  InvariantViolationError,
  OverAllocationError,
  PendingStepsError,
  ScanExceedsExpectedError,
  StepAlreadyResolvedError,
  StepNotFoundError,
  TerminalStateError,
} from "../domain-error.js";
import { Entity } from "../entity.js";
import { AggregateRoot } from "../aggregate-root.js";
import { ValueObject } from "../value-object.js";

class Money extends ValueObject<{ amount: number; currency: string }> {
  constructor(amount: number, currency: string) {
    super({ amount, currency });
  }
}
class OtherMoney extends ValueObject<{ amount: number; currency: string }> {
  constructor(amount: number, currency: string) {
    super({ amount, currency });
  }
}
class Thing extends Entity {}
class Root extends AggregateRoot {}

describe("Primitivas DDD — happy path", () => {
  it("ValueObject compara estructuralmente", () => {
    expect(new Money(1, "EUR").equals(new Money(1, "EUR"))).toBe(true);
  });

  it("Entity y AggregateRoot comparan por id", () => {
    expect(new Thing("a").equals(new Thing("a"))).toBe(true);
    expect(new Root("a").equals(new Root("a"))).toBe(true);
  });

  it("cada error tiene un code estable y conserva detalles", () => {
    const cases: Array<[DomainError, string]> = [
      [new InvalidQuantityError("m"), "INVALID_QUANTITY"],
      [new InsufficientStockError("m"), "INSUFFICIENT_STOCK"],
      [new OverAllocationError("m"), "OVER_ALLOCATION"],
      [new ExceedsAllocatedError("m"), "EXCEEDS_ALLOCATED"],
      [new InvariantViolationError("m"), "INVARIANT_VIOLATION"],
      [new InvalidStateTransitionError("m"), "INVALID_STATE_TRANSITION"],
      [new TerminalStateError("m"), "TERMINAL_STATE"],
      [new StepAlreadyResolvedError("m"), "STEP_ALREADY_RESOLVED"],
      [new StepNotFoundError("m"), "STEP_NOT_FOUND"],
      [new PendingStepsError("m"), "TASK_HAS_PENDING_STEPS"],
      [new ScanExceedsExpectedError("m", { a: 1 }), "SCAN_EXCEEDS_EXPECTED"],
    ];
    for (const [error, code] of cases) {
      expect(error.code).toBe(code);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(error.constructor.name);
    }
    expect(cases[10]?.[0].details).toEqual({ a: 1 });
    expect(cases[0]?.[0].details).toEqual({});
  });
});

describe("Primitivas DDD — romper a propósito", () => {
  it("ValueObject distinto no es igual (valores, clase o undefined)", () => {
    expect(new Money(1, "EUR").equals(new Money(2, "EUR"))).toBe(false);
    expect(new Money(1, "EUR").equals(new OtherMoney(1, "EUR") as unknown as Money)).toBe(false);
    expect(new Money(1, "EUR").equals(undefined)).toBe(false);
  });

  it("entidades con distinto id, distinta clase o undefined no son iguales", () => {
    expect(new Thing("a").equals(new Thing("b"))).toBe(false);
    expect(new Thing("a").equals(new Root("a"))).toBe(false);
    expect(new Thing("a").equals(undefined)).toBe(false);
  });
});
