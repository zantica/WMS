// apps/mobile/app/(tabs)/index.tsx
// Bandeja principal de tareas operativas del almacén (RECEIVING, PUTAWAY, PICKING, PACKING).
// Consume GET /api/v1/tasks y POST /api/v1/tasks/:id/start mediante el cliente HTTP tipado.
// Rediseñada con el HUD de telemetría S5 dark-data-dense (@wms/shared-types): cero hex crudos.

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useOfflineSync } from "../../src/context/offline-sync";
import { WmsApiClientError } from "../../src/api/client";
import { OfflineSyncStatusBar } from "../../src/components/OfflineSyncStatusBar";
import {
  WmsBanner,
  WmsEmptyState,
  WmsKpiCard,
  WmsProgressBar,
  WmsTag,
} from "../../src/components/WmsUiPrimitives";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_MIN_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  monoText,
  resolveTaskStatusVisual,
  resolveTaskTypeVisual,
  tabularNums,
} from "../../src/theme/tokens";
import {
  calculateTaskProgress,
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
  const { cache, isOnline } = useOfflineSync();

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

      if (!isOnline) {
        // Modo offline: cargar desde LocalTaskCache
        const cached = cache.getAllTasks();
        const filtered =
          selectedFilter === "ALL"
            ? cached
            : cached.filter((t) => t.type === selectedFilter);
        setTasks(filtered);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const result = await client.listTasks(
          selectedFilter === "ALL" ? undefined : { type: selectedFilter },
        );
        cache.setTasks(result);
        setTasks(result);
      } catch (err) {
        // Fallback a caché local si la red falla
        const cached = cache.getAllTasks();
        if (cached.length > 0) {
          const filtered =
            selectedFilter === "ALL"
              ? cached
              : cached.filter((t) => t.type === selectedFilter);
          setTasks(filtered);
          setErrorBanner("Modo offline activo: mostrando tareas guardadas en caché local.");
        } else if (err instanceof WmsApiClientError) {
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
    [client, cache, isOnline, selectedFilter],
  );

  useEffect(() => {
    void loadTasks(false);
  }, [loadTasks]);

  const queueMetrics = useMemo(() => {
    let pendingCount = 0;
    let inProgressCount = 0;
    let exceptionCount = 0;
    for (const task of tasks) {
      if (task.status === "PENDING") pendingCount += 1;
      else if (task.status === "IN_PROGRESS") inProgressCount += 1;
      else if (task.status === "EXCEPTION") exceptionCount += 1;
    }
    return { pendingCount, inProgressCount, exceptionCount };
  }, [tasks]);

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
      <OfflineSyncStatusBar showSimulateToggle />

      <View style={styles.operatorHeader}>
        <View>
          <Text style={styles.operatorEyebrow}>OPERARIO EN TURNO</Text>
          <Text style={styles.operatorHighlight}>{session.operatorName}</Text>
        </View>
        <WmsTag label={session.warehouseId} symbol="◆" tone="blue" mono />
      </View>

      {/* HUD compacto de cola operativa móvil */}
      <View style={styles.kpiRow}>
        <WmsKpiCard
          label="En curso"
          value={queueMetrics.inProgressCount}
          unit="tareas"
          tone="amber"
          tagLabel="▲ PISO"
        />
        <WmsKpiCard
          label="Pendientes"
          value={queueMetrics.pendingCount}
          unit="tareas"
          tone="blue"
          tagLabel="● COLA"
        />
        {queueMetrics.exceptionCount > 0 ? (
          <WmsKpiCard
            label="Excepciones"
            value={queueMetrics.exceptionCount}
            unit="alertas"
            tone="rose"
            tagLabel="⚠ REVISAR"
          />
        ) : null}
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
        <View style={styles.bannerWrap}>
          <WmsBanner
            title="⚠ Error de sincronización con @wms/api"
            message={errorBanner}
            tone="rose"
            actionLabel="Reintentar ahora"
            onAction={() => {
              void loadTasks(false);
            }}
          />
        </View>
      ) : null}

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={WMS_COLORS.accent} />
          <Text style={styles.loadingText}>
            Sincronizando cola de tareas operativas...
          </Text>
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
              tintColor={WMS_COLORS.accent}
            />
          }
        >
          {tasks.length === 0 ? (
            <WmsEmptyState
              title="Sin tareas operativas en cola"
              subtitle="No hay órdenes asignadas para el filtro activo. Desliza hacia abajo o pulsa sincronizar para consultar @wms/api."
              actionLabel="Sincronizar bandeja"
              onAction={() => {
                void loadTasks(true);
              }}
            />
          ) : (
            tasks.map((task) => {
              const progress = calculateTaskProgress(task);
              const nextStep = getNextActiveStep(task.steps);
              const isStarting = startingTaskId === task.id;
              const typeVisual = resolveTaskTypeVisual(task.type);
              const statusVisual = resolveTaskStatusVisual(task.status);

              return (
                <View key={task.id} style={styles.taskCard}>
                  <View style={styles.cardTopRow}>
                    <View style={styles.badgeGroup}>
                      <WmsTag
                        label={typeVisual.code}
                        symbol={typeVisual.symbol}
                        tone={typeVisual.tone}
                      />
                      <WmsTag
                        label={statusVisual.shortLabel}
                        symbol={statusVisual.symbol}
                        tone={statusVisual.tone}
                      />
                    </View>
                    <Text style={[styles.stepsCounter, monoText]}>
                      {progress.completedSteps}/{progress.totalSteps} pasos
                    </Text>
                  </View>

                  <Text
                    style={[styles.taskIdText, monoText]}
                    numberOfLines={1}
                  >
                    Tarea #{task.id}
                    {task.orderId ? ` · Pedido #${task.orderId}` : ""}
                  </Text>

                  <WmsProgressBar
                    percent={progress.percent}
                    leftLabel={`Unidades: ${progress.scannedUnits}/${progress.expectedUnits} uds`}
                    rightLabel={`${progress.percent}%`}
                    tone={
                      task.status === "EXCEPTION"
                        ? "rose"
                        : task.status === "COMPLETED"
                          ? "emerald"
                          : "blue"
                    }
                  />

                  {nextStep ? (
                    <View style={styles.nextStepBox}>
                      <Text style={styles.nextStepLabel}>
                        SIGUIENTE PARADA (#{nextStep.sequence})
                      </Text>
                      <Text style={[styles.nextStepLocation, monoText]}>
                        Ubicación: {nextStep.locationCode}
                      </Text>
                      <Text style={[styles.nextStepProduct, tabularNums]}>
                        <Text style={monoText}>{nextStep.productSku}</Text> —{" "}
                        {nextStep.productName} ({nextStep.scannedQty}/
                        {nextStep.expectedQty} uds)
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.allCompletedText}>
                      ✓ Todos los pasos verificados en el recorrido.
                    </Text>
                  )}

                  <Pressable
                    onPress={() => {
                      void handleStartOrOpenTask(task);
                    }}
                    disabled={isStarting}
                    style={[
                      styles.actionButton,
                      task.status === "IN_PROGRESS"
                        ? styles.actionButtonPrimary
                        : styles.actionButtonSecondary,
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionButtonText,
                        task.status === "IN_PROGRESS"
                          ? styles.actionButtonTextPrimary
                          : styles.actionButtonTextSecondary,
                      ]}
                    >
                      {isStarting
                        ? "Iniciando tarea..."
                        : task.status === "PENDING"
                          ? "Tomar e iniciar tarea →"
                          : "Continuar escaneo en piso →"}
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
    backgroundColor: WMS_COLORS.bg,
  },
  operatorHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: WMS_SPACING.lg,
    paddingVertical: WMS_SPACING.sm,
    backgroundColor: WMS_COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: WMS_COLORS.border,
  },
  operatorEyebrow: {
    color: WMS_COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  operatorHighlight: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "700",
  },
  kpiRow: {
    flexDirection: "row",
    gap: WMS_SPACING.sm,
    paddingHorizontal: WMS_SPACING.lg,
    paddingTop: WMS_SPACING.md,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: WMS_SPACING.sm,
    paddingHorizontal: WMS_SPACING.lg,
    paddingVertical: WMS_SPACING.md,
  },
  filterChip: {
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: 6,
    borderRadius: WMS_RADII.sm,
    backgroundColor: WMS_COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
  },
  filterChipActive: {
    backgroundColor: WMS_COLORS.accentTint,
    borderColor: WMS_COLORS.accentBorder,
  },
  filterChipText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: WMS_COLORS.accent,
    fontWeight: "700",
  },
  bannerWrap: {
    paddingHorizontal: WMS_SPACING.lg,
    marginBottom: WMS_SPACING.sm,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  loadingText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.sm,
  },
  listContent: {
    paddingHorizontal: WMS_SPACING.lg,
    paddingBottom: WMS_SPACING.xxl,
    gap: WMS_SPACING.md,
  },
  taskCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.sm,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: WMS_SPACING.sm,
  },
  badgeGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: WMS_SPACING.xs,
  },
  stepsCounter: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
  taskIdText: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "600",
  },
  nextStepBox: {
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.md,
    padding: WMS_SPACING.sm,
    gap: 3,
    borderLeftWidth: 3,
    borderLeftColor: WMS_COLORS.accent,
  },
  nextStepLabel: {
    color: WMS_COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
  },
  nextStepLocation: {
    color: WMS_COLORS.accent,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "800",
  },
  nextStepProduct: {
    color: WMS_COLORS.text,
    fontSize: 13,
  },
  allCompletedText: {
    color: WMS_COLORS.success,
    fontSize: 13,
    fontWeight: "600",
  },
  actionButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  actionButtonPrimary: {
    backgroundColor: WMS_COLORS.accent,
    borderColor: WMS_COLORS.accent,
  },
  actionButtonSecondary: {
    backgroundColor: WMS_COLORS.surfaceHover,
    borderColor: WMS_COLORS.borderStrong,
  },
  actionButtonText: {
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "800",
  },
  actionButtonTextPrimary: {
    color: WMS_COLORS.accentContrast,
  },
  actionButtonTextSecondary: {
    color: WMS_COLORS.text,
  },
});
