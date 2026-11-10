/**
 * Error base del dominio. `code` es estable (contrato): los adaptadores
 * (API, web, mobile) lo mapean a HTTP / UI sin depender del mensaje.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Cantidad no finita, negativa, cero (cuando se exige positiva) o con más de 4 decimales. */
export class InvalidQuantityError extends DomainError {
  readonly code = "INVALID_QUANTITY";
}

/** Se pide retirar más stock del disponible (onHand - allocated). */
export class InsufficientStockError extends DomainError {
  readonly code = "INSUFFICIENT_STOCK";
}

/** Se pide asignar más que el disponible (sobre-asignación). */
export class OverAllocationError extends DomainError {
  readonly code = "OVER_ALLOCATION";
}

/** Se libera/consume más de lo asignado. */
export class ExceedsAllocatedError extends DomainError {
  readonly code = "EXCEEDS_ALLOCATED";
}

/** Un ajuste dejaría onHand por debajo de lo ya asignado. */
export class InvariantViolationError extends DomainError {
  readonly code = "INVARIANT_VIOLATION";
}

/** Transición de estado no permitida (incluye retrocesos). */
export class InvalidStateTransitionError extends DomainError {
  readonly code = "INVALID_STATE_TRANSITION";
}

/** Se intenta operar sobre una entidad en estado terminal. */
export class TerminalStateError extends DomainError {
  readonly code = "TERMINAL_STATE";
}

/** El paso ya fue resuelto (doble confirmación, excepción previa, omitido). */
export class StepAlreadyResolvedError extends DomainError {
  readonly code = "STEP_ALREADY_RESOLVED";
}

/** El paso no pertenece a la tarea. */
export class StepNotFoundError extends DomainError {
  readonly code = "STEP_NOT_FOUND";
}

/** Se intenta completar una tarea con pasos aún PENDING. */
export class PendingStepsError extends DomainError {
  readonly code = "TASK_HAS_PENDING_STEPS";
}

/** El escaneo superaría la cantidad esperada del paso. */
export class ScanExceedsExpectedError extends DomainError {
  readonly code = "SCAN_EXCEEDS_EXPECTED";
}
