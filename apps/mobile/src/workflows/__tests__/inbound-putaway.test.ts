// apps/mobile/src/workflows/__tests__/inbound-putaway.test.ts
// Suite de tests unitarios para la lógica de Recepción (Inbound RECEIVING),
// Putaway (PUTAWAY), cálculo de progreso y mapeo de errores de dominio en @wms/mobile.

import { describe, expect, it } from "vitest";
import type { TaskStepDTO } from "@wms/shared-types";
import { WmsApiClientError } from "../../api/client.js";
import {
  calculateTaskProgress,
  formatDomainErrorBanner,
  getNextActiveStep,
  getRemainingStepQty,
  matchReceivingStepByScan,
  normalizeScanCode,
  resolveTaskExecutionRoute,
} from "../inbound-putaway.js";

const SAMPLE_STEPS: TaskStepDTO[] = [
  {
    id: "step-2",
    sequence: 2,
    locationId: "loc-recv-1",
    locationCode: "RECV-01",
    productId: "prod-2",
    productSku: "SKU-MOUSE-02",
    productName: "Mouse Inalámbrico",
    productBarcode: "7509998887776",
    expectedQty: 15,
    scannedQty: 5,
    status: "PENDING",
  },
  {
    id: "step-1",
    sequence: 1,
    locationId: "loc-recv-1",
    locationCode: "RECV-01",
    productId: "prod-1",
    productSku: "SKU-KB-01",
    productName: "Teclado Mecánico",
    productBarcode: "7501112223334",
    expectedQty: 10,
    scannedQty: 10,
    status: "COMPLETED",
  },
  {
    id: "step-3",
    sequence: 3,
    locationId: "loc-recv-1",
    locationCode: "RECV-01",
    productId: "prod-1",
    productSku: "SKU-KB-01",
    productName: "Teclado Mecánico (Lote Adicional)",
    productBarcode: "7501112223334",
    expectedQty: 5,
    scannedQty: 0,
    status: "PENDING",
  },
];

