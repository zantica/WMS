// apps/api/src/use-cases/security/tenant-context.ts
// Casos de uso y validadores de dominio para el aislamiento de contexto multi-tenant (F7.2).
// Totalmente desacoplado de Fastify y Prisma — depende únicamente del puerto `TenantContextPort`
// y de los contratos compartidos en `@wms/shared-types`.

import { AsyncLocalStorage } from "node:async_hooks";
import type { TenantContextOptions } from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type {
  TenantContextPort,
  TenantScopedWork,
} from "../../ports/tenant-context.js";

export interface AmbientTenantContextFrame<TScope = unknown> {
  tenantId: string;
  scope: TScope;
}

const ambientTenantStorage =
  new AsyncLocalStorage<AmbientTenantContextFrame>();

/**
 * Ejecuta una función dentro de un marco de contexto de tenant en `AsyncLocalStorage`.
 * Usado por los adaptadores de `TenantContextPort` para propagar la transacción activa
 * a casos de uso anidados (`moveStock`, `allocateOrder`, `cancelOrder`, etc.) sin
 * acoplarse al mock de `@wms/db` en tests unitarios.
 */
export function runWithAmbientTenantScope<TResult, TScope = unknown>(
  frame: AmbientTenantContextFrame<TScope>,
  fn: () => Promise<TResult>,
): Promise<TResult> {
  return ambientTenantStorage.run(frame, fn);
}

/**
 * Devuelve el marco de contexto de tenant activo en la pila asíncrona actual (o `undefined`).
 */
export function getAmbientTenantScope<TScope = unknown>():
  | AmbientTenantContextFrame<TScope>
  | undefined {
  return ambientTenantStorage.getStore() as
    | AmbientTenantContextFrame<TScope>
    | undefined;
}

/**
 * Patrón estricto para identificadores de tenant (`cuid`, `uuid`, slugs seguros).
 * Prohíbe espacios, comillas, puntos y coma, saltos de línea o caracteres de control.
 */
export const VALID_TENANT_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

/**
 * Valida y normaliza un `tenantId`.
 * Lanza `WmsError("VALIDATION_ERROR", ..., 400)` si es nulo, vacío, demasiado largo
 * o contiene caracteres potencialmente inseguros (ej. intento de inyección SQL/GUC).
 */
export function validateTenantId(tenantId: unknown): string {
  if (typeof tenantId !== "string") {
    throw new WmsError(
      "VALIDATION_ERROR",
      "tenantId is required and must be a non-empty string",
      400,
    );
  }

  const trimmed = tenantId.trim();
  if (trimmed.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "tenantId cannot be empty or whitespace",
      400,
    );
  }

  if (trimmed.length > 128) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "tenantId exceeds maximum length of 128 characters",
      400,
      { maxLength: 128, actualLength: trimmed.length },
    );
  }

  if (!VALID_TENANT_ID_PATTERN.test(trimmed)) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "tenantId contains invalid or unsafe characters",
      400,
    );
  }

  return trimmed;
}

/**
 * Verifica que un registro o recurso pertenezca al `expectedTenantId` activo.
 * Lanza `WmsError("TENANT_MISMATCH", ..., 403)` ante cualquier discrepancia o ausencia.
 */
export function assertTenantOwnership(
  expectedTenantId: unknown,
  resourceTenantId: unknown,
  resourceName = "Resource",
): void {
  const validExpected = validateTenantId(expectedTenantId);
  if (
    typeof resourceTenantId !== "string" ||
    resourceTenantId.trim().length === 0 ||
    resourceTenantId.trim() !== validExpected
  ) {
    throw new WmsError(
      "TENANT_MISMATCH",
      `${resourceName} does not belong to the active tenant context`,
      403,
      {
        resourceName,
        expectedTenantId: validExpected,
      },
    );
  }
}

export interface ExecuteInTenantContextParams<TResult, TScope = unknown> {
  tenantContext: TenantContextPort<TScope>;
  tenantId: string;
  work: TenantScopedWork<TResult, TScope>;
  options?: TenantContextOptions | undefined;
}

/**
 * Caso de uso hexagonal para ejecutar una unidad de trabajo dentro del contexto aislado
 * de un tenant (`TenantContextPort`).
 *
 * Invariantes:
 * 1. Valida que `tenantId` sea no vacío y cumpla `VALID_TENANT_ID_PATTERN`.
 * 2. Si ya existe un `currentTenantId` activo en el puerto y difiere del solicitado,
 *    lanza `WmsError("TENANT_MISMATCH", ..., 403)` antes de tocar el recurso subyacente.
 * 3. Propaga opciones de aislamiento (`Serializable`, `timeoutMs`, `maxWaitMs`) al puerto.
 */
export async function executeInTenantContext<TResult, TScope = unknown>(
  params: ExecuteInTenantContextParams<TResult, TScope>,
): Promise<TResult> {
  const normalizedTenantId = validateTenantId(params.tenantId);

  const currentTenant = params.tenantContext.getCurrentTenantId();
  if (currentTenant !== null && currentTenant !== normalizedTenantId) {
    throw new WmsError(
      "TENANT_MISMATCH",
      `Cannot switch active tenant context from "${currentTenant}" to "${normalizedTenantId}"`,
      403,
      {
        activeTenantId: currentTenant,
        requestedTenantId: normalizedTenantId,
      },
    );
  }

  if (params.options !== undefined) {
    if (
      params.options.timeoutMs !== undefined &&
      (!Number.isFinite(params.options.timeoutMs) ||
        params.options.timeoutMs <= 0)
    ) {
      throw new WmsError(
        "VALIDATION_ERROR",
        "timeoutMs must be a positive number",
        400,
      );
    }

    if (
      params.options.maxWaitMs !== undefined &&
      (!Number.isFinite(params.options.maxWaitMs) ||
        params.options.maxWaitMs <= 0)
    ) {
      throw new WmsError(
        "VALIDATION_ERROR",
        "maxWaitMs must be a positive number",
        400,
      );
    }
  }

  return await params.tenantContext.runWithTenant(
    normalizedTenantId,
    params.work,
    params.options,
  );
}
