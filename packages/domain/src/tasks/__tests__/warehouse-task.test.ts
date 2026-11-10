import { describe, expect, it } from "vitest";
import { TaskStep } from "../task-step.js";
import { WarehouseTask } from "../warehouse-task.js";
import {
  assertTaskTransition,
  canTransitionTask,
  isStepResolved,
  isTaskTerminal,
  TASK_STATUSES,
  STEP_STATUSES,
  type TaskStatus,
} from "../task-state-machine.js";
import {
  DomainError,
  InvalidQuantityError,
  InvalidStateTransitionError,
  PendingStepsError,
  ScanExceedsExpectedError,
  StepAlreadyResolvedError,
  StepNotFoundError,
  TerminalStateError,
} from "../../shared/domain-error.js";

const step = (id: string, expectedQty = 2) => new TaskStep({ id, expectedQty });
const task = (steps: TaskStep[] = [step("s1"), step("s2")], status?: TaskStatus) =>
  new WarehouseTask({ id: "t1", tenantId: "tn", steps, ...(status ? { status } : {}) });

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return (error as DomainError).code;
  }
  throw new Error("expected a DomainError");
}

describe("WarehouseTask / TaskStep — happy path", () => {
  it("espeja los enums del esquema", () => {
    expect(TASK_STATUSES).toEqual(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "EXCEPTION"]);
    expect(STEP_STATUSES).toEqual(["PENDING", "COMPLETED", "EXCEPTION", "SKIPPED"]);
  });

  it("escaneo parcial mantiene el paso PENDING y el total lo completa", () => {
    const s = step("s1", 3);
    expect(s.scan(1)).toBe("PENDING");
    expect(s.remainingQty).toBe(2);
    expect(s.scan(2)).toBe("COMPLETED");
    expect(s.remainingQty).toBe(0);
    expect(s.isResolved).toBe(true);
    expect([s.expectedQty, s.scannedQty]).toEqual([3, 3]);
  });

  it("la tarea se completa al resolver todos los pasos", () => {
    const t = task();
    t.start();
    expect(t.status).toBe("IN_PROGRESS");
    expect(t.confirmStep("s1", 2)).toEqual({ stepStatus: "COMPLETED", taskStatus: "IN_PROGRESS" });
    expect(t.confirmStep("s2", 2)).toEqual({ stepStatus: "COMPLETED", taskStatus: "COMPLETED" });
    expect(t.steps).toHaveLength(2);
  });

  it("una tarea PENDING puede completarse directamente (como confirm-task-step)", () => {
    const t = task([step("s1")]);
    expect(t.confirmStep("s1", 2).taskStatus).toBe("COMPLETED");
  });

  it("un paso en EXCEPTION cuenta como resuelto para completar", () => {
    const t = task();
    t.reportStepException("s1");
    expect(t.status).toBe("PENDING");
    expect(t.confirmStep("s2", 2).taskStatus).toBe("COMPLETED");
  });

  it("addStep añade pasos de reemplazo y complete() funciona con todos resueltos", () => {
    const t = task([step("s1")], "IN_PROGRESS");
    t.reportStepException("s1");
    t.addStep(step("r1", 1));
    t.confirmStep("r1", 1);
    expect(t.status).toBe("COMPLETED");
    expect(task([]).complete()).toBeUndefined();
  });

  it("escalar excepción omite pasos pendientes y deja la tarea en EXCEPTION; se puede reanudar", () => {
    const t = task([step("s1"), step("s2"), step("s3")], "IN_PROGRESS");
    t.confirmStep("s3", 2);
    t.escalateStepException("s1");
    expect(t.steps.map((s) => s.status)).toEqual(["EXCEPTION", "SKIPPED", "COMPLETED"]);
    expect(t.status).toBe("EXCEPTION");
    t.start();
    expect(t.status).toBe("IN_PROGRESS");
  });

  it("cancelar omite pasos pendientes y respeta los completados", () => {
    const t = task();
    t.confirmStep("s1", 2);
    t.cancel();
    expect(t.status).toBe("CANCELLED");
    expect(t.steps.map((s) => s.status)).toEqual(["COMPLETED", "SKIPPED"]);
  });

  it("tabla de transiciones", () => {
    expect(canTransitionTask("PENDING", "IN_PROGRESS")).toBe(true);
    expect(canTransitionTask("EXCEPTION", "IN_PROGRESS")).toBe(true);
    expect(isTaskTerminal("COMPLETED")).toBe(true);
    expect(isTaskTerminal("EXCEPTION")).toBe(false);
    expect(isStepResolved("PENDING")).toBe(false);
    expect(isStepResolved("SKIPPED")).toBe(true);
    expect(() => assertTaskTransition("PENDING", "IN_PROGRESS")).not.toThrow();
  });
});

