// apps/mobile/src/context/offline-sync.tsx
// Proveedor de Contexto React para el Motor Hexagonal OfflineSyncQueue y LocalTaskCache.
// Conecta el cliente de sesión con la cola offline, monitor de conectividad y caché de tareas.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ConfirmReceiptLinePayload,
  ConfirmTaskStepPayload,
} from "@wms/shared-types";
import { useSession } from "./session.js";
import {
  EventConnectivityMonitor,
  HttpSyncTransport,
  InMemoryOfflineQueueStorage,
  LocalTaskCache,
  OfflineSyncQueue,
  type OfflineQueueItem,
  type QueueSnapshot,
  type SyncExecutionResult,
} from "../offline/index.js";

export interface OfflineSyncContextValue {
  snapshot: QueueSnapshot;
  queue: OfflineSyncQueue;
  cache: LocalTaskCache;
  connectivity: EventConnectivityMonitor;
  isOnline: boolean;
  setOnline: (online: boolean) => void;
  syncNow: () => Promise<SyncExecutionResult>;
  enqueueStepConfirmation: (
    payload: ConfirmTaskStepPayload,
  ) => Promise<OfflineQueueItem>;
  enqueueReceiptLineConfirmation: (
    payload: ConfirmReceiptLinePayload,
  ) => Promise<OfflineQueueItem>;
  retryQuarantined: (idempotencyKey: string) => Promise<boolean>;
  discardQuarantined: (idempotencyKey: string) => Promise<boolean>;
  clearQuarantined: () => Promise<number>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

export interface OfflineSyncProviderProps {
  children: ReactNode;
  initialOnline?: boolean;
}

export function OfflineSyncProvider({
  children,
  initialOnline = true,
}: OfflineSyncProviderProps): JSX.Element {
  const { client } = useSession();

  const cache = useMemo(() => new LocalTaskCache(), []);
  const connectivity = useMemo(
    () => new EventConnectivityMonitor(initialOnline),
    [initialOnline],
  );
  const storage = useMemo(() => new InMemoryOfflineQueueStorage(), []);
  const transport = useMemo(() => new HttpSyncTransport(client), [client]);

  const queue = useMemo(
    () =>
      new OfflineSyncQueue({
        storage,
        transport,
        connectivity,
      }),
    [storage, transport, connectivity],
  );

  const [snapshot, setSnapshot] = useState<QueueSnapshot>(() =>
    queue.getSnapshot(),
  );

  useEffect(() => {
    let isMounted = true;

    void queue.init().then(() => {
      if (isMounted) {
        setSnapshot(queue.getSnapshot());
      }
    });

    const unsubscribe = queue.subscribe((nextSnapshot) => {
      if (isMounted) {
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      queue.dispose();
      connectivity.dispose();
    };
  }, [queue, connectivity]);

  const setOnline = useCallback(
    (online: boolean) => {
      connectivity.setOnline(online);
    },
    [connectivity],
  );

  const syncNow = useCallback(async (): Promise<SyncExecutionResult> => {
    return queue.sync();
  }, [queue]);

  const enqueueStepConfirmation = useCallback(
    async (payload: ConfirmTaskStepPayload): Promise<OfflineQueueItem> => {
      return queue.enqueue("CONFIRM_STEP", payload);
    },
    [queue],
  );

  const enqueueReceiptLineConfirmation = useCallback(
    async (payload: ConfirmReceiptLinePayload): Promise<OfflineQueueItem> => {
      return queue.enqueue("CONFIRM_RECEIPT_LINE", payload);
    },
    [queue],
  );

  const retryQuarantined = useCallback(
    async (idempotencyKey: string): Promise<boolean> => {
      return queue.retryQuarantined(idempotencyKey);
    },
    [queue],
  );

  const discardQuarantined = useCallback(
    async (idempotencyKey: string): Promise<boolean> => {
      return queue.discardQuarantined(idempotencyKey);
    },
    [queue],
  );

  const clearQuarantined = useCallback(async (): Promise<number> => {
    return queue.clearQuarantined();
  }, [queue]);

  const value = useMemo<OfflineSyncContextValue>(
    () => ({
      snapshot,
      queue,
      cache,
      connectivity,
      isOnline: snapshot.networkStatus !== "OFFLINE",
      setOnline,
      syncNow,
      enqueueStepConfirmation,
      enqueueReceiptLineConfirmation,
      retryQuarantined,
      discardQuarantined,
      clearQuarantined,
    }),
    [
      snapshot,
      queue,
      cache,
      connectivity,
      setOnline,
      syncNow,
      enqueueStepConfirmation,
      enqueueReceiptLineConfirmation,
      retryQuarantined,
      discardQuarantined,
      clearQuarantined,
    ],
  );

  return (
    <OfflineSyncContext.Provider value={value}>
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync(): OfflineSyncContextValue {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error(
      "useOfflineSync must be used within an <OfflineSyncProvider>",
    );
  }
  return ctx;
}
