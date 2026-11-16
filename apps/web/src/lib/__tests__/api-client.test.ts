// apps/web/src/lib/__tests__/api-client.test.ts
// Suite de tests unitarios para el cliente HTTP tipado del Dashboard Web (@wms/web).

import { describe, expect, it, vi } from "vitest";
import type {
  DiagnosticErrorRecord,
  InventoryBalanceDTO,
  LocationDTO,
  ProductDTO,
  SalesOrderDTO,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import {
  CORRELATION_ID_HEADER,
  WmsWebApiError,
  createWmsWebClient,
} from "../api-client.js";

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
        headers: expect.objectContaining({
          Accept: "application/json",
          "x-api-key": "demo-api-key-12345",
          Authorization: "Bearer jwt-supervisor-token",
          [CORRELATION_ID_HEADER]: expect.any(String),
        }),
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

  it("propagates x-correlation-id on every request, exposes correlationId on WmsWebApiError, and queries /api/v1/diagnostics/errors", async () => {
    const diagRecords: DiagnosticErrorRecord[] = [
      {
        id: "diag-1",
        tenantId: "tenant-1",
        correlationId: "web-corr-001",
        errorCode: "INSUFFICIENT_STOCK",
        message: "Insufficient ATP stock",
        statusCode: 409,
        method: "POST",
        path: "/api/v1/orders/ord-1/allocate",
        userId: "sup-1",
        occurredAt: "2026-10-31T00:00:00.000Z",
      },
    ];

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === CORRELATION_ID_HEADER ? "web-corr-001" : null,
        },
        json: vi
          .fn()
          .mockResolvedValue({ success: true, data: diagRecords }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: {
          get: (name: string) =>
            name === CORRELATION_ID_HEADER ? "srv-header-corr-77" : null,
        },
        json: vi.fn().mockResolvedValue({
          success: false,
          error: {
            code: "FORBIDDEN",
            message: "Only ADMIN and SUPERVISOR can access diagnostic logs",
            correlationId: "srv-body-corr-88",
          },
        }),
      } as unknown as Response);

    const client = createWmsWebClient({
      baseUrl: "http://localhost:3001",
      bearerToken: "jwt-token",
      fetchImpl: mockFetch,
      correlationIdGenerator: () => "web-corr-001",
    });

    const errors = await client.listDiagnosticErrors({
      limit: 20,
      errorCode: "INSUFFICIENT_STOCK",
      correlationId: "web-corr-001",
    });

    expect(errors).toEqual(diagRecords);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/v1/diagnostics/errors?limit=20&errorCode=INSUFFICIENT_STOCK&correlationId=web-corr-001",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          [CORRELATION_ID_HEADER]: "web-corr-001",
        }),
      }),
    );

    await expect(client.listDiagnosticErrors()).rejects.toMatchObject({
      name: "WmsWebApiError",
      code: "FORBIDDEN",
      statusCode: 403,
      correlationId: "srv-body-corr-88",
    });
  });

  it("handles categories and products with filters and user operations (F9.1)", async () => {
    const mockCategory = {
      id: "cat-1",
      code: "ROPA",
      name: "Ropa y Textiles",
      isActive: true,
    };
    const mockProduct = {
      id: "prod-1",
      sku: "TSHIRT",
      name: "Camiseta",
      categoryId: "cat-1",
      isActive: true,
    };
    const mockUser = {
      id: "usr-1",
      tenantId: "tenant-1",
      clerkId: "clerk-1",
      name: "Admin User",
      email: "admin@test.com",
      role: "ADMIN" as const,
      isActive: true,
    };

    const mockFetch = vi
      .fn<typeof fetch>()
      // 1. listProducts with query
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, data: [mockProduct] }),
      } as unknown as Response)
      // 2. updateProduct
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { ...mockProduct, name: "Camiseta Actualizada" },
        }),
      } as unknown as Response)
      // 3. listCategories
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, data: [mockCategory] }),
      } as unknown as Response)
      // 4. createCategory
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ success: true, data: mockCategory }),
      } as unknown as Response)
      // 5. updateCategory
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { ...mockCategory, name: "Ropa Modificada" },
        }),
      } as unknown as Response)
      // 6. listUsers
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({ success: true, data: [mockUser] }),
      } as unknown as Response)
      // 7. createUser
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({ success: true, data: mockUser }),
      } as unknown as Response)
      // 8. updateUser
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { ...mockUser, role: "SUPERVISOR" },
        }),
      } as unknown as Response);

    const client = createWmsWebClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-key",
      fetchImpl: mockFetch,
    });

    const prods = await client.listProducts({
      q: "Camiseta",
      categoryId: "cat-1",
      includeInactive: true,
    });
    expect(prods).toEqual([mockProduct]);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/v1/products?q=Camiseta&categoryId=cat-1&includeInactive=true",
      expect.anything(),
    );

    const updatedProd = await client.updateProduct("prod-1", {
      name: "Camiseta Actualizada",
    });
    expect(updatedProd.name).toBe("Camiseta Actualizada");

    const cats = await client.listCategories({ includeInactive: true });
    expect(cats).toEqual([mockCategory]);

    const createdCat = await client.createCategory({
      code: "ROPA",
      name: "Ropa y Textiles",
    });
    expect(createdCat.code).toBe("ROPA");

    const updatedCat = await client.updateCategory("cat-1", {
      name: "Ropa Modificada",
    });
    expect(updatedCat.name).toBe("Ropa Modificada");

    const users = await client.listUsers({ role: "ADMIN" });
    expect(users).toEqual([mockUser]);

    const createdUser = await client.createUser({
      name: "Admin User",
      email: "admin@test.com",
      role: "ADMIN",
    });
    expect(createdUser.email).toBe("admin@test.com");

    const updatedUser = await client.updateUser("usr-1", {
      role: "SUPERVISOR",
    });
    expect(updatedUser.role).toBe("SUPERVISOR");
  });

  it("calls generateLocationLabels and generateProductLabels with proper endpoints and payloads", async () => {
    const mockBatchResponse = {
      symbology: "QR",
      dimensions: { widthMm: 70, heightMm: 35 },
      count: 1,
      labels: [
        {
          id: "lbl-1",
          entityType: "LOCATION",
          entityId: "loc-1",
          code: "A-01-01",
          barcodePayload: "LOC:A-01-01",
          humanReadableText: "LOC:A-01-01",
          title: "Ubicación A-01-01",
          symbology: "QR",
          widthMm: 70,
          heightMm: 35,
          svg: "<svg>test</svg>",
          dataUri: "data:image/svg+xml;utf8,<svg>test</svg>",
        },
      ],
    };

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: mockBatchResponse,
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { ...mockBatchResponse, symbology: "CODE128" },
        }),
      } as unknown as Response);

    const client = createWmsWebClient({
      baseUrl: "http://localhost:3001",
      apiKey: "test-api-key",
      fetchImpl: mockFetch,
    });

    const locLabels = await client.generateLocationLabels({
      locationCodes: ["A-01-01"],
      symbology: "QR",
      widthMm: 70,
      heightMm: 35,
    });

    expect(locLabels.count).toBe(1);
    expect(locLabels.symbology).toBe("QR");
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/v1/labels/locations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          locationCodes: ["A-01-01"],
          symbology: "QR",
          widthMm: 70,
          heightMm: 35,
        }),
      }),
    );

    const prodLabels = await client.generateProductLabels({
      skus: ["SKU-100"],
      symbology: "CODE128",
    });

    expect(prodLabels.count).toBe(1);
    expect(prodLabels.symbology).toBe("CODE128");
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/v1/labels/products",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          skus: ["SKU-100"],
          symbology: "CODE128",
        }),
      }),
    );
  });

  it("calls physical topology and layout endpoints (macro, aisle detail, generate-block, rollback, update)", async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            warehouseId: "wh-1",
            totalLocations: 10,
            activeLocations: 8,
            occupiedLocations: 4,
            blockedLocations: 2,
            occupancyRate: 50,
            totalOnHand: 200,
            totalAllocated: 50,
            totalAtp: 150,
            zones: [],
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            warehouseId: "wh-1",
            zone: "MAIN",
            aisle: "01",
            totalLocations: 6,
            activeLocations: 6,
            occupiedLocations: 2,
            blockedLocations: 0,
            occupancyRate: 33,
            totalOnHand: 100,
            totalAllocated: 20,
            totalAtp: 80,
            racks: [],
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            dryRun: false,
            batchId: "batch-123",
            totalGenerated: 4,
            createdCount: 4,
            skippedCollisionsCount: 0,
            collisions: [],
            creatableCount: 4,
            locations: [],
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            batchId: "batch-123",
            deletedCount: 4,
          },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: {
            id: "loc-1",
            warehouseId: "wh-1",
            code: "A-01-01",
            type: "STORAGE",
            storageType: "RACK",
            status: "BLOCKED",
            zone: "MAIN",
            rack: "01",
            level: "01",
            position: "01",
            isActive: false,
          },
        }),
      } as unknown as Response);

    const client = createWmsWebClient({
      baseUrl: "http://localhost:3001",
      apiKey: "test-api-key",
      fetchImpl: mockFetch,
    });

    const macro = await client.getWarehouseLayoutSummary("wh-1");
    expect(macro.totalLocations).toBe(10);
    expect(macro.occupancyRate).toBe(50);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/v1/locations/layout/wh-1",
      expect.objectContaining({ method: "GET" }),
    );

    const aisle = await client.getAisleLayoutDetail("wh-1", "01", "MAIN");
    expect(aisle.aisle).toBe("01");
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/v1/locations/layout/wh-1/aisles/01?zone=MAIN",
      expect.objectContaining({ method: "GET" }),
    );

    const gen = await client.generateLocationBlock({
      warehouseId: "wh-1",
      type: "STORAGE",
      storageType: "RACK",
      zone: "MAIN",
      aisle: "01",
      rackStart: 1,
      rackEnd: 1,
      levelStart: 1,
      levelEnd: 2,
      positionsPerLevel: 2,
    });
    expect(gen.batchId).toBe("batch-123");
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3001/api/v1/locations/generate-block",
      expect.objectContaining({ method: "POST" }),
    );

    const rollback = await client.deleteLocationBatch("batch-123");
    expect(rollback.deletedCount).toBe(4);
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      "http://localhost:3001/api/v1/locations/batches/batch-123",
      expect.objectContaining({ method: "DELETE" }),
    );

    const updated = await client.updateLocation("loc-1", { status: "BLOCKED" });
    expect(updated.status).toBe("BLOCKED");
    expect(mockFetch).toHaveBeenNthCalledWith(
      5,
      "http://localhost:3001/api/v1/locations/loc-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "BLOCKED" }),
      }),
    );
  });
});
