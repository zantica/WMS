// apps/mobile/src/workflows/picking.ts
// Lógica pura de recorrido por ubicación (locationCode ASC), doble validación de escaneo
// (1º Ubicación STORAGE -> 2º Producto Barcode/SKU) y formateo de excepciones/re-asignaciones
// para el flujo móvil de Picking y Packing en @wms/mobile.
// Respeta las fronteras del monorepo: importa únicamente desde @wms/shared-types y módulos locales.

import type { OrderStatus, TaskStepDTO } from "@wms/shared-types";
import type {
  ConfirmTaskStepResponse,
  ReplacementStepSummary,
} from "../api/client.js";
import { normalizeScanCode } from "./inbound-putaway.js";

export type DualScanStage =
  | "AWAITING_LOCATION"
  | "AWAITING_PRODUCT"
  | "READY_TO_CONFIRM";

export interface DualScanState {
  stepId: string;
  stage: DualScanStage;
  verifiedLocationCode: string | null;
  matchedProductCode: string | null;
}

export interface DualScanTransition {
  valid: boolean;
  nextStage: DualScanStage;
  verifiedLocationCode: string | null;
  matchedProductCode: string | null;
  errorCode?: "INVALID_SCAN" | undefined;
  errorMessage?: string | undefined;
}

export interface PickingExceptionFeedback {
  reallocated: boolean;
  orderStatus: OrderStatus;
  severity: "info" | "warning";
  title: string;
  summary: string;
  actionHint: string;
  replacementLocations: string[];
  replacementSteps: ReplacementStepSummary[];
}

/**
 * Crea el estado inicial de la máquina de doble escaneo para un paso de Picking.
 */
export function createInitialDualScanState(stepId: string): DualScanState {
  return {
    stepId,
    stage: "AWAITING_LOCATION",
    verifiedLocationCode: null,
    matchedProductCode: null,
  };
}

/**
 * Ordena los pasos de una tarea de Picking según el recorrido físico del almacén:
 * `locationCode ASC` y desempate por `sequence ASC`.
 */
export function sortPickingStepsByLocation(
  steps: readonly TaskStepDTO[],
): TaskStepDTO[] {
  return [...steps].sort((a, b) => {
    const locA = normalizeScanCode(a.locationCode);
    const locB = normalizeScanCode(b.locationCode);
    if (locA < locB) return -1;
    if (locA > locB) return 1;
    return a.sequence - b.sequence;
  });
}

/**
 * Obtiene el siguiente paso activo (`PENDING`) de una tarea de Picking
 * respetando estrictamente el recorrido `locationCode ASC` / `sequence ASC`.
 */
export function getNextPickingStep(
  steps: readonly TaskStepDTO[],
): TaskStepDTO | null {
  const ordered = sortPickingStepsByLocation(steps);
  const nextPending = ordered.find((step) => step.status === "PENDING");
  return nextPending ?? null;
}

/**
 * Verifica si el código escaneado coincide con el código de ubicación STORAGE del paso (`step.locationCode`).
 */
export function validateLocationScan(
  step: Pick<TaskStepDTO, "locationCode">,
  scannedCode: string,
): boolean {
  const normalizedScanned = normalizeScanCode(scannedCode);
  const normalizedExpected = normalizeScanCode(step.locationCode);
  if (normalizedScanned.length === 0 || normalizedExpected.length === 0) {
    return false;
  }
  return normalizedScanned === normalizedExpected;
}

/**
 * Verifica si el código escaneado coincide con el código de barras (`productBarcode`)
 * o el SKU (`productSku`) del producto esperado en el paso de Picking.
 */
export function validateProductScan(
  step: Pick<TaskStepDTO, "productSku" | "productBarcode">,
  scannedCode: string,
): boolean {
  const normalizedScanned = normalizeScanCode(scannedCode);
  if (normalizedScanned.length === 0) {
    return false;
  }

  const normalizedSku = normalizeScanCode(step.productSku);
  if (normalizedSku.length > 0 && normalizedScanned === normalizedSku) {
    return true;
  }

  if (
    typeof step.productBarcode === "string" &&
    step.productBarcode.trim().length > 0
  ) {
    const normalizedBarcode = normalizeScanCode(step.productBarcode);
    if (normalizedScanned === normalizedBarcode) {
      return true;
    }
  }

  return false;
}

/**
 * Máquina de estados pura para la doble validación de escaneo en cada parada de Picking:
 * 1. `AWAITING_LOCATION`: exige escanear el código QR/etiqueta de la ubicación STORAGE (`step.locationCode`).
 * 2. `AWAITING_PRODUCT`: una vez verificada la ubicación, exige escanear el barcode o SKU del producto.
 * 3. `READY_TO_CONFIRM`: listo para enviar la confirmación de extracción a `@wms/api`.
 */
