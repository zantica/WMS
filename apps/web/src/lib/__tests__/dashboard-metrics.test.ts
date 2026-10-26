// apps/web/src/lib/__tests__/dashboard-metrics.test.ts
// Suite de tests unitarios para los agregadores y filtros puros del Dashboard de Supervisores (@wms/web).

import { describe, expect, it } from "vitest";
import type {
  InventoryBalanceDTO,
  LocationDTO,
  SalesOrderDTO,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import type { KardexTransactionItem } from "../api-client.js";
import {
  computeInventoryKpis,
  filterKardexTransactions,
  groupLocationsByZone,
  summarizeOrdersByStatus,
  summarizeTasksMonitor,
} from "../dashboard-metrics.js";

describe("dashboard-metrics (@wms/web)", () => {
  it("computes inventory KPIs (OnHand, Allocated, ATP, SKU/Location counts, utilizationRate)", () => {
    const emptyKpis = computeInventoryKpis([]);
    expect(emptyKpis).toEqual({
      totalOnHand: 0,
      totalAllocated: 0,
      totalAtp: 0,
      uniqueProductsWithStock: 0,
      uniqueLocationsWithStock: 0,
      utilizationRate: 0,
    });

    const balances: InventoryBalanceDTO[] = [
      {
        locationId: "loc-a1",
        locationCode: "A-01-01",
        productId: "prod-1",
        productSku: "PROD-001",
        productName: "Camiseta",
        onHandQty: 20,
        allocatedQty: 5,
        atpQty: 15,
      },
      {
        locationId: "loc-a2",
        locationCode: "A-02-01",
        productId: "prod-1",
        productSku: "PROD-001",
        productName: "Camiseta",
        onHandQty: 10,
        allocatedQty: 0,
        atpQty: 10,
      },
      {
        locationId: "loc-a3",
        locationCode: "A-03-01",
        productId: "prod-2",
        productSku: "PROD-002",
        productName: "Pantalón",
        onHandQty: 10,
        allocatedQty: 5,
        atpQty: 5,
      },
    ];

    const kpis = computeInventoryKpis(balances);
    expect(kpis).toEqual({
      totalOnHand: 40,
      totalAllocated: 10,
      totalAtp: 30,
      uniqueProductsWithStock: 2,
      uniqueLocationsWithStock: 3,
      utilizationRate: 25,
    });
  });

  it("groups locations by physical zone (RECEIVING -> STORAGE -> PACKING -> DISPATCH) and injects stock occupancy", () => {
    const locations: LocationDTO[] = [
      {
        id: "loc-pack",
        warehouseId: "wh-1",
        code: "PACKING-01",
        type: "PACKING",
      },
      {
        id: "loc-s2",
        warehouseId: "wh-1",
        code: "A-02-01",
        type: "STORAGE",
      },
      {
        id: "loc-s1",
        warehouseId: "wh-1",
        code: "A-01-01",
        type: "STORAGE",
      },
      {
        id: "loc-rec",
        warehouseId: "wh-1",
        code: "RECEPCION-01",
        type: "RECEIVING",
      },
    ];

    const balances: InventoryBalanceDTO[] = [
      {
        locationId: "loc-s1",
        locationCode: "A-01-01",
        productId: "prod-2",
        productSku: "PROD-002",
        productName: "Pantalón",
        onHandQty: 8,
        allocatedQty: 2,
        atpQty: 6,
      },
      {
        locationId: "loc-s1",
        locationCode: "A-01-01",
        productId: "prod-1",
        productSku: "PROD-001",
        productName: "Camiseta",
        onHandQty: 12,
        allocatedQty: 4,
        atpQty: 8,
      },
    ];

    const zones = groupLocationsByZone(locations, balances);
    expect(zones.map((z) => z.zone)).toEqual([
      "RECEIVING",
      "STORAGE",
      "PACKING",
      "DISPATCH",
    ]);

    const storageZone = zones.find((z) => z.zone === "STORAGE");
    expect(storageZone).toBeDefined();
    expect(storageZone?.totalLocations).toBe(2);
    expect(storageZone?.occupiedLocations).toBe(1);
    expect(storageZone?.totalOnHand).toBe(20);
    expect(storageZone?.totalAllocated).toBe(6);
    expect(storageZone?.totalAtp).toBe(14);
    expect(storageZone?.locations.map((l) => l.location.code)).toEqual([
      "A-01-01",
      "A-02-01",
    ]);
    expect(storageZone?.locations[0]?.skuCount).toBe(2);
    expect(storageZone?.locations[0]?.isOccupied).toBe(true);
    expect(storageZone?.locations[1]?.isOccupied).toBe(false);
  });

  it("summarizes sales orders by status and extracts ON_HOLD, PACKED, and high priority orders", () => {
    const orders: SalesOrderDTO[] = [
      {
        id: "ord-1",
        externalRef: "#101",
        status: "PENDING",
        priority: 15,
        createdAt: "2026-10-26T00:00:00.000Z",
        lines: [],
      },
      {
        id: "ord-2",
        externalRef: "#102",
        status: "ON_HOLD",
        priority: 20,
        createdAt: "2026-10-26T00:00:00.000Z",
        lines: [],
      },
      {
        id: "ord-3",
        externalRef: "#103",
        status: "PACKED",
        priority: 5,
        createdAt: "2026-10-26T00:00:00.000Z",
        lines: [],
      },
      {
        id: "ord-4",
        externalRef: "#104",
        status: "SHIPPED",
        priority: 50,
        createdAt: "2026-10-26T00:00:00.000Z",
        lines: [],
      },
    ];

    const summary = summarizeOrdersByStatus(orders);
    expect(summary.totalOrders).toBe(4);
    expect(summary.activeOrdersCount).toBe(3);
    expect(summary.countsByStatus.PENDING).toBe(1);
    expect(summary.countsByStatus.ON_HOLD).toBe(1);
    expect(summary.countsByStatus.PACKED).toBe(1);
    expect(summary.countsByStatus.SHIPPED).toBe(1);
    expect(summary.onHoldOrders.map((o) => o.id)).toEqual(["ord-2"]);
    expect(summary.readyToDispatchOrders.map((o) => o.id)).toEqual(["ord-3"]);
    expect(summary.highPriorityOrders.map((o) => o.id)).toEqual([
      "ord-1",
      "ord-2",
    ]);
  });

  it("calculates step progress and identifies exceptions in summarizeTasksMonitor", () => {
    const tasks: WarehouseTaskDTO[] = [
      {
        id: "task-1",
        orderId: "ord-1",
        type: "PICKING",
        status: "IN_PROGRESS",
        steps: [
          {
            id: "s1",
            sequence: 1,
            locationId: "l1",
            locationCode: "A-01-01",
            productId: "p1",
            productSku: "PROD-001",
            productName: "Camiseta",
            expectedQty: 4,
            scannedQty: 4,
            status: "COMPLETED",
          },
          {
            id: "s2",
            sequence: 2,
            locationId: "l2",
            locationCode: "A-02-01",
            productId: "p2",
            productSku: "PROD-002",
            productName: "Pantalón",
            expectedQty: 2,
            scannedQty: 0,
            status: "PENDING",
          },
        ],
      },
      {
        id: "task-2",
        orderId: "ord-2",
        type: "PICKING",
        status: "EXCEPTION",
        steps: [
          {
            id: "s3",
            sequence: 1,
            locationId: "l3",
            locationCode: "A-03-01",
            productId: "p3",
            productSku: "PROD-003",
            productName: "Zapatillas",
            expectedQty: 3,
            scannedQty: 1,
            status: "EXCEPTION",
          },
        ],
      },
    ];

    const monitor = summarizeTasksMonitor(tasks);
    expect(monitor.totalTasks).toBe(2);
    expect(monitor.inProgressCount).toBe(1);
    expect(monitor.exceptionCount).toBe(1);
    expect(monitor.rows[0]?.percent).toBe(50);
    expect(monitor.rows[0]?.scannedUnits).toBe(4);
    expect(monitor.rows[0]?.expectedUnits).toBe(6);
    expect(monitor.tasksWithExceptions).toHaveLength(1);
    expect(monitor.tasksWithExceptions[0]?.task.id).toBe("task-2");
  });

  it("filters Kardex transactions by TxReason and free-text search", () => {
    const txs: KardexTransactionItem[] = [
      {
        id: "tx-1",
        productSku: "PROD-001",
        productName: "Camiseta Básica Blanca",
        fromLocation: "RECEPCION-01",
        toLocation: "A-01-01",
        quantity: 10,
        reason: "PUTAWAY",
        referenceId: "task-put-1",
        notes: "Ubicación inicial",
        createdAt: "2026-10-26T00:00:00.000Z",
      },
      {
        id: "tx-2",
        productSku: "PROD-002",
        productName: "Pantalón Vaquero",
        fromLocation: "A-03-01",
        toLocation: null,
        quantity: 2,
        reason: "ALLOCATION_CANCEL",
        referenceId: "ord-99",
        notes: "Liberación por cancelación de pedido",
        createdAt: "2026-10-26T01:00:00.000Z",
      },
    ];

    expect(filterKardexTransactions(txs, { reason: "ALL" })).toHaveLength(2);
    expect(
      filterKardexTransactions(txs, { reason: "ALLOCATION_CANCEL" }),
    ).toHaveLength(1);
    expect(
      filterKardexTransactions(txs, { reason: "ALL", search: "a-01-01" }),
    ).toHaveLength(1);
    expect(
      filterKardexTransactions(txs, { search: "cancelación" }),
    ).toHaveLength(1);
    expect(
      filterKardexTransactions(txs, { search: "inexistente-xyz" }),
    ).toHaveLength(0);
  });
});
