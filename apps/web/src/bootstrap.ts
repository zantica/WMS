// apps/web/src/bootstrap.ts
// Función pura de resolución de configuración inicial para el composition root (src/main.tsx).
// Sin acceso directo a process.env ni import.meta.env (CP-7).

import type { SupervisorSession } from "./context/supervisor-session.js";

export interface WebBootstrapEnv {
  readonly VITE_API_BASE_URL?: string | undefined;
  readonly VITE_API_KEY?: string | undefined;
  readonly VITE_WAREHOUSE_ID?: string | undefined;
}

export function resolveBootstrapSession(
  env: WebBootstrapEnv,
): Partial<SupervisorSession> {
  const session: Partial<SupervisorSession> = {};

  if (env.VITE_API_BASE_URL !== undefined) {
    session.apiBaseUrl = env.VITE_API_BASE_URL.trim();
  }
  if (env.VITE_API_KEY && env.VITE_API_KEY.trim().length > 0) {
    session.apiKey = env.VITE_API_KEY.trim();
  }
  if (env.VITE_WAREHOUSE_ID && env.VITE_WAREHOUSE_ID.trim().length > 0) {
    session.warehouseId = env.VITE_WAREHOUSE_ID.trim();
  }

  return session;
}
