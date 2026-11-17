// apps/api/src/use-cases/auth/login.ts
// Casos de uso de autenticación por contraseña y resolución del perfil de sesión actual.

import type {
  AuthUserDTO,
  LoginInput,
  LoginResponseDTO,
  UserRole,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type { PasswordHasherPort } from "../../ports/password-hasher.js";
import type { UserRepositoryPort } from "../../ports/user-repository.js";

export interface JwtTokenIssuerPayload {
  sub: string;
  userId: string;
  tenantId: string;
  role: UserRole;
}

export interface LoginWithPasswordDeps {
  userRepo: UserRepositoryPort;
  passwordHasher: PasswordHasherPort;
  issueToken: (payload: JwtTokenIssuerPayload) => string;
  expiresInSeconds: number;
}

export async function loginWithPassword(
  deps: LoginWithPasswordDeps,
  input: LoginInput,
): Promise<LoginResponseDTO> {
  const normalizedEmail = input.email.trim().toLowerCase();
  if (normalizedEmail.length === 0 || !normalizedEmail.includes("@")) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "Debe proporcionar un email válido",
      400,
    );
  }

  if (typeof input.password !== "string" || input.password.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "Debe proporcionar una contraseña",
      400,
    );
  }

  const normalizedTenantId = input.tenantId?.trim() || undefined;
  const user = await deps.userRepo.findUserByEmailForAuth(
    normalizedEmail,
    normalizedTenantId,
  );

  if (!user || !user.passwordHash) {
    throw new WmsError(
      "UNAUTHORIZED",
      "Credenciales inválidas",
      401,
    );
  }

  const isPasswordValid = await deps.passwordHasher.verify(
    input.password,
    user.passwordHash,
  );
  if (!isPasswordValid) {
    throw new WmsError(
      "UNAUTHORIZED",
      "Credenciales inválidas",
      401,
    );
  }

  if (!user.isActive) {
    throw new WmsError(
      "UNAUTHORIZED",
      "User account is inactive",
      401,
    );
  }

  const token = deps.issueToken({
    sub: user.clerkId,
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  });

  return {
    token,
    expiresInSeconds: deps.expiresInSeconds,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
  };
}

export interface SessionActorContext {
  tenantId: string;
  userId?: string | undefined;
  userRole?: UserRole | undefined;
}

export async function getCurrentSessionUser(
  userRepo: UserRepositoryPort,
  context: SessionActorContext,
): Promise<AuthUserDTO> {
  if (!context.tenantId) {
    throw new WmsError("UNAUTHORIZED", "Authentication required", 401);
  }

  if (context.userId) {
    const dbUser =
      context.userRole === "SUPERUSER"
        ? await userRepo.findUserByIdGlobal(context.userId)
        : await userRepo.findUserById(context.tenantId, context.userId);

    if (dbUser) {
      if (!dbUser.isActive) {
        throw new WmsError("UNAUTHORIZED", "User account is inactive", 401);
      }
      return {
        id: dbUser.id,
        tenantId: context.tenantId,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        isActive: dbUser.isActive,
      };
    }

    // Usuario externo JWT válido sin fila en tabla users
    return {
      id: context.userId,
      tenantId: context.tenantId,
      name: "Operador Externo",
      email: `${context.userId}@external.local`,
      role: context.userRole ?? "OPERATOR",
      isActive: true,
    };
  }

  // Sesión máquina-a-máquina vía x-api-key
  return {
    id: "api-key",
    tenantId: context.tenantId,
    name: "API Key Client",
    email: "api-key@system.local",
    role: context.userRole ?? "ADMIN",
    isActive: true,
  };
}
