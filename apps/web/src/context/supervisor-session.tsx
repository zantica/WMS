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
  WmsWebApiError,
  createWmsWebClient,
  type HealthCheckResponse,
} from "../lib/api-client.js";
import { useTranslation } from "./locale-context.js";

const STORAGE_KEY = "wms.web.supervisor_session.v1";

export interface SessionFeedback {
  type: "success" | "info" | "warning";
  message: string;
}

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
  sessionFeedback: SessionFeedback | null;
  clearSessionFeedback: () => void;
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
  const { t } = useTranslation();
  const [session, setSession] = useState<SupervisorSession>(() => ({
    ...DEFAULT_SUPERVISOR_SESSION,
    ...initialSession,
  }));
  const [sessionFeedback, setSessionFeedback] =
    useState<SessionFeedback | null>(null);

  const clearSessionFeedback = useCallback(() => {
    setSessionFeedback(null);
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

  useEffect(() => {
    let parsedStorage: Partial<SupervisorSession> | null = null;
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        parsedStorage = JSON.parse(raw) as Partial<SupervisorSession>;
        setSession((prev) => ({
          ...prev,
          ...(typeof parsedStorage?.apiBaseUrl === "string"
            ? { apiBaseUrl: parsedStorage.apiBaseUrl }
            : {}),
          ...(typeof parsedStorage?.apiKey === "string"
            ? { apiKey: parsedStorage.apiKey }
            : {}),
          ...(typeof parsedStorage?.bearerToken === "string"
            ? { bearerToken: parsedStorage.bearerToken }
            : {}),
          ...(typeof parsedStorage?.warehouseId === "string"
            ? { warehouseId: parsedStorage.warehouseId }
            : {}),
          ...(typeof parsedStorage?.supervisorName === "string"
            ? { supervisorName: parsedStorage.supervisorName }
            : {}),
          ...(parsedStorage?.currentUser !== undefined
            ? { currentUser: parsedStorage.currentUser }
            : {}),
        }));
      }
    } catch {
      // Ignore localStorage read errors in restricted environments
    }

    const effectiveUser =
      initialSession?.currentUser ?? parsedStorage?.currentUser ?? null;
    const effectiveToken =
      parsedStorage?.bearerToken ?? initialSession?.bearerToken;
    const effectiveBaseUrl =
      parsedStorage?.apiBaseUrl ??
      initialSession?.apiBaseUrl ??
      DEFAULT_SUPERVISOR_SESSION.apiBaseUrl;
    const effectiveApiKey =
      parsedStorage?.apiKey ??
      initialSession?.apiKey ??
      DEFAULT_SUPERVISOR_SESSION.apiKey;

    const shouldValidateSession =
      !effectiveUser &&
      (Boolean(effectiveToken) ||
        (typeof window !== "undefined" &&
          typeof globalThis.fetch === "function" &&
          !initialSession));

    if (!shouldValidateSession) {
      return;
    }

    let cancelled = false;
    const probeClient = createWmsWebClient({
      baseUrl: effectiveBaseUrl,
      apiKey: effectiveApiKey,
      bearerToken: effectiveToken,
    });

    void probeClient
      .getMe()
      .then((me) => {
        if (cancelled) return;
        updateSession({
          currentUser: me,
          supervisorName: me.name,
          isConnected: true,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof WmsWebApiError && err.statusCode === 401 && effectiveToken) {
          updateSession({
            bearerToken: undefined,
            currentUser: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialSession, updateSession]);

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
      setSessionFeedback({
        type: "success",
        message: t("web.auth.loginSuccessFeedback", {
          name: res.user.name,
          role: res.user.role,
        }),
      });
      return res;
    },
    [t, updateSession],
  );

  const login = useCallback(
    async (input: LoginInput): Promise<LoginResponseDTO> => {
      if (session.currentUser) {
        throw new Error(t("web.auth.activeSessionLoginBlocked"));
      }
      const res = await client.login(input);
      return applyAuthenticatedResponse(res);
    },
    [session.currentUser, t, client, applyAuthenticatedResponse],
  );

  const bootstrapSuperuser = useCallback(
    async (input: BootstrapSuperuserInput): Promise<LoginResponseDTO> => {
      if (session.currentUser) {
        throw new Error(t("web.auth.activeSessionLoginBlocked"));
      }
      const res = await client.bootstrapSuperuser(input);
      return applyAuthenticatedResponse(res);
    },
    [session.currentUser, t, client, applyAuthenticatedResponse],
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
      setSessionFeedback({
        type: "info",
        message: t("web.auth.logoutSuccessFeedback"),
      });
    }
  }, [client, t, updateSession]);

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
      sessionFeedback,
      clearSessionFeedback,
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
      sessionFeedback,
      clearSessionFeedback,
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
