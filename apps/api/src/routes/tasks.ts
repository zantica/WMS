// apps/api/src/routes/tasks.ts
// Rutas para las tareas de almacén (picking, putaway, etc.)
// La app móvil consume estos endpoints para mostrar pasos guiados al operario.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { prisma } from "@wms/db";
import { confirmTaskStep } from "../use-cases/tasks/confirm-task-step.js";
import { WmsError } from "../plugins/error-handler.js";
import type { ApiResponse, WarehouseTaskDTO } from "@wms/shared-types";

const ConfirmStepSchema = z.object({
  scannedCode: z.string().min(1), // Código escaneado (barcode producto o code ubicación)
  quantity: z.number().positive().optional(),
  reportException: z.boolean().optional(),
  exceptionNote: z.string().optional(),
});

export const taskRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/tasks — Tareas disponibles para el operario autenticado
  app.get<{ Querystring: { type?: string; status?: string } }>(
    "/",
    {
      schema: {
        tags: ["Tasks"],
        summary: "Listar tareas de almacén disponibles o asignadas",
      },
    },
    async (request): Promise<ApiResponse<WarehouseTaskDTO[]>> => {
      const tasks = await prisma.warehouseTask.findMany({
        where: {
          tenantId: request.tenantId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          ...(request.query.type ? { type: request.query.type as never } : {}),
          // El operario ve sus tareas asignadas + las no asignadas
          ...(request.userId
            ? {
                OR: [
                  { assignedTo: request.userId },
                  { assignedTo: null },
                ],
              }
            : {}),
        },
        include: {
          steps: {
            orderBy: { sequence: "asc" },
            include: {
              location: { select: { code: true } },
              product: { select: { sku: true, name: true, barcode: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 20,
      });

      return {
        success: true,
        data: tasks.map(taskToDTO),
      };
    },
  );

  // GET /api/v1/tasks/:id — Detalle de una tarea
  app.get<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        tags: ["Tasks"],
        summary: "Obtener detalle de una tarea y sus pasos",
      },
    },
    async (request): Promise<ApiResponse<WarehouseTaskDTO>> => {
      const task = await prisma.warehouseTask.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
        include: {
          steps: {
            orderBy: { sequence: "asc" },
            include: {
              location: { select: { code: true } },
              product: { select: { sku: true, name: true, barcode: true } },
            },
          },
        },
      });

      if (!task) {
        throw new WmsError("TASK_NOT_FOUND", `Task ${request.params.id} not found`, 404);
      }

      return { success: true, data: taskToDTO(task) };
    },
  );

  // POST /api/v1/tasks/:id/start — Operario toma la tarea
  app.post<{ Params: { id: string } }>(
    "/:id/start",
    {
      schema: {
        tags: ["Tasks"],
        summary: "Iniciar una tarea y asignarla al operario",
      },
    },
    async (request) => {
      const task = await prisma.warehouseTask.findFirst({
        where: { id: request.params.id, tenantId: request.tenantId },
      });

      if (!task) throw new WmsError("TASK_NOT_FOUND", "Task not found", 404);
      if (task.status !== "PENDING") {
        throw new WmsError(
          "VALIDATION_ERROR",
          `Task is already ${task.status}`,
          409,
        );
      }

      const updated = await prisma.warehouseTask.update({
        where: { id: task.id },
        data: {
          status: "IN_PROGRESS",
          assignedTo: request.userId ?? task.assignedTo,
          startedAt: new Date(),
        },
      });

      return { success: true, data: { taskId: updated.id, status: updated.status } };
    },
  );

  // POST /api/v1/tasks/:id/steps/:stepId/confirm — Confirmar escaneo de un paso
  app.post<{ Params: { id: string; stepId: string } }>(
    "/:id/steps/:stepId/confirm",
    {
      schema: {
        tags: ["Tasks"],
        summary: "Confirmar escaneo de ubicación/producto en un paso de tarea",
      },
    },
    async (request, reply) => {
      const body = ConfirmStepSchema.parse(request.body);

      const result = await confirmTaskStep({
        taskId: request.params.id,
        stepId: request.params.stepId,
        tenantId: request.tenantId,
        scannedCode: body.scannedCode,
        quantity: body.quantity,
        reportException: body.reportException,
        exceptionNote: body.exceptionNote,
        userId: request.userId,
      });

      return reply.send({
        success: true,
        data: result,
      });
    },
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────
type TaskWithSteps = Awaited<ReturnType<typeof prisma.warehouseTask.findFirst>> & {
  steps: Array<{
    id: string;
    sequence: number;
    locationId: string;
    productId: string;
    expectedQty: import("@prisma/client").Prisma.Decimal;
    scannedQty: import("@prisma/client").Prisma.Decimal;
    status: string;
    location: { code: string };
    product: { sku: string; name: string; barcode: string | null };
  }>;
};

function taskToDTO(task: NonNullable<TaskWithSteps>): WarehouseTaskDTO {
  return {
    id: task.id,
    orderId: task.orderId,
    type: task.type as WarehouseTaskDTO["type"],
    status: task.status as WarehouseTaskDTO["status"],
    assignedTo: task.assignedTo,
    steps: task.steps.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      locationId: s.locationId,
      locationCode: s.location.code,
      productId: s.productId,
      productSku: s.product.sku,
      productName: s.product.name,
      productBarcode: s.product.barcode,
      expectedQty: Number(s.expectedQty),
      scannedQty: Number(s.scannedQty),
      status: s.status as WarehouseTaskDTO["steps"][0]["status"],
    })),
  };
}