describe("inbound-putaway workflows (@wms/mobile)", () => {
  it("normalizes scanned codes and computes remaining step quantity safely", () => {
    expect(normalizeScanCode("  sku-kb-01 \n")).toBe("SKU-KB-01");
    expect(getRemainingStepQty({ expectedQty: 15, scannedQty: 5 })).toBe(10);
    expect(getRemainingStepQty({ expectedQty: 10, scannedQty: 12 })).toBe(0);
  });

  it("matches receiving steps by barcode, SKU, or productId and prioritizes PENDING steps", () => {
    // prod-1 appears in step-1 (COMPLETED) and step-3 (PENDING); should prioritize step-3
    const byBarcode = matchReceivingStepByScan(
      SAMPLE_STEPS,
      " 7501112223334 ",
    );
    expect(byBarcode?.id).toBe("step-3");

    // Matches PENDING step by SKU case-insensitively
    const bySku = matchReceivingStepByScan(SAMPLE_STEPS, "sku-mouse-02");
    expect(bySku?.id).toBe("step-2");

    // Matches by productId
    const byProductId = matchReceivingStepByScan(SAMPLE_STEPS, "PROD-2");
    expect(byProductId?.id).toBe("step-2");

    // Falls back to COMPLETED step if no PENDING step matches that product
    const completedOnlySteps: TaskStepDTO[] = [SAMPLE_STEPS[1]!];
    const completedMatch = matchReceivingStepByScan(
      completedOnlySteps,
      "SKU-KB-01",
    );
    expect(completedMatch?.id).toBe("step-1");

    // Returns null on empty code or unknown code
    expect(matchReceivingStepByScan(SAMPLE_STEPS, "   ")).toBeNull();
    expect(matchReceivingStepByScan(SAMPLE_STEPS, "UNKNOWN-999")).toBeNull();
  });

  it("returns the next active PENDING step ordered by sequence ASC", () => {
    const next = getNextActiveStep(SAMPLE_STEPS);
    expect(next?.id).toBe("step-2");
    expect(next?.sequence).toBe(2);

    const allDone: TaskStepDTO[] = SAMPLE_STEPS.map((s) => ({
      ...s,
      status: "COMPLETED",
    }));
    expect(getNextActiveStep(allDone)).toBeNull();
  });

  it("calculates task progress across steps and units including edge cases", () => {
    const progress = calculateTaskProgress({ steps: SAMPLE_STEPS });
    expect(progress).toEqual({
      completedSteps: 1,
      totalSteps: 3,
      expectedUnits: 30,
      scannedUnits: 15,
      remainingUnits: 15,
      percent: 50,
    });

    // Edge case: task with 0 expected units but steps present
    const zeroUnitsProgress = calculateTaskProgress({
      steps: [
        {
          ...SAMPLE_STEPS[0]!,
          expectedQty: 0,
          scannedQty: 0,
          status: "COMPLETED",
        },
        {
          ...SAMPLE_STEPS[1]!,
          expectedQty: 0,
          scannedQty: 0,
          status: "PENDING",
        },
      ],
    });
    expect(zeroUnitsProgress.percent).toBe(50);

    // Edge case: empty steps list
    const emptyProgress = calculateTaskProgress({ steps: [] });
    expect(emptyProgress).toEqual({
      completedSteps: 0,
      totalSteps: 0,
      expectedUnits: 0,
      scannedUnits: 0,
      remainingUnits: 0,
      percent: 0,
    });
  });

  it("resolves Expo Router execution routes for RECEIVING, PUTAWAY, PICKING, and PACKING tasks", () => {
    expect(
      resolveTaskExecutionRoute({ id: "task-rec-1", type: "RECEIVING" }),
    ).toBe("/tasks/receiving/task-rec-1");
    expect(
      resolveTaskExecutionRoute({ id: "task-put-1", type: "PUTAWAY" }),
    ).toBe("/tasks/putaway/task-put-1");
    expect(
      resolveTaskExecutionRoute({ id: "task-pick-1", type: "PICKING" }),
    ).toBe("/tasks/picking/task-pick-1");
    expect(
      resolveTaskExecutionRoute({ id: "task-pack-1", type: "PACKING" }),
    ).toBe("/tasks/picking/task-pack-1");
  });

  it("formats domain errors (INVALID_SCAN, INSUFFICIENT_STOCK, WRONG_STEP_SEQUENCE, etc.) into actionable operator banners", () => {
    const invalidScanBanner = formatDomainErrorBanner(
      new WmsApiClientError(
        "INVALID_SCAN",
        'Scanned code "BAD-CODE" does not match location A-01-01',
        422,
      ),
    );
    expect(invalidScanBanner.code).toBe("INVALID_SCAN");
    expect(invalidScanBanner.severity).toBe("error");
    expect(invalidScanBanner.title).toContain("Código Escaneado Inválido");

    const stockBanner = formatDomainErrorBanner(
      new WmsApiClientError(
        "INSUFFICIENT_STOCK",
        "Insufficient stock in RECV-01",
        409,
      ),
    );
    expect(stockBanner.code).toBe("INSUFFICIENT_STOCK");
    expect(stockBanner.severity).toBe("error");
    expect(stockBanner.title).toContain("Stock Insuficiente");

    const sequenceBanner = formatDomainErrorBanner(
      new WmsApiClientError(
        "WRONG_STEP_SEQUENCE",
        "Task is already completed",
        422,
      ),
    );
    expect(sequenceBanner.code).toBe("WRONG_STEP_SEQUENCE");
    expect(sequenceBanner.severity).toBe("warning");

    const locBanner = formatDomainErrorBanner(
      new WmsApiClientError(
        "LOCATION_NOT_FOUND",
        "No receiving location found",
        404,
      ),
    );
    expect(locBanner.code).toBe("LOCATION_NOT_FOUND");

    const prodBanner = formatDomainErrorBanner(
      new WmsApiClientError("PRODUCT_NOT_FOUND", "Product not in task", 404),
    );
    expect(prodBanner.code).toBe("PRODUCT_NOT_FOUND");

    const taskBanner = formatDomainErrorBanner(
      new WmsApiClientError("TASK_NOT_FOUND", "Task missing", 404),
    );
    expect(taskBanner.code).toBe("TASK_NOT_FOUND");
    expect(taskBanner.severity).toBe("warning");

    const authBanner = formatDomainErrorBanner(
      new WmsApiClientError("UNAUTHORIZED", "Invalid API key", 401),
    );
    expect(authBanner.code).toBe("UNAUTHORIZED");

    const netBanner = formatDomainErrorBanner(
      new WmsApiClientError("NETWORK_ERROR", "Timeout", 0),
    );
    expect(netBanner.code).toBe("NETWORK_ERROR");
    expect(netBanner.severity).toBe("warning");

    const fallbackWmsBanner = formatDomainErrorBanner(
      new WmsApiClientError("VALIDATION_ERROR", "Invalid quantity", 400),
    );
    expect(fallbackWmsBanner.code).toBe("VALIDATION_ERROR");

    const genericErrorBanner = formatDomainErrorBanner(
      new Error("Unexpected crash"),
    );
    expect(genericErrorBanner.code).toBe("UNKNOWN_ERROR");
    expect(genericErrorBanner.message).toBe("Unexpected crash");

    const nonErrorBanner = formatDomainErrorBanner("raw string error");
    expect(nonErrorBanner.code).toBe("UNKNOWN_ERROR");
  });
});
