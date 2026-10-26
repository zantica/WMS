// apps/web/src/lib/api-client.ts
// Cliente HTTP tipado para el Dashboard de Supervisores (@wms/web).
// Respeta estrictamente las fronteras del monorepo: importa únicamente de @wms/shared-types.

import type {
  AdjustmentInput,
  ApiError,
  ApiResponse,
  CreateLocationInput,
  CreateOrderInput,
  CreateProductInput,
  InventoryBalanceDTO,
  LocationDTO,
  LocationType,
  OrderStatus,
  ProductDTO,
  SalesOrderDTO,
  TaskStatus,
  TaskType,
  TxReason,
  WarehouseTaskDTO,
  WmsErrorCode,
} from "@wms/shared-types";

export interface WmsWebClientConfig {
  baseUrl?: string | undefined;
  apiKey?: string | undefined;
  bearerToken?: string | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  service: string;
}

export interface ListLocationsFilters {
  warehouseId?: string | undefined;
  type?: LocationType | undefined;
}

export interface ListBalancesFilters {
  productId?: string | undefined;
  locationId?: string | undefined;
}

export interface ListTransactionsFilters {
  page?: number | undefined;
  limit?: number | undefined;
  productId?: string | undefined;
  reason?: TxReason | undefined;
}

export interface KardexTransactionItem {
  id: string;
  productSku: string;
  productName: string;
  fromLocation: string | null;
  toLocation: string | null;
  quantity: number;
  reason: TxReason;
  referenceId?: string | null | undefined;
  userId?: string | null | undefined;
  notes?: string | null | undefined;
  createdAt: string;
}

export interface KardexPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface KardexTransactionsResponse {
  data: KardexTransactionItem[];
  pagination: KardexPagination;
}

export interface AdjustmentResult {
  message: string;
}

export interface ListOrdersFilters {
  status?: OrderStatus | undefined;
}

export interface AllocateOrderResponse {
  taskId: string;
  message: string;
}

export interface CancelOrderResponse {
  orderId: string;
  previousStatus: OrderStatus;
  status: "CANCELLED";
  releasedLinesCount: number;
  totalReleasedQty: number;
  cancelledTasksCount: number;
}

export interface DispatchOrderResponse {
  orderId: string;
  status: OrderStatus;
}

export interface ListTasksFilters {
  type?: TaskType | undefined;
  status?: TaskStatus | undefined;
}

/**
 * Error tipado del cliente web que preserva el código de dominio (`WmsErrorCode`),
 * el código de estado HTTP y los detalles adicionales devueltos por `@wms/api`.
 */
export class WmsWebApiError extends Error {
  public readonly code: WmsErrorCode | string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    code: WmsErrorCode | string,
    message: string,
    statusCode: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "WmsWebApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const DEFAULT_BASE_URL = "http://localhost:3001";

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  return trimmed.replace(/\/+$/, "");
}

function isApiErrorPayload(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate["success"] !== false) {
    return false;
  }
  const errorObj = candidate["error"];
  if (typeof errorObj !== "object" || errorObj === null) {
    return false;
  }
  const errRecord = errorObj as Record<string, unknown>;
  return (
    typeof errRecord["code"] === "string" &&
    typeof errRecord["message"] === "string"
  );
}

function isApiSuccessPayload<T>(value: unknown): value is ApiResponse<T> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return candidate["success"] === true && "data" in candidate;
}

