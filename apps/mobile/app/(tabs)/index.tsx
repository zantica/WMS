// apps/mobile/app/(tabs)/index.tsx
// Bandeja principal de tareas operativas del almacén (RECEIVING, PUTAWAY, PICKING, PACKING).
// Consume GET /api/v1/tasks y POST /api/v1/tasks/:id/start mediante el cliente HTTP tipado.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import type { TaskType, WarehouseTaskDTO } from "@wms/shared-types";
import { useSession } from "../../src/context/session";
import { WmsApiClientError } from "../../src/api/client";
import {
  getNextActiveStep,
  resolveTaskExecutionRoute,
} from "../../src/workflows/inbound-putaway";

type TaskFilter = "ALL" | TaskType;

const TASK_FILTERS: { label: string; value: TaskFilter }[] = [
  { label: "Todas", value: "ALL" },
  { label: "Recepción", value: "RECEIVING" },
  { label: "Putaway", value: "PUTAWAY" },
  { label: "Picking", value: "PICKING" },
  { label: "Packing", value: "PACKING" },
];

export default function TasksListScreen(): JSX.Element {
  const router = useRouter();
  const { client, session } = useSession();

  const [selectedFilter, setSelectedFilter] = useState<TaskFilter>("ALL");
  const [tasks, setTasks] = useState<WarehouseTaskDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [startingTaskId, setStartingTaskId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const loadTasks = useCallback(
    async (refresh = false) => {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorBanner(null);

      try {
        const result = await client.listTasks(
          selectedFilter === "ALL" ? undefined : { type: selectedFilter },
        );
        setTasks(result);
      } catch (err) {
        if (err instanceof WmsApiClientError) {
          setErrorBanner(`[${err.code}] ${err.message}`);
        } else if (err instanceof Error) {
          setErrorBanner(err.message);
        } else {
          setErrorBanner("Error al cargar las tareas del almacén.");
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [client, selectedFilter],
  );

  useEffect(() => {
    void loadTasks(false);
  }, [loadTasks]);

  const handleStartOrOpenTask = useCallback(
    async (task: WarehouseTaskDTO) => {
      setErrorBanner(null);
      if (task.status === "PENDING") {
        setStartingTaskId(task.id);
        try {
          await client.startTask(task.id);
          await loadTasks(true);
        } catch (err) {
          if (err instanceof WmsApiClientError) {
            setErrorBanner(`[${err.code}] ${err.message}`);
          } else if (err instanceof Error) {
            setErrorBanner(err.message);
          }
          setStartingTaskId(null);
          return;
        }
        setStartingTaskId(null);
      }

      router.push(resolveTaskExecutionRoute(task));
    },
    [client, loadTasks, router],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.operatorHeader}>
        <Text style={styles.operatorText}>
          Operario: <Text style={styles.operatorHighlight}>{session.operatorName}</Text>
        </Text>
        <Text style={styles.warehouseText}>{session.warehouseId}</Text>
      </View>

      <View style={styles.filterRow}>
        {TASK_FILTERS.map((f) => {
          const isActive = selectedFilter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setSelectedFilter(f.value)}
              style={[
                styles.filterChip,
                isActive ? styles.filterChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  isActive ? styles.filterChipTextActive : null,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {errorBanner ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorBoxText}>{errorBanner}</Text>
          <Pressable
            onPress={() => {
              void loadTasks(false);
            }}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Cargando cola de tareas...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                void loadTasks(true);
              }}
              tintColor="#38BDF8"
            />
          }
        >
          {tasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Sin tareas pendientes</Text>
              <Text style={styles.emptySubtitle}>
                No hay tareas activas para el filtro seleccionado. Desliza hacia
                abajo para actualizar.
              </Text>
            </View>
          ) : (
            tasks.map((task) => {
              const completedSteps = task.steps.filter(
                (s) => s.status === "COMPLETED",
              ).length;
              const totalSteps = task.steps.length;
              const nextStep = getNextActiveStep(task.steps);
              const isStarting = startingTaskId === task.id;

              return (
                <View key={task.id} style={styles.taskCard}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.badgeGroup}>
                      <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>{task.type}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          task.status === "IN_PROGRESS"
                            ? styles.statusInProgress
                            : styles.statusPending,
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>{task.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.stepsCounter}>
                      {completedSteps}/{totalSteps} pasos
                    </Text>
                  </View>

                  <Text style={styles.taskIdText} numberOfLines={1}>
                    Tarea #{task.id}
                    {task.orderId ? ` · Pedido ${task.orderId}` : ""}
                  </Text>

                  {nextStep ? (
                    <View style={styles.nextStepBox}>
                      <Text style={styles.nextStepLabel}>
                        Siguiente paso (#{nextStep.sequence}):
                      </Text>
                      <Text style={styles.nextStepLocation}>
                        Ubicación: {nextStep.locationCode}
                      </Text>
                      <Text style={styles.nextStepProduct}>
                        {nextStep.productSku} — {nextStep.productName} (
                        {nextStep.scannedQty}/{nextStep.expectedQty} uds)
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.allCompletedText}>
                      Todos los pasos listos para confirmar.
                    </Text>
                  )}

                  <Pressable
                    onPress={() => {
                      void handleStartOrOpenTask(task);
                    }}
                    disabled={isStarting}
                    style={styles.actionButton}
                  >
                    <Text style={styles.actionButtonText}>
                      {isStarting
                        ? "Iniciando..."
                        : task.status === "PENDING"
                          ? "Tomar e Iniciar Tarea"
                          : "Continuar Escaneo"}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  operatorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#1E293B",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  operatorText: {
    color: "#94A3B8",
    fontSize: 13,
  },
  operatorHighlight: {
    color: "#F8FAFC",
    fontWeight: "700",
  },
  warehouseText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  filterChipActive: {
    backgroundColor: "#2563EB",
    borderColor: "#3B82F6",
  },
  filterChipText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#450A0A",
    borderWidth: 1,
    borderColor: "#EF4444",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  errorBoxText: {
    color: "#FCA5A5",
    fontSize: 12,
    flex: 1,
  },
  retryButton: {
    backgroundColor: "#EF4444",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  emptyCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    gap: 6,
  },
  emptyTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "700",
  },
  emptySubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    textAlign: "center",
  },
  taskCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgeGroup: {
    flexDirection: "row",
    gap: 8,
  },
  typeBadge: {
    backgroundColor: "#0EA5E9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: "#082F49",
    fontSize: 11,
    fontWeight: "800",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusPending: {
    backgroundColor: "#334155",
  },
  statusInProgress: {
    backgroundColor: "#065F46",
  },
  statusBadgeText: {
    color: "#F8FAFC",
    fontSize: 11,
    fontWeight: "700",
  },
  stepsCounter: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
  taskIdText: {
    color: "#CBD5E1",
    fontSize: 12,
  },
  nextStepBox: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    padding: 10,
    gap: 2,
    borderLeftWidth: 3,
    borderLeftColor: "#38BDF8",
  },
  nextStepLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  nextStepLocation: {
    color: "#38BDF8",
    fontSize: 14,
    fontWeight: "800",
  },
  nextStepProduct: {
    color: "#F8FAFC",
    fontSize: 13,
  },
  allCompletedText: {
    color: "#34D399",
    fontSize: 13,
    fontWeight: "600",
  },
  actionButton: {
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#052E16",
    fontSize: 14,
    fontWeight: "800",
  },
});