export function advanceDualScanState(
  state: DualScanState,
  step: Pick<
    TaskStepDTO,
    "id" | "locationCode" | "productSku" | "productBarcode"
  >,
  scannedCode: string,
): DualScanTransition {
  const baseState: DualScanState =
    state.stepId === step.id ? state : createInitialDualScanState(step.id);

  const normalizedScanned = normalizeScanCode(scannedCode);
  if (normalizedScanned.length === 0) {
    return {
      valid: false,
      nextStage: baseState.stage,
      verifiedLocationCode: baseState.verifiedLocationCode,
      matchedProductCode: baseState.matchedProductCode,
      errorCode: "INVALID_SCAN",
      errorMessage: "El código escaneado no puede estar vacío.",
    };
  }

  if (baseState.stage === "AWAITING_LOCATION") {
    if (validateLocationScan(step, normalizedScanned)) {
      return {
        valid: true,
        nextStage: "AWAITING_PRODUCT",
        verifiedLocationCode: normalizeScanCode(step.locationCode),
        matchedProductCode: null,
      };
    }

    return {
      valid: false,
      nextStage: "AWAITING_LOCATION",
      verifiedLocationCode: null,
      matchedProductCode: null,
      errorCode: "INVALID_SCAN",
      errorMessage: `El código escaneado "${normalizedScanned}" no coincide con la estantería STORAGE esperada (${step.locationCode}).`,
    };
  }

  // Etapa AWAITING_PRODUCT o re-escaneo en READY_TO_CONFIRM
  const verifiedLoc =
    baseState.verifiedLocationCode ?? normalizeScanCode(step.locationCode);

  if (validateProductScan(step, normalizedScanned)) {
    return {
      valid: true,
      nextStage: "READY_TO_CONFIRM",
      verifiedLocationCode: verifiedLoc,
      matchedProductCode: normalizedScanned,
    };
  }

  const expectedProductLabel =
    typeof step.productBarcode === "string" &&
    step.productBarcode.trim().length > 0
      ? `${step.productSku} / ${step.productBarcode}`
      : step.productSku;

  return {
    valid: false,
    nextStage: "AWAITING_PRODUCT",
    verifiedLocationCode: verifiedLoc,
    matchedProductCode: null,
    errorCode: "INVALID_SCAN",
    errorMessage: `El código escaneado "${normalizedScanned}" no corresponde al producto esperado (${expectedProductLabel}).`,
  };
}

/**
 * Formatea el resultado devuelto por `@wms/api` al reportar una excepción en un paso de Picking (`F3.2`),
 * indicando claramente si el stock faltante fue re-asignado a nuevas ubicaciones STORAGE
 * o si el pedido pasó a estado `ON_HOLD` por falta de stock alternativo.
 */
export function formatPickingExceptionFeedback(
  response: ConfirmTaskStepResponse,
  step: Pick<TaskStepDTO, "sequence" | "locationCode" | "productSku">,
): PickingExceptionFeedback {
  const replacementSteps: ReplacementStepSummary[] =
    response.replacementSteps ?? [];
  const replacementLocations = replacementSteps.map(
    (s) => `${s.locationCode} (${s.expectedQty} uds)`,
  );

  if (response.reallocated === true) {
    const orderStatus: OrderStatus = response.orderStatus ?? "PICKING";
    const locationsDetail =
      replacementLocations.length > 0
        ? replacementLocations.join(", ")
        : "ubicaciones alternativas";

    return {
      reallocated: true,
      orderStatus,
      severity: "info",
      title: "Stock Re-asignado a Nueva Ubicación",
      summary: `Incidencia registrada en parada #${step.sequence} (${step.locationCode} · ${step.productSku}). Se generaron nuevos pasos de extracción en: ${locationsDetail}.`,
      actionHint:
        "Dirígete a la nueva estantería STORAGE agregada al recorrido para completar el Picking.",
      replacementLocations,
      replacementSteps,
    };
  }

  const orderStatus: OrderStatus = response.orderStatus ?? "ON_HOLD";
  return {
    reallocated: false,
    orderStatus,
    severity: "warning",
    title: "Pedido en Espera (ON_HOLD) — Sin Stock Alternativo",
    summary: `Incidencia registrada en parada #${step.sequence} (${step.locationCode} · ${step.productSku}). No existe stock ATP suficiente en otras ubicaciones STORAGE; el pedido pasó a estado ${orderStatus}.`,
    actionHint:
      "Notifica al supervisor de almacén para reabastecimiento o ajuste de inventario.",
    replacementLocations: [],
    replacementSteps: [],
  };
}
