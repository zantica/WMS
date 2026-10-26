// apps/web/src/lib/dashboard-metrics.ts
// Funciones puras y deterministas de agregación, cálculo de KPIs y filtrado para el Dashboard Web (@wms/web).
// Respeta las fronteras del monorepo: depende únicamente de @wms/shared-types y tipos locales.

import type {
  InventoryBalanceDTO,
  LocationDTO,
  LocationType,
  OrderStatus,
  SalesOrderDTO,
  TxReason,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import type { KardexTransactionItem } from "./api-client.js";

export const LOCATION_ZONE_ORDER: readonly LocationType[] = [
  "RECEIVING",
  "STORAGE",
  "PACKING",
  "DISPATCH",
] as const;

export const ORDER_STATUS_LIST: readonly OrderStatus[] = [
  "PENDING",
  "ALLOCATED",
  "PICKING",
  "PACKED",
  "SHIPPED",
  "ON_HOLD",
  "CANCELLED",
] as const;

export interface InventoryKpis {
  totalOnHand: number;
  totalAllocated: number;
  totalAtp: number;
  uniqueProductsWithStock: number;
  uniqueLocationsWithStock: number;
  /** Porcentaje de stock reservado sobre stock físico: (totalAllocated / totalOnHand) * 100 */
  utilizationRate: number;
}

export interface LocationOccupancyNode {
  location: LocationDTO;
  onHandQty: number;
  allocatedQty: number;
  atpQty: number;
  skuCount: number;
  isOccupied: boolean;
  items: InventoryBalanceDTO[];
}

export interface ZoneMapGroup {
  zone: LocationType;
  label: string;
  totalLocations: number;
  occupiedLocations: number;
  totalOnHand: number;
  totalAllocated: number;
  totalAtp: number;
  locations: LocationOccupancyNode[];
}

export interface OrdersStatusSummary {
  totalOrders: number;
  activeOrdersCount: number;
  countsByStatus: Record<OrderStatus, number>;
  onHoldOrders: SalesOrderDTO[];
  readyToDispatchOrders: SalesOrderDTO[];
  highPriorityOrders: SalesOrderDTO[];
}

export interface TaskMonitorRow {
  task: WarehouseTaskDTO;
  completedSteps: number;
  totalSteps: number;
  exceptionSteps: number;
  pendingSteps: number;
  scannedUnits: number;
  expectedUnits: number;
  percent: number;
  hasException: boolean;
}

export interface TasksMonitorSummary {
  totalTasks: number;
  pendingCount: number;
  inProgressCount: number;
  exceptionCount: number;
  completedCount: number;
  rows: TaskMonitorRow[];
  tasksWithExceptions: TaskMonitorRow[];
}

export interface KardexFilterQuery {
  reason?: TxReason | "ALL" | undefined;
  search?: string | undefined;
}

const ZONE_LABELS: Record<LocationType, string> = {
  RECEIVING: "Recepción (Muelle de Entrada)",
  STORAGE: "Almacenaje (Estanterías de Picking)",
  PACKING: "Packing (Mesa de Empaquetado)",
  DISPATCH: "Despacho (Muelle de Salida)",
};

/**
 * Calcula los KPIs globales del inventario a partir de los snapshots de `InventoryBalanceDTO`.
 */
export function computeInventoryKpis(
  balances: readonly InventoryBalanceDTO[],
): InventoryKpis {
  let totalOnHand = 0;
  let totalAllocated = 0;
  let totalAtp = 0;
  const productIds = new Set<string>();
  const locationIds = new Set<string>();

  for (const b of balances) {
    totalOnHand += b.onHandQty;
    totalAllocated += b.allocatedQty;
    totalAtp += b.atpQty;
    if (b.onHandQty > 0) {
      productIds.add(b.productId);
      locationIds.add(b.locationId);
    }
  }

  const utilizationRate =
    totalOnHand > 0
      ? Math.round((totalAllocated / totalOnHand) * 10000) / 100
      : 0;

  return {
    totalOnHand,
    totalAllocated,
    totalAtp,
    uniqueProductsWithStock: productIds.size,
    uniqueLocationsWithStock: locationIds.size,
    utilizationRate,
  };
}

/**
 * Agrupa las ubicaciones del almacén por zona física (`RECEIVING` -> `STORAGE` -> `PACKING` -> `DISPATCH`)
 * y cruza cada ubicación con sus saldos de inventario en vivo para renderizar el Mapa de Ubicaciones.
 */
export function groupLocationsByZone(
  locations: readonly LocationDTO[],
  balances: readonly InventoryBalanceDTO[],
): ZoneMapGroup[] {
  const balancesByLocation = new Map<string, InventoryBalanceDTO[]>();
  for (const b of balances) {
    const existing = balancesByLocation.get(b.locationId);
    if (existing) {
      existing.push(b);
    } else {
      balancesByLocation.set(b.locationId, [b]);
    }
  }

  return LOCATION_ZONE_ORDER.map((zone) => {
    const zoneLocations = locations
      .filter((loc) => loc.type === zone)
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code));

    let occupiedLocations = 0;
    let zoneOnHand = 0;
    let zoneAllocated = 0;
    let zoneAtp = 0;

    const nodes: LocationOccupancyNode[] = zoneLocations.map((loc) => {
      const items = (balancesByLocation.get(loc.id) ?? [])
        .slice()
        .sort((a, b) => a.productSku.localeCompare(b.productSku));

      let onHandQty = 0;
      let allocatedQty = 0;
      let atpQty = 0;
      const skus = new Set<string>();

      for (const item of items) {
        onHandQty += item.onHandQty;
        allocatedQty += item.allocatedQty;
        atpQty += item.atpQty;
        if (item.onHandQty > 0) {
          skus.add(item.productId);
        }
      }

      const isOccupied = onHandQty > 0;
      if (isOccupied) {
        occupiedLocations += 1;
      }

      zoneOnHand += onHandQty;
      zoneAllocated += allocatedQty;
      zoneAtp += atpQty;

      return {
        location: loc,
        onHandQty,
        allocatedQty,
        atpQty,
        skuCount: skus.size,
        isOccupied,
        items,
      };
    });

    return {
      zone,
      label: ZONE_LABELS[zone],
      totalLocations: zoneLocations.length,
      occupiedLocations,
      totalOnHand: zoneOnHand,
      totalAllocated: zoneAllocated,
      totalAtp: zoneAtp,
      locations: nodes,
    };
  });
}

