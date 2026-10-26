// apps/mobile/src/workflows/inbound-putaway.ts
// Lógica pura de resolución de escaneo, cálculo de progreso y mapeo de errores de dominio
// para los flujos móviles de Recepción (Inbound RECEIVING) y Putaway (PUTAWAY).
// Respeta las fronteras del monorepo: importa únicamente desde @wms/shared-types y módulos locales.

import type {
  TaskStepDTO,
  TaskType,
  WarehouseTaskDTO,
  WmsErrorCode,
} from "@wms/shared-types";
import { WmsApiClientError } from "../api/client";

export interface TaskProgressSummary {
  completedSteps: number;
  totalSteps: number;
  expectedUnits: number;
  scannedUnits: number;
  remainingUnits: number;
  percent: number;
}

export type ErrorBannerSeverity = "error" | "warning";

export interface DomainErrorBanner {
  code: WmsErrorCode | string;
  title: string;
  message: string;
  actionHint: string;
  severity: ErrorBannerSeverity;
}

/**
 * Normaliza un código escaneado o introducido manualmente (trim + mayúsculas)
 * para comparaciones insensibles a mayúsculas/espacios.
 */
export function normalizeScanCode(rawCode: string): string {
  return rawCode.trim().toUpperCase();
}

/**
 * Calcula las unidades restantes por procesar en un paso (`expectedQty - scannedQty`),
 * garantizando que nunca sea menor que 0.
 */
export function getRemainingStepQty(
  step: Pick<TaskStepDTO, "expectedQty" | "scannedQty">,
): number {
  return Math.max(0, step.expectedQty - step.scannedQty);
}

/**
 * Busca el paso de una tarea de Recepción (`RECEIVING`) cuyo `productBarcode`, `productSku`
 * o `productId` coincida con el código escaneado.
 * Prioriza los pasos en estado `PENDING` (en orden de `sequence ASC`) por si existen
 * múltiples líneas para el mismo producto o pasos ya completados.
 */
export function matchReceivingStepByScan(
  steps: readonly TaskStepDTO[],
  scannedCode: string,
): TaskStepDTO | null {
  const normalized = normalizeScanCode(scannedCode);
  if (normalized.length === 0) {
    return null;
  }

  const ordered = [...steps].sort((a, b) => a.sequence - b.sequence);

  const matchesCode = (step: TaskStepDTO): boolean => {
    const skuMatch = normalizeScanCode(step.productSku) === normalized;
    const barcodeMatch =
      typeof step.productBarcode === "string" &&
      step.productBarcode.trim().length > 0 &&
      normalizeScanCode(step.productBarcode) === normalized;
    const idMatch = normalizeScanCode(step.productId) === normalized;
    return skuMatch || barcodeMatch || idMatch;
  };

  const pendingMatch = ordered.find(
    (step) => step.status === "PENDING" && matchesCode(step),
  );
  if (pendingMatch) {
    return pendingMatch;
  }

  const anyMatch = ordered.find((step) => matchesCode(step));
  return anyMatch ?? null;
}

/**
 * Obtiene el siguiente paso activo (`PENDING`) de una tarea (Putaway, Recepción o Picking)
 * respetando estrictamente el orden de secuencia (`sequence ASC`).
 */
export function getNextActiveStep(
  steps: readonly TaskStepDTO[],
): TaskStepDTO | null {
  const pending = steps
    .filter((step) => step.status === "PENDING")
    .sort((a, b) => a.sequence - b.sequence);

  return pending[0] ?? null;
}

/**
 * Calcula las métricas de progreso de una tarea operativa a nivel de pasos y de unidades.
 */
export function calculateTaskProgress(
  task: Pick<WarehouseTaskDTO, "steps">,
): TaskProgressSummary {
  const totalSteps = task.steps.length;
  let completedSteps = 0;
  let expectedUnits = 0;
  let scannedUnits = 0;

  for (const step of task.steps) {
    if (step.status === "COMPLETED") {
      completedSteps += 1;
    }
    expectedUnits += Math.max(0, step.expectedQty);
    scannedUnits += Math.max(0, step.scannedQty);
  }

  const remainingUnits = Math.max(0, expectedUnits - scannedUnits);
  const percent =
    expectedUnits > 0
      ? Math.min(100, Math.round((scannedUnits / expectedUnits) * 100))
      : totalSteps > 0
        ? Math.min(100, Math.round((completedSteps / totalSteps) * 100))
        : 0;

  return {
    completedSteps,
    totalSteps,
    expectedUnits,
    scannedUnits,
    remainingUnits,
    percent,
  };
}

