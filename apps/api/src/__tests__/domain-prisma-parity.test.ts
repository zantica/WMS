// apps/api/src/__tests__/domain-prisma-parity.test.ts
// Test de paridad entre enums de @wms/domain y enums generados de Prisma (@wms/db),
// además de validar el mapeo completo de DomainError -> WmsError (contratos CP-3).

import { describe, it, expect } from "vitest";
import {
  OrderStatus as PrismaOrderStatus,
  StepStatus as PrismaStepStatus,
  TaskStatus as PrismaTaskStatus,
  TxReason as PrismaTxReason,
} from "@wms/db";
import {
  DomainError,
  ExceedsAllocatedError,
  InsufficientStockError,
  InvalidQuantityError,
  InvalidStateTransitionError,
  InvariantViolationError,
  ORDER_STATUSES,
  OverAllocationError,
  PendingStepsError,
  STEP_STATUSES,
  ScanExceedsExpectedError,
  StepAlreadyResolvedError,
  StepNotFoundError,
  TASK_STATUSES,
  TX_REASONS,
  TerminalStateError,
} from "@wms/domain";
import { domainErrorToWmsError } from "../shared/domain-error-mapper.js";
import { WmsError } from "../plugins/error-handler.js";

describe("Paridad @wms/domain <-> Prisma (@wms/db)", () => {
  it("TASK_STATUSES coincide exactamente con Prisma TaskStatus", () => {
    const prismaValues = Object.values(PrismaTaskStatus).sort();
    const domainValues = [...TASK_STATUSES].sort();
    expect(domainValues).toEqual(prismaValues);
  });

  it("STEP_STATUSES coincide exactamente con Prisma StepStatus", () => {
    const prismaValues = Object.values(PrismaStepStatus).sort();
    const domainValues = [...STEP_STATUSES].sort();
    expect(domainValues).toEqual(prismaValues);
  });

  it("ORDER_STATUSES coincide exactamente con Prisma OrderStatus", () => {
    const prismaValues = Object.values(PrismaOrderStatus).sort();
    const domainValues = [...ORDER_STATUSES].sort();
    expect(domainValues).toEqual(prismaValues);
  });

  it("TX_REASONS coincide exactamente con Prisma TxReason", () => {
    const prismaValues = Object.values(PrismaTxReason).sort();
    const domainValues = [...TX_REASONS].sort();
    expect(domainValues).toEqual(prismaValues);
  });

  it("mapea todas las subclases de DomainError a WmsError conservando los códigos públicos", () => {
    class CustomDomainError extends DomainError {
      readonly code = "CUSTOM_DOMAIN";
    }

    const cases: Array<[DomainError, string, number]> = [
      [new InvalidQuantityError("bad qty", { value: -1 }), "VALIDATION_ERROR", 422],
      [new InsufficientStockError("no stock"), "INSUFFICIENT_STOCK", 409],
      [new OverAllocationError("over alloc"), "INSUFFICIENT_STOCK", 409],
      [new ExceedsAllocatedError("exceeds"), "VALIDATION_ERROR", 409],
      [new InvariantViolationError("inv"), "VALIDATION_ERROR", 409],
      [new InvalidStateTransitionError("trans"), "VALIDATION_ERROR", 409],
      [new TerminalStateError("term"), "VALIDATION_ERROR", 409],
      [new StepAlreadyResolvedError("resolved"), "VALIDATION_ERROR", 409],
      [new StepNotFoundError("not found"), "TASK_NOT_FOUND", 404],
      [new PendingStepsError("pending"), "VALIDATION_ERROR", 409],
      [new ScanExceedsExpectedError("overscan"), "VALIDATION_ERROR", 422],
      [new CustomDomainError("generic"), "VALIDATION_ERROR", 400],
    ];

    for (const [domainErr, expectedCode, expectedStatus] of cases) {
      const mapped = domainErrorToWmsError(domainErr);
      expect(mapped).toBeInstanceOf(WmsError);
      expect(mapped.code).toBe(expectedCode);
      expect(mapped.statusCode).toBe(expectedStatus);
      expect(mapped.message).toBe(domainErr.message);
    }
  });
});