export class WmsWebApiClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private bearerToken: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: WmsWebClientConfig = {}) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
    this.apiKey = config.apiKey;
    this.bearerToken = config.bearerToken;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
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

  public updateConfig(config: Partial<WmsWebClientConfig>): void {
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

  private buildHeaders(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
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

  private async requestRaw(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    options?: {
      query?: Record<string, string | undefined> | undefined;
      body?: unknown;
    },
  ): Promise<{ status: number; ok: boolean; payload: unknown }> {
    const hasBody = options?.body !== undefined;
    const url = this.buildUrl(path, options?.query);
    const headers = this.buildHeaders(hasBody);

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
      throw new WmsWebApiError("NETWORK_ERROR", message, 0, err);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new WmsWebApiError(
        "INVALID_RESPONSE",
        `Failed to parse JSON response from ${method} ${path} (HTTP ${response.status})`,
        response.status,
      );
    }

    if (isApiErrorPayload(payload)) {
      throw new WmsWebApiError(
        payload.error.code,
        payload.error.message,
        response.status,
        payload.error.details,
      );
    }

    if (!response.ok) {
      throw new WmsWebApiError(
        "HTTP_ERROR",
        `Request ${method} ${path} failed with status ${response.status}`,
        response.status,
        payload,
      );
    }

    return { status: response.status, ok: response.ok, payload };
  }

  private async requestEnvelope<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    options?: {
      query?: Record<string, string | undefined> | undefined;
      body?: unknown;
    },
  ): Promise<T> {
    const { status, payload } = await this.requestRaw(method, path, options);

    if (isApiSuccessPayload<T>(payload)) {
      return payload.data;
    }

    throw new WmsWebApiError(
      "INVALID_RESPONSE",
      `Unexpected envelope format from ${method} ${path}`,
      status,
      payload,
    );
  }

  /**
   * GET /health — Verifica conectividad con el servidor @wms/api.
   */
  public async checkHealth(): Promise<HealthCheckResponse> {
    const { payload } = await this.requestRaw("GET", "/health");
    if (isApiSuccessPayload<HealthCheckResponse>(payload)) {
      return payload.data;
    }
    return payload as HealthCheckResponse;
  }

  /**
   * GET /api/v1/products — Lista productos activos del catálogo del tenant.
   */
  public async listProducts(): Promise<ProductDTO[]> {
    return this.requestEnvelope<ProductDTO[]>("GET", "/api/v1/products");
  }

  /**
   * POST /api/v1/products — Crea un nuevo producto en el catálogo del tenant.
   */
  public async createProduct(input: CreateProductInput): Promise<ProductDTO> {
    return this.requestEnvelope<ProductDTO>("POST", "/api/v1/products", {
      body: input,
    });
  }

  /**
   * GET /api/v1/locations — Lista ubicaciones del almacén filtrables por warehouseId y type.
   */
  public async listLocations(
    filters?: ListLocationsFilters,
  ): Promise<LocationDTO[]> {
    return this.requestEnvelope<LocationDTO[]>("GET", "/api/v1/locations", {
      query: {
        warehouseId: filters?.warehouseId,
        type: filters?.type,
      },
    });
  }

  /**
   * POST /api/v1/locations — Crea una nueva ubicación en el almacén.
   */
  public async createLocation(
    input: CreateLocationInput,
  ): Promise<LocationDTO> {
    return this.requestEnvelope<LocationDTO>("POST", "/api/v1/locations", {
      body: input,
    });
  }

  /**
   * GET /api/v1/inventory/balances — Consulta saldos en vivo (`onHandQty`, `allocatedQty`, `atpQty`).
   */
  public async listBalances(
    filters?: ListBalancesFilters,
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
   * GET /api/v1/inventory/transactions — Consulta el Libro Mayor Inmutable (Kardex paginado).
   */
  public async listTransactions(
    filters?: ListTransactionsFilters,
  ): Promise<KardexTransactionsResponse> {
    const { status, payload } = await this.requestRaw(
      "GET",
      "/api/v1/inventory/transactions",
      {
        query: {
          page: filters?.page !== undefined ? String(filters.page) : undefined,
          limit:
            filters?.limit !== undefined ? String(filters.limit) : undefined,
          productId: filters?.productId,
          reason: filters?.reason,
        },
      },
    );

    if (!isApiSuccessPayload<KardexTransactionItem[]>(payload)) {
      throw new WmsWebApiError(
        "INVALID_RESPONSE",
        "Unexpected envelope format from GET /api/v1/inventory/transactions",
        status,
        payload,
      );
    }

    const rawRecord = payload as unknown as Record<string, unknown>;
    const rawPagination = rawRecord["pagination"] as
      | Partial<KardexPagination>
      | undefined;

    const data = payload.data;
    const page =
      typeof rawPagination?.page === "number"
        ? rawPagination.page
        : (filters?.page ?? 1);
    const limit =
      typeof rawPagination?.limit === "number"
        ? rawPagination.limit
        : (filters?.limit ?? 50);
    const total =
      typeof rawPagination?.total === "number"
        ? rawPagination.total
        : data.length;
    const pages =
      typeof rawPagination?.pages === "number"
        ? rawPagination.pages
        : Math.max(1, Math.ceil(total / Math.max(1, limit)));

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  }

  /**
   * POST /api/v1/inventory/adjustments — Registra un ajuste manual auditado en el Ledger.
   */
  public async createAdjustment(
    input: AdjustmentInput,
  ): Promise<AdjustmentResult> {
    return this.requestEnvelope<AdjustmentResult>(
      "POST",
      "/api/v1/inventory/adjustments",
      { body: input },
    );
  }

  /**
   * GET /api/v1/orders — Lista pedidos de venta filtrables por estado.
   */
  public async listOrders(
    filters?: ListOrdersFilters,
  ): Promise<SalesOrderDTO[]> {
    return this.requestEnvelope<SalesOrderDTO[]>("GET", "/api/v1/orders", {
      query: {
        status: filters?.status,
      },
    });
  }

  /**
   * POST /api/v1/orders — Crea un nuevo pedido de venta.
   */
  public async createOrder(input: CreateOrderInput): Promise<SalesOrderDTO> {
    return this.requestEnvelope<SalesOrderDTO>("POST", "/api/v1/orders", {
      body: input,
    });
  }

  /**
   * POST /api/v1/orders/:id/allocate — Reserva stock (ATP) y genera la tarea de Picking.
   */
  public async allocateOrder(orderId: string): Promise<AllocateOrderResponse> {
    return this.requestEnvelope<AllocateOrderResponse>(
      "POST",
      `/api/v1/orders/${encodeURIComponent(orderId)}/allocate`,
    );
  }

  /**
   * POST /api/v1/orders/:id/cancel — Cancela un pedido y libera atómicamente sus reservas pendientes.
   */
  public async cancelOrder(
    orderId: string,
    reason?: string,
  ): Promise<CancelOrderResponse> {
    return this.requestEnvelope<CancelOrderResponse>(
      "POST",
      `/api/v1/orders/${encodeURIComponent(orderId)}/cancel`,
      {
        body:
          reason && reason.trim().length > 0
            ? { reason: reason.trim() }
            : {},
      },
    );
  }

  /**
   * POST /api/v1/orders/:id/dispatch — Despacha un pedido en estado PACKED y lo marca como SHIPPED.
   */
  public async dispatchOrder(orderId: string): Promise<DispatchOrderResponse> {
    return this.requestEnvelope<DispatchOrderResponse>(
      "POST",
      `/api/v1/orders/${encodeURIComponent(orderId)}/dispatch`,
    );
  }

  /**
   * GET /api/v1/tasks — Lista tareas operativas activas en el almacén.
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
}

export function createWmsWebClient(
  config?: WmsWebClientConfig,
): WmsWebApiClient {
  return new WmsWebApiClient(config);
}
