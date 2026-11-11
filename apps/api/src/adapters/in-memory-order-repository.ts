// apps/api/src/adapters/in-memory-order-repository.ts
// Adaptador en memoria para OrderRepository.
// Respeta el contrato multi-tenant y actualiza pedidos y líneas de forma consistente.

import type { OrderStatus } from "@wms/domain";
import type {
  ActivePickingTaskData,
  OrderData,
  OrderRepository,
} from "../ports/order-repository.js";
import type {
  InMemoryProductRecord,
  InMemoryTaskRecord,
} from "./in-memory-task-repository.js";

export interface InMemoryOrderLineRecord {
  id: string;
  productId: string;
  requestedQty: number;
  pickedQty: number;
}

export interface InMemoryOrderRecord {
  id: string;
  tenantId: string;
  warehouseId: string;
  status: OrderStatus;
  externalRef?: string | null;
  notes?: string | null;
  lines: InMemoryOrderLineRecord[];
}

export interface InMemoryOrderState {
  orders: InMemoryOrderRecord[];
  products: InMemoryProductRecord[];
  tasks: InMemoryTaskRecord[];
}

export class InMemoryOrderRepository implements OrderRepository {
  constructor(private readonly state: InMemoryOrderState) {}

  async findById(tenantId: string, orderId: string): Promise<OrderData | null> {
    const order = this.state.orders.find(
      (o) => o.id === orderId && o.tenantId === tenantId,
    );
    if (!order) return null;

    return {
      id: order.id,
      tenantId: order.tenantId,
      warehouseId: order.warehouseId,
      status: order.status,
      externalRef: order.externalRef ?? null,
      notes: order.notes ?? null,
      lines: order.lines.map((line) => {
        const prod = this.state.products.find(
          (p) => p.id === line.productId && p.tenantId === tenantId,
        );
        return {
          id: line.id,
          productId: line.productId,
          requestedQty: line.requestedQty,
          pickedQty: line.pickedQty,
          product: {
            id: prod?.id ?? line.productId,
            sku: prod?.sku ?? "",
            name: prod?.name ?? "",
            barcode: prod?.barcode ?? null,
          },
        };
      }),
    };
  }

  async updateStatus(
    tenantId: string,
    orderId: string,
    status: OrderStatus,
    notes?: string | null,
  ): Promise<void> {
    const order = this.state.orders.find(
      (o) => o.id === orderId && o.tenantId === tenantId,
    );
    if (!order) return;

    order.status = status;
    if (notes !== undefined) {
      order.notes = notes;
    }
  }

  async incrementPickedQty(
    tenantId: string,
    orderId: string,
    productId: string,
    quantity: number,
  ): Promise<void> {
    const order = this.state.orders.find(
      (o) => o.id === orderId && o.tenantId === tenantId,
    );
    if (!order) return;

    for (const line of order.lines) {
      if (line.productId === productId) {
        line.pickedQty += quantity;
      }
    }
  }

  async findActivePickingTasks(
    tenantId: string,
    orderId: string,
  ): Promise<ActivePickingTaskData[]> {
    return this.state.tasks
      .filter(
        (t) =>
          t.tenantId === tenantId &&
          t.orderId === orderId &&
          t.type === "PICKING" &&
          (t.status === "PENDING" ||
            t.status === "IN_PROGRESS" ||
            t.status === "EXCEPTION"),
      )
      .map((t) => ({
        id: t.id,
        status: t.status,
        steps: [...t.steps]
          .sort((a, b) => a.sequence - b.sequence)
          .map((s) => ({
            id: s.id,
            sequence: s.sequence,
            locationId: s.locationId,
            productId: s.productId,
            expectedQty: s.expectedQty,
            scannedQty: s.scannedQty,
            status: s.status,
          })),
      }));
  }
}
