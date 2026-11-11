// apps/api/src/shared/domain-error-mapper.ts
// Mapeador de excepciones de dominio (DomainError de @wms/domain)
// a errores de contrato de la API (WmsError de @wms/shared-types).
// Conserva de forma estricta los códigos HTTP y códigos públicos actuales (CP-3, CP-7).

import {
  DomainError,
  ExceedsAllocatedError,
  InsufficientStockError,
  InvalidQuantityError,
  InvalidStateTransitionError,
  InvariantViolationError,
  OverAllocationError,
  PendingStepsError,
  ScanExceedsExpectedError,
  StepAlreadyResolvedError,
  StepNotFoundError,
  TerminalStateError,
} from "@wms/domain";
import { WmsError } from "../plugins/error-handler.js";

/**
 * Traduce un DomainError a su correspondiente WmsError respetando
 * el código de error público y el status HTTP esperado por los clientes.
 */
export function domainErrorToWmsError(error: DomainError): WmsError {
  if (error instanceof InvalidQuantityError) {
    return new WmsError("VALIDATION_ERROR", error.message, 422, error.details);
  }

  if (error instanceof InsufficientStockError || error instanceof OverAllocationError) {
    return new WmsError("INSUFFICIENT_STOCK", error.message, 409, error.details);
  }

  if (error instanceof StepNotFoundError) {
    return new WmsError("TASK_NOT_FOUND", error.message, 404, error.details);
  }

  if (error instanceof ScanExceedsExpectedError) {
    return new WmsError("VALIDATION_ERROR", error.message, 422, error.details);
  }

  if (
    error instanceof ExceedsAllocatedError ||
    error instanceof InvariantViolationError ||
    error instanceof InvalidStateTransitionError ||
    error instanceof TerminalStateError ||
    error instanceof StepAlreadyResolvedError ||
    error instanceof PendingStepsError
  ) {
    return new WmsError("VALIDATION_ERROR", error.message, 409, error.details);
  }

  return new WmsError("VALIDATION_ERROR", error.message, 400, error.details);
}

/**
 * Si el error capturado es un DomainError, lo mapea a WmsError y lo relanza;
 * de lo contrario, relanza el error original.
 */
export function rethrowDomainErrorAsWmsError(err: unknown): never {
  if (err instanceof DomainError) {
    throw domainErrorToWmsError(err);
  }
  throw err;
}
