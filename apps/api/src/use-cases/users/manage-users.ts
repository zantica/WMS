// apps/api/src/use-cases/users/manage-users.ts
// Caso de uso: Gestión de usuarios, contraseñas opcionales y roles RBAC (SUPERUSER / ADMIN / SUPERVISOR / OPERATOR).

import type {
  CreateTenantUserInput,
  ListTenantUsersFilters,
  TenantUserDTO,
  UpdateTenantUserInput,
  UserRole,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type { PasswordHasherPort } from "../../ports/password-hasher.js";
import type { UserRepositoryPort } from "../../ports/user-repository.js";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

function assertCanViewUsers(actorRole: UserRole): void {
  if (
    actorRole !== "SUPERUSER" &&
    actorRole !== "ADMIN" &&
    actorRole !== "SUPERVISOR"
  ) {
    throw new WmsError(
      "FORBIDDEN",
      "Solo administradores y supervisores pueden listar usuarios del inquilino",
      403,
    );
  }
}

function assertCanManageUsers(actorRole: UserRole): void {
  if (actorRole !== "SUPERUSER" && actorRole !== "ADMIN") {
    throw new WmsError(
      "FORBIDDEN",
      "Solo los administradores del inquilino pueden crear o modificar usuarios",
      403,
    );
  }
}

async function resolveTargetTenantId(
  userRepo: UserRepositoryPort,
  sessionTenantId: string,
  actorRole: UserRole,
  requestedTenantId?: string,
): Promise<string> {
  const trimmed = requestedTenantId?.trim();
  if (!trimmed || trimmed === sessionTenantId) {
    return sessionTenantId;
  }

  if (actorRole !== "SUPERUSER") {
    throw new WmsError(
      "TENANT_MISMATCH",
      "No tiene permisos para gestionar usuarios en otro inquilino",
      403,
    );
  }

  const exists = await userRepo.tenantExists(trimmed);
  if (!exists) {
    throw new WmsError(
      "VALIDATION_ERROR",
      `El inquilino "${trimmed}" no existe`,
      404,
    );
  }

  return trimmed;
}

async function hashOptionalPassword(
  password: string | undefined,
  passwordHasher?: PasswordHasherPort,
): Promise<string | undefined> {
  if (password === undefined) {
    return undefined;
  }

  if (
    typeof password !== "string" ||
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new WmsError(
      "VALIDATION_ERROR",
      `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres`,
      400,
    );
  }

  if (!passwordHasher) {
    throw new WmsError(
      "CONFIGURATION_ERROR",
      "PasswordHasherPort es obligatorio cuando se asigna una contraseña",
      500,
    );
  }

  return passwordHasher.hash(password);
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
  passwordHasher?: PasswordHasherPort,
): Promise<TenantUserDTO> {
  assertCanManageUsers(actorRole);

  if (input.role === "SUPERUSER" && actorRole !== "SUPERUSER") {
    throw new WmsError(
      "FORBIDDEN",
      "Solo un SUPERUSER puede crear usuarios con rol SUPERUSER",
      403,
    );
  }

  const targetTenantId = await resolveTargetTenantId(
    userRepo,
    tenantId,
    actorRole,
    input.tenantId,
  );

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

  const existingEmail = await userRepo.findUserByEmail(
    targetTenantId,
    normalizedEmail,
  );
  if (existingEmail) {
    throw new WmsError(
      "CONFLICT",
      `Ya existe un usuario con el email "${normalizedEmail}" en este inquilino`,
      409,
    );
  }

  const resolvedClerkId =
    input.clerkId?.trim() || `clerk_${crypto.randomUUID()}`;
  const existingClerk = await userRepo.findUserByClerkId(resolvedClerkId);
  if (existingClerk) {
    throw new WmsError(
      "CONFLICT",
      `El identificador Clerk "${resolvedClerkId}" ya está asignado a otro usuario`,
      409,
    );
  }

  const passwordHash = await hashOptionalPassword(
    input.password,
    passwordHasher,
  );

  return userRepo.createUser(targetTenantId, {
    name: normalizedName,
    email: normalizedEmail,
    role: input.role,
    clerkId: resolvedClerkId,
    ...(passwordHash !== undefined ? { passwordHash } : {}),
  });
}

export async function updateTenantUser(
  userRepo: UserRepositoryPort,
  tenantId: string,
  actorRole: UserRole,
  actorUserId: string,
  targetUserId: string,
  input: UpdateTenantUserInput,
  passwordHasher?: PasswordHasherPort,
): Promise<TenantUserDTO> {
  assertCanManageUsers(actorRole);

  const targetTenantId = await resolveTargetTenantId(
    userRepo,
    tenantId,
    actorRole,
    input.tenantId,
  );

  const targetUser = await userRepo.findUserById(targetTenantId, targetUserId);
  if (!targetUser) {
    throw new WmsError(
      "USER_NOT_FOUND",
      `Usuario con ID "${targetUserId}" no encontrado en este inquilino`,
      404,
    );
  }

  if (targetUser.role === "SUPERUSER" && actorRole !== "SUPERUSER") {
    throw new WmsError(
      "FORBIDDEN",
      "Un administrador de tenant no puede modificar una cuenta SUPERUSER",
      403,
    );
  }

  if (input.role === "SUPERUSER" && actorRole !== "SUPERUSER") {
    throw new WmsError(
      "FORBIDDEN",
      "Solo un SUPERUSER puede asignar o promover al rol SUPERUSER",
      403,
    );
  }

  // Regla de seguridad: un administrador/superuser no puede auto-desactivarse ni degradarse
  if (actorUserId === targetUserId) {
    if (input.isActive === false) {
      throw new WmsError(
        "VALIDATION_ERROR",
        "Un administrador no puede desactivar su propia cuenta",
        409,
      );
    }
    if (input.role !== undefined && input.role !== actorRole) {
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
        targetTenantId,
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

  const passwordHash = await hashOptionalPassword(
    input.password,
    passwordHasher,
  );

  return userRepo.updateUser(targetTenantId, targetUserId, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    ...(passwordHash !== undefined ? { passwordHash } : {}),
  });
}
