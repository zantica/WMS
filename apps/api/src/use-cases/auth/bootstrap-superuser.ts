// apps/api/src/use-cases/auth/bootstrap-superuser.ts
// Caso de uso: Inicialización controlada del Superuser (admin@navelo.dev) y estado de bootstrap.

import { timingSafeEqual } from "node:crypto";
import type {
  BootstrapStatusDTO,
  BootstrapSuperuserInput,
  LoginResponseDTO,
  UserRole,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type { PasswordHasherPort } from "../../ports/password-hasher.js";
import type { UserRepositoryPort } from "../../ports/user-repository.js";
import type { JwtTokenIssuerPayload } from "./login.js";

export const DEFAULT_SUPERUSER_EMAIL = "admin@navelo.dev" as const;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export interface BootstrapSuperuserDeps {
  userRepo: UserRepositoryPort;
  passwordHasher: PasswordHasherPort;
  issueToken: (payload: JwtTokenIssuerPayload) => string;
  expiresInSeconds: number;
  setupSecret?: string | undefined;
}

function isTimingSafeMatch(expected: string, actual: string): boolean {
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(actual, "utf8");
  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }
  return timingSafeEqual(expectedBuf, actualBuf);
}

export async function getBootstrapStatus(
  userRepo: UserRepositoryPort,
  setupSecret?: string,
): Promise<BootstrapStatusDTO> {
  const superuserCount = await userRepo.countSuperusers();
  return {
    hasSuperuser: superuserCount > 0,
    requiresSetupSecret: Boolean(setupSecret && setupSecret.trim().length > 0),
    defaultSuperuserEmail: DEFAULT_SUPERUSER_EMAIL,
  };
}

export async function bootstrapSuperuser(
  deps: BootstrapSuperuserDeps,
  input: BootstrapSuperuserInput,
): Promise<LoginResponseDTO> {
  const normalizedName = input.name.trim();
  if (normalizedName.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "El nombre del Superuser no puede estar vacío",
      400,
    );
  }

  const normalizedEmail = (
    input.email?.trim() || DEFAULT_SUPERUSER_EMAIL
  ).toLowerCase();
  if (normalizedEmail.length === 0 || !normalizedEmail.includes("@")) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "Debe proporcionar un email válido para el Superuser",
      400,
    );
  }

  if (
    typeof input.password !== "string" ||
    input.password.length < MIN_PASSWORD_LENGTH ||
    input.password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new WmsError(
      "VALIDATION_ERROR",
      `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres`,
      400,
    );
  }

  const configuredSecret = deps.setupSecret?.trim();
  const hasConfiguredSecret = Boolean(configuredSecret && configuredSecret.length > 0);
  const superuserCount = await deps.userRepo.countSuperusers();

  if (hasConfiguredSecret) {
    const providedSecret = input.setupSecret?.trim() ?? "";
    if (!providedSecret || !isTimingSafeMatch(configuredSecret!, providedSecret)) {
      throw new WmsError(
        "FORBIDDEN",
        "Setup secret inválido para inicializar el Superuser",
        403,
      );
    }
  } else if (superuserCount > 0) {
    throw new WmsError(
      "CONFLICT",
      "Ya existe un SUPERUSER registrado en el sistema",
      409,
    );
  }

  const explicitTenantId = input.tenantId?.trim();
  let targetTenantId: string | null = null;

  if (explicitTenantId) {
    const exists = await deps.userRepo.tenantExists(explicitTenantId);
    if (!exists) {
      throw new WmsError(
        "VALIDATION_ERROR",
        `El inquilino "${explicitTenantId}" no existe`,
        404,
      );
    }
    targetTenantId = explicitTenantId;
  } else {
    targetTenantId = await deps.userRepo.resolveDefaultTenantId();
  }

  if (!targetTenantId) {
    throw new WmsError(
      "CONFIGURATION_ERROR",
      "No existe ningún inquilino disponible para asociar el Superuser",
      500,
    );
  }

  const existingEmail = await deps.userRepo.findUserByEmail(
    targetTenantId,
    normalizedEmail,
  );
  if (existingEmail) {
    throw new WmsError(
      "CONFLICT",
      `Ya existe un usuario con el email "${normalizedEmail}" en el inquilino destino`,
      409,
    );
  }

  const preferredClerkId =
    superuserCount === 0 && normalizedEmail === DEFAULT_SUPERUSER_EMAIL
      ? "user_navelo_superuser"
      : `clerk_${crypto.randomUUID()}`;

  const existingClerk = await deps.userRepo.findUserByClerkId(preferredClerkId);
  const resolvedClerkId = existingClerk
    ? `clerk_${crypto.randomUUID()}`
    : preferredClerkId;

  const passwordHash = await deps.passwordHasher.hash(input.password);
  const role: UserRole = "SUPERUSER";

  const created = await deps.userRepo.createUser(targetTenantId, {
    name: normalizedName,
    email: normalizedEmail,
    role,
    clerkId: resolvedClerkId,
    passwordHash,
  });

  const token = deps.issueToken({
    sub: created.clerkId,
    userId: created.id,
    tenantId: created.tenantId,
    role: created.role,
  });

  return {
    token,
    expiresInSeconds: deps.expiresInSeconds,
    user: {
      id: created.id,
      tenantId: created.tenantId,
      name: created.name,
      email: created.email,
      role: created.role,
      isActive: created.isActive,
    },
  };
}
