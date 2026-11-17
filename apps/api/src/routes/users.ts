// apps/api/src/routes/users.ts
// Rutas de Fastify para la gestión de usuarios, contraseñas opcionales y roles del inquilino (RBAC).

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  USER_ROLES,
  type ApiResponse,
  type TenantUserDTO,
  type UserRole,
} from "@wms/shared-types";
import {
  createTenantUser,
  listTenantUsers,
  updateTenantUser,
} from "../use-cases/users/manage-users.js";

const ListUsersQuerySchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  includeInactive: z
    .preprocess((val) => val === "true" || val === true, z.boolean())
    .optional(),
});

const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  role: z.enum(USER_ROLES),
  clerkId: z.string().max(100).optional(),
  password: z.string().min(8).max(128).optional(),
  tenantId: z.string().trim().min(1).max(128).optional(),
});

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().max(255).optional(),
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(128).optional(),
  tenantId: z.string().trim().min(1).max(128).optional(),
});

export const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/v1/users — Listar usuarios del tenant (SUPERUSER / ADMIN / SUPERVISOR)
  app.get(
    "/",
    {
      schema: {
        tags: ["Users"],
        summary: "Listar usuarios y roles del inquilino",
      },
    },
    async (request): Promise<ApiResponse<TenantUserDTO[]>> => {
      const query = ListUsersQuerySchema.parse(request.query);
      const actorRole: UserRole = request.userRole ?? "ADMIN";

      const users = await listTenantUsers(
        app.userRepository,
        request.tenantId,
        actorRole,
        query,
      );

      return {
        success: true,
        data: users,
      };
    },
  );

  // POST /api/v1/users — Crear nuevo usuario en el tenant (SUPERUSER / ADMIN)
  app.post(
    "/",
    {
      schema: {
        tags: ["Users"],
        summary: "Crear un nuevo usuario en el inquilino (SUPERUSER o ADMIN)",
      },
    },
    async (request, reply): Promise<ApiResponse<TenantUserDTO>> => {
      const body = CreateUserSchema.parse(request.body);
      const actorRole: UserRole = request.userRole ?? "ADMIN";

      const created = await createTenantUser(
        app.userRepository,
        request.tenantId,
        actorRole,
        body,
        app.passwordHasher,
      );

      return reply.status(201).send({
        success: true,
        data: created,
      });
    },
  );

  // PATCH /api/v1/users/:id — Modificar rol, contraseña o datos de un usuario (SUPERUSER / ADMIN)
  app.patch<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        tags: ["Users"],
        summary: "Actualizar un usuario, contraseña o rol (SUPERUSER o ADMIN)",
      },
    },
    async (request): Promise<ApiResponse<TenantUserDTO>> => {
      const body = UpdateUserSchema.parse(request.body);
      const actorRole: UserRole = request.userRole ?? "ADMIN";
      const actorUserId =
        request.userId ??
        (request.headers["x-user-id"] as string | undefined) ??
        "system_admin";

      const updated = await updateTenantUser(
        app.userRepository,
        request.tenantId,
        actorRole,
        actorUserId,
        request.params.id,
        body,
        app.passwordHasher,
      );

      return {
        success: true,
        data: updated,
      };
    },
  );
};
