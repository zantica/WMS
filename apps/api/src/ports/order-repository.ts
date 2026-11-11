// apps/api/src/ports/order-repository.ts
// Puerto hexagonal para consulta y actualización del ciclo de vida de SalesOrder.
// Trabaja desacoplado de Prisma y filtra siempre por tenantId.

import type { OrderStatus, TaskStatus, StepStatus } from "@wms/domain";

export interface OrderLineData {
  id: string;
  productId: string;
  requestedQty: number;
  pickedQty: number;
  product: {
    id: string;
    sku: string;
    name: string;
    barcode?: string | null;
  };
}

export interface OrderData {
  id: string;
  tenantId: string;
  warehouseId: string;
  status: OrderStatus;
  externalRef?: string | null;
  notes?: string | null;
  lines: OrderLineData[];
}

export interface ActivePickingStepData {
  id: string;
  sequence: number;
  locationId: string;
  productId: string;
  expectedQty: number;
  scannedQty: number;
  status: StepStatus;
}

export interface ActivePickingTaskData {
  id: string;
  status: TaskStatus;
  steps: ActivePickingStepData[];
}

export interface OrderRepository {
  /**
   * Carga un pedido con sus líneas y productos filtrando por tenantId.
   */
  findById(tenantId: string, orderId: string): Promise<OrderData | null>;

  /**
   * Actualiza el estado del pedido y opcionalmente sus notas.
   */
  updateStatus(
    tenantId: string,
    orderId: string,
    status: OrderStatus,
    notes?: string | null,
  ): Promise<void>;

  /**
   * Incrementa la cantidad recogida (pickedQty) en una línea del pedido.
   */
  incrementPickedQty(
    tenantId: string,
    orderId: string,
    productId: string,
    quantity: number,
  ): Promise<void>;

  /**
   * Busca las tareas de tipo PICKING activas asociadas a un pedido (usado en cancelOrder).
   */
  findActivePickingTasks(
    tenantId: string,
    orderId: string,
  ): Promise<ActivePickingTaskData[]>;
}
