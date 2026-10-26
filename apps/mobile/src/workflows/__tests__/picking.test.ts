// apps/mobile/src/workflows/__tests__/picking.test.ts
// Suite de tests unitarios para el flujo móvil de Picking y Packing paso a paso (@wms/mobile):
// recorrido por ubicación (locationCode ASC), doble validación de escaneo (Ubicación -> Producto)
// y formateo de excepciones/re-asignaciones en tiempo real (F3.2 / F3.3).

import { describe, expect, it } from "vitest";
import type { TaskStepDTO } from "@wms/shared-types";
import type { ConfirmTaskStepResponse } from "../../api/client.js";
import {
  advanceDualScanState,
  createInitialDualScanState,
  formatPickingExceptionFeedback,
  getNextPickingStep,
  sortPickingStepsByLocation,
  validateLocationScan,
  validateProductScan,
} from "../picking.js";

const SAMPLE_PICKING_STEPS: TaskStepDTO[] = [
  {
    id: "step-b2",
    sequence: 3,
    locationId: "loc-b2",
    locationCode: "B-02-01",
    productId: "prod-2",
    productSku: "SKU-MOUSE-02",
    productName: "Mouse Inalámbrico Pro",
    productBarcode: "7509998887776",
    expectedQty: 4,
    scannedQty: 0,
    status: "PENDING",
  },
  {
    id: "step-a1-seq2",
    sequence: 2,
    locationId: "loc-a1",
    locationCode: "A-01-01",
    productId: "prod-3",
    productSku: "SKU-PAD-03",
    productName: "Mousepad XL",
    productBarcode: null,
    expectedQty: 2,
    scannedQty: 0,
    status: "PENDING",
  },
  {
    id: "step-a1-seq1",
    sequence: 1,
    locationId: "loc-a1",
    locationCode: "A-01-01",
    productId: "prod-1",
    productSku: "SKU-KB-01",
    productName: "Teclado Mecánico RGB",
    productBarcode: "7501112223334",
    expectedQty: 5,
    scannedQty: 5,
    status: "COMPLETED",
  },
  {
    id: "step-a2-exc",
    sequence: 4,
    locationId: "loc-a2",
    locationCode: "A-02-01",
    productId: "prod-1",
    productSku: "SKU-KB-01",
    productName: "Teclado Mecánico RGB",
    productBarcode: "7501112223334",
    expectedQty: 3,
    scannedQty: 0,
    status: "EXCEPTION",
  },
];

