// packages/shared-types/src/index.ts
// DTOs y tipos de dominio compartidos entre API, Web y Mobile.
// NO importa nada de Prisma aquí — estos tipos son agnósticos al ORM.

// ─────────────────────────────────────────────────────────────
// ENUMS DE DOMINIO
// ─────────────────────────────────────────────────────────────

export type UserRole = "ADMIN" | "SUPERVISOR" | "OPERATOR";

export type LocationType = "RECEIVING" | "STORAGE" | "PACKING" | "DISPATCH";
export type StorageType = "RACK" | "SHELVING" | "FLOOR";
export type LocationStatus = "ACTIVE" | "BLOCKED";

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

export interface CategoryDTO {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductDTO {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryCode?: string | null;
  weightGrams?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  depthCm?: number | null;
  imageUrl?: string | null;
  isActive: boolean;
}

export interface LocationDTO {
  id: string;
  warehouseId: string;
  code: string;
  type: LocationType;
  storageType?: StorageType | undefined;
  status?: LocationStatus | undefined;
  zone?: string | undefined;
  aisle?: string | null | undefined;
  rack?: string | undefined;
  level?: string | undefined;
  position?: string | undefined;
  generationBatchId?: string | null | undefined;
  description?: string | null | undefined;
  isActive?: boolean | undefined;
  createdAt?: string | undefined;
}

export interface LocationCellDTO {
  id: string;
  code: string;
  zone: string;
  aisle: string | null;
  rack: string;
  level: string;
  position: string;
  storageType: StorageType;
  type: LocationType;
  status: LocationStatus;
  onHandQty: number;
  allocatedQty: number;
  atpQty: number;
  skuCount: number;
}

export interface RackLayoutGroupDTO {
  rack: string;
  storageType: StorageType;
  totalLocations: number;
  occupiedLocations: number;
  blockedLocations: number;
  occupancyRate: number;
  totalOnHand: number;
  totalAllocated: number;
  totalAtp: number;
  levels: Array<{
    level: string;
    positions: LocationCellDTO[];
  }>;
}

export interface AisleLayoutSummaryDTO {
  zone: string;
  aisle: string;
  storageType: StorageType;
  totalLocations: number;
  activeLocations: number;
  occupiedLocations: number;
  blockedLocations: number;
  /** Porcentaje de ocupación: activeLocations === 0 ? 0 : Math.round((occupiedLocations / activeLocations) * 100) */
  occupancyRate: number;
  totalOnHand: number;
  totalAllocated: number;
  totalAtp: number;
}

export interface AisleLayoutDetailDTO {
  warehouseId: string;
  zone: string;
  aisle: string;
  totalLocations: number;
  activeLocations: number;
  occupiedLocations: number;
  blockedLocations: number;
  occupancyRate: number;
  totalOnHand: number;
  totalAllocated: number;
  totalAtp: number;
  racks: RackLayoutGroupDTO[];
}

export interface ZoneLayoutNodeDTO {
  zone: string;
  totalLocations: number;
  activeLocations: number;
  occupiedLocations: number;
  blockedLocations: number;
  occupancyRate: number;
  totalOnHand: number;
  totalAllocated: number;
  totalAtp: number;
  aisles: AisleLayoutSummaryDTO[];
}

export interface WarehouseLayoutSummaryDTO {
  warehouseId: string;
  totalLocations: number;
  activeLocations: number;
  occupiedLocations: number;
  blockedLocations: number;
  occupancyRate: number;
  totalOnHand: number;
  totalAllocated: number;
  totalAtp: number;
  zones: ZoneLayoutNodeDTO[];
}

export interface CreateLocationInput {
  warehouseId: string;
  code?: string | undefined;
  type: LocationType;
  storageType?: StorageType | undefined;
  status?: LocationStatus | undefined;
  zone?: string | undefined;
  aisle?: string | null | undefined;
  rack?: string | undefined;
  level?: string | undefined;
  position?: string | undefined;
  description?: string | null | undefined;
}

export interface UpdateLocationInput {
  status?: LocationStatus | undefined;
  storageType?: StorageType | undefined;
  description?: string | null | undefined;
  zone?: string | undefined;
  aisle?: string | null | undefined;
  rack?: string | undefined;
  level?: string | undefined;
  position?: string | undefined;
}

export interface GenerateLocationBlockInput {
  warehouseId: string;
  type: LocationType;
  storageType: StorageType;
  zone: string;
  aisle?: string | null;
  rackStart: number;
  rackEnd: number;
  levelStart: number;
  levelEnd: number;
  positionsPerLevel: number;
  dryRun?: boolean;
}

export interface GenerateLocationBlockResultDTO {
  dryRun: boolean;
  batchId?: string | null;
  totalGenerated: number;
  createdCount: number;
  skippedCollisionsCount: number;
  collisions: string[];
  creatableCount: number;
  locations: LocationDTO[];
}

export interface DeleteLocationBatchResultDTO {
  batchId: string;
  deletedCount: number;
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

export interface CreateCategoryInput {
  code: string;
  name: string;
  description?: string | undefined;
}

export interface UpdateCategoryInput {
  code?: string | undefined;
  name?: string | undefined;
  description?: string | null | undefined;
  isActive?: boolean | undefined;
}

export interface CreateProductInput {
  sku?: string | undefined;
  name: string;
  barcode?: string | undefined;
  description?: string | undefined;
  categoryId?: string | null | undefined;
  weightGrams?: number | undefined;
  widthCm?: number | undefined;
  heightCm?: number | undefined;
  depthCm?: number | undefined;
  imageUrl?: string | undefined;
}

export interface UpdateProductInput {
  sku?: string | undefined;
  name?: string | undefined;
  barcode?: string | null | undefined;
  description?: string | null | undefined;
  categoryId?: string | null | undefined;
  weightGrams?: number | null | undefined;
  widthCm?: number | null | undefined;
  heightCm?: number | null | undefined;
  depthCm?: number | null | undefined;
  imageUrl?: string | null | undefined;
  isActive?: boolean | undefined;
}

export interface ListProductsFilters {
  sku?: string | undefined;
  q?: string | undefined;
  barcode?: string | undefined;
  categoryId?: string | undefined;
  includeInactive?: boolean | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}

export interface PaginationMetaDTO {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface TenantUserDTO {
  id: string;
  tenantId: string;
  clerkId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

export interface CreateTenantUserInput {
  name: string;
  email: string;
  role: UserRole;
  clerkId?: string | undefined;
}

export interface UpdateTenantUserInput {
  name?: string | undefined;
  email?: string | undefined;
  role?: UserRole | undefined;
  isActive?: boolean | undefined;
}

export interface ListTenantUsersFilters {
  role?: UserRole | undefined;
  includeInactive?: boolean | undefined;
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
// INTEGRACIONES EXTERNAS Y WEBHOOKS (Hito 4 — F4.2)
// ─────────────────────────────────────────────────────────────

export interface ExternalOrderLineInput {
  productId?: string | undefined;
  sku?: string | undefined;
  requestedQty: number;
  unitPrice?: number | undefined;
}

export interface IngestExternalOrderInput {
  warehouseId: string;
  externalId: string;
  externalRef?: string | undefined;
  customerName?: string | undefined;
  customerEmail?: string | undefined;
  priority?: number | undefined;
  notes?: string | undefined;
  autoAllocate?: boolean | undefined;
  lines: ExternalOrderLineInput[];
}

export interface IngestExternalOrderResult {
  orderId: string;
  externalId: string;
  status: OrderStatus;
  idempotentReplay: boolean;
  allocatedTaskId: string | null;
  allocationError?: string | undefined;
}

export interface OrderShippedWebhookLine {
  productId: string;
  sku?: string | undefined;
  requestedQty: number;
  pickedQty: number;
}

export interface OrderShippedWebhookPayload {
  event: "order.shipped";
  orderId: string;
  externalId: string | null;
  externalRef: string | null;
  tenantId: string;
  warehouseId: string;
  shippedAt: string;
  lines: OrderShippedWebhookLine[];
}

// ─────────────────────────────────────────────────────────────
// OBSERVABILIDAD Y DIAGNÓSTICOS (Hito 7 — F7.1)
// ─────────────────────────────────────────────────────────────

export const CORRELATION_ID_HEADER = "x-correlation-id" as const;

export interface DiagnosticErrorRecord {
  id: string;
  tenantId: string;
  correlationId: string;
  errorCode: string;
  message: string;
  statusCode: number;
  method: string;
  path: string;
  userId?: string | null | undefined;
  details?: unknown;
  occurredAt: string; // ISO 8601
}

export interface ListDiagnosticErrorsFilters {
  limit?: number | undefined;
  errorCode?: string | undefined;
  correlationId?: string | undefined;
}

// ─────────────────────────────────────────────────────────────
// SEGURIDAD MULTI-TENANT Y CONTEXTO RLS (Hito 7 — F7.2)
// ─────────────────────────────────────────────────────────────

export const TENANT_CONTEXT_GUC = "app.current_tenant_id" as const;
export const AUTH_CLERK_LOOKUP_GUC = "app.auth_clerk_id" as const;

export type TenantIsolationLevel =
  | "ReadUncommitted"
  | "ReadCommitted"
  | "RepeatableRead"
  | "Serializable";

export interface TenantContextOptions {
  isolationLevel?: TenantIsolationLevel | undefined;
  timeoutMs?: number | undefined;
  maxWaitMs?: number | undefined;
}

export interface RlsTablePolicySpec {
  tableName: string;
  policyName: string;
  kind: "direct_tenant_column" | "parent_relation" | "auth_controlled";
  tenantColumn?: string | undefined;
  parentTable?: string | undefined;
  foreignKeyColumn?: string | undefined;
  enableRls: true;
  forceRls: true;
}

// ─────────────────────────────────────────────────────────────
// OFFLINE-FIRST & IDEMPOTENCIA (Hito 6 — F6.1)
// ─────────────────────────────────────────────────────────────

export type SyncTaskActionType = "CONFIRM_STEP" | "CONFIRM_RECEIPT_LINE";

export type SyncBatchItemStatus =
  | "APPLIED"
  | "ALREADY_APPLIED"
  | "CONFLICT"
  | "REJECTED";

export interface ConfirmTaskStepPayload {
  taskId: string;
  stepId: string;
  scannedCode: string;
  quantity?: number | undefined;
  reportException?: boolean | undefined;
  exceptionNote?: string | undefined;
}

export interface ConfirmReceiptLinePayload {
  taskId: string;
  productId: string;
  scannedQty: number;
  barcode?: string | undefined;
}

export interface SyncTaskBatchItem {
  idempotencyKey: string;
  action: SyncTaskActionType;
  occurredAt: string; // ISO 8601 cliente
  payload: ConfirmTaskStepPayload | ConfirmReceiptLinePayload;
}

export interface SyncBatchItemResult {
  idempotencyKey: string;
  action: SyncTaskActionType;
  status: SyncBatchItemStatus;
  occurredAt: string;
  receivedAt: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface SyncTaskBatchRequest {
  items: SyncTaskBatchItem[];
}

export interface SyncTaskBatchResult {
  total: number;
  appliedCount: number;
  alreadyAppliedCount: number;
  conflictCount: number;
  rejectedCount: number;
  processedAt: string;
  items: SyncBatchItemResult[];
}

export interface IdempotencyRecordDTO<T = unknown> {
  id: string;
  tenantId: string;
  idempotencyKey: string;
  action: string;
  requestHash?: string | null;
  responseStatus: number;
  responseBody: T;
  occurredAt?: string | null;
  createdAt: string;
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
    correlationId?: string | undefined;
    details?: unknown;
  };
}

// Códigos de error de dominio
export type WmsErrorCode =
  | "INSUFFICIENT_STOCK"
  | "PRODUCT_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "USER_NOT_FOUND"
  | "LOCATION_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "INVALID_SCAN"
  | "ORDER_ALREADY_ALLOCATED"
  | "WRONG_STEP_SEQUENCE"
  | "TENANT_MISMATCH"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "CONFIGURATION_ERROR"
  | "CONFLICT"
  | "INVALID_LOCATION_CODE"
  | "INVALID_STORAGE_TOPOLOGY"
  | "LOCATION_BATCH_IN_USE";

// ─────────────────────────────────────────────────────────────
// DESIGN SYSTEM COMPARTIDO (S5 dark-data-dense / P2 / T3)
// ─────────────────────────────────────────────────────────────

export * from "./design-tokens.js";
export * from "./api-helpers.js";
export * from "./barcode-payload.js";
export * from "./topology.js";

