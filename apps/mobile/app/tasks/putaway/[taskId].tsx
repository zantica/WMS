// apps/mobile/app/tasks/putaway/[taskId].tsx
// Pantalla guiada de Putaway (Ubicación de Muelle RECEIVING a Estantería STORAGE).
// Guía al operario paso a paso en orden de secuencia (locationCode ASC),
// valida el escaneo con POST /api/v1/tasks/:id/steps/:stepId/confirm y permite reportar excepciones.
// Rediseñada con tokens S5 dark-data-dense (@wms/shared-types): cero hex crudos.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { TaskStepDTO, WarehouseTaskDTO } from "@wms/shared-types";
import { BarcodeScannerBox } from "../../../src/components/BarcodeScannerBox";
import { OfflineSyncStatusBar } from "../../../src/components/OfflineSyncStatusBar";
import {
  commonTaskStyles,
  TaskExceptionSection,
  TaskQuantityControl,
} from "../../../src/components/TaskScreenCommon";
import {
  handleOfflineStepConfirmation,
  handleOfflineTaskLoad,
} from "../../../src/offline/task-screen-offline";
import {
  WmsBanner,
  WmsProgressBar,
  WmsTag,
} from "../../../src/components/WmsUiPrimitives";
import { useSession } from "../../../src/context/session";
import { useOfflineSync } from "../../../src/context/offline-sync";
import { WmsApiClientError } from "../../../src/api/client";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_MIN_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  monoText,
  resolveStepStatusVisual,
  resolveTaskStatusVisual,
} from "../../../src/theme/tokens";
import {
  calculateTaskProgress,
  formatDomainErrorBanner,
  getNextActiveStep,
  getRemainingStepQty,
  type DomainErrorBanner,
} from "../../../src/workflows/inbound-putaway";

