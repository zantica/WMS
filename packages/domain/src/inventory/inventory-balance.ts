import { AggregateRoot } from "../shared/aggregate-root.js";
import {
  ExceedsAllocatedError,
  InsufficientStockError,
  InvariantViolationError,
  OverAllocationError,
} from "../shared/domain-error.js";
import { Quantity } from "./quantity.js";

export interface InventoryBalanceProps {
  id: string;
  tenantId: string;
  locationId: string;
  productId: string;
  onHand?: number;
  allocated?: number;
}

/**
 * Proyección de stock por (tenant, ubicación, producto).
 * Invariantes: onHand >= 0, allocated <= onHand, available = onHand - allocated.
 * (allocatedQty está incluido en onHandQty, no es adicional.)
 */
export class InventoryBalance extends AggregateRoot {
  readonly tenantId: string;
  readonly locationId: string;
  readonly productId: string;
  private onHandQty: Quantity;
  private allocatedQty: Quantity;

  constructor(props: InventoryBalanceProps) {
    super(props.id);
    this.tenantId = props.tenantId;
    this.locationId = props.locationId;
    this.productId = props.productId;
    this.onHandQty = Quantity.of(props.onHand ?? 0);
    this.allocatedQty = Quantity.of(props.allocated ?? 0);
    if (this.allocatedQty.isGreaterThan(this.onHandQty)) {
      throw new InvariantViolationError("allocated cannot exceed onHand", {
        onHand: this.onHandQty.value,
        allocated: this.allocatedQty.value,
      });
    }
  }

  get onHand(): number {
    return this.onHandQty.value;
  }

  get allocated(): number {
    return this.allocatedQty.value;
  }

  get available(): number {
    return this.onHandQty.subtract(this.allocatedQty).value;
  }

  /** Entrada de stock (INBOUND_RECEIPT, PUTAWAY destino, RETURN_INBOUND, PICK destino). */
  receive(quantity: number): void {
    this.onHandQty = this.onHandQty.add(Quantity.positive(quantity));
  }

  /** Salida de stock no reservado (PUTAWAY origen, OUTBOUND_SHIPMENT). */
  withdraw(quantity: number): void {
    const qty = Quantity.positive(quantity);
    this.assertWithinAvailable(qty, InsufficientStockError, "Insufficient available stock");
    this.onHandQty = this.onHandQty.subtract(qty);
  }

  /** Reserva stock disponible para un pedido (ALLOCATION). */
  allocate(quantity: number): void {
    const qty = Quantity.positive(quantity);
    this.assertWithinAvailable(qty, OverAllocationError, "Cannot allocate more than available");
    this.allocatedQty = this.allocatedQty.add(qty);
  }

  /** Libera exactamente `quantity` de lo asignado (ALLOCATION_CANCEL). */
  release(quantity: number): void {
    const qty = Quantity.positive(quantity);
    this.assertWithinAllocated(qty, "release");
    this.allocatedQty = this.allocatedQty.subtract(qty);
  }

  /**
   * Libera hasta `quantity`, acotado a lo asignado (comportamiento de cancel-order
   * y handle-picking-exception: min(allocated, pendiente)). Devuelve lo liberado.
   */
  releaseUpTo(quantity: number): number {
    const requested = Quantity.of(quantity);
    const released = this.allocatedQty.min(requested);
    this.allocatedQty = this.allocatedQty.subtract(released);
    return released.value;
  }

  /** Picking: descuenta de onHand y de allocated a la vez (PICK). */
  consume(quantity: number): void {
    const qty = Quantity.positive(quantity);
    this.assertWithinAllocated(qty, "consume");
    this.allocatedQty = this.allocatedQty.subtract(qty);
    this.onHandQty = this.onHandQty.subtract(qty);
  }

  /** Ajuste de inventario (ADJUSTMENT): fija el nuevo onHand absoluto. */
  adjust(newOnHand: number): void {
    const target = Quantity.of(newOnHand);
    if (target.isLessThan(this.allocatedQty)) {
      throw new InvariantViolationError("Adjustment would leave onHand below allocated", {
        newOnHand: target.value,
        allocated: this.allocatedQty.value,
      });
    }
    this.onHandQty = target;
  }

  private assertWithinAvailable(
    qty: Quantity,
    ErrorType: new (message: string, details: Record<string, unknown>) => Error,
    message: string,
  ): void {
    if (qty.isGreaterThan(this.onHandQty.subtract(this.allocatedQty))) {
      throw new ErrorType(message, {
        requested: qty.value,
        available: this.available,
      });
    }
  }

  private assertWithinAllocated(qty: Quantity, operation: string): void {
    if (qty.isGreaterThan(this.allocatedQty)) {
      throw new ExceedsAllocatedError(`Cannot ${operation} more than allocated`, {
        requested: qty.value,
        allocated: this.allocatedQty.value,
      });
    }
  }
}