describe("WarehouseTask / TaskStep — romper a propósito", () => {
  it("no retrocede: COMPLETED → IN_PROGRESS y similares", () => {
    const done = task([], "COMPLETED");
    expect(() => done.start()).toThrow(TerminalStateError);
    expect(codeOf(() => assertTaskTransition("COMPLETED", "IN_PROGRESS"))).toBe("TERMINAL_STATE");
    expect(codeOf(() => assertTaskTransition("IN_PROGRESS", "PENDING"))).toBe("INVALID_STATE_TRANSITION");
    expect(() => task([], "IN_PROGRESS").start()).toThrow(InvalidStateTransitionError);
  });

  it.each(["COMPLETED", "CANCELLED"] as const)("prohíbe operar sobre tarea %s", (status) => {
    const t = task([step("s1")], status);
    expect(() => t.confirmStep("s1", 1)).toThrow(TerminalStateError);
    expect(() => t.reportStepException("s1")).toThrow(TerminalStateError);
    expect(() => t.escalateStepException("s1")).toThrow(TerminalStateError);
    expect(() => t.addStep(step("x"))).toThrow(TerminalStateError);
    expect(() => t.complete()).toThrow(TerminalStateError);
    expect(codeOf(() => t.cancel())).toBe("TERMINAL_STATE");
  });

  it("doble confirmación de paso", () => {
    const t = task([step("s1"), step("s2")], "IN_PROGRESS");
    t.confirmStep("s1", 2);
    expect(() => t.confirmStep("s1", 1)).toThrow(StepAlreadyResolvedError);
    expect(codeOf(() => t.confirmStep("s1", 1))).toBe("STEP_ALREADY_RESOLVED");
  });

  it("no se opera sobre pasos EXCEPTION o SKIPPED", () => {
    const s = step("s1");
    s.reportException();
    expect(() => s.scan(1)).toThrow(StepAlreadyResolvedError);
    expect(() => s.skip()).toThrow(StepAlreadyResolvedError);
    expect(() => s.reportException()).toThrow(StepAlreadyResolvedError);
  });

  it("completar con pasos PENDING falla y no muta", () => {
    const t = task();
    t.confirmStep("s1", 2);
    expect(() => t.complete()).toThrow(PendingStepsError);
    expect(codeOf(() => t.complete())).toBe("TASK_HAS_PENDING_STEPS");
    expect(t.status).toBe("PENDING");
  });

  it("paso inexistente", () => {
    expect(() => task().confirmStep("nope", 1)).toThrow(StepNotFoundError);
    expect(codeOf(() => task().reportStepException("nope"))).toBe("STEP_NOT_FOUND");
  });

  it("sobre-escaneo y cantidades inválidas no mutan el paso", () => {
    const s = step("s1", 2);
    expect(() => s.scan(3)).toThrow(ScanExceedsExpectedError);
    for (const bad of [0, -1, Number.NaN, Infinity, 0.00001]) {
      expect(() => s.scan(bad)).toThrow(InvalidQuantityError);
    }
    expect([s.scannedQty, s.status]).toEqual([0, "PENDING"]);
  });

  it("construcción inválida de paso", () => {
    expect(() => new TaskStep({ id: "x", expectedQty: 0 })).toThrow(InvalidQuantityError);
    expect(() => new TaskStep({ id: "x", expectedQty: 1, scannedQty: 2 })).toThrow(InvalidQuantityError);
  });

  it("escalar excepción sobre tarea ya en EXCEPTION falla sin dejar mutaciones", () => {
    const t = task([step("s1"), step("s2")], "EXCEPTION");
    expect(() => t.escalateStepException("s1")).toThrow(InvalidStateTransitionError);
    expect(t.steps.map((s) => s.status)).toEqual(["PENDING", "PENDING"]);
  });
});
