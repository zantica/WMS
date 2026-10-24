// apps/mobile/src/context/session-context.tsx
// Re-exporta el contexto de sesión del operario por compatibilidad de nombres.

export {
  DEFAULT_OPERATOR_SESSION,
  SessionProvider,
  useSession,
  type OperatorSession,
  type SessionContextValue,
  type SessionProviderProps,
} from "./session.js";
