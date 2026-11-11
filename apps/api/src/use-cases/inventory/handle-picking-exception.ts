// apps/api/src/use-cases/inventory/handle-picking-exception.ts
// Caso de uso: Gestionar excepciones operativas durante el Picking (rotura de stock,
// producto dañado o ubicación vacía) y re-asignar stock automáticamente.
// Orquesta WarehouseTask/TaskStep e InventoryBalance dentro de un UnitOfWork Serializable.

import { canTransitionOrder } from "@wms/domain";
import { WmsError } from "../../plugins/error-handler.js";
import type { UnitOfWork } from "../../ports/unit-of-work.js";
import { PrismaUnitOfWork } from "../../adapters/prisma-unit-of-work.js";
import { rethrowDomainErrorAsWmsError } from "../../shared/domain-error-mapper.js";

export interface HandlePickingExceptionParams {
  taskId: string;
  stepId: string;
  tenantId: string;
  exceptionNote?: string | undefined;
  userId?: string | undefined;
  unitOfWork?: UnitOfWork | undefined;
  tx?: unknown;
}

export interface ReplacementStepInfo {
  id: string;
  sequence: number;
  locationId: string;
  locationCode: string;
  expectedQty: number;
}

export interface HandlePickingExceptionResult {
  stepId: string;
  taskId: string;
  orderId: string;
  stepStatus: "EXCEPTION";
  taskStatus: "IN_PROGRESS" | "EXCEPTION";
  orderStatus: string;
  reallocated: boolean;
  releasedOriginalQty: number;
  replacementSteps: ReplacementStepInfo[];
  note: string;
}

/**
 * Gestiona una excepción reportada por un operario en un paso de una tarea PICKING:
 * libera la reserva de la ubicación original (clamp a 0 vía releaseUpTo) e intenta
 * re-asignar la cantidad faltante desde ubicaciones STORAGE alternativas.
 * Si no hay ATP suficiente, libera las reservas pendientes y coloca el pedido en ON_HOLD.
 */