describe("picking workflows (@wms/mobile)", () => {
  it("sorts picking steps by locationCode ASC and breaks ties by sequence ASC without mutating input", () => {
    const originalCopy = [...SAMPLE_PICKING_STEPS];
    const sorted = sortPickingStepsByLocation(SAMPLE_PICKING_STEPS);

    expect(SAMPLE_PICKING_STEPS).toEqual(originalCopy);
    expect(sorted.map((s) => s.id)).toEqual([
      "step-a1-seq1", // A-01-01 (seq 1)
      "step-a1-seq2", // A-01-01 (seq 2)
      "step-a2-exc", // A-02-01 (seq 4)
      "step-b2", // B-02-01 (seq 3)
    ]);
  });

  it("returns the next PENDING picking step following locationCode ASC / sequence ASC", () => {
    // step-a1-seq1 is COMPLETED, so the first PENDING in locationCode ASC order is step-a1-seq2
    const next = getNextPickingStep(SAMPLE_PICKING_STEPS);
    expect(next?.id).toBe("step-a1-seq2");
    expect(next?.locationCode).toBe("A-01-01");

    // When all steps are COMPLETED or EXCEPTION, returns null
    const finishedSteps: TaskStepDTO[] = SAMPLE_PICKING_STEPS.map((s) => ({
      ...s,
      status: s.status === "EXCEPTION" ? "EXCEPTION" : "COMPLETED",
    }));
    expect(getNextPickingStep(finishedSteps)).toBeNull();
  });

  it("validates location scan case-insensitively and rejects empty or mismatched codes", () => {
    const step = { locationCode: "A-01-01" };

    expect(validateLocationScan(step, "A-01-01")).toBe(true);
    expect(validateLocationScan(step, "  a-01-01 \n")).toBe(true);
    expect(validateLocationScan(step, "B-02-01")).toBe(false);
    expect(validateLocationScan(step, "   ")).toBe(false);
    expect(validateLocationScan({ locationCode: "  " }, "A-01-01")).toBe(false);
  });

  it("validates product scan against either productBarcode or productSku", () => {
    const stepWithBarcode = {
      productSku: "SKU-KB-01",
      productBarcode: "7501112223334",
    };

    expect(validateProductScan(stepWithBarcode, "7501112223334")).toBe(true);
    expect(validateProductScan(stepWithBarcode, " sku-kb-01 ")).toBe(true);
    expect(validateProductScan(stepWithBarcode, "A-01-01")).toBe(false);
    expect(validateProductScan(stepWithBarcode, "")).toBe(false);

    const stepWithoutBarcode = {
      productSku: "SKU-PAD-03",
      productBarcode: null,
    };

    expect(validateProductScan(stepWithoutBarcode, "SKU-PAD-03")).toBe(true);
    expect(validateProductScan(stepWithoutBarcode, "7501112223334")).toBe(
      false,
    );
  });

  it("advances dual scan state machine through 1st Location scan -> 2nd Product scan -> READY_TO_CONFIRM", () => {
    const step = SAMPLE_PICKING_STEPS[0]!; // B-02-01, SKU-MOUSE-02, barcode 7509998887776
    const initial = createInitialDualScanState(step.id);
    expect(initial).toEqual({
      stepId: "step-b2",
      stage: "AWAITING_LOCATION",
      verifiedLocationCode: null,
      matchedProductCode: null,
    });

    // Step 1: Scan location B-02-01
    const afterLocation = advanceDualScanState(initial, step, " b-02-01 ");
    expect(afterLocation).toEqual({
      valid: true,
      nextStage: "AWAITING_PRODUCT",
      verifiedLocationCode: "B-02-01",
      matchedProductCode: null,
    });

    // Step 2: Scan product barcode 7509998887776
    const stateAfterLoc = {
      stepId: step.id,
      stage: afterLocation.nextStage,
      verifiedLocationCode: afterLocation.verifiedLocationCode,
      matchedProductCode: afterLocation.matchedProductCode,
    };

    const afterProduct = advanceDualScanState(
      stateAfterLoc,
      step,
      "7509998887776",
    );
    expect(afterProduct).toEqual({
      valid: true,
      nextStage: "READY_TO_CONFIRM",
      verifiedLocationCode: "B-02-01",
      matchedProductCode: "7509998887776",
    });
  });

  it("rejects out-of-order or invalid scans in advanceDualScanState with INVALID_SCAN and resets when stepId changes", () => {
    const stepWithBarcode = SAMPLE_PICKING_STEPS[0]!; // B-02-01, SKU-MOUSE-02, 7509998887776
    const stepNoBarcode = SAMPLE_PICKING_STEPS[1]!; // A-01-01, SKU-PAD-03, barcode null

    // 1. Empty scan rejected
    const emptyRes = advanceDualScanState(
      createInitialDualScanState(stepWithBarcode.id),
      stepWithBarcode,
      "   ",
    );
    expect(emptyRes.valid).toBe(false);
    expect(emptyRes.errorCode).toBe("INVALID_SCAN");
    expect(emptyRes.nextStage).toBe("AWAITING_LOCATION");

    // 2. Scanning product barcode while still AWAITING_LOCATION fails
    const prematureProductRes = advanceDualScanState(
      createInitialDualScanState(stepWithBarcode.id),
      stepWithBarcode,
      "7509998887776",
    );
    expect(prematureProductRes.valid).toBe(false);
    expect(prematureProductRes.errorCode).toBe("INVALID_SCAN");
    expect(prematureProductRes.nextStage).toBe("AWAITING_LOCATION");
    expect(prematureProductRes.verifiedLocationCode).toBeNull();
    expect(prematureProductRes.errorMessage).toContain("B-02-01");

    // 3. Scanning wrong product while AWAITING_PRODUCT keeps location verified and stays in AWAITING_PRODUCT
    const awaitingProductState = {
      stepId: stepWithBarcode.id,
      stage: "AWAITING_PRODUCT" as const,
      verifiedLocationCode: "B-02-01",
      matchedProductCode: null,
    };
    const wrongProdRes = advanceDualScanState(
      awaitingProductState,
      stepWithBarcode,
      "WRONG-SKU-999",
    );
    expect(wrongProdRes.valid).toBe(false);
    expect(wrongProdRes.errorCode).toBe("INVALID_SCAN");
    expect(wrongProdRes.nextStage).toBe("AWAITING_PRODUCT");
    expect(wrongProdRes.verifiedLocationCode).toBe("B-02-01");
    expect(wrongProdRes.errorMessage).toContain(
      "SKU-MOUSE-02 / 7509998887776",
    );

    // 4. Wrong product on a step without barcode formats error message with SKU only
    const wrongProdNoBarcode = advanceDualScanState(
      {
        stepId: stepNoBarcode.id,
        stage: "AWAITING_PRODUCT",
        verifiedLocationCode: "A-01-01",
        matchedProductCode: null,
      },
      stepNoBarcode,
      "BAD-CODE",
    );
    expect(wrongProdNoBarcode.valid).toBe(false);
    expect(wrongProdNoBarcode.errorMessage).toContain("(SKU-PAD-03)");

    // 5. State from a previous stepId automatically resets to AWAITING_LOCATION for the new step
    const staleStateTransition = advanceDualScanState(
      awaitingProductState, // belongs to step-b2
      stepNoBarcode, // step-a1-seq2
      "A-01-01",
    );
    expect(staleStateTransition.valid).toBe(true);
    expect(staleStateTransition.nextStage).toBe("AWAITING_PRODUCT");
    expect(staleStateTransition.verifiedLocationCode).toBe("A-01-01");
  });

  it("formats picking exception feedback for automatic reallocation (F3.2) and for ON_HOLD fallback", () => {
    const step = {
      sequence: 1,
      locationCode: "A-01-01",
      productSku: "SKU-KB-01",
    };

    const reallocatedResponse: ConfirmTaskStepResponse = {
      stepId: "step-1",
      scannedQty: 2,
      expectedQty: 5,
      remainingQty: 3,
      stepStatus: "EXCEPTION",
      taskStatus: "IN_PROGRESS",
      taskComplete: false,
      reallocated: true,
      orderStatus: "PICKING",
      replacementSteps: [
        {
          id: "step-rep-1",
          locationId: "loc-a2",
          locationCode: "A-02-01",
          expectedQty: 2,
        },
        {
          id: "step-rep-2",
          locationId: "loc-b1",
          locationCode: "B-01-01",
          expectedQty: 1,
        },
      ],
    };

    const reallocatedFeedback = formatPickingExceptionFeedback(
      reallocatedResponse,
      step,
    );
    expect(reallocatedFeedback.reallocated).toBe(true);
    expect(reallocatedFeedback.orderStatus).toBe("PICKING");
    expect(reallocatedFeedback.severity).toBe("info");
    expect(reallocatedFeedback.replacementLocations).toEqual([
      "A-02-01 (2 uds)",
      "B-01-01 (1 uds)",
    ]);
    expect(reallocatedFeedback.summary).toContain(
      "A-02-01 (2 uds), B-01-01 (1 uds)",
    );

    // Fallback when reallocated is true but replacementSteps is undefined
    const reallocatedEmptyList = formatPickingExceptionFeedback(
      {
        ...reallocatedResponse,
        replacementSteps: undefined,
        orderStatus: undefined,
      },
      step,
    );
    expect(reallocatedEmptyList.reallocated).toBe(true);
    expect(reallocatedEmptyList.orderStatus).toBe("PICKING");
    expect(reallocatedEmptyList.summary).toContain("ubicaciones alternativas");

    // ON_HOLD case when no alternative ATP stock exists
    const onHoldResponse: ConfirmTaskStepResponse = {
      stepId: "step-1",
      scannedQty: 0,
      expectedQty: 5,
      remainingQty: 5,
      stepStatus: "EXCEPTION",
      taskStatus: "EXCEPTION",
      taskComplete: false,
      reallocated: false,
      orderStatus: "ON_HOLD",
      replacementSteps: [],
    };

    const onHoldFeedback = formatPickingExceptionFeedback(onHoldResponse, step);
    expect(onHoldFeedback.reallocated).toBe(false);
    expect(onHoldFeedback.orderStatus).toBe("ON_HOLD");
    expect(onHoldFeedback.severity).toBe("warning");
    expect(onHoldFeedback.replacementLocations).toEqual([]);
    expect(onHoldFeedback.title).toContain("ON_HOLD");
    expect(onHoldFeedback.summary).toContain("ON_HOLD");
  });
});
