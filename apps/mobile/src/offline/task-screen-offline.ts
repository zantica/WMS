// apps/mobile/src/offline/task-screen-offline.ts
// Helpers compartidos para la orquestación offline de pantallas de tareas (@wms/mobile).
// Elimina la duplicación de validación, encolamiento y optimismo entre Putaway, Picking y Receiving.

import type {
  ConfirmReceiptLinePayload,
  ConfirmTaskStepPayload,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import { WmsApiClientError } from "../api/client.js";
import {
  formatDomainErrorBanner,
  type DomainErrorBanner,
} from "../workflows/inbound-putaway.js";
import type { LocalTaskCache } from "./local-task-cache.js";

export interface OfflineTaskLoadResult {
  readonly task: WarehouseTaskDTO | null;
  readonly domainError: DomainErrorBanner | null;
}

/**
 * Carga una tarea desde la caché local cuando la terminal está offline o ante caída de red.
 */
export function handleOfflineTaskLoad(
  taskId: string,
  cache: LocalTaskCache,
  customMissingMessage?: string,
): OfflineTaskLoadResult {
  const cached = cache.getTask(taskId);
  if (cached) {
    return { task: cached, domainError: null };
  }
  return {
    task: null,
    domainError: {
      title: "Tarea no disponible offline",
      message:
        customMissingMessage ??
        "Esta tarea no fue descargada previamente en la caché local.",
      actionHint:
        "Conecta la terminal a la red para descargar las tareas de almacén.",
      severity: "warning",
      code: "OFFLINE_CACHE_MISS",
    },
  };
}

export interface OfflineStepConfirmationParams {
  readonly cache: LocalTaskCache;
  readonly enqueueStepConfirmation: (
    payload: ConfirmTaskStepPayload,
  ) => Promise<unknown>;
  readonly taskId: string;
  readonly stepId: string;
  readonly scannedCode: string;
  readonly quantity: number;
}

export interface OfflineConfirmationResult {
  readonly success: boolean;
  readonly updatedTask?: WarehouseTaskDTO;
  readonly error?: DomainErrorBanner;
}

/**
 * Valida un escaneo contra la caché local, encola la mutación offline y aplica el cambio optimista.
 */
export async function handleOfflineStepConfirmation(
  params: OfflineStepConfirmationParams,
): Promise<OfflineConfirmationResult> {
  const {
    cache,
    enqueueStepConfirmation,
    taskId,
    stepId,
    scannedCode,
    quantity,
  } = params;

  const val = cache.validateScan(taskId, stepId, scannedCode, quantity);
  if (!val.isValid) {
    return {
      success: false,
      error: formatDomainErrorBanner(
        new WmsApiClientError(
          val.code ?? "INVALID_SCAN",
          val.message ?? "Error de validación offline.",
          422,
        ),
      ),
    };
  }

  try {
    await enqueueStepConfirmation({
      taskId,
      stepId,
      scannedCode,
      quantity,
    });

    const updatedTask = cache.applyOptimisticStep(taskId, stepId, quantity);
    return {
      success: true,
      updatedTask,
    };
  } catch (enqueueErr) {
    return {
      success: false,
      error: formatDomainErrorBanner(
        new WmsApiClientError(
          "OFFLINE_QUEUE_ERROR",
          enqueueErr instanceof Error
            ? enqueueErr.message
            : "No se pudo guardar la mutación en la cola offline.",
          500,
        ),
      ),
    };
  }
}

export interface OfflineReceiptLineConfirmationParams {
  readonly cache: LocalTaskCache;
  readonly enqueueReceiptLineConfirmation: (
    payload: ConfirmReceiptLinePayload,
  ) => Promise<unknown>;
  readonly taskId: string;
  readonly productId: string;
  readonly scannedCode: string;
  readonly quantity: number;
}

/**
 * Valida una línea de recepción offline, encola en cola offline y actualiza optimísticamente el caché local.
 */
export async function handleOfflineReceiptLineConfirmation(
  params: OfflineReceiptLineConfirmationParams,
): Promise<OfflineConfirmationResult> {
  const {
    cache,
    enqueueReceiptLineConfirmation,
    taskId,
    productId,
    scannedCode,
    quantity,
  } = params;

  const val = cache.validateReceiptLine(
    taskId,
    productId,
    scannedCode,
    quantity,
  );
  if (!val.isValid) {
    return {
      success: false,
      error: formatDomainErrorBanner(
        new WmsApiClientError(
          val.code ?? "INVALID_SCAN",
          val.message ?? "Error en validación de recepción offline.",
          422,
        ),
      ),
    };
  }

  try {
    await enqueueReceiptLineConfirmation({
      taskId,
      productId,
      scannedQty: quantity,
      barcode: scannedCode,
    });

    const updatedTask = cache.applyOptimisticReceiptLine(
      taskId,
      productId,
      quantity,
    );
    return {
      success: true,
      updatedTask,
    };
  } catch (enqueueErr) {
    return {
      success: false,
      error: formatDomainErrorBanner(
        new WmsApiClientError(
          "OFFLINE_QUEUE_ERROR",
          enqueueErr instanceof Error
            ? enqueueErr.message
            : "No se pudo guardar la mutación en la cola offline.",
          500,
        ),
      ),
    };
  }
}
