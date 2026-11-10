// apps/mobile/src/offline/local-task-cache.ts
// Caché local en memoria de tareas y pasos asignados para validación offline en @wms/mobile.
// Permite validar códigos de barras, ubicaciones, secuencia y cantidades sin conexión al servidor.

import type { TaskStepDTO, WarehouseTaskDTO } from "@wms/shared-types";
import type { OfflineValidationResult } from "./types.js";

function cloneTask(task: WarehouseTaskDTO): WarehouseTaskDTO {
  return JSON.parse(JSON.stringify(task)) as WarehouseTaskDTO;
}

export class LocalTaskCache {
  private readonly tasks: Map<string, WarehouseTaskDTO> = new Map();

  constructor(initialTasks: readonly WarehouseTaskDTO[] = []) {
    for (const task of initialTasks) {
      this.tasks.set(task.id, cloneTask(task));
    }
  }

  public setTasks(tasks: readonly WarehouseTaskDTO[]): void {
    this.tasks.clear();
    for (const task of tasks) {
      this.tasks.set(task.id, cloneTask(task));
    }
  }

  public upsertTask(task: WarehouseTaskDTO): void {
    this.tasks.set(task.id, cloneTask(task));
  }

  public getTask(taskId: string): WarehouseTaskDTO | undefined {
    const task = this.tasks.get(taskId);
    return task ? cloneTask(task) : undefined;
  }

  public getAllTasks(): WarehouseTaskDTO[] {
    return Array.from(this.tasks.values()).map(cloneTask);
  }

  public removeTask(taskId: string): void {
    this.tasks.delete(taskId);
  }

  public clear(): void {
    this.tasks.clear();
  }

  /**
   * Valida un escaneo de paso operativo (Putaway o Picking) contra las reglas de dominio.
   */
  public validateScan(
    taskId: string,
    stepId: string,
    scannedCode: string,
    quantity?: number,
  ): OfflineValidationResult {
    const task = this.tasks.get(taskId);
    if (!task) {
      return {
        isValid: false,
        code: "TASK_NOT_FOUND",
        message: `La tarea "${taskId}" no existe en la caché local.`,
      };
    }

    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      return {
        isValid: false,
        code: "CONFLICT",
        message: `La tarea "${taskId}" ya se encuentra finalizada (${task.status}).`,
      };
    }

    const steps = [...task.steps].sort((a, b) => a.sequence - b.sequence);
    const targetStep = steps.find((s) => s.id === stepId);
    if (!targetStep) {
      return {
        isValid: false,
        code: "TASK_NOT_FOUND",
        message: `El paso "${stepId}" no pertenece a la tarea "${taskId}".`,
      };
    }

    if (targetStep.status === "COMPLETED") {
      return {
        isValid: false,
        code: "CONFLICT",
        message: `El paso "${stepId}" ya fue completado previamente.`,
      };
    }

    // Regla de secuencia estricta: ningún paso anterior puede quedar PENDING
    const earlierPendingStep = steps.find(
      (s) => s.sequence < targetStep.sequence && s.status === "PENDING",
    );
    if (earlierPendingStep) {
      return {
        isValid: false,
        code: "WRONG_STEP_SEQUENCE",
        message: `Debe completar el paso anterior (${earlierPendingStep.sequence} en ${earlierPendingStep.locationCode}) antes de continuar.`,
      };
    }

    // Validación de coincidencia de código (barcode, SKU o código de ubicación)
    const normalizedScan = scannedCode.trim().toUpperCase();
    const matchesLocation =
      targetStep.locationCode.trim().toUpperCase() === normalizedScan;
    const matchesBarcode =
      targetStep.productBarcode !== null &&
      targetStep.productBarcode !== undefined &&
      targetStep.productBarcode.trim().toUpperCase() === normalizedScan;
    const matchesSku =
      targetStep.productSku.trim().toUpperCase() === normalizedScan;

    if (!matchesLocation && !matchesBarcode && !matchesSku) {
      return {
        isValid: false,
        code: "INVALID_SCAN",
        message: `El código "${scannedCode}" no coincide con el producto esperado (${targetStep.productSku}) ni la ubicación (${targetStep.locationCode}).`,
      };
    }

