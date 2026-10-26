// apps/mobile/src/context/session.tsx
// Contexto de sesión y configuración del terminal móvil para operarios de almacén.
// Gestiona la URL de la API, credenciales multi-tenant (x-api-key / Bearer) y el cliente HTTP tipado.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Constants from "expo-constants";
import {
  WmsApiClient,
  createWmsClient,
  type HealthCheckResponse,
} from "../api/client";

/**
 * Detecta automáticamente la IP de la máquina host (donde corre Metro / Expo)
 * para que en un móvil físico no apunte a `localhost` (127.0.0.1 del teléfono).
 */
function resolveDefaultApiBaseUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  if (typeof hostUri === "string" && hostUri.trim().length > 0) {
    const host = hostUri.split(":")[0]?.trim();
    if (host && host !== "localhost" && host !== "127.0.0.1") {
      return `http://${host}:3001`;
    }
  }
  return "http://localhost:3001";
}

export interface OperatorSession {
  apiBaseUrl: string;
  apiKey: string;
  bearerToken?: string | undefined;
  warehouseId: string;
  operatorName: string;
  isConnected: boolean;
}

export interface SessionContextValue {
  session: OperatorSession;
  client: WmsApiClient;
  updateSession: (partial: Partial<OperatorSession>) => void;
  testConnection: (override?: {
    apiBaseUrl?: string | undefined;
    apiKey?: string | undefined;
    bearerToken?: string | undefined;
  }) => Promise<HealthCheckResponse>;
  logout: () => void;
}

export const DEFAULT_OPERATOR_SESSION: OperatorSession = {
  apiBaseUrl: resolveDefaultApiBaseUrl(),
  apiKey: "demo-api-key-12345",
  warehouseId: "warehouse-demo",
  operatorName: "Operario Turno A",
  isConnected: true,
};

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  children: ReactNode;
  initialSession?: Partial<OperatorSession>;
}

export function SessionProvider({
  children,
  initialSession,
}: SessionProviderProps): JSX.Element {
  const [session, setSession] = useState<OperatorSession>(() => ({
    ...DEFAULT_OPERATOR_SESSION,
    ...initialSession,
  }));

  const client = useMemo(
    () =>
      createWmsClient({
        baseUrl: session.apiBaseUrl,
        apiKey: session.apiKey,
        bearerToken: session.bearerToken,
      }),
    [session.apiBaseUrl, session.apiKey, session.bearerToken],
  );

  const updateSession = useCallback((partial: Partial<OperatorSession>) => {
    setSession((prev) => ({
      ...prev,
      ...partial,
    }));
  }, []);

  const testConnection = useCallback(
    async (override?: {
      apiBaseUrl?: string | undefined;
      apiKey?: string | undefined;
      bearerToken?: string | undefined;
    }): Promise<HealthCheckResponse> => {
      const tempClient = createWmsClient({
        baseUrl: override?.apiBaseUrl ?? session.apiBaseUrl,
        apiKey: override?.apiKey ?? session.apiKey,
        bearerToken: override?.bearerToken ?? session.bearerToken,
      });
      const health = await tempClient.checkHealth();
      setSession((prev) => ({
        ...prev,
        ...(override?.apiBaseUrl !== undefined
          ? { apiBaseUrl: override.apiBaseUrl }
          : {}),
        ...(override?.apiKey !== undefined ? { apiKey: override.apiKey } : {}),
        ...(override?.bearerToken !== undefined
          ? { bearerToken: override.bearerToken }
          : {}),
        isConnected: health.status === "ok",
      }));
      return health;
    },
    [session.apiBaseUrl, session.apiKey, session.bearerToken],
  );

  const logout = useCallback(() => {
    setSession((prev) => ({
      ...prev,
      isConnected: false,
    }));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      client,
      updateSession,
      testConnection,
      logout,
    }),
    [session, client, updateSession, testConnection, logout],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a <SessionProvider>");
  }
  return ctx;
}