/**
 * Resume el estado de la cartera de pedidos (`SalesOrderDTO`), identificando bloqueos (`ON_HOLD`),
 * pedidos listos para despacho (`PACKED`) y pedidos de alta prioridad (`priority >= 10`).
 */
export function summarizeOrdersByStatus(
  orders: readonly SalesOrderDTO[],
): OrdersStatusSummary {
  const countsByStatus: Record<OrderStatus, number> = {
    PENDING: 0,
    ALLOCATED: 0,
    PICKING: 0,
    PACKED: 0,
    SHIPPED: 0,
    ON_HOLD: 0,
    CANCELLED: 0,
  };

  const onHoldOrders: SalesOrderDTO[] = [];
  const readyToDispatchOrders: SalesOrderDTO[] = [];
  const highPriorityOrders: SalesOrderDTO[] = [];
  let activeOrdersCount = 0;

  for (const order of orders) {
    countsByStatus[order.status] = (countsByStatus[order.status] ?? 0) + 1;

    const isTerminal =
      order.status === "SHIPPED" || order.status === "CANCELLED";
    if (!isTerminal) {
      activeOrdersCount += 1;
    }

    if (order.status === "ON_HOLD") {
      onHoldOrders.push(order);
    }

    if (order.status === "PACKED") {
      readyToDispatchOrders.push(order);
    }

    if (!isTerminal && order.priority >= 10) {
      highPriorityOrders.push(order);
    }
  }

  return {
    totalOrders: orders.length,
    activeOrdersCount,
    countsByStatus,
    onHoldOrders,
    readyToDispatchOrders,
    highPriorityOrders,
  };
}

/**
 * Calcula el avance operativo de las tareas de piso (`WarehouseTaskDTO`) y detecta excepciones activas.
 */
export function summarizeTasksMonitor(
  tasks: readonly WarehouseTaskDTO[],
): TasksMonitorSummary {
  let pendingCount = 0;
  let inProgressCount = 0;
  let exceptionCount = 0;
  let completedCount = 0;

  const rows: TaskMonitorRow[] = tasks.map((task) => {
    if (task.status === "PENDING") pendingCount += 1;
    else if (task.status === "IN_PROGRESS") inProgressCount += 1;
    else if (task.status === "EXCEPTION") exceptionCount += 1;
    else if (task.status === "COMPLETED") completedCount += 1;

    let completedSteps = 0;
    let exceptionSteps = 0;
    let pendingSteps = 0;
    let scannedUnits = 0;
    let expectedUnits = 0;

    for (const step of task.steps) {
      scannedUnits += step.scannedQty;
      expectedUnits += step.expectedQty;
      if (step.status === "COMPLETED") {
        completedSteps += 1;
      } else if (step.status === "EXCEPTION") {
        exceptionSteps += 1;
      } else if (step.status === "PENDING") {
        pendingSteps += 1;
      }
    }

    const totalSteps = task.steps.length;
    const percent =
      totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const hasException = task.status === "EXCEPTION" || exceptionSteps > 0;

    return {
      task,
      completedSteps,
      totalSteps,
      exceptionSteps,
      pendingSteps,
      scannedUnits,
      expectedUnits,
      percent,
      hasException,
    };
  });

  const tasksWithExceptions = rows.filter((row) => row.hasException);

  return {
    totalTasks: tasks.length,
    pendingCount,
    inProgressCount,
    exceptionCount,
    completedCount,
    rows,
    tasksWithExceptions,
  };
}

/**
 * Filtra movimientos del Libro Mayor Inmutable (Kardex) por motivo contable (`TxReason`)
 * y término de búsqueda libre (SKU, nombre de producto, ubicaciones origen/destino, referencia o notas).
 */
export function filterKardexTransactions(
  transactions: readonly KardexTransactionItem[],
  query: KardexFilterQuery,
): KardexTransactionItem[] {
  const reasonFilter =
    query.reason && query.reason !== "ALL" ? query.reason : undefined;
  const searchNormalized = query.search?.trim().toLowerCase() ?? "";

  return transactions.filter((tx) => {
    if (reasonFilter && tx.reason !== reasonFilter) {
      return false;
    }

    if (searchNormalized.length === 0) {
      return true;
    }

    const haystack = [
      tx.productSku,
      tx.productName,
      tx.fromLocation ?? "",
      tx.toLocation ?? "",
      tx.referenceId ?? "",
      tx.notes ?? "",
      tx.userId ?? "",
      tx.reason,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchNormalized);
  });
}