    // Validación de cantidad
    if (quantity !== undefined) {
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return {
          isValid: false,
          code: "INVALID_SCAN",
          message: "La cantidad escaneada debe ser un número positivo.",
        };
      }
      const remaining = targetStep.expectedQty - targetStep.scannedQty;
      if (quantity > remaining) {
        return {
          isValid: false,
          code: "INVALID_SCAN",
          message: `La cantidad escaneada (${quantity}) excede la cantidad pendiente (${remaining}).`,
        };
      }
    }

    return { isValid: true };
  }

  /**
   * Valida el escaneo de una línea de recepción de mercancía en muelle.
   */
  public validateReceiptLine(
    taskId: string,
    productId: string,
    scannedCode?: string,
    quantity?: number,
  ): OfflineValidationResult {
    const task = this.tasks.get(taskId);
    if (!task) {
      return {
        isValid: false,
        code: "TASK_NOT_FOUND",
        message: `La tarea "${taskId}" no existe en la caché local.`,
      };
    }

    if (task.type !== "RECEIVING") {
      return {
        isValid: false,
        code: "CONFLICT",
        message: `La tarea "${taskId}" no es de tipo RECEIVING.`,
      };
    }

    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      return {
        isValid: false,
        code: "CONFLICT",
        message: `La tarea de recepción "${taskId}" ya está finalizada.`,
      };
    }

    const step = task.steps.find((s) => s.productId === productId);
    if (!step) {
      return {
        isValid: false,
        code: "PRODUCT_NOT_FOUND",
        message: `El producto "${productId}" no se encuentra en esta orden de recepción.`,
      };
    }

    if (scannedCode !== undefined && scannedCode.trim().length > 0) {
      const normalizedScan = scannedCode.trim().toUpperCase();
      const matchesBarcode =
        step.productBarcode !== null &&
        step.productBarcode !== undefined &&
        step.productBarcode.trim().toUpperCase() === normalizedScan;
      const matchesSku = step.productSku.trim().toUpperCase() === normalizedScan;

      if (!matchesBarcode && !matchesSku) {
        return {
          isValid: false,
          code: "INVALID_SCAN",
          message: `El código "${scannedCode}" no corresponde al SKU ${step.productSku}.`,
        };
      }
    }

    if (quantity !== undefined && (!Number.isFinite(quantity) || quantity <= 0)) {
      return {
        isValid: false,
        code: "INVALID_SCAN",
        message: "La cantidad a recibir debe ser un número positivo.",
      };
    }

    return { isValid: true };
  }

  /**
   * Aplica de forma optimista la confirmación de un paso en la caché local.
   */
  public applyOptimisticStep(
    taskId: string,
    stepId: string,
    quantity: number,
    reportException?: boolean,
  ): WarehouseTaskDTO {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in local cache`);
    }

    const updatedTask = cloneTask(task);
    const step = updatedTask.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new Error(`Step ${stepId} not found in task ${taskId}`);
    }

    if (reportException) {
      step.status = "EXCEPTION";
      updatedTask.status = "EXCEPTION";
    } else {
      step.scannedQty += quantity;
      if (step.scannedQty >= step.expectedQty) {
        step.status = "COMPLETED";
      }
      if (updatedTask.status === "PENDING") {
        updatedTask.status = "IN_PROGRESS";
      }

      const allCompleted = updatedTask.steps.every(
        (s) => s.status === "COMPLETED",
      );
      if (allCompleted) {
        updatedTask.status = "COMPLETED";
      }
    }

    this.tasks.set(taskId, updatedTask);
    return cloneTask(updatedTask);
  }

  /**
   * Aplica de forma optimista la confirmación de recepción en la caché local.
   */
  public applyOptimisticReceiptLine(
    taskId: string,
    productId: string,
    quantity: number,
  ): WarehouseTaskDTO {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in local cache`);
    }

    const updatedTask = cloneTask(task);
    const step = updatedTask.steps.find(
      (s) => s.productId === productId && s.status === "PENDING",
    );
    if (!step) {
      throw new Error(
        `No pending step found for product ${productId} in task ${taskId}`,
      );
    }

    step.scannedQty += quantity;
    if (step.scannedQty >= step.expectedQty) {
      step.status = "COMPLETED";
    }
    if (updatedTask.status === "PENDING") {
      updatedTask.status = "IN_PROGRESS";
    }

    const allCompleted = updatedTask.steps.every(
      (s) => s.status === "COMPLETED",
    );
    if (allCompleted) {
      updatedTask.status = "COMPLETED";
    }

    this.tasks.set(taskId, updatedTask);
    return cloneTask(updatedTask);
  }
}
