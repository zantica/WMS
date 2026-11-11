// apps/api/src/ports/task-repository.ts
// Puerto hexagonal para persistencia del agregado WarehouseTask y sus TaskSteps.
// Preserva aislamiento estricto multi-tenant (tenantId).

import type { StepStatus, TaskStatus, WarehouseTask } from "@wms/domain";

export type WarehouseTaskType = "RECEIVING" | "PUTAWAY" | "PICKING" | "PACKING";

export interface TaskStepDetails {
  id: string;
  sequence: number;
  locationId: string;
  locationCode: string;
  warehouseId: string;
  productId: string;
  productSku: string;
  productBarcode: string | null;
  expectedQty: number;
  scannedQty: number;
  status: StepStatus;
  exceptionNote?: string | null;
}

export interface TaskDetails {
  id: string;
  tenantId: string;
  orderId: string | null;
  receiptRef: string | null;
  type: WarehouseTaskType;
  status: TaskStatus;
  steps: TaskStepDetails[];
}

export interface WarehouseTaskRecord {
  task: WarehouseTask;
  details: TaskDetails;
}

export interface CreateTaskStepInput {
  sequence: number;
  locationId: string;
  productId: string;
  expectedQty: number;
}

export interface CreateTaskInput {
  tenantId: string;
  orderId?: string | null;
  receiptRef?: string | null;
  type: WarehouseTaskType;
  status: TaskStatus;
  assignedTo?: string | null;
  steps: CreateTaskStepInput[];
}

export interface SaveTaskOptions {
  completedAt?: Date | null;
  stepUpdates?: Record<
    string,
    {
      completedAt?: Date | null;
      exceptionNote?: string | null;
    }
  >;
}

export interface TaskRepository {
  /**
   * Carga el agregado WarehouseTask junto con los metadatos de sus pasos.
   */
  findById(tenantId: string, taskId: string): Promise<WarehouseTaskRecord | null>;

  /**
   * Crea una nueva WarehouseTask con sus pasos iniciales.
   */
  create(input: CreateTaskInput): Promise<{ id: string }>;

  /**
   * Añade un paso adicional (ej. paso de reemplazo en picking exception) a la tarea.
   */
  addStep(
    tenantId: string,
    taskId: string,
    step: CreateTaskStepInput,
  ): Promise<{ id: string; sequence: number }>;

  /**
   * Persiste los cambios de estado y progreso del agregado WarehouseTask y sus pasos.
   */
  save(task: WarehouseTask, options?: SaveTaskOptions): Promise<void>;
}
