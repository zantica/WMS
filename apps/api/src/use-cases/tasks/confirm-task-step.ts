// apps/api/src/use-cases/tasks/confirm-task-step.ts
// Caso de uso: Confirmar un paso de tarea operativa (PUTAWAY o PICKING) o reportar excepción.
// Orquesta WarehouseTask/TaskStep e InventoryBalance dentro de un UnitOfWork Serializable.
//
// Hito 6 (F6.1): Soporta idempotencia transaccional mediante el puerto IdempotencyStore.
// Reintentos con la misma idempotencyKey devuelven ALREADY_APPLIED con el resultado original
// sin duplicar InventoryTransaction ni alterar InventoryBalance.

import { InventoryBalance, Quantity } from "@wms/domain";
import { WmsError } from "../../plugins/error-handler.js";
import {
  handlePickingException,
  type ReplacementStepInfo,
} from "../inventory/handle-picking-exception.js";
import { moveStock } from "../inventory/move-stock.js";
import type { IdempotencyStore } from "../../ports/idempotency-store.js";
import { PrismaIdempotencyStore } from "../../adapters/prisma-idempotency-store.js";
import { DEFAULT_TX_TIMEOUT_MS, type UnitOfWork } from "../../ports/unit-of-work.js";
import { PrismaUnitOfWork } from "../../adapters/prisma-unit-of-work.js";
import { rethrowDomainErrorAsWmsError } from "../../shared/domain-error-mapper.js";

export interface ConfirmTaskStepParams {
  taskId: string;
  stepId: string;
  tenantId: string;
  scannedCode: string;
  quantity?: number | undefined;
  reportException?: boolean | undefined;
  exceptionNote?: string | undefined;
  userId?: string | undefined;
  idempotencyKey?: string | undefined;
  occurredAt?: Date | string | undefined;
  idempotencyStore?: IdempotencyStore | undefined;
  unitOfWork?: UnitOfWork | undefined;
  tx?: unknown;
}

export interface ConfirmTaskStepResult {
  stepId: string;
  scannedQty: number;
  expectedQty: number;
  remainingQty: number;
  stepStatus: "COMPLETED" | "PENDING" | "EXCEPTION";
  taskStatus: "IN_PROGRESS" | "COMPLETED" | "EXCEPTION";
  taskComplete: boolean;
  note?: string | undefined;
  reallocated?: boolean | undefined;
  orderStatus?: string | undefined;
  replacementSteps?: ReplacementStepInfo[] | undefined;
  idempotencyStatus?: "APPLIED" | "ALREADY_APPLIED" | undefined;
}

function isUniqueConstraintError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const code = (err as { code?: string }).code;
    const msg = (err as { message?: string }).message ?? "";
    return code === "P2002" || code === "23505" || msg.includes("Unique constraint");
  }
  return false;
}

/**
 * Confirma el escaneo de un paso en una tarea de almacén (PUTAWAY / PICKING)
 * o registra una excepción reportada por el operario.
 */