export default function PutawayTaskScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string }>();
  const taskId = typeof params.taskId === "string" ? params.taskId : "";
  const { client } = useSession();
  const { cache, isOnline, enqueueStepConfirmation } = useOfflineSync();

  const [task, setTask] = useState<WarehouseTaskDTO | null>(null);
  const [qtyInput, setQtyInput] = useState<string>("1");
  const [showExceptionForm, setShowExceptionForm] = useState<boolean>(false);
  const [exceptionNote, setExceptionNote] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [domainError, setDomainError] = useState<DomainErrorBanner | null>(
    null,
  );
  const [successNote, setSuccessNote] = useState<string | null>(null);

  const loadTask = useCallback(async () => {
    if (!taskId) {
      setDomainError(
        formatDomainErrorBanner(
          new WmsApiClientError(
            "TASK_NOT_FOUND",
            "No se especificó el identificador de la tarea de Putaway.",
            404,
          ),
        ),
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    if (!isOnline) {
      const { task: cached, domainError: offErr } = handleOfflineTaskLoad(
        taskId,
        cache,
      );
      if (cached) {
        setTask(cached);
        const next = getNextActiveStep(cached.steps);
        if (next) {
          setQtyInput(String(Math.max(1, getRemainingStepQty(next))));
        }
      } else {
        setDomainError(offErr);
      }
      setIsLoading(false);
      return;
    }

    try {
      let fetched = await client.getTask(taskId);
      // Si la tarea PUTAWAY aún está en PENDING, la iniciamos automáticamente para el operario
      if (fetched.status === "PENDING") {
        await client.startTask(taskId);
        fetched = await client.getTask(taskId);
      }
      cache.upsertTask(fetched);
      setTask(fetched);

      const next = getNextActiveStep(fetched.steps);
      if (next) {
        setQtyInput(String(Math.max(1, getRemainingStepQty(next))));
      }
    } catch (err) {
      const { task: cached } = handleOfflineTaskLoad(taskId, cache);
      if (cached) {
        setTask(cached);
        const next = getNextActiveStep(cached.steps);
        if (next) {
          setQtyInput(String(Math.max(1, getRemainingStepQty(next))));
        }
      } else {
        setDomainError(formatDomainErrorBanner(err));
      }
    } finally {
      setIsLoading(false);
    }
  }, [client, cache, isOnline, taskId]);

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

  const progress = useMemo(
    () => (task ? calculateTaskProgress(task) : null),
    [task],
  );

  const nextStep: TaskStepDTO | null = useMemo(
    () => (task ? getNextActiveStep(task.steps) : null),
    [task],
  );

  const parsedQty = useMemo(() => {
    const n = Number(qtyInput);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }, [qtyInput]);

  const handleConfirmStepScan = useCallback(
    async (scannedCode: string) => {
      if (!task || !nextStep) return;
      setDomainError(null);
      setSuccessNote(null);
      setIsSubmitting(true);

      if (!isOnline) {
        const offRes = await handleOfflineStepConfirmation({
          cache,
          enqueueStepConfirmation,
          taskId: task.id,
          stepId: nextStep.id,
          scannedCode,
          quantity: parsedQty,
        });

        if (!offRes.success) {
          if (offRes.error) setDomainError(offRes.error);
          setIsSubmitting(false);
          return;
        }

        if (offRes.updatedTask) {
          setTask(offRes.updatedTask);
          const next = getNextActiveStep(offRes.updatedTask.steps);
          if (next) {
            setQtyInput(String(Math.max(1, getRemainingStepQty(next))));
          }
        }
        setSuccessNote(
          `[OFFLINE] Guardado en cola local: ${parsedQty} uds en ${nextStep.locationCode}.`,
        );
        setShowExceptionForm(false);
        setExceptionNote("");
        setIsSubmitting(false);
        return;
      }

      try {
        const res = await client.confirmTaskStep(task.id, nextStep.id, {
          scannedCode,
          quantity: parsedQty,
        });

        setSuccessNote(
          `Ubicado en ${nextStep.locationCode}: ${res.scannedQty}/${res.expectedQty} uds (${res.stepStatus}).`,
        );
        setShowExceptionForm(false);
        setExceptionNote("");
        await loadTask();
      } catch (err) {
        setDomainError(formatDomainErrorBanner(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      task,
      nextStep,
      parsedQty,
      isOnline,
      cache,
      enqueueStepConfirmation,
      client,
      loadTask,
    ],
  );

  const handleReportException = useCallback(async () => {
    if (!task || !nextStep) return;
    setDomainError(null);
    setSuccessNote(null);
    setIsSubmitting(true);

    try {
      const note =
        exceptionNote.trim().length > 0
          ? exceptionNote.trim()
          : `Incidencia reportada en ubicación ${nextStep.locationCode}`;

      const res = await client.confirmTaskStep(task.id, nextStep.id, {
        scannedCode: nextStep.locationCode,
        reportException: true,
        exceptionNote: note,
      });

      setSuccessNote(
        `Incidencia registrada en paso #${nextStep.sequence} (${res.stepStatus}).`,
      );
      setShowExceptionForm(false);
      setExceptionNote("");
      await loadTask();
    } catch (err) {
      setDomainError(formatDomainErrorBanner(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [task, nextStep, exceptionNote, client, loadTask]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={WMS_COLORS.accent} />
          <Text style={styles.loadingText}>
            Cargando ruta de Putaway #{taskId}...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const taskStatusVisual = task ? resolveTaskStatusVisual(task.status) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineSyncStatusBar />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cabecera de la tarea PUTAWAY */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <WmsTag label="STORAGE · PUTAWAY" symbol="→" tone="blue" />
            {taskStatusVisual ? (
              <WmsTag
                label={taskStatusVisual.shortLabel}
                symbol={taskStatusVisual.symbol}
                tone={taskStatusVisual.tone}
              />
            ) : null}
          </View>
          <Text style={[styles.taskTitle, monoText]}>
            Putaway #{task?.id ?? taskId}
          </Text>
          {progress ? (
            <WmsProgressBar
              percent={progress.percent}
              leftLabel={`Pasos: ${progress.completedSteps}/${progress.totalSteps}`}
              rightLabel={`Unidades ubicadas: ${progress.scannedUnits}/${progress.expectedUnits} (${progress.percent}%)`}
              tone="blue"
            />
          ) : null}
        </View>

        {/* Banner de error de dominio */}
        {domainError ? (
          <WmsBanner
            title={domainError.title}
            codeBadge={domainError.code}
            message={domainError.message}
            actionHint={domainError.actionHint}
            tone={domainError.severity === "warning" ? "amber" : "rose"}
            testID="putaway-error-banner"
          />
        ) : null}

        {/* Banner de éxito */}
        {successNote ? (
          <WmsBanner
            title="✓ Ubicación confirmada en estantería"
            message={successNote}
            tone="emerald"
            testID="putaway-success-banner"
          />
        ) : null}

        {/* Estado de finalización o paso guiado actual */}
        {!nextStep ? (
          <View
            style={[
              styles.completedCard,
              task?.status === "EXCEPTION" ? styles.completedExceptionCard : null,
            ]}
          >
            <WmsTag
              label={
                task?.status === "EXCEPTION"
                  ? "INCIDENCIA EN ESTANTERÍA"
                  : "PUTAWAY COMPLETADO"
              }
              symbol={task?.status === "EXCEPTION" ? "⚠" : "✓"}
              tone={task?.status === "EXCEPTION" ? "amber" : "emerald"}
            />
            <Text style={styles.completedTitle}>
              {task?.status === "EXCEPTION"
                ? "Tarea Putaway con incidencia reportada"
                : "Putaway completado exitosamente"}
            </Text>
            <Text style={styles.completedSubtitle}>
              El stock ha sido transferido del muelle de recepción (RECEIVING) a
              las estanterías de almacenamiento (STORAGE) en el Ledger.
            </Text>
            <Pressable
              onPress={() => {
                router.push("/(tabs)");
              }}
              style={styles.backToQueueButton}
            >
              <Text style={styles.backToQueueButtonText}>
                Volver a la cola de tareas
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.guidedPanel}>
            {/* Tarjeta destacada de ubicación destino */}
            <View style={styles.destinationCard}>
              <Text style={styles.stepSequenceLabel}>
                PASO ACTIVO #{nextStep.sequence} DE {task?.steps.length ?? 1}
              </Text>
              <Text style={styles.destinationInstruction}>
                Dirígete a la estantería STORAGE:
              </Text>
              <Text style={[styles.destinationCode, monoText]}>
                {nextStep.locationCode}
              </Text>
              <View style={commonTaskStyles.productSummaryBox}>
                <Text style={commonTaskStyles.productNameText}>
                  <Text style={monoText}>{nextStep.productSku}</Text> —{" "}
                  {nextStep.productName}
                </Text>
                <Text style={[commonTaskStyles.productMetaText, monoText]}>
                  EAN/Barcode: {nextStep.productBarcode ?? "Sin EAN"} · Ubicado:{" "}
                  {nextStep.scannedQty}/{nextStep.expectedQty} uds
                </Text>
                <Text style={[commonTaskStyles.remainingHighlight, monoText]}>
                  Cantidad a depositar ahora: {getRemainingStepQty(nextStep)}{" "}
                  unidades
                </Text>
              </View>
            </View>

            {/* Control de cantidad a ubicar */}
            <TaskQuantityControl
              label={`Cantidad a confirmar en ${nextStep.locationCode}:`}
              value={qtyInput}
              onChangeValue={setQtyInput}
              onAdjust={(delta) =>
                setQtyInput(
                  String(
                    Math.min(
                      Math.max(1, getRemainingStepQty(nextStep)),
                      Math.max(1, parsedQty + delta),
                    ),
                  ),
                )
              }
              maxPendingQty={getRemainingStepQty(nextStep)}
              onSelectMax={() =>
                setQtyInput(String(Math.max(1, getRemainingStepQty(nextStep))))
              }
              disabled={isSubmitting}
              inputTestID="putaway-qty-input"
            />

            <BarcodeScannerBox
              onScan={(code) => {
                void handleConfirmStepScan(code);
              }}
              label={`Escanear ubicación ${nextStep.locationCode} o producto ${nextStep.productSku}`}
              placeholder="Escanea el QR de la estantería o código del producto..."
              expectedCodeHint={`${nextStep.locationCode} / ${nextStep.productBarcode ?? nextStep.productSku}`}
              disabled={isSubmitting}
            />

            {/* Botón y formulario para reportar excepción en ubicación/stock */}
            <TaskExceptionSection
              isOpen={showExceptionForm}
              onToggle={() => setShowExceptionForm((prev) => !prev)}
              note={exceptionNote}
              onChangeNote={setExceptionNote}
              onSubmit={() => void handleReportException()}
              isSubmitting={isSubmitting}
              toggleLabelOpen="Cancelar reporte de incidencia"
              toggleLabelClosed="⚠ Reportar incidencia (ubicación llena / merma)"
              placeholder="Describe el motivo (ej. Ubicación A-01-01 bloqueada)..."
              submitLabel={`Confirmar incidencia en paso #${nextStep.sequence}`}
              inputTestID="putaway-exception-input"
              submitTestID="putaway-submit-exception-btn"
            />
          </View>
        )}

        {/* Secuencia completa de pasos de Putaway */}
        <View style={commonTaskStyles.stepsListSection}>
          <Text style={commonTaskStyles.sectionTitle}>
            Ruta de ubicación ({task?.steps.length ?? 0} paradas)
          </Text>
          {task?.steps.map((step) => {
            const isCurrent = nextStep?.id === step.id;
            const isCompleted = step.status === "COMPLETED";
            const stepVisual = resolveStepStatusVisual(step.status);

            return (
              <View
                key={step.id}
                style={[
                  commonTaskStyles.stepRowCard,
                  isCurrent ? styles.stepRowCurrent : null,
                  isCompleted ? styles.stepRowCompleted : null,
                ]}
              >
                <View style={commonTaskStyles.stepRowHeader}>
                  <Text style={[commonTaskStyles.stepSeqText, monoText]}>
                    #{step.sequence} · Estantería {step.locationCode}
                  </Text>
                  <WmsTag
                    label={stepVisual.label}
                    symbol={stepVisual.symbol}
                    tone={stepVisual.tone}
                  />
                </View>
                <Text style={commonTaskStyles.stepProductName}>
                  <Text style={monoText}>{step.productSku}</Text> —{" "}
                  {step.productName}
                </Text>
                <Text style={[commonTaskStyles.stepUnitsBadge, monoText]}>
                  {step.scannedQty}/{step.expectedQty} uds
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WMS_COLORS.bg,
  },
  container: {
    padding: WMS_SPACING.lg,
    gap: WMS_SPACING.md,
    paddingBottom: WMS_SPACING.xxl,
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
  headerCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.sm,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  taskTitle: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.lg,
    fontWeight: "800",
  },
  completedCard: {
    backgroundColor: WMS_COLORS.successTint,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.lg,
    borderWidth: 1,
    borderColor: WMS_COLORS.successBorder,
    gap: WMS_SPACING.sm,
  },
  completedExceptionCard: {
    backgroundColor: WMS_COLORS.warningTint,
    borderColor: WMS_COLORS.warningBorder,
  },
  completedTitle: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.base,
    fontWeight: "800",
  },
  completedSubtitle: {
    color: WMS_COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  backToQueueButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.accent,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: WMS_SPACING.xs,
  },
  backToQueueButtonText: {
    color: WMS_COLORS.accentContrast,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "800",
  },
  guidedPanel: {
    gap: WMS_SPACING.md,
  },
  destinationCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.lg,
    borderWidth: 1,
    borderColor: WMS_COLORS.accentBorder,
    gap: 6,
  },
  stepSequenceLabel: {
    color: WMS_COLORS.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  destinationInstruction: {
    color: WMS_COLORS.muted,
    fontSize: 13,
  },
  destinationCode: {
    color: WMS_COLORS.accent,
    fontSize: WMS_FONT_SIZES.display,
    fontWeight: "900",
  },
  stepRowCurrent: {
    borderColor: WMS_COLORS.accentBorder,
    backgroundColor: WMS_COLORS.surfaceHover,
  },
  stepRowCompleted: {
    opacity: 0.72,
    borderColor: WMS_COLORS.successBorder,
  },
});
