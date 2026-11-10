import { AggregateRoot } from "../shared/aggregate-root.js";
import { PendingStepsError, StepNotFoundError } from "../shared/domain-error.js";
import { TaskStep } from "./task-step.js";
import {
  assertTaskTransition,
  type StepStatus,
  type TaskStatus,
} from "./task-state-machine.js";

export interface WarehouseTaskProps {
  id: string;
  tenantId: string;
  status?: TaskStatus;
  steps?: TaskStep[];
}

export interface ConfirmStepResult {
  stepStatus: StepStatus;
  taskStatus: TaskStatus;
}

/**
 * Agregado de tarea de almacén. Solo se completa cuando todos sus pasos están
 * resueltos y no admite operaciones una vez COMPLETED o CANCELLED.
 */
export class WarehouseTask extends AggregateRoot {
  readonly tenantId: string;
  private currentStatus: TaskStatus;
  private readonly stepList: TaskStep[];

  constructor(props: WarehouseTaskProps) {
    super(props.id);
    this.tenantId = props.tenantId;
    this.currentStatus = props.status ?? "PENDING";
    this.stepList = [...(props.steps ?? [])];
  }

  get status(): TaskStatus {
    return this.currentStatus;
  }

  get steps(): readonly TaskStep[] {
    return this.stepList;
  }

  /** PENDING|EXCEPTION → IN_PROGRESS. */
  start(): void {
    this.transitionTo("IN_PROGRESS");
  }

  /** Añade un paso (p. ej. de reemplazo tras una excepción de picking). */
  addStep(step: TaskStep): void {
    this.assertOperable();
    this.stepList.push(step);
  }

  /**
   * Confirma (parcial o totalmente) un paso. Si con ello todos los pasos quedan
   * resueltos, la tarea pasa a COMPLETED.
   */
  confirmStep(stepId: string, quantity: number): ConfirmStepResult {
    this.assertOperable();
    const stepStatus = this.findStep(stepId).scan(quantity);
    if (this.stepList.every((step) => step.isResolved)) {
      this.transitionTo("COMPLETED");
    }
    return { stepStatus, taskStatus: this.currentStatus };
  }

  /** Marca el paso como EXCEPTION sin alterar el estado de la tarea (hay reasignación). */
  reportStepException(stepId: string): void {
    this.assertOperable();
    this.findStep(stepId).reportException();
  }

  /**
   * Excepción irresoluble: el paso queda EXCEPTION, los demás pasos PENDING se
   * omiten (SKIPPED) y la tarea pasa a EXCEPTION.
   */
  escalateStepException(stepId: string): void {
    assertTaskTransition(this.currentStatus, "EXCEPTION"); // falla antes de mutar nada
    const failing = this.findStep(stepId);
    failing.reportException();
    this.skipPendingSteps();
    this.transitionTo("EXCEPTION");
  }

  /** Completa explícitamente; exige que ningún paso siga PENDING. */
  complete(): void {
    this.assertOperable();
    const pending = this.stepList.filter((step) => !step.isResolved);
    if (pending.length > 0) {
      throw new PendingStepsError(`Task ${this.id} has pending steps`, {
        pendingStepIds: pending.map((step) => step.id),
      });
    }
    this.transitionTo("COMPLETED");
  }

  /** Cancela la tarea omitiendo los pasos aún pendientes (cancel-order). */
  cancel(): void {
    this.assertOperable();
    this.skipPendingSteps();
    this.transitionTo("CANCELLED");
  }

  private assertOperable(): void {
    // Una transición cualquiera desde el estado actual lanza TerminalStateError si es terminal.
    assertTaskTransition(this.currentStatus, "CANCELLED");
  }

  private transitionTo(next: TaskStatus): void {
    assertTaskTransition(this.currentStatus, next);
    this.currentStatus = next;
  }

  private skipPendingSteps(): void {
    for (const step of this.stepList) {
      if (!step.isResolved) {
        step.skip();
      }
    }
  }

  private findStep(stepId: string): TaskStep {
    const step = this.stepList.find((candidate) => candidate.id === stepId);
    if (!step) {
      throw new StepNotFoundError(`Step ${stepId} not found in task ${this.id}`, {
        taskId: this.id,
        stepId,
      });
    }
    return step;
  }
}