export async function confirmTaskStep(
  params: ConfirmTaskStepParams,
): Promise<ConfirmTaskStepResult> {
  const {
    taskId,
    stepId,
    tenantId,
    scannedCode,
    quantity,
    reportException,
    exceptionNote,
    userId,
    idempotencyKey,
    occurredAt,
  } = params;

  const store = params.idempotencyStore ?? new PrismaIdempotencyStore();
  const uow = params.unitOfWork ?? new PrismaUnitOfWork(undefined, params.tx);

  // ── 0. Comprobación de idempotencia previa ─────────────────────────────
  if (idempotencyKey) {
    const existing = await store.find<ConfirmTaskStepResult>(
      tenantId,
      idempotencyKey,
      params.tx,
    );
    if (existing) {
      return {
        ...existing.responseBody,
        idempotencyStatus: "ALREADY_APPLIED",
      };
    }
  }

  try {
    return await uow.execute(
      tenantId,
      async (repos) => {
        if (idempotencyKey) {
          const existingInTx = await store.find<ConfirmTaskStepResult>(
            tenantId,
            idempotencyKey,
            repos.txScope,
          );
          if (existingInTx) {
            return {
              ...existingInTx.responseBody,
              idempotencyStatus: "ALREADY_APPLIED",
            };
          }
        }

        const taskRecord = await repos.tasks.findById(tenantId, taskId);
        if (!taskRecord) {
          throw new WmsError("TASK_NOT_FOUND", `Task ${taskId} not found`, 404);
        }

        const { task: taskAgg, details } = taskRecord;
        const stepData = details.steps.find((s) => s.id === stepId);
        if (!stepData) {
          throw new WmsError("TASK_NOT_FOUND", `Step ${stepId} not found`, 404);
        }

        if (taskAgg.status === "COMPLETED" || taskAgg.status === "CANCELLED") {
          throw new WmsError(
            "VALIDATION_ERROR",
            `Task ${taskId} is already ${taskAgg.status}`,
            409,
          );
        }

        if (stepData.status === "COMPLETED") {
          throw new WmsError(
            "VALIDATION_ERROR",
            `Step ${stepId} is already completed`,
            409,
          );
        }

        if (stepData.status === "EXCEPTION" || stepData.status === "SKIPPED") {
          throw new WmsError(
            "VALIDATION_ERROR",
            `Step ${stepId} is already ${stepData.status}`,
            409,
          );
        }

        // ── 1. Excepción reportada por el operario ─────────────────────────
        if (reportException || exceptionNote) {
          const note = exceptionNote ?? "Operator reported exception";

          if (details.type === "PICKING") {
            const exceptionResult = await handlePickingException({
              taskId: taskAgg.id,
              stepId: stepData.id,
              tenantId,
              exceptionNote: note,
              ...(userId ? { userId } : {}),
              unitOfWork: uow,
            });

            const exResult: ConfirmTaskStepResult = {
              stepId: stepData.id,
              scannedQty: stepData.scannedQty,
              expectedQty: stepData.expectedQty,
              remainingQty: Math.max(0, stepData.expectedQty - stepData.scannedQty),
              stepStatus: "EXCEPTION",
              taskStatus: exceptionResult.taskStatus,
              taskComplete: false,
              note: exceptionResult.note,
              reallocated: exceptionResult.reallocated,
              orderStatus: exceptionResult.orderStatus,
              replacementSteps: exceptionResult.replacementSteps,
              idempotencyStatus: idempotencyKey ? "APPLIED" : undefined,
            };

            if (idempotencyKey) {
              await store.save(
                {
                  tenantId,
                  idempotencyKey,
                  action: "CONFIRM_TASK_STEP",
                  responseBody: exResult,
                  occurredAt,
                },
                repos.txScope,
              );
            }

            return exResult;
          }

          if (taskAgg.status === "EXCEPTION") {
            taskAgg.start();
          }
          taskAgg.escalateStepException(stepData.id);
          await repos.tasks.save(taskAgg, {
            stepUpdates: {
              [stepData.id]: { exceptionNote: note },
            },
          });

          const genericExResult: ConfirmTaskStepResult = {
            stepId: stepData.id,
            scannedQty: stepData.scannedQty,
            expectedQty: stepData.expectedQty,
            remainingQty: Math.max(0, stepData.expectedQty - stepData.scannedQty),
            stepStatus: "EXCEPTION",
            taskStatus: "EXCEPTION",
            taskComplete: false,
            note,
            idempotencyStatus: idempotencyKey ? "APPLIED" : undefined,
          };

          if (idempotencyKey) {
            await store.save(
              {
                tenantId,
                idempotencyKey,
                action: "CONFIRM_TASK_STEP",
                responseBody: genericExResult,
                occurredAt,
              },
              repos.txScope,
            );
          }

          return genericExResult;
        }

        // ── 2. Validar cantidad y código escaneado ─────────────────────────
        const qtyToScan = quantity ?? 1;
        Quantity.positive(qtyToScan);

        const codeMatch =
          scannedCode === stepData.productBarcode ||
          scannedCode === stepData.productSku ||
          scannedCode === stepData.locationCode;

        if (!codeMatch) {
          throw new WmsError(
            "INVALID_SCAN",
            `Scanned code "${scannedCode}" does not match expected product ${stepData.productSku}`,
            422,
            {
              expected: stepData.productBarcode ?? stepData.productSku,
              expectedLocation: stepData.locationCode,
              scanned: scannedCode,
            },
          );
        }

        // ── 3. Aplicar transición del paso y tarea en el agregado ──────────
        if (taskAgg.status === "PENDING" || taskAgg.status === "EXCEPTION") {
          taskAgg.start();
        }
        const { stepStatus, taskStatus } = taskAgg.confirmStep(stepId, qtyToScan);
        const allDone = taskStatus === "COMPLETED";

        // ── 4. Ejecutar movimiento de stock según el tipo de tarea ─────────
        if (details.type === "PICKING") {
          if (!details.orderId) {
            throw new WmsError(
              "ORDER_NOT_FOUND",
              "Picking task has no associated order",
              404,
            );
          }

          const order = await repos.orders.findById(tenantId, details.orderId);
          if (!order) {
            throw new WmsError(
              "ORDER_NOT_FOUND",
              `Order ${details.orderId} not found`,
              404,
            );
          }

          const packingLocation = await repos.inventory.findLocationByType(
            tenantId,
            order.warehouseId,
            "PACKING",
          );
          if (!packingLocation) {
            throw new WmsError(
              "LOCATION_NOT_FOUND",
              "No PACKING location configured for this warehouse",
              409,
            );
          }

          // PICK consume reserva + onHand en STORAGE origen y suma onHand en PACKING destino
          const sourceBalance = await repos.inventory.findBalanceForUpdate(
            tenantId,
            stepData.locationId,
            stepData.productId,
          );
          if (!sourceBalance) {
            throw new WmsError(
              "INSUFFICIENT_STOCK",
              `No stock found for product ${stepData.productId} in location ${stepData.locationId}`,
              409,
            );
          }

          sourceBalance.consume(qtyToScan);
          await repos.inventory.saveBalance(sourceBalance);

          let destBalance = await repos.inventory.findBalanceForUpdate(
            tenantId,
            packingLocation.id,
            stepData.productId,
          );
          if (!destBalance) {
            destBalance = new InventoryBalance({
              id: crypto.randomUUID(),
              tenantId,
              locationId: packingLocation.id,
              productId: stepData.productId,
              onHand: 0,
              allocated: 0,
            });
          }
          destBalance.receive(qtyToScan);
          await repos.inventory.saveBalance(destBalance);

          await repos.inventory.recordTransaction({
            tenantId,
            productId: stepData.productId,
            fromLocationId: stepData.locationId,
            toLocationId: packingLocation.id,
            quantity: qtyToScan,
            reason: "PICK",
            referenceId: details.orderId,
            userId: userId ?? null,
          });

          await repos.orders.incrementPickedQty(
            tenantId,
            details.orderId,
            stepData.productId,
            qtyToScan,
          );
        } else if (details.type === "PUTAWAY") {
          const receivingLocation = await repos.inventory.findLocationByType(
            tenantId,
            stepData.warehouseId,
            "RECEIVING",
          );
          if (!receivingLocation) {
            throw new WmsError(
              "LOCATION_NOT_FOUND",
              "No RECEIVING location configured for this warehouse",
              409,
            );
          }

          await moveStock({
            tenantId,
            productId: stepData.productId,
            fromLocationId: receivingLocation.id,
            toLocationId: stepData.locationId,
            quantity: qtyToScan,
            reason: "PUTAWAY",
            referenceId: taskAgg.id,
            ...(userId ? { userId } : {}),
            unitOfWork: uow,
          });
        }

        // ── 5. Persistir progreso de tarea/paso y cierre de pedido ─────────
        await repos.tasks.save(taskAgg, {
          ...(allDone ? { completedAt: new Date() } : {}),
          stepUpdates: {
            [stepData.id]: {
              completedAt: stepStatus === "COMPLETED" ? new Date() : null,
            },
          },
        });

        if (allDone && details.type === "PICKING" && details.orderId) {
          await repos.orders.updateStatus(tenantId, details.orderId, "PACKED");
        }

        const updatedStep = taskAgg.steps.find((s) => s.id === stepId)!;
        const result: ConfirmTaskStepResult = {
          stepId: stepData.id,
          scannedQty: updatedStep.scannedQty,
          expectedQty: updatedStep.expectedQty,
          remainingQty: updatedStep.remainingQty,
          stepStatus: stepStatus as "COMPLETED" | "PENDING" | "EXCEPTION",
          taskStatus: taskStatus as "IN_PROGRESS" | "COMPLETED" | "EXCEPTION",
          taskComplete: allDone,
          idempotencyStatus: idempotencyKey ? "APPLIED" : undefined,
        };

        if (idempotencyKey) {
          await store.save(
            {
              tenantId,
              idempotencyKey,
              action: "CONFIRM_TASK_STEP",
              responseBody: result,
              occurredAt,
            },
            repos.txScope,
          );
        }

        return result;
      },
      { isolationLevel: "Serializable", timeoutMs: DEFAULT_TX_TIMEOUT_MS },
    );
  } catch (err: unknown) {
    if (idempotencyKey && isUniqueConstraintError(err)) {
      const replay = await store.find<ConfirmTaskStepResult>(
        tenantId,
        idempotencyKey,
      );
      if (replay) {
        return {
          ...replay.responseBody,
          idempotencyStatus: "ALREADY_APPLIED",
        };
      }
    }
    rethrowDomainErrorAsWmsError(err);
  }
}
