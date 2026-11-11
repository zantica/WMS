// apps/api/src/adapters/prisma-task-repository.ts
// Adaptador Prisma/PostgreSQL para TaskRepository.
// Reconstruye el AggregateRoot WarehouseTask + TaskStep y persiste mutaciones con tenantId.

import { TaskStep, WarehouseTask, type StepStatus, type TaskStatus } from "@wms/domain";
import type { Prisma, prisma as prismaClientType } from "@wms/db";
import type {
  CreateTaskInput,
  CreateTaskStepInput,
  SaveTaskOptions,
  TaskRepository,
  WarehouseTaskRecord,
  WarehouseTaskType,
} from "../ports/task-repository.js";

type PrismaClientOrTx = Prisma.TransactionClient | typeof prismaClientType;

export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly client: PrismaClientOrTx) {}

  async findById(
    tenantId: string,
    taskId: string,
  ): Promise<WarehouseTaskRecord | null> {
    const row = await this.client.warehouseTask.findFirst({
      where: { id: taskId, tenantId },
      include: {
        steps: {
          orderBy: { sequence: "asc" },
          include: {
            location: true,
            product: true,
          },
        },
      },
    });

    if (!row || row.tenantId !== tenantId) {
      return null;
    }

    const domainSteps = row.steps.map(
      (s) =>
        new TaskStep({
          id: s.id,
          expectedQty: Number(s.expectedQty),
          scannedQty: Number(s.scannedQty),
          status: s.status as StepStatus,
        }),
    );

    const task = new WarehouseTask({
      id: row.id,
      tenantId: row.tenantId,
      status: row.status as TaskStatus,
      steps: domainSteps,
    });

    return {
      task,
      details: {
        id: row.id,
        tenantId: row.tenantId,
        orderId: row.orderId,
        receiptRef: row.receiptRef,
        type: row.type as WarehouseTaskType,
        status: row.status as TaskStatus,
        steps: row.steps.map((s) => ({
          id: s.id,
          sequence: s.sequence,
          locationId: s.locationId,
          locationCode: s.location.code,
          warehouseId: s.location.warehouseId,
          productId: s.productId,
          productSku: s.product.sku,
          productBarcode: s.product.barcode,
          expectedQty: Number(s.expectedQty),
          scannedQty: Number(s.scannedQty),
          status: s.status as StepStatus,
          exceptionNote: s.exceptionNote,
        })),
      },
    };
  }

  async create(input: CreateTaskInput): Promise<{ id: string }> {
    const created = await this.client.warehouseTask.create({
      data: {
        tenantId: input.tenantId,
        orderId: input.orderId ?? null,
        receiptRef: input.receiptRef ?? null,
        type: input.type,
        status: input.status,
        assignedTo: input.assignedTo ?? null,
        steps: {
          create: input.steps.map((s) => ({
            sequence: s.sequence,
            locationId: s.locationId,
            productId: s.productId,
            expectedQty: s.expectedQty,
            scannedQty: 0,
            status: "PENDING",
          })),
        },
      },
    });

    return { id: created.id };
  }

  async addStep(
    tenantId: string,
    taskId: string,
    step: CreateTaskStepInput,
  ): Promise<{ id: string; sequence: number }> {
    // Verificar pertenencia de la tarea antes de insertar paso hijo
    const ownerCheck = await this.client.warehouseTask.findFirst({
      where: { id: taskId, tenantId },
      select: { id: true },
    });
    if (!ownerCheck) {
      throw new Error(`Task ${taskId} not found for tenant ${tenantId}`);
    }

    const created = await this.client.taskStep.create({
      data: {
        taskId,
        sequence: step.sequence,
        locationId: step.locationId,
        productId: step.productId,
        expectedQty: step.expectedQty,
        scannedQty: 0,
        status: "PENDING",
      },
    });

    return { id: created.id, sequence: created.sequence };
  }

  async save(task: WarehouseTask, options?: SaveTaskOptions): Promise<void> {
    const completedAtValue =
      options?.completedAt !== undefined
        ? options.completedAt
        : task.status === "COMPLETED" || task.status === "CANCELLED"
          ? new Date()
          : undefined;

    await this.client.warehouseTask.updateMany({
      where: { id: task.id, tenantId: task.tenantId },
      data: {
        status: task.status,
        ...(completedAtValue !== undefined ? { completedAt: completedAtValue } : {}),
      },
    });

    for (const step of task.steps) {
      const stepUpdate = options?.stepUpdates?.[step.id];
      await this.client.taskStep.updateMany({
        where: {
          id: step.id,
          taskId: task.id,
          task: { tenantId: task.tenantId },
        },
        data: {
          scannedQty: step.scannedQty,
          status: step.status,
          ...(stepUpdate?.completedAt !== undefined
            ? { completedAt: stepUpdate.completedAt }
            : {}),
          ...(stepUpdate?.exceptionNote !== undefined
            ? { exceptionNote: stepUpdate.exceptionNote }
            : {}),
        },
      });
    }
  }
}
