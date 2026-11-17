// apps/web/src/context/supervisor-session.tsx
// Contexto React para la sesión del Supervisor / Usuario JWT en el Dashboard Web (@wms/web).
// Gestiona la conexión multi-tenant (JWT Bearer / cookie HttpOnly wms_session / x-api-key), el warehouse activo y persistencia.

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
import type {
  AuthUserDTO,
  BootstrapSuperuserInput,
  LoginInput,
  LoginResponseDTO,
} from "@wms/shared-types";
import {
  WmsWebApiClient,
  createWmsWebClient,
  type HealthCheckResponse,
} from "../lib/api-client.js";

const STORAGE_KEY = "wms.web.supervisor_session.v1";

export interface SupervisorSession {
  apiBaseUrl: string;
  apiKey: string;
  bearerToken?: string | undefined;
  warehouseId: string;
  supervisorName: string;
  currentUser?: AuthUserDTO | null | undefined;
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
  login: (input: LoginInput) => Promise<LoginResponseDTO>;
  bootstrapSuperuser: (
    input: BootstrapSuperuserInput,
  ) => Promise<LoginResponseDTO>;
  logout: () => Promise<void>;
  refreshSessionUser: () => Promise<AuthUserDTO | null>;
}

export const DEFAULT_SUPERVISOR_SESSION: SupervisorSession = {
  apiBaseUrl: "http://localhost:3001",
  apiKey: "demo-api-key-12345",
  warehouseId: "warehouse-demo",
  supervisorName: "Supervisor Turno Central",
  currentUser: null,
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
          ...(parsed.currentUser !== undefined
            ? { currentUser: parsed.currentUser }
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

  const applyAuthenticatedResponse = useCallback(
    (res: LoginResponseDTO): LoginResponseDTO => {
      updateSession({
        bearerToken: res.token,
        apiKey: "",
        currentUser: res.user,
        supervisorName: res.user.name,
        isConnected: true,
      });
      return res;
    },
    [updateSession],
  );

  const login = useCallback(
    async (input: LoginInput): Promise<LoginResponseDTO> => {
      const res = await client.login(input);
      return applyAuthenticatedResponse(res);
    },
    [client, applyAuthenticatedResponse],
  );

  const bootstrapSuperuser = useCallback(
    async (input: BootstrapSuperuserInput): Promise<LoginResponseDTO> => {
      const res = await client.bootstrapSuperuser(input);
      return applyAuthenticatedResponse(res);
    },
    [client, applyAuthenticatedResponse],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await client.logout();
    } finally {
      updateSession({
        bearerToken: undefined,
        currentUser: null,
        apiKey: DEFAULT_SUPERVISOR_SESSION.apiKey,
        supervisorName: DEFAULT_SUPERVISOR_SESSION.supervisorName,
      });
    }
  }, [client, updateSession]);

  const refreshSessionUser = useCallback(async (): Promise<AuthUserDTO | null> => {
    try {
      const me = await client.getMe();
      updateSession({
        currentUser: me,
        supervisorName: me.name,
        isConnected: true,
      });
      return me;
    } catch {
      return null;
    }
  }, [client, updateSession]);

  const value = useMemo<SupervisorSessionContextValue>(
    () => ({
      session,
      client,
      updateSession,
      testConnection,
      login,
      bootstrapSuperuser,
      logout,
      refreshSessionUser,
    }),
    [
      session,
      client,
      updateSession,
      testConnection,
      login,
      bootstrapSuperuser,
      logout,
      refreshSessionUser,
    ],
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
