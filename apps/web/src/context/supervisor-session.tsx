"use client";

// apps/web/src/context/supervisor-session.tsx
// Contexto React para la sesión del Supervisor en el Dashboard Web (@wms/web).
// Gestiona la conexión multi-tenant (x-api-key / Authorization: Bearer), el warehouse activo y persistencia en localStorage.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import {
  WmsWebApiClient,
  createWmsWebClient,
  type HealthCheckResponse,
} from "../lib/api-client";

const STORAGE_KEY = "wms.web.supervisor_session.v1";

export interface SupervisorSession {
  apiBaseUrl: string;
  apiKey: string;
  bearerToken?: string | undefined;
  warehouseId: string;
  supervisorName: string;
  isConnected: boolean;
}

export interface SupervisorSessionContextValue {
  session: SupervisorSession;
  client: WmsWebApiClient;
  updateSession: (partial: Partial<SupervisorSession>) => void;
  testConnection: (override?: {
    apiBaseUrl?: string | undefined;
    apiKey?: string | undefined;
    bearerToken?: string | undefined;
  }) => Promise<HealthCheckResponse>;
}

export const DEFAULT_SUPERVISOR_SESSION: SupervisorSession = {
  apiBaseUrl: "http://localhost:3001",
  apiKey: "demo-api-key-12345",
  warehouseId: "warehouse-demo",
  supervisorName: "Supervisor Turno Central",
  isConnected: true,
};

const SupervisorSessionContext =
  createContext<SupervisorSessionContextValue | null>(null);

export interface SupervisorSessionProviderProps {
  children: ReactNode;
  initialSession?: Partial<SupervisorSession> | undefined;
}

export function SupervisorSessionProvider({
  children,
  initialSession,
}: SupervisorSessionProviderProps): JSX.Element {
  const [session, setSession] = useState<SupervisorSession>(() => ({
    ...DEFAULT_SUPERVISOR_SESSION,
    ...initialSession,
  }));

  useEffect(() => {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SupervisorSession>;
        setSession((prev) => ({
          ...prev,
          ...(typeof parsed.apiBaseUrl === "string"
            ? { apiBaseUrl: parsed.apiBaseUrl }
            : {}),
          ...(typeof parsed.apiKey === "string"
            ? { apiKey: parsed.apiKey }
            : {}),
          ...(typeof parsed.bearerToken === "string"
            ? { bearerToken: parsed.bearerToken }
            : {}),
          ...(typeof parsed.warehouseId === "string"
            ? { warehouseId: parsed.warehouseId }
            : {}),
          ...(typeof parsed.supervisorName === "string"
            ? { supervisorName: parsed.supervisorName }
            : {}),
        }));
      }
    } catch {
      // Ignore localStorage read errors in restricted environments
    }
  }, []);

  const updateSession = useCallback((partial: Partial<SupervisorSession>) => {
    setSession((prev) => {
      const next = {
        ...prev,
        ...partial,
      };
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage write errors
      }
      return next;
    });
  }, []);

  const client = useMemo(
    () =>
      createWmsWebClient({
        baseUrl: session.apiBaseUrl,
        apiKey: session.apiKey,
        bearerToken: session.bearerToken,
      }),
    [session.apiBaseUrl, session.apiKey, session.bearerToken],
  );

  const testConnection = useCallback(
    async (override?: {
      apiBaseUrl?: string | undefined;
      apiKey?: string | undefined;
      bearerToken?: string | undefined;
    }): Promise<HealthCheckResponse> => {
      const tempClient = createWmsWebClient({
        baseUrl: override?.apiBaseUrl ?? session.apiBaseUrl,
        apiKey: override?.apiKey ?? session.apiKey,
        bearerToken: override?.bearerToken ?? session.bearerToken,
      });

      const health = await tempClient.checkHealth();
      updateSession({
        ...(override?.apiBaseUrl !== undefined
          ? { apiBaseUrl: override.apiBaseUrl }
          : {}),
        ...(override?.apiKey !== undefined ? { apiKey: override.apiKey } : {}),
        ...(override?.bearerToken !== undefined
          ? { bearerToken: override.bearerToken }
          : {}),
        isConnected: health.status === "ok",
      });
      return health;
    },
    [session.apiBaseUrl, session.apiKey, session.bearerToken, updateSession],
  );

  const value = useMemo<SupervisorSessionContextValue>(
    () => ({
      session,
      client,
      updateSession,
      testConnection,
    }),
    [session, client, updateSession, testConnection],
  );

  return (
    <SupervisorSessionContext.Provider value={value}>
      {children}
    </SupervisorSessionContext.Provider>
  );
}

export function useSupervisorSession(): SupervisorSessionContextValue {
  const ctx = useContext(SupervisorSessionContext);
  if (!ctx) {
    throw new Error(
      "useSupervisorSession must be used within a <SupervisorSessionProvider>",
    );
  }
  return ctx;
}