export async function handlePickingException(
  params: HandlePickingExceptionParams,
): Promise<HandlePickingExceptionResult> {
  const { taskId, stepId, tenantId, exceptionNote, userId } = params;
  const note = exceptionNote ?? "Operator reported exception";
  const uow = params.unitOfWork ?? new PrismaUnitOfWork(undefined, params.tx);

  try {
    return await uow.execute(
      tenantId,
      async (repos) => {
        // ── 1. Cargar tarea, pasos y pedido filtrando por tenantId ─────────
        const taskRecord = await repos.tasks.findById(tenantId, taskId);

        if (!taskRecord || taskRecord.details.tenantId !== tenantId) {
          throw new WmsError("TASK_NOT_FOUND", `Task ${taskId} not found`, 404);
        }

        const { task: taskAgg, details } = taskRecord;

        if (details.type !== "PICKING") {
          throw new WmsError(
            "VALIDATION_ERROR",
            `Task ${taskId} is not a PICKING task`,
            422,
          );
        }

        if (taskAgg.status === "COMPLETED" || taskAgg.status === "CANCELLED") {
          throw new WmsError(
            "VALIDATION_ERROR",
            `Task ${taskId} is already ${taskAgg.status}`,
            409,
          );
        }

        if (!details.orderId) {
          throw new WmsError(
            "ORDER_NOT_FOUND",
            `Order for picking task ${taskId} not found`,
            404,
          );
        }

        const order = await repos.orders.findById(tenantId, details.orderId);
        if (!order || order.tenantId !== tenantId) {
          throw new WmsError(
            "ORDER_NOT_FOUND",
            `Order for picking task ${taskId} not found`,
            404,
          );
        }

        const stepData = details.steps.find((s) => s.id === stepId);
        if (!stepData) {
          throw new WmsError("TASK_NOT_FOUND", `Step ${stepId} not found`, 404);
        }

        if (stepData.status !== "PENDING") {
          throw new WmsError(
            "VALIDATION_ERROR",
            `Step ${stepId} is already ${stepData.status}`,
            409,
          );
        }

        const missingQty = Math.max(0, stepData.expectedQty - stepData.scannedQty);

        // ── 2. Liberar reserva no recogida en la ubicación original ────────
        let releasedOriginalQty = 0;

        if (missingQty > 0) {
          const origBalance = await repos.inventory.findBalanceForUpdate(
            tenantId,
            stepData.locationId,
            stepData.productId,
          );

          if (origBalance) {
            const toRelease = origBalance.releaseUpTo(missingQty);

            if (toRelease > 0) {
              await repos.inventory.saveBalance(origBalance);

              await repos.inventory.recordTransaction({
                tenantId,
                productId: stepData.productId,
                fromLocationId: stepData.locationId,
                quantity: toRelease,
                reason: "ALLOCATION_CANCEL",
                referenceId: order.id,
                userId: userId ?? null,
                notes: `Picking exception at ${stepData.locationCode}: ${note}`,
              });

              releasedOriginalQty = toRelease;
            }
          }
        }

        // ── 3. Buscar ubicaciones STORAGE alternativas con ATP > 0 ─────────
        const candidateBalances =
          missingQty > 0
            ? await repos.inventory.findStorageBalancesForUpdate(
                tenantId,
                stepData.productId,
                {
                  warehouseId: order.warehouseId,
                  excludeLocationId: stepData.locationId,
                },
              )
            : [];

        const totalAlternativeAtp = candidateBalances.reduce(
          (acc, c) => acc + Math.max(0, c.balance.available),
          0,
        );

        // ── 4A. Stock alternativo suficiente → Re-alocar y crear pasos ─────
        if (totalAlternativeAtp >= missingQty) {
          taskAgg.reportStepException(stepId);
          if (taskAgg.status !== "IN_PROGRESS") {
            taskAgg.start();
          }

          let remaining = missingQty;
          let nextSequence =
            details.steps.reduce((max, s) => Math.max(max, s.sequence), 0) + 1;
          const replacementSteps: ReplacementStepInfo[] = [];

          for (const candidate of candidateBalances) {
            if (remaining <= 0) break;

            const atp = candidate.balance.available;
            if (atp <= 0) continue;

            const toAllocate = Math.min(atp, remaining);

            candidate.balance.allocate(toAllocate);
            await repos.inventory.saveBalance(candidate.balance);

            await repos.inventory.recordTransaction({
              tenantId,
              productId: stepData.productId,
              fromLocationId: candidate.balance.locationId,
              quantity: toAllocate,
              reason: "ALLOCATION",
              referenceId: order.id,
              userId: userId ?? null,
              notes: `Re-allocated after picking exception at ${stepData.locationCode} for order ${order.externalRef ?? order.id}`,
            });

            const createdStep = await repos.tasks.addStep(tenantId, taskAgg.id, {
              sequence: nextSequence,
              locationId: candidate.balance.locationId,
              productId: stepData.productId,
              expectedQty: toAllocate,
            });

            replacementSteps.push({
              id: createdStep.id,
              sequence: nextSequence,
              locationId: candidate.balance.locationId,
              locationCode: candidate.locationCode,
              expectedQty: toAllocate,
            });

            nextSequence += 1;
            remaining -= toAllocate;
          }

          await repos.tasks.save(taskAgg, {
            stepUpdates: {
              [stepId]: { exceptionNote: note },
            },
          });

          return {
            stepId: stepData.id,
            taskId: taskAgg.id,
            orderId: order.id,
            stepStatus: "EXCEPTION",
            taskStatus: "IN_PROGRESS",
            orderStatus: order.status,
            reallocated: true,
            releasedOriginalQty,
            replacementSteps,
            note,
          };
        }

        // ── 4B. Stock alternativo insuficiente → Liberar pasos y ON_HOLD ───
        for (const otherStep of details.steps) {
          if (otherStep.id === stepId || otherStep.status !== "PENDING") {
            continue;
          }

          const otherMissingQty = Math.max(
            0,
            otherStep.expectedQty - otherStep.scannedQty,
          );

          if (otherMissingQty > 0) {
            const otherBalance = await repos.inventory.findBalanceForUpdate(
              tenantId,
              otherStep.locationId,
              otherStep.productId,
            );

            if (otherBalance) {
              const toReleaseOther = otherBalance.releaseUpTo(otherMissingQty);

              if (toReleaseOther > 0) {
                await repos.inventory.saveBalance(otherBalance);

                await repos.inventory.recordTransaction({
                  tenantId,
                  productId: otherStep.productId,
                  fromLocationId: otherStep.locationId,
                  quantity: toReleaseOther,
                  reason: "ALLOCATION_CANCEL",
                  referenceId: order.id,
                  userId: userId ?? null,
                  notes: `Released due to unresolvable picking exception on task ${taskAgg.id}`,
                });
              }
            }
          }
        }

        if (taskAgg.status === "EXCEPTION") {
          taskAgg.start();
        }
        taskAgg.escalateStepException(stepId);

        await repos.tasks.save(taskAgg, {
          stepUpdates: {
            [stepId]: { exceptionNote: note },
          },
        });

        if (canTransitionOrder(order.status, "ON_HOLD")) {
          await repos.orders.updateStatus(tenantId, order.id, "ON_HOLD");
        }

        return {
          stepId: stepData.id,
          taskId: taskAgg.id,
          orderId: order.id,
          stepStatus: "EXCEPTION",
          taskStatus: "EXCEPTION",
          orderStatus: "ON_HOLD",
          reallocated: false,
          releasedOriginalQty,
          replacementSteps: [],
          note,
        };
      },
      { isolationLevel: "Serializable", timeoutMs: 15_000 },
    );
  } catch (err) {
    rethrowDomainErrorAsWmsError(err);
  }
}
