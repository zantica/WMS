// apps/mobile/src/api/client.ts
// Cliente HTTP tipado para consumir la API REST de @wms/api desde la app móvil de operarios.
// Respeta las fronteras del monorepo: importa únicamente desde @wms/shared-types.

import {
  CORRELATION_ID_HEADER,
  extractResponseHeaderCorrelationId,
  generateCorrelationId,
  isApiErrorPayload,
  isApiSuccessPayload,
  normalizeBaseUrl,
  type ApiError,
  type ApiResponse,
  type ConfirmScanInput,
  type InventoryBalanceDTO,
  type OrderStatus,
  type StepStatus,
  type TaskStatus,
  type TaskType,
  type WarehouseTaskDTO,
  type WmsErrorCode,
  type SyncTaskBatchRequest,
  type SyncTaskBatchResult,
} from "@wms/shared-types";

export {
  CORRELATION_ID_HEADER,
  extractResponseHeaderCorrelationId,
  generateCorrelationId,
  isApiErrorPayload,
  isApiSuccessPayload,
  normalizeBaseUrl,
};

export interface WmsClientConfig {
  baseUrl?: string;
  apiKey?: string | undefined;
  bearerToken?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
  correlationIdGenerator?: (() => string) | undefined;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  service: string;
}

export interface ListTasksFilters {
  type?: TaskType | undefined;
  status?: TaskStatus | undefined;
}

export interface StartTaskResult {
  taskId: string;
  status: TaskStatus;
}

export interface ConfirmTaskStepInput extends ConfirmScanInput {
  reportException?: boolean | undefined;
  exceptionNote?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface ReplacementStepSummary {
  id: string;
  locationId: string;
  locationCode: string;
  expectedQty: number;
}

export interface ConfirmTaskStepResponse {
  stepId: string;
  scannedQty: number;
  expectedQty: number;
  remainingQty: number;
  stepStatus: Extract<StepStatus, "COMPLETED" | "PENDING" | "EXCEPTION">;
  taskStatus: Extract<TaskStatus, "IN_PROGRESS" | "COMPLETED" | "EXCEPTION">;
  taskComplete: boolean;
  note?: string | undefined;
  reallocated?: boolean | undefined;
  orderStatus?: OrderStatus | undefined;
  replacementSteps?: ReplacementStepSummary[] | undefined;
}

export interface DispatchOrderResponse {
  orderId: string;
  status: OrderStatus;
}

export interface ConfirmReceiptLineInput {
  productId: string;
  scannedQty: number;
  barcode?: string | undefined;
  idempotencyKey?: string | undefined;
}

export interface ConfirmReceiptLineResponse {
  stepId: string;
  scannedQty: number;
  expectedQty: number;
  stepStatus: Extract<StepStatus, "COMPLETED" | "PENDING">;
  taskStatus: Extract<TaskStatus, "COMPLETED" | "IN_PROGRESS">;
  putawayTaskId: string | null;
  remainingQty: number;
}

export interface GetInventoryBalancesFilters {
  productId?: string | undefined;
  locationId?: string | undefined;
}

/**
 * Error tipado del cliente móvil que preserva el código de negocio (`WmsErrorCode`),
 * el código de estado HTTP, el `correlationId` y los detalles adicionales devueltos por `@wms/api`.
 */
export class WmsApiClientError extends Error {
  public readonly code: WmsErrorCode | string;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly correlationId?: string | undefined;

  constructor(
    code: WmsErrorCode | string,
    message: string,
    statusCode: number,
    details?: unknown,
    correlationId?: string,
  ) {
    super(message);
    this.name = "WmsApiClientError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.correlationId = correlationId;
  }
}

const DEFAULT_BASE_URL = "http://localhost:3001";

export class WmsApiClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private bearerToken: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly correlationIdGenerator: () => string;

