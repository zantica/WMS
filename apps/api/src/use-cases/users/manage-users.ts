// apps/api/src/use-cases/users/manage-users.ts
// Caso de uso: Gestión de usuarios y roles del inquilino (Tenant).

import type {
  CreateTenantUserInput,
  ListTenantUsersFilters,
  TenantUserDTO,
  UpdateTenantUserInput,
  UserRole,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type { UserRepositoryPort } from "../../ports/user-repository.js";

function assertCanViewUsers(actorRole: UserRole): void {
  if (actorRole !== "ADMIN" && actorRole !== "SUPERVISOR") {
    throw new WmsError(
      "FORBIDDEN",
      "Solo administradores y supervisores pueden listar usuarios del inquilino",
      403,
    );
  }
}

function assertCanManageUsers(actorRole: UserRole): void {
  if (actorRole !== "ADMIN") {
    throw new WmsError(
      "FORBIDDEN",
      "Solo los administradores del inquilino pueden crear o modificar usuarios",
      403,
    );
  }
}

export async function listTenantUsers(
  userRepo: UserRepositoryPort,
  tenantId: string,
  actorRole: UserRole,
  filters: ListTenantUsersFilters = {},
): Promise<TenantUserDTO[]> {
  assertCanViewUsers(actorRole);
  return userRepo.listUsers(tenantId, filters);
}

export async function createTenantUser(
  userRepo: UserRepositoryPort,
  tenantId: string,
  actorRole: UserRole,
  input: CreateTenantUserInput,
): Promise<TenantUserDTO> {
  assertCanManageUsers(actorRole);

  const normalizedName = input.name.trim();
  if (normalizedName.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "El nombre del usuario no puede estar vacío",
      400,
    );
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  if (normalizedEmail.length === 0 || !normalizedEmail.includes("@")) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "Debe proporcionar un email de usuario válido",
      400,
    );
  }

  const existingEmail = await userRepo.findUserByEmail(tenantId, normalizedEmail);
  if (existingEmail) {
    throw new WmsError(
      "CONFLICT",
      `Ya existe un usuario con el email "${normalizedEmail}" en este inquilino`,
      409,
    );
  }

  const resolvedClerkId = input.clerkId?.trim() || `clerk_${crypto.randomUUID()}`;
  const existingClerk = await userRepo.findUserByClerkId(resolvedClerkId);
  if (existingClerk) {
    throw new WmsError(
      "CONFLICT",
      `El identificador Clerk "${resolvedClerkId}" ya está asignado a otro usuario`,
      409,
    );
  }

  return userRepo.createUser(tenantId, {
    name: normalizedName,
    email: normalizedEmail,
    role: input.role,
    clerkId: resolvedClerkId,
  });
}

export async function updateTenantUser(
  userRepo: UserRepositoryPort,
  tenantId: string,
  actorRole: UserRole,
  actorUserId: string,
  targetUserId: string,
  input: UpdateTenantUserInput,
): Promise<TenantUserDTO> {
  assertCanManageUsers(actorRole);

  const targetUser = await userRepo.findUserById(tenantId, targetUserId);
  if (!targetUser) {
    throw new WmsError(
      "USER_NOT_FOUND",
      `Usuario con ID "${targetUserId}" no encontrado en este inquilino`,
      404,
    );
  }

  // Regla de seguridad: un administrador no puede auto-desactivarse ni degradarse
  if (actorUserId === targetUserId) {
    if (input.isActive === false) {
      throw new WmsError(
        "VALIDATION_ERROR",
        "Un administrador no puede desactivar su propia cuenta",
        409,
      );
    }
    if (input.role !== undefined && input.role !== "ADMIN") {
      throw new WmsError(
        "VALIDATION_ERROR",
        "Un administrador no puede revocar su propio rol de administrador",
        409,
      );
    }
  }

  let normalizedEmail: string | undefined;
  if (input.email !== undefined) {
    normalizedEmail = input.email.trim().toLowerCase();
    if (normalizedEmail.length === 0 || !normalizedEmail.includes("@")) {
      throw new WmsError(
        "VALIDATION_ERROR",
        "Debe proporcionar un email de usuario válido",
        400,
      );
    }

    if (normalizedEmail !== targetUser.email.toLowerCase()) {
      const existingEmail = await userRepo.findUserByEmail(
        tenantId,
        normalizedEmail,
      );
      if (existingEmail && existingEmail.id !== targetUserId) {
        throw new WmsError(
          "CONFLICT",
          `Ya existe un usuario con el email "${normalizedEmail}" en este inquilino`,
          409,
        );
      }
    }
  }

  return userRepo.updateUser(tenantId, targetUserId, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });
}
