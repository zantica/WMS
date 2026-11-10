import { InvalidStateTransitionError, TerminalStateError } from "../shared/domain-error.js";

/** Espejo del enum `TaskStatus` de Prisma. */
export const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXCEPTION"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Espejo del enum `StepStatus` de Prisma. */
export const STEP_STATUSES = ["PENDING", "COMPLETED", "EXCEPTION", "SKIPPED"] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

/**
 * Transiciones permitidas de tarea. Derivadas del comportamiento de confirm-task-step
 * (completa desde cualquier estado no terminal, incluso sin pasar por IN_PROGRESS),
 * handle-picking-exception (â†’ EXCEPTION / vuelta a IN_PROGRESS) y cancel-order (â†’ CANCELLED).
 */
const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  PENDING: ["IN_PROGRESS", "COMPLETED", "EXCEPTION", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "EXCEPTION", "CANCELLED"],
  EXCEPTION: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Un paso PENDING puede resolverse; el resto son terminales (no hay retroceso). */
const STEP_TRANSITIONS: Readonly<Record<StepStatus, readonly StepStatus[]>> = {
  PENDING: ["COMPLETED", "EXCEPTION", "SKIPPED"],
  COMPLETED: [],
  EXCEPTION: [],
  SKIPPED: [],
};

export function isTaskTerminal(status: TaskStatus): boolean {
  return TASK_TRANSITIONS[status].length === 0;
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (isTaskTerminal(from)) {
    throw new TerminalStateError(`Task is already ${from}`, { from, to });
  }
  if (!canTransitionTask(from, to)) {
    throw new InvalidStateTransitionError(`Illegal task transition ${from} -> ${to}`, { from, to });
  }
}

/** Un paso está resuelto cuando ya no es PENDING (COMPLETED, EXCEPTION o SKIPPED). */
export function isStepResolved(status: StepStatus): boolean {
  return STEP_TRANSITIONS[status].length === 0;
}
