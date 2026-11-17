// apps/api/src/routes/auth.ts
// Rutas Fastify para sesión JWT con cookie HttpOnly (wms_session) y bootstrap de Superuser.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  SESSION_COOKIE_NAME,
  type ApiResponse,
  type AuthUserDTO,
  type BootstrapStatusDTO,
  type LoginResponseDTO,
} from "@wms/shared-types";
import { createJwtToken } from "../plugins/auth.js";
import {
  bootstrapSuperuser,
  getBootstrapStatus,
} from "../use-cases/auth/bootstrap-superuser.js";
import {
  getCurrentSessionUser,
  loginWithPassword,
} from "../use-cases/auth/login.js";

export interface AuthRoutesOptions {
  jwtSecret?: string | undefined;
  jwtExpiresInSeconds?: number | undefined;
  bootstrapSetupSecret?: string | undefined;
  isProduction?: boolean | undefined;
}

const LoginBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
  tenantId: z.string().trim().min(1).max(128).optional(),
});

const BootstrapSuperuserBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email().max(255).optional(),
  password: z.string().min(8).max(128),
  tenantId: z.string().trim().min(1).max(128).optional(),
  setupSecret: z.string().min(1).max(256).optional(),
});

export function buildSessionCookieHeader(
  token: string,
  maxAgeSeconds: number,
  isProduction: boolean,
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function clearSessionCookieHeader(isProduction: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0",
  ];
  if (isProduction) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app,
  options,
) => {
  const expiresInSeconds = options.jwtExpiresInSeconds ?? 28_800;
  const isProduction = options.isProduction ?? false;

  const issueToken = (payload: {
    sub: string;
    userId: string;
    tenantId: string;
    role: AuthUserDTO["role"];
  }) =>
    createJwtToken(
      {
        sub: payload.sub,
        userId: payload.userId,
        tenantId: payload.tenantId,
        role: payload.role,
        expiresInSeconds,
      },
      options.jwtSecret,
    );

  // POST /api/v1/auth/login
  app.post(
    "/login",
    {
      schema: {
        tags: ["Auth"],
        summary: "Autenticar usuario con email y contraseña (emite JWT + cookie HttpOnly)",
      },
    },
    async (request, reply): Promise<ApiResponse<LoginResponseDTO>> => {
      const body = LoginBodySchema.parse(request.body);
      const result = await loginWithPassword(
        {
          userRepo: app.userRepository,
          passwordHasher: app.passwordHasher,
          issueToken,
          expiresInSeconds,
        },
        body,
      );

      reply.header(
        "Set-Cookie",
        buildSessionCookieHeader(
          result.token,
          result.expiresInSeconds,
          isProduction,
        ),
      );

      return reply.status(200).send({
        success: true,
        data: result,
      });
    },
  );

  // POST /api/v1/auth/logout
  app.post(
    "/logout",
    {
      schema: {
        tags: ["Auth"],
        summary: "Cerrar sesión eliminando cookie HttpOnly wms_session",
      },
    },
    async (_request, reply): Promise<ApiResponse<{ loggedOut: boolean }>> => {
      reply.header("Set-Cookie", clearSessionCookieHeader(isProduction));
      return reply.status(200).send({
        success: true,
        data: { loggedOut: true },
      });
    },
  );

  // GET /api/v1/auth/me
  app.get(
    "/me",
    {
      schema: {
        tags: ["Auth"],
        summary: "Obtener perfil y rol del usuario autenticado en la sesión actual",
      },
    },
    async (request): Promise<ApiResponse<AuthUserDTO>> => {
      const user = await getCurrentSessionUser(app.userRepository, {
        tenantId: request.tenantId,
        userId: request.userId,
        userRole: request.userRole,
      });

      return {
        success: true,
        data: user,
      };
    },
  );

  // GET /api/v1/auth/bootstrap-status
  app.get(
    "/bootstrap-status",
    {
      schema: {
        tags: ["Auth"],
        summary: "Consultar si existe un SUPERUSER inicial en el sistema",
      },
    },
    async (): Promise<ApiResponse<BootstrapStatusDTO>> => {
      const status = await getBootstrapStatus(
        app.userRepository,
        options.bootstrapSetupSecret,
      );
      return {
        success: true,
        data: status,
      };
    },
  );

  // POST /api/v1/auth/bootstrap-superuser
  app.post(
    "/bootstrap-superuser",
    {
      schema: {
        tags: ["Auth"],
        summary: "Crear cuenta SUPERUSER inicial (admin@navelo.dev) y abrir sesión",
      },
    },
    async (request, reply): Promise<ApiResponse<LoginResponseDTO>> => {
      const body = BootstrapSuperuserBodySchema.parse(request.body);
      const result = await bootstrapSuperuser(
        {
          userRepo: app.userRepository,
          passwordHasher: app.passwordHasher,
          issueToken,
          expiresInSeconds,
          setupSecret: options.bootstrapSetupSecret,
        },
        body,
      );

      reply.header(
        "Set-Cookie",
        buildSessionCookieHeader(
          result.token,
          result.expiresInSeconds,
          isProduction,
        ),
      );

      return reply.status(201).send({
        success: true,
        data: result,
      });
    },
  );
};