  constructor(config: WmsClientConfig = {}) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
    this.apiKey = config.apiKey;
    this.bearerToken = config.bearerToken;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.correlationIdGenerator =
      config.correlationIdGenerator ?? generateCorrelationId;
  }

  public getConfig(): {
    baseUrl: string;
    apiKey?: string | undefined;
    bearerToken?: string | undefined;
  } {
    return {
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      bearerToken: this.bearerToken,
    };
  }

  public updateConfig(config: Partial<WmsClientConfig>): void {
    if (config.baseUrl !== undefined) {
      this.baseUrl = normalizeBaseUrl(config.baseUrl);
    }
    if ("apiKey" in config) {
      this.apiKey = config.apiKey;
    }
    if ("bearerToken" in config) {
      this.bearerToken = config.bearerToken;
    }
  }

  private buildHeaders(
    hasBody: boolean,
    correlationId: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      [CORRELATION_ID_HEADER]: correlationId,
    };

    if (hasBody) {
      headers["Content-Type"] = "application/json";
    }

    if (this.apiKey && this.apiKey.trim().length > 0) {
      headers["x-api-key"] = this.apiKey.trim();
    }

    if (this.bearerToken && this.bearerToken.trim().length > 0) {
      headers["Authorization"] = `Bearer ${this.bearerToken.trim()}`;
    }

    return headers;
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | undefined>,
  ): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const searchParams = new URLSearchParams();

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") {
          searchParams.append(key, value);
        }
      }
    }

    const queryString = searchParams.toString();
    return queryString.length > 0
      ? `${this.baseUrl}${normalizedPath}?${queryString}`
      : `${this.baseUrl}${normalizedPath}`;
  }

  private async requestEnvelope<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    options?: {
      query?: Record<string, string | undefined> | undefined;
      body?: unknown;
      correlationId?: string | undefined;
    },
  ): Promise<T> {
    const hasBody = options?.body !== undefined;
    const url = this.buildUrl(path, options?.query);
    const requestCorrelationId =
      options?.correlationId && options.correlationId.trim().length > 0
        ? options.correlationId.trim()
        : this.correlationIdGenerator();
    const headers = this.buildHeaders(hasBody, requestCorrelationId);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        ...(hasBody ? { body: JSON.stringify(options?.body) } : {}),
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network request failed";
      throw new WmsApiClientError(
        "NETWORK_ERROR",
        message,
        0,
        err,
        requestCorrelationId,
      );
    }

    const responseHeaderCorrelationId =
      extractResponseHeaderCorrelationId(response);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WmsApiClientError(
        "INVALID_RESPONSE",
        `Failed to parse JSON response from ${method} ${path} (HTTP ${response.status})`,
        response.status,
        undefined,
        responseHeaderCorrelationId ?? requestCorrelationId,
      );
    }

    if (isApiErrorPayload(payload)) {
      const resolvedCorrelationId =
        payload.error.correlationId ??
        responseHeaderCorrelationId ??
        requestCorrelationId;
      throw new WmsApiClientError(
        payload.error.code,
        payload.error.message,
        response.status,
        payload.error.details,
        resolvedCorrelationId,
      );
    }

    if (!response.ok) {
      throw new WmsApiClientError(
        "HTTP_ERROR",
        `Request ${method} ${path} failed with status ${response.status}`,
        response.status,
        payload,
        responseHeaderCorrelationId ?? requestCorrelationId,
      );
    }

    if (isApiSuccessPayload<T>(payload)) {
      return payload.data;
    }

    throw new WmsApiClientError(
      "INVALID_RESPONSE",
      `Unexpected envelope format from ${method} ${path}`,
      response.status,
      payload,
      responseHeaderCorrelationId ?? requestCorrelationId,
    );
  }

  /**
   * GET /health — Verifica conectividad con el servidor @wms/api.
   */
  public async checkHealth(): Promise<HealthCheckResponse> {
    const url = this.buildUrl("/health");
    const requestCorrelationId = this.correlationIdGenerator();
    const headers = this.buildHeaders(false, requestCorrelationId);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Network request failed";
      throw new WmsApiClientError(
        "NETWORK_ERROR",
        message,
        0,
        err,
        requestCorrelationId,
      );
    }

    const responseHeaderCorrelationId =
      extractResponseHeaderCorrelationId(response);

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WmsApiClientError(
        "INVALID_RESPONSE",
        `Invalid JSON from /health (HTTP ${response.status})`,
        response.status,
        undefined,
        responseHeaderCorrelationId ?? requestCorrelationId,
      );
    }

    if (isApiErrorPayload(payload)) {
      const resolvedCorrelationId =
        payload.error.correlationId ??
        responseHeaderCorrelationId ??
        requestCorrelationId;
      throw new WmsApiClientError(
        payload.error.code,
        payload.error.message,
        response.status,
        payload.error.details,
        resolvedCorrelationId,
      );
    }

    if (!response.ok) {
      throw new WmsApiClientError(
        "HTTP_ERROR",
        `Health check failed with status ${response.status}`,
        response.status,
        payload,
        responseHeaderCorrelationId ?? requestCorrelationId,
      );
    }

    if (isApiSuccessPayload<HealthCheckResponse>(payload)) {
      return payload.data;
    }

    return payload as HealthCheckResponse;
  }

  /**
   * GET /api/v1/tasks — Lista tareas operativas pendientes o en curso.
   */
  public async listTasks(
    filters?: ListTasksFilters,
  ): Promise<WarehouseTaskDTO[]> {
    return this.requestEnvelope<WarehouseTaskDTO[]>("GET", "/api/v1/tasks", {
      query: {
        type: filters?.type,
        status: filters?.status,
      },
    });
  }

  /**
   * GET /api/v1/tasks/:id — Obtiene el detalle de una tarea y sus pasos ordenados.
   */
  public async getTask(id: string): Promise<WarehouseTaskDTO> {
    return this.requestEnvelope<WarehouseTaskDTO>(
      "GET",
      `/api/v1/tasks/${encodeURIComponent(id)}`,
    );
  }

  /**
   * POST /api/v1/tasks/:id/start — Toma e inicia una tarea operativa en estado PENDING.
   */
  public async startTask(id: string): Promise<StartTaskResult> {
    return this.requestEnvelope<StartTaskResult>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(id)}/start`,
    );
  }

  /**
   * POST /api/v1/tasks/:id/steps/:stepId/confirm — Confirma el escaneo de un paso (PUTAWAY / PICKING) o reporta incidencia.
   */
  public async confirmTaskStep(
    taskId: string,
    stepId: string,
    input: ConfirmTaskStepInput,
  ): Promise<ConfirmTaskStepResponse> {
    return this.requestEnvelope<ConfirmTaskStepResponse>(
      "POST",
      `/api/v1/tasks/${encodeURIComponent(taskId)}/steps/${encodeURIComponent(stepId)}/confirm`,
      { body: input },
    );
  }

  /**
   * POST /api/v1/receipts/:taskId/confirm-line — Confirma el escaneo de un producto recibido en muelle (RECEIVING).
   */
  public async confirmReceiptLine(
    taskId: string,
    input: ConfirmReceiptLineInput,
  ): Promise<ConfirmReceiptLineResponse> {
    return this.requestEnvelope<ConfirmReceiptLineResponse>(
      "POST",
      `/api/v1/receipts/${encodeURIComponent(taskId)}/confirm-line`,
      { body: input },
    );
  }

  /**
   * GET /api/v1/inventory/balances — Consulta saldos de inventario en vivo (onHand, allocated, ATP).
   */
  public async getInventoryBalances(
    filters?: GetInventoryBalancesFilters,
  ): Promise<InventoryBalanceDTO[]> {
    return this.requestEnvelope<InventoryBalanceDTO[]>(
      "GET",
      "/api/v1/inventory/balances",
      {
        query: {
          productId: filters?.productId,
          locationId: filters?.locationId,
        },
      },
    );
  }

  /**
   * POST /api/v1/orders/:id/dispatch — Confirma el cierre de Packing y despacha el pedido (SHIPPED).
   */
  public async dispatchOrder(
    orderId: string,
  ): Promise<DispatchOrderResponse> {
    return this.requestEnvelope<DispatchOrderResponse>(
      "POST",
      `/api/v1/orders/${encodeURIComponent(orderId)}/dispatch`,
    );
  }

  /**
   * POST /api/v1/tasks/sync-batch — Sincroniza un lote de mutaciones en orden FIFO (Offline-First).
   */
  public async syncTaskBatch(
    request: SyncTaskBatchRequest,
  ): Promise<SyncTaskBatchResult> {
    return this.requestEnvelope<SyncTaskBatchResult>(
      "POST",
      "/api/v1/tasks/sync-batch",
      { body: request },
    );
  }
}

export function createWmsClient(config?: WmsClientConfig): WmsApiClient {
  return new WmsApiClient(config);
}
