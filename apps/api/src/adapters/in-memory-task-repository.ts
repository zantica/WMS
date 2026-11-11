// apps/api/src/adapters/in-memory-task-repository.ts
// Adaptador en memoria para TaskRepository.
// Reconstruye el agregado WarehouseTask + TaskStep y persiste cambios por tenantId.

import { TaskStep, WarehouseTask, type StepStatus, type TaskStatus } from "@wms/domain";
import type {
  CreateTaskInput,
  CreateTaskStepInput,
  SaveTaskOptions,
  TaskRepository,
  WarehouseTaskRecord,
  WarehouseTaskType,
} from "../ports/task-repository.js";
import type { InMemoryLocationRecord } from "./in-memory-inventory-repository.js";

export interface InMemoryProductRecord {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  barcode?: string | null;
}

export interface InMemoryTaskStepRecord {
  id: string;
  taskId: string;
  sequence: number;
  locationId: string;
  productId: string;
  expectedQty: number;
  scannedQty: number;
  status: StepStatus;
  exceptionNote?: string | null;
  completedAt?: Date | null;
}

export interface InMemoryTaskRecord {
  id: string;
  tenantId: string;
  orderId: string | null;
  receiptRef: string | null;
  type: WarehouseTaskType;
  status: TaskStatus;
  assignedTo: string | null;
  completedAt?: Date | null;
  steps: InMemoryTaskStepRecord[];
}

export interface InMemoryTaskState {
  tasks: InMemoryTaskRecord[];
  locations: InMemoryLocationRecord[];
  products: InMemoryProductRecord[];
}

export class InMemoryTaskRepository implements TaskRepository {
  private taskCounter = 0;
  private stepCounter = 0;

  constructor(private readonly state: InMemoryTaskState) {}

  async findById(
    tenantId: string,
    taskId: string,
  ): Promise<WarehouseTaskRecord | null> {
    const row = this.state.tasks.find(
      (t) => t.id === taskId && t.tenantId === tenantId,
    );
    if (!row) return null;

    const sortedSteps = [...row.steps].sort((a, b) => a.sequence - b.sequence);
    const domainSteps = sortedSteps.map(
      (s) =>
        new TaskStep({
          id: s.id,
          expectedQty: s.expectedQty,
          scannedQty: s.scannedQty,
          status: s.status,
        }),
    );

    const task = new WarehouseTask({
      id: row.id,
      tenantId: row.tenantId,
      status: row.status,
      steps: domainSteps,
    });

    return {
      task,
      details: {
        id: row.id,
        tenantId: row.tenantId,
        orderId: row.orderId,
        receiptRef: row.receiptRef,
        type: row.type,
        status: row.status,
        steps: sortedSteps.map((s) => {
          const loc = this.state.locations.find(
            (l) => l.id === s.locationId && l.tenantId === tenantId,
          );
          const prod = this.state.products.find(
            (p) => p.id === s.productId && p.tenantId === tenantId,
          );
          return {
            id: s.id,
            sequence: s.sequence,
            locationId: s.locationId,
            locationCode: loc?.code ?? "",
            warehouseId: loc?.warehouseId ?? "",
            productId: s.productId,
            productSku: prod?.sku ?? "",
            productBarcode: prod?.barcode ?? null,
            expectedQty: s.expectedQty,
            scannedQty: s.scannedQty,
            status: s.status,
            exceptionNote: s.exceptionNote ?? null,
          };
        }),
      },
    };
  }

  async create(input: CreateTaskInput): Promise<{ id: string }> {
    this.taskCounter += 1;
    const taskId = `task-mem-${this.taskCounter}`;

    const steps: InMemoryTaskStepRecord[] = input.steps.map((s) => {
      this.stepCounter += 1;
      return {
        id: `step-mem-${this.stepCounter}`,
        taskId,
        sequence: s.sequence,
        locationId: s.locationId,
        productId: s.productId,
        expectedQty: s.expectedQty,
        scannedQty: 0,
        status: "PENDING",
      };
    });

    this.state.tasks.push({
      id: taskId,
      tenantId: input.tenantId,
      orderId: input.orderId ?? null,
      receiptRef: input.receiptRef ?? null,
      type: input.type,
      status: input.status,
      assignedTo: input.assignedTo ?? null,
      steps,
    });

    return { id: taskId };
  }

  async addStep(
    tenantId: string,
    taskId: string,
    step: CreateTaskStepInput,
  ): Promise<{ id: string; sequence: number }> {
    const task = this.state.tasks.find(
      (t) => t.id === taskId && t.tenantId === tenantId,
    );
    if (!task) {
      throw new Error(`Task ${taskId} not found for tenant ${tenantId}`);
    }

    this.stepCounter += 1;
    const stepId = `step-mem-${this.stepCounter}`;
    task.steps.push({
      id: stepId,
      taskId,
      sequence: step.sequence,
      locationId: step.locationId,
      productId: step.productId,
      expectedQty: step.expectedQty,
      scannedQty: 0,
      status: "PENDING",
    });

    return { id: stepId, sequence: step.sequence };
  }

  async save(task: WarehouseTask, options?: SaveTaskOptions): Promise<void> {
    const row = this.state.tasks.find(
      (t) => t.id === task.id && t.tenantId === task.tenantId,
    );
    if (!row) return;

    row.status = task.status;
    if (options?.completedAt !== undefined) {
      row.completedAt = options.completedAt;
    } else if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      row.completedAt = new Date();
    }

    for (const domainStep of task.steps) {
      const stepRow = row.steps.find((s) => s.id === domainStep.id);
      if (!stepRow) continue;
      stepRow.scannedQty = domainStep.scannedQty;
      stepRow.status = domainStep.status;
      const stepOpt = options?.stepUpdates?.[domainStep.id];
      if (stepOpt?.completedAt !== undefined) {
        stepRow.completedAt = stepOpt.completedAt;
      }
      if (stepOpt?.exceptionNote !== undefined) {
        stepRow.exceptionNote = stepOpt.exceptionNote;
      }
    }
  }
}
