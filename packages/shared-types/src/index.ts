// packages/shared-types/src/index.ts
// DTOs y tipos de dominio compartidos entre API, Web y Mobile.
// NO importa nada de Prisma aquí — estos tipos son agnósticos al ORM.

// ─────────────────────────────────────────────────────────────
// ENUMS DE DOMINIO
// ─────────────────────────────────────────────────────────────

export type UserRole = "ADMIN" | "SUPERVISOR" | "OPERATOR";

export type LocationType = "RECEIVING" | "STORAGE" | "PACKING" | "DISPATCH";

export type TxReason =
  | "INBOUND_RECEIPT"
  | "PUTAWAY"
  | "ALLOCATION"
  | "ALLOCATION_CANCEL"
  | "PICK"
  | "OUTBOUND_SHIPMENT"
  | "ADJUSTMENT"
  | "RETURN_INBOUND";

export type OrderStatus =
  | "PENDING"
  | "ALLOCATED"
  | "PICKING"
  | "PACKED"
  | "SHIPPED"
  | "CANCELLED"
  | "ON_HOLD";

export type TaskType = "RECEIVING" | "PUTAWAY" | "PICKING" | "PACKING";
export type TaskStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "EXCEPTION";
export type StepStatus = "PENDING" | "COMPLETED" | "EXCEPTION" | "SKIPPED";

// ─────────────────────────────────────────────────────────────
// DTOs DE RESPUESTA (lo que devuelve la API)
// ─────────────────────────────────────────────────────────────

export interface ProductDTO {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  description?: string | null;
  weightGrams?: number | null;
  imageUrl?: string | null;
  isActive: boolean;
}

export interface LocationDTO {
  id: string;
  warehouseId: string;
  code: string;
  type: LocationType;
  description?: string | null;
}

export interface InventoryBalanceDTO {
  locationId: string;
  locationCode: string;
  productId: string;
  productSku: string;
  productName: string;
  onHandQty: number;
  allocatedQty: number;
  /** Available To Promise: onHandQty - allocatedQty */
  atpQty: number;
}

export interface SalesOrderDTO {
  id: string;
  externalId?: string | null;
  externalRef?: string | null;
  status: OrderStatus;
  customerName?: string | null;
  priority: number;
  createdAt: string; // ISO 8601
  lines: OrderLineDTO[];
}

export interface OrderLineDTO {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  requestedQty: number;
  pickedQty: number;
}

export interface WarehouseTaskDTO {
  id: string;
  orderId: string | null;
  type: TaskType;
  status: TaskStatus;
  assignedTo?: string | null;
  steps: TaskStepDTO[];
}

export interface TaskStepDTO {
  id: string;
  sequence: number;
  locationId: string;
  locationCode: string;
  productId: string;
  productSku: string;
  productName: string;
  productBarcode?: string | null;
  expectedQty: number;
  scannedQty: number;
  status: StepStatus;
}

// ─────────────────────────────────────────────────────────────
// DTOs DE SOLICITUD (lo que envía el cliente a la API)
// ─────────────────────────────────────────────────────────────

export interface CreateProductInput {
  sku: string;
  name: string;
  barcode?: string;
  description?: string;
  weightGrams?: number;
}

export interface CreateLocationInput {
  warehouseId: string;
  code: string;
  type: LocationType;
  description?: string;
}

export interface CreateOrderInput {
  warehouseId: string;
  externalId?: string;
  externalRef?: string;
  customerName?: string;
  customerEmail?: string;
  priority?: number;
  notes?: string;
  lines: {
    productId: string;
    requestedQty: number;
    unitPrice?: number;
  }[];
}

export interface ConfirmScanInput {
  /** Código escaneado (barcode del producto o code de la ubicación) */
  scannedCode: string;
  quantity?: number;
}

export interface AdjustmentInput {
  locationId: string;
  productId: string;
  quantityDelta: number; // Positivo = añadir, negativo = quitar
  notes: string; // Obligatorio para trazabilidad
}

// ─────────────────────────────────────────────────────────────
// RESPUESTAS ENVOLVENTES
// ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Códigos de error de dominio
export type WmsErrorCode =
  | "INSUFFICIENT_STOCK"
  | "PRODUCT_NOT_FOUND"
  | "LOCATION_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "INVALID_SCAN"
  | "ORDER_ALREADY_ALLOCATED"
  | "WRONG_STEP_SEQUENCE"
  | "TENANT_MISMATCH"
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR";
