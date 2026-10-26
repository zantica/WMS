// apps/web/src/lib/__tests__/api-client.test.ts
// Suite de tests unitarios para el cliente HTTP tipado del Dashboard Web (@wms/web).

import { describe, expect, it, vi } from "vitest";
import type {
  InventoryBalanceDTO,
  LocationDTO,
  ProductDTO,
  SalesOrderDTO,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import { WmsWebApiError, createWmsWebClient } from "../api-client.js";

function createMockFetch(
  status: number,
  body: unknown,
  ok = status >= 200 && status < 300,
) {
  return vi.fn<typeof fetch>().mockResolvedValue({
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response);
}

describe("WmsWebApiClient (@wms/web)", () => {
  it("normalizes baseUrl, injects x-api-key and Authorization headers, and checks /health", async () => {
    const mockFetch = createMockFetch(200, {
      status: "ok",
      timestamp: "2026-10-26T00:00:00.000Z",
      service: "wms-api",
    });

    const client = createWmsWebClient({
      baseUrl: "http://localhost:3001///",
      apiKey: "demo-api-key-12345",
      bearerToken: "jwt-supervisor-token",
      fetchImpl: mockFetch,
    });

    expect(client.getConfig()).toEqual({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      bearerToken: "jwt-supervisor-token",
    });

    const health = await client.checkHealth();
    expect(health.status).toBe("ok");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/health",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-api-key": "demo-api-key-12345",
          Authorization: "Bearer jwt-supervisor-token",
        },
      }),
    );

    client.updateConfig({
      baseUrl: "http://10.0.0.15:3001/",
      apiKey: "updated-key",
      bearerToken: undefined,
    });
    expect(client.getConfig()).toEqual({
      baseUrl: "http://10.0.0.15:3001",
      apiKey: "updated-key",
      bearerToken: undefined,
    });
  });

  it("lists and creates products (/api/v1/products) and locations (/api/v1/locations)", async () => {
    const product: ProductDTO = {
      id: "prod-1",
      sku: "PROD-001",
      name: "Camiseta Básica Blanca",
      barcode: "8410376000019",
      weightGrams: 200,
      isActive: true,
    };

    const location: LocationDTO = {
      id: "loc-1",
      warehouseId: "warehouse-demo",
      code: "A-01-01",
      type: "STORAGE",
      description: "Pasillo A",
    };

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, data: [product] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ success: true, data: product }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, data: [location] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ success: true, data: location }),
      } as unknown as Response);

    const client = createWmsWebClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      fetchImpl: mockFetch,
    });

    const products = await client.listProducts();
    expect(products).toEqual([product]);

    const createdProd = await client.createProduct({
      sku: "PROD-001",
      name: "Camiseta Básica Blanca",
      barcode: "8410376000019",
      weightGrams: 200,
    });
    expect(createdProd).toEqual(product);

    const locations = await client.listLocations({
      warehouseId: "warehouse-demo",
      type: "STORAGE",
    });
    expect(locations).toEqual([location]);
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3001/api/v1/locations?warehouseId=warehouse-demo&type=STORAGE",
      expect.objectContaining({ method: "GET" }),
    );

    const createdLoc = await client.createLocation({
      warehouseId: "warehouse-demo",
      code: "A-01-01",
      type: "STORAGE",
      description: "Pasillo A",
    });
    expect(createdLoc).toEqual(location);
  });

  it("queries inventory balances, paginated Kardex transactions, and records manual adjustments", async () => {
    const balances: InventoryBalanceDTO[] = [
      {
        locationId: "loc-1",
        locationCode: "A-01-01",
        productId: "prod-1",
        productSku: "PROD-001",
        productName: "Camiseta Básica Blanca",
        onHandQty: 25,
        allocatedQty: 5,
        atpQty: 20,
      },
    ];

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, data: balances }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: [
            {
              id: "tx-1",
              productSku: "PROD-001",
              productName: "Camiseta Básica Blanca",
              fromLocation: null,
              toLocation: "A-01-01",
              quantity: 5,
              reason: "ADJUSTMENT",
              referenceId: null,
              userId: "sup-1",
              notes: "Ajuste inicial",
              createdAt: "2026-10-26T00:00:00.000Z",
            },
          ],
          pagination: { page: 2, limit: 25, total: 30, pages: 2 },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { message: "Adjustment recorded in ledger" },
        }),
      } as unknown as Response);

    const client = createWmsWebClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      fetchImpl: mockFetch,
    });

    const balRes = await client.listBalances({ productId: "prod-1" });
    expect(balRes).toEqual(balances);

    const txRes = await client.listTransactions({
      page: 2,
      limit: 25,
      reason: "ADJUSTMENT",
    });
    expect(txRes.data).toHaveLength(1);
    expect(txRes.pagination).toEqual({
      page: 2,
      limit: 25,
      total: 30,
      pages: 2,
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/v1/inventory/transactions?page=2&limit=25&reason=ADJUSTMENT",
      expect.objectContaining({ method: "GET" }),
    );

    const adjRes = await client.createAdjustment({
      locationId: "loc-1",
      productId: "prod-1",
      quantityDelta: 5,
      notes: "Ajuste inicial",
    });
    expect(adjRes.message).toBe("Adjustment recorded in ledger");
  });

  it("manages orders (list, create, allocate, cancel, dispatch) and lists tasks", async () => {
    const order: SalesOrderDTO = {
      id: "ord-1",
      externalRef: "#PED-1001",
      status: "PENDING",
      customerName: "Cliente Demo",
      priority: 10,
      createdAt: "2026-10-26T00:00:00.000Z",
      lines: [
        {
          id: "line-1",
          productId: "prod-1",
          productSku: "PROD-001",
          productName: "Camiseta",
          requestedQty: 4,
          pickedQty: 0,
        },
      ],
    };

    const task: WarehouseTaskDTO = {
      id: "task-1",
      orderId: "ord-1",
      type: "PICKING",
      status: "IN_PROGRESS",
      assignedTo: "op-1",
      steps: [],
    };

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, data: [order] }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ success: true, data: order }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { taskId: "task-1", message: "Order allocated." },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            orderId: "ord-1",
            previousStatus: "ALLOCATED",
            status: "CANCELLED",
            releasedLinesCount: 1,
            totalReleasedQty: 4,
            cancelledTasksCount: 1,
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { orderId: "ord-1", status: "SHIPPED" },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, data: [task] }),
      } as unknown as Response);

    const client = createWmsWebClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      fetchImpl: mockFetch,
    });

    const orders = await client.listOrders({ status: "PENDING" });
    expect(orders).toEqual([order]);

    const createdOrder = await client.createOrder({
      warehouseId: "warehouse-demo",
      lines: [{ productId: "prod-1", requestedQty: 4 }],
    });
    expect(createdOrder.id).toBe("ord-1");

    const alloc = await client.allocateOrder("ord-1");
    expect(alloc.taskId).toBe("task-1");

    const cancelled = await client.cancelOrder("ord-1", "Rotura de stock");
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.totalReleasedQty).toBe(4);

    const dispatched = await client.dispatchOrder("ord-1");
    expect(dispatched.status).toBe("SHIPPED");

    const tasks = await client.listTasks({
      type: "PICKING",
      status: "IN_PROGRESS",
    });
    expect(tasks).toEqual([task]);
  });

  it("throws WmsWebApiError on ApiError payload, network failure, or malformed JSON", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: vi.fn().mockResolvedValue({
          success: false,
          error: {
            code: "INSUFFICIENT_STOCK",
            message: "Insufficient ATP stock for PROD-001",
            details: { missingQty: 3 },
          },
        }),
      } as unknown as Response)
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
      } as unknown as Response);

    const client = createWmsWebClient({
      baseUrl: "http://localhost:3001",
      fetchImpl: mockFetch,
    });

    await expect(client.allocateOrder("ord-99")).rejects.toMatchObject({
      name: "WmsWebApiError",
      code: "INSUFFICIENT_STOCK",
      statusCode: 409,
      details: { missingQty: 3 },
    });

    await expect(client.listProducts()).rejects.toMatchObject({
      name: "WmsWebApiError",
      code: "NETWORK_ERROR",
      statusCode: 0,
    });

    await expect(client.listProducts()).rejects.toBeInstanceOf(WmsWebApiError);
  });
});
