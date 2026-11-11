// apps/api/src/adapters/prisma-order-repository.ts
// Adaptador Prisma/PostgreSQL para OrderRepository.
// Garantiza aislamiento multi-tenant (tenantId) en cada lectura y escritura.

import type { OrderStatus, StepStatus, TaskStatus } from "@wms/domain";
import type { Prisma, prisma as prismaClientType } from "@wms/db";
import type {
  ActivePickingTaskData,
  OrderData,
  OrderRepository,
} from "../ports/order-repository.js";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prismaClientType;

export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly client: PrismaClientOrTx) {}

  async findById(tenantId: string, orderId: string): Promise<OrderData | null> {
    const order = await this.client.salesOrder.findFirst({
      where: { id: orderId, tenantId },
      include: { lines: { include: { product: true } } },
    });

    if (!order || order.tenantId !== tenantId) {
      return null;
    }

    return {
      id: order.id,
      tenantId: order.tenantId,
      warehouseId: order.warehouseId,
      status: order.status as OrderStatus,
      externalRef: order.externalRef,
      notes: order.notes,
      lines: order.lines.map((line) => ({
        id: line.id,
        productId: line.productId,
        requestedQty: Number(line.requestedQty),
        pickedQty: Number(line.pickedQty),
        product: {
          id: line.product.id,
          sku: line.product.sku,
          name: line.product.name,
          barcode: line.product.barcode,
        },
      })),
    };
  }

  async updateStatus(
    tenantId: string,
    orderId: string,
    status: OrderStatus,
    notes?: string | null,
  ): Promise<void> {
    await this.client.salesOrder.updateMany({
      where: { id: orderId, tenantId },
      data: {
        status,
        ...(notes !== undefined ? { notes } : {}),
      },
    });
  }

  async incrementPickedQty(
    tenantId: string,
    orderId: string,
    productId: string,
    quantity: number,
  ): Promise<void> {
    await this.client.orderLine.updateMany({
      where: {
        orderId,
        productId,
        order: { tenantId },
      },
      data: {
        pickedQty: { increment: quantity },
      },
    });
  }

  async findActivePickingTasks(
    tenantId: string,
    orderId: string,
  ): Promise<ActivePickingTaskData[]> {
    const tasks = await this.client.warehouseTask.findMany({
      where: {
        tenantId,
        orderId,
        type: "PICKING",
        status: { in: ["PENDING", "IN_PROGRESS", "EXCEPTION"] },
      },
      include: {
        steps: {
          orderBy: { sequence: "asc" },
        },
      },
    });

    return tasks.map((task) => ({
      id: task.id,
      status: task.status as TaskStatus,
      steps: task.steps.map((step) => ({
        id: step.id,
        sequence: step.sequence,
        locationId: step.locationId,
        productId: step.productId,
        expectedQty: Number(step.expectedQty),
        scannedQty: Number(step.scannedQty),
        status: step.status as StepStatus,
      })),
    }));
  }
}
