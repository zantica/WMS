import { InvalidQuantityError } from "../shared/domain-error.js";
import { ValueObject } from "../shared/value-object.js";

const SCALE = 10_000; // Decimal(12, 4) del esquema Prisma
const MAX_UNITS = 999_999_999_999; // 12 dígitos en total, 4 decimales

/**
 * Cantidad de stock >= 0 con precisión fija de 4 decimales (Decimal(12,4)).
 * Internamente se guarda en unidades enteras para evitar errores de coma flotante.
 */
export class Quantity extends ValueObject<{ units: number }> {
  private constructor(units: number) {
    super({ units });
  }

  /** Cantidad >= 0. Rechaza NaN, Infinity, negativos y más de 4 decimales. */
  static of(value: number): Quantity {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new InvalidQuantityError("Quantity must be a finite number", { value });
    }
    if (value < 0) {
      throw new InvalidQuantityError("Quantity cannot be negative", { value });
    }
    const units = Math.round(value * SCALE);
    if (Math.abs(units / SCALE - value) > 1e-9) {
      throw new InvalidQuantityError("Quantity supports at most 4 decimals", { value });
    }
    if (units > MAX_UNITS) {
      throw new InvalidQuantityError("Quantity exceeds Decimal(12,4) range", { value });
    }
    return new Quantity(units);
  }

  /** Cantidad estrictamente > 0 (operaciones de movimiento). */
  static positive(value: number): Quantity {
    const quantity = Quantity.of(value);
    if (quantity.isZero()) {
      throw new InvalidQuantityError("Quantity must be positive", { value });
    }
    return quantity;
  }

  get value(): number {
    return this.props.units / SCALE;
  }

  isZero(): boolean {
    return this.props.units === 0;
  }

  add(other: Quantity): Quantity {
    return Quantity.of((this.props.units + other.props.units) / SCALE);
  }

  /** Falla con InvalidQuantityError si el resultado sería negativo. */
  subtract(other: Quantity): Quantity {
    return Quantity.of((this.props.units - other.props.units) / SCALE);
  }

  min(other: Quantity): Quantity {
    return this.props.units <= other.props.units ? this : other;
  }

  isGreaterThan(other: Quantity): boolean {
    return this.props.units > other.props.units;
  }

  isLessThan(other: Quantity): boolean {
    return this.props.units < other.props.units;
  }
}
