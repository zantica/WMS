import { InvalidStateTransitionError, TerminalStateError } from "../shared/domain-error.js";

/** Espejo del enum `OrderStatus` de Prisma. */
export const ORDER_STATUSES = [
  "PENDING",
  "ALLOCATED",
  "PICKING",
  "PACKED",
  "SHIPPED",
  "CANCELLED",
  "ON_HOLD",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Transiciones permitidas. Fuentes: allocate-order (PENDING|ON_HOLD → ALLOCATED),
 * confirm-task-step (→ PACKED; hoy desde ALLOCATED porque nada escribe PICKING),
 * handle-picking-exception (→ ON_HOLD), orders.ts (PACKED → SHIPPED) y cancel-order.
 */
const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ["ALLOCATED", "CANCELLED"],
  ALLOCATED: ["PICKING", "PACKED", "ON_HOLD", "CANCELLED"],
  PICKING: ["PACKED", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["ALLOCATED", "CANCELLED"],
  PACKED: ["SHIPPED"],
  SHIPPED: [],
  CANCELLED: [],
};

/** Estados con stock reservado (allocatedQty) pendiente de picking. */
const STOCK_RESERVED_STATUSES: readonly OrderStatus[] = ["ALLOCATED", "PICKING"];

export interface OrderCancellationPlan {
  nextStatus: "CANCELLED";
  /** true si hay que liberar reservas (ALLOCATION_CANCEL) de las líneas no recogidas. */
  releasesStock: boolean;
}

export function isOrderTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (isOrderTerminal(from)) {
    throw new TerminalStateError(`Order is already ${from}`, { from, to });
  }
  if (!canTransitionOrder(from, to)) {
    throw new InvalidStateTransitionError(`Illegal order transition ${from} -> ${to}`, { from, to });
  }
}

/** Valida que el pedido se pueda cancelar y indica si debe liberar stock. */
export function planOrderCancellation(status: OrderStatus): OrderCancellationPlan {
  assertOrderTransition(status, "CANCELLED");
  return { nextStatus: "CANCELLED", releasesStock: STOCK_RESERVED_STATUSES.includes(status) };
}
