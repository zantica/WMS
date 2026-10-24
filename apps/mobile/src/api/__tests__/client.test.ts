// apps/mobile/src/api/__tests__/client.test.ts
// Suite de tests unitarios para el cliente HTTP tipado de @wms/mobile.

import { describe, expect, it, vi } from "vitest";
import type { InventoryBalanceDTO, WarehouseTaskDTO } from "@wms/shared-types";
import { WmsApiClientError, createWmsClient } from "../client.js";

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

describe("WmsApiClient (@wms/mobile)", () => {
  it("normalizes trailing slashes in baseUrl and injects x-api-key and Authorization headers", async () => {
    const mockFetch = createMockFetch(200, {
      status: "ok",
      timestamp: "2026-10-24T00:00:00.000Z",
      service: "wms-api",
    });

    const client = createWmsClient({
      baseUrl: "http://192.168.1.50:3001///",
      apiKey: "demo-api-key-12345",
      bearerToken: "jwt-token-abc",
      fetchImpl: mockFetch,
    });

    expect(client.getConfig().baseUrl).toBe("http://192.168.1.50:3001");

    const res = await client.checkHealth();
    expect(res.status).toBe("ok");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://192.168.1.50:3001/health",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-api-key": "demo-api-key-12345",
          Authorization: "Bearer jwt-token-abc",
        },
      }),
    );

    client.updateConfig({
      baseUrl: "http://localhost:4000/",
      apiKey: "new-key",
      bearerToken: undefined,
    });
    expect(client.getConfig()).toEqual({
      baseUrl: "http://localhost:4000",
      apiKey: "new-key",
      bearerToken: undefined,
    });
  });

  it("lists tasks with optional type and status query parameters and unwraps ApiResponse<WarehouseTaskDTO[]>", async () => {
    const sampleTasks: WarehouseTaskDTO[] = [
      {
        id: "task-putaway-1",
        orderId: null,
        type: "PUTAWAY",
        status: "PENDING",
        assignedTo: null,
        steps: [
          {
            id: "step-1",
            sequence: 1,
            locationId: "loc-storage-1",
            locationCode: "A-01-01",
            productId: "prod-1",
            productSku: "SKU-001",
            productName: "Teclado Mecánico",
            productBarcode: "7501234567890",
            expectedQty: 10,
            scannedQty: 0,
            status: "PENDING",
          },
        ],
      },
    ];

    const mockFetch = createMockFetch(200, {
      success: true,
      data: sampleTasks,
    });

    const client = createWmsClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      fetchImpl: mockFetch,
    });

    const result = await client.listTasks({
      type: "PUTAWAY",
      status: "PENDING",
    });

    expect(result).toEqual(sampleTasks);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/tasks?type=PUTAWAY&status=PENDING",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("fetches single task details via getTask and starts a task via startTask", async () => {
    const taskDetail: WarehouseTaskDTO = {
      id: "task-pick-1",
      orderId: "order-101",
      type: "PICKING",
      status: "IN_PROGRESS",
      assignedTo: "user-op-1",
      steps: [],
    };

    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: { taskId: "task-pick-1", status: "IN_PROGRESS" },
        }),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          success: true,
          data: taskDetail,
        }),
      } as unknown as Response);

    const client = createWmsClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      fetchImpl: mockFetch,
    });

    const startRes = await client.startTask("task-pick-1");
    expect(startRes).toEqual({
      taskId: "task-pick-1",
      status: "IN_PROGRESS",
    });
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3001/api/v1/tasks/task-pick-1/start",
      expect.objectContaining({ method: "POST" }),
    );

    const detailRes = await client.getTask("task-pick-1");
    expect(detailRes).toEqual(taskDetail);
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/api/v1/tasks/task-pick-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("confirms a task step (POST /api/v1/tasks/:id/steps/:stepId/confirm) and sends JSON payload", async () => {
    const mockFetch = createMockFetch(200, {
      success: true,
      data: {
        stepId: "step-1",
        scannedQty: 5,
        expectedQty: 5,
        remainingQty: 0,
        stepStatus: "COMPLETED",
        taskStatus: "COMPLETED",
        taskComplete: true,
      },
    });

    const client = createWmsClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      fetchImpl: mockFetch,
    });

    const res = await client.confirmTaskStep("task-1", "step-1", {
      scannedCode: "A-01-01",
      quantity: 5,
    });

    expect(res.taskComplete).toBe(true);
    expect(res.stepStatus).toBe("COMPLETED");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/tasks/task-1/steps/step-1/confirm",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": "demo-api-key-12345",
        },
        body: JSON.stringify({ scannedCode: "A-01-01", quantity: 5 }),
      }),
    );
  });

  it("confirms a receipt line (POST /api/v1/receipts/:taskId/confirm-line) and returns generated putawayTaskId", async () => {
    const mockFetch = createMockFetch(200, {
      success: true,
      data: {
        stepId: "step-rec-1",
        scannedQty: 20,
        expectedQty: 20,
        stepStatus: "COMPLETED",
        taskStatus: "COMPLETED",
        putawayTaskId: "task-putaway-99",
        remainingQty: 0,
      },
    });

    const client = createWmsClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      fetchImpl: mockFetch,
    });

    const res = await client.confirmReceiptLine("task-rec-1", {
      productId: "prod-1",
      scannedQty: 20,
      barcode: "7501234567890",
    });

    expect(res.putawayTaskId).toBe("task-putaway-99");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/receipts/task-rec-1/confirm-line",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          productId: "prod-1",
          scannedQty: 20,
          barcode: "7501234567890",
        }),
      }),
    );
  });

  it("queries live inventory balances with filters", async () => {
    const balances: InventoryBalanceDTO[] = [
      {
        locationId: "loc-1",
        locationCode: "A-01-01",
        productId: "prod-1",
        productSku: "SKU-001",
        productName: "Monitor 27",
        onHandQty: 15,
        allocatedQty: 3,
        atpQty: 12,
      },
    ];

    const mockFetch = createMockFetch(200, {
      success: true,
      data: balances,
    });

    const client = createWmsClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      fetchImpl: mockFetch,
    });

    const res = await client.getInventoryBalances({ locationId: "loc-1" });
    expect(res).toEqual(balances);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/inventory/balances?locationId=loc-1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("throws WmsApiClientError preserving code, statusCode, and details when API returns ApiError", async () => {
    const mockFetch = createMockFetch(
      422,
      {
        success: false,
        error: {
          code: "INVALID_SCAN",
          message: 'Scanned code "WRONG-99" does not match expected product',
          details: { expected: "SKU-001", scanned: "WRONG-99" },
        },
      },
      false,
    );

    const client = createWmsClient({
      baseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      fetchImpl: mockFetch,
    });

    await expect(
      client.confirmTaskStep("task-1", "step-1", { scannedCode: "WRONG-99" }),
    ).rejects.toMatchObject({
      name: "WmsApiClientError",
      code: "INVALID_SCAN",
      statusCode: 422,
      details: { expected: "SKU-001", scanned: "WRONG-99" },
    });
  });

  it("throws WmsApiClientError with NETWORK_ERROR or INVALID_RESPONSE when fetch or JSON parsing fails", async () => {
    const failingFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: vi.fn().mockRejectedValue(new Error("Unexpected token <")),
      } as unknown as Response);

    const client = createWmsClient({
      baseUrl: "http://localhost:3001",
      fetchImpl: failingFetch,
    });

    await expect(client.listTasks()).rejects.toBeInstanceOf(WmsApiClientError);

    try {
      await client.listTasks();
    } catch (err) {
      expect(err).toBeInstanceOf(WmsApiClientError);
      const wmsErr = err as WmsApiClientError;
      expect(wmsErr.code).toBe("INVALID_RESPONSE");
      expect(wmsErr.statusCode).toBe(502);
    }
  });
});