/**
 * Devuelve la ruta de Expo Router correspondiente para ejecutar una tarea según su tipo.
 */
export function resolveTaskExecutionRoute(
  task: Pick<WarehouseTaskDTO, "id" | "type">,
): string {
  const encodedId = encodeURIComponent(task.id);
  const taskType: TaskType = task.type;

  if (taskType === "RECEIVING") {
    return `/tasks/receiving/${encodedId}`;
  }
  if (taskType === "PUTAWAY") {
    return `/tasks/putaway/${encodedId}`;
  }
  if (taskType === "PICKING" || taskType === "PACKING") {
    return `/tasks/picking/${encodedId}`;
  }
  return `/(tabs)/scanner?taskId=${encodedId}`;
}

/**
 * Transforma errores del cliente HTTP (`WmsApiClientError`) o excepciones genéricas
 * en un banner estructurado y accionable para el operario en piso.
 */
export function formatDomainErrorBanner(error: unknown): DomainErrorBanner {
  if (error instanceof WmsApiClientError) {
    switch (error.code) {
      case "INVALID_SCAN":
        return {
          code: error.code,
          title: "Código Escaneado Inválido",
          message: error.message,
          actionHint:
            "Verifica que la etiqueta corresponda al SKU, código de barras o ubicación indicada en pantalla.",
          severity: "error",
        };
      case "INSUFFICIENT_STOCK":
        return {
          code: error.code,
          title: "Stock Insuficiente en Origen",
          message: error.message,
          actionHint:
            "El saldo físico disponible (OnHand) en la ubicación origen no cubre la cantidad solicitada. Reporta una incidencia o verifica el conteo.",
          severity: "error",
        };
      case "WRONG_STEP_SEQUENCE":
        return {
          code: error.code,
          title: "Secuencia de Paso Incorrecta",
          message: error.message,
          actionHint:
            "Debes completar el paso activo en orden o reiniciar la tarea antes de confirmar este movimiento.",
          severity: "warning",
        };
      case "LOCATION_NOT_FOUND":
        return {
          code: error.code,
          title: "Ubicación No Encontrada",
          message: error.message,
          actionHint:
            "Confirma que el muelle RECEIVING o la ubicación STORAGE exista y esté dada de alta en este almacén.",
          severity: "error",
        };
      case "PRODUCT_NOT_FOUND":
        return {
          code: error.code,
          title: "Producto No Registrado",
          message: error.message,
          actionHint:
            "El código escaneado no pertenece al catálogo activo del tenant o no está incluido en esta orden de entrada.",
          severity: "error",
        };
      case "TASK_NOT_FOUND":
        return {
          code: error.code,
          title: "Tarea No Encontrada",
          message: error.message,
          actionHint:
            "Actualiza la bandeja de tareas; es posible que la tarea haya sido reasignada o cancelada.",
          severity: "warning",
        };
      case "UNAUTHORIZED":
      case "TENANT_MISMATCH":
        return {
          code: error.code,
          title: "Sesión o Permisos Inválidos",
          message: error.message,
          actionHint:
            "Revisa la API Key configurada en la pantalla de conexión de la terminal.",
          severity: "error",
        };
      case "NETWORK_ERROR":
        return {
          code: error.code,
          title: "Sin Conexión con el Servidor WMS",
          message: error.message,
          actionHint:
            "Comprueba la red Wi-Fi del almacén y la URL del servidor configurada en la terminal.",
          severity: "warning",
        };
      default:
        return {
          code: error.code,
          title: `Error de Operación (${error.code})`,
          message: error.message,
          actionHint:
            "Revisa los datos ingresados e intenta escanear nuevamente.",
          severity: "error",
        };
    }
  }

  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      title: "Error Inesperado",
      message: error.message,
      actionHint: "Intenta repetir la operación o recarga la pantalla.",
      severity: "error",
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    title: "Error Inesperado",
    message: "Se produjo un fallo desconocido al procesar la solicitud.",
    actionHint: "Intenta repetir la operación o recarga la pantalla.",
    severity: "error",
  };
}
