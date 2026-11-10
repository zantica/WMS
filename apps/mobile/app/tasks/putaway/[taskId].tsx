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
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { TaskStepDTO, WarehouseTaskDTO } from "@wms/shared-types";
import { BarcodeScannerBox } from "../../../src/components/BarcodeScannerBox";
import {
  WmsBanner,
  WmsProgressBar,
  WmsTag,
} from "../../../src/components/WmsUiPrimitives";
import { useSession } from "../../../src/context/session";
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
    try {
      let fetched = await client.getTask(taskId);
      // Si la tarea PUTAWAY aún está en PENDING, la iniciamos automáticamente para el operario
      if (fetched.status === "PENDING") {
        await client.startTask(taskId);
        fetched = await client.getTask(taskId);
      }
      setTask(fetched);

      const next = getNextActiveStep(fetched.steps);
      if (next) {
        setQtyInput(String(Math.max(1, getRemainingStepQty(next))));
      }
    } catch (err) {
      setDomainError(formatDomainErrorBanner(err));
    } finally {
      setIsLoading(false);
    }
  }, [client, taskId]);

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
    [task, nextStep, parsedQty, client, loadTask],
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
              <View style={styles.productSummaryBox}>
                <Text style={styles.productNameText}>
                  <Text style={monoText}>{nextStep.productSku}</Text> —{" "}
                  {nextStep.productName}
                </Text>
                <Text style={[styles.productMetaText, monoText]}>
                  EAN/Barcode: {nextStep.productBarcode ?? "Sin EAN"} · Ubicado:{" "}
                  {nextStep.scannedQty}/{nextStep.expectedQty} uds
                </Text>
                <Text style={[styles.remainingHighlight, monoText]}>
                  Cantidad a depositar ahora: {getRemainingStepQty(nextStep)}{" "}
                  unidades
                </Text>
              </View>
            </View>

            {/* Control de cantidad a ubicar */}
            <View style={styles.qtyControlRow}>
              <Text style={styles.qtyControlLabel}>
                Cantidad a confirmar en {nextStep.locationCode}:
              </Text>
              <View style={styles.qtyButtonsGroup}>
                <Pressable
                  onPress={() =>
                    setQtyInput(String(Math.max(1, parsedQty - 1)))
                  }
                  disabled={isSubmitting}
                  style={styles.qtyStepBtn}
                >
                  <Text style={[styles.qtyStepBtnText, monoText]}>-1</Text>
                </Pressable>
                <TextInput
                  style={[styles.qtyInput, monoText]}
                  value={qtyInput}
                  onChangeText={setQtyInput}
                  keyboardType="numeric"
                  editable={!isSubmitting}
                  testID="putaway-qty-input"
                />
                <Pressable
                  onPress={() =>
                    setQtyInput(
                      String(
                        Math.min(
                          Math.max(1, getRemainingStepQty(nextStep)),
                          parsedQty + 1,
                        ),
                      ),
                    )
                  }
                  disabled={isSubmitting}
                  style={styles.qtyStepBtn}
                >
                  <Text style={[styles.qtyStepBtnText, monoText]}>+1</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    setQtyInput(
                      String(Math.max(1, getRemainingStepQty(nextStep))),
                    )
                  }
                  disabled={isSubmitting}
                  style={styles.qtyMaxBtn}
                >
                  <Text style={styles.qtyMaxBtnText}>Total paso</Text>
                </Pressable>
              </View>
            </View>

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
            <View style={styles.exceptionContainer}>
              <Pressable
                onPress={() => setShowExceptionForm((prev) => !prev)}
                style={styles.toggleExceptionButton}
              >
                <Text style={styles.toggleExceptionText}>
                  {showExceptionForm
                    ? "Cancelar reporte de incidencia"
                    : "⚠ Reportar incidencia (ubicación llena / merma)"}
                </Text>
              </Pressable>

              {showExceptionForm ? (
                <View style={styles.exceptionForm}>
                  <TextInput
                    style={styles.exceptionInput}
                    value={exceptionNote}
                    onChangeText={setExceptionNote}
                    placeholder="Describe el motivo (ej. Ubicación A-01-01 bloqueada)..."
                    placeholderTextColor={WMS_COLORS.muted}
                    editable={!isSubmitting}
                    testID="putaway-exception-input"
                  />
                  <Pressable
                    onPress={() => {
                      void handleReportException();
                    }}
                    disabled={isSubmitting}
                    style={styles.submitExceptionButton}
                    testID="putaway-submit-exception-btn"
                  >
                    <Text style={styles.submitExceptionButtonText}>
                      Confirmar incidencia en paso #{nextStep.sequence}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Secuencia completa de pasos de Putaway */}
        <View style={styles.stepsListSection}>
          <Text style={styles.sectionTitle}>
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
                  styles.stepRowCard,
                  isCurrent ? styles.stepRowCurrent : null,
                  isCompleted ? styles.stepRowCompleted : null,
                ]}
              >
                <View style={styles.stepRowHeader}>
                  <Text style={[styles.stepSeqText, monoText]}>
                    #{step.sequence} · Estantería {step.locationCode}
                  </Text>
                  <WmsTag
                    label={stepVisual.label}
                    symbol={stepVisual.symbol}
                    tone={stepVisual.tone}
                  />
                </View>
                <Text style={styles.stepProductName}>
                  <Text style={monoText}>{step.productSku}</Text> —{" "}
                  {step.productName}
                </Text>
                <Text style={[styles.stepUnitsBadge, monoText]}>
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
  productSummaryBox: {
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.md,
    padding: WMS_SPACING.sm,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: 4,
    marginTop: WMS_SPACING.xs,
  },
  productNameText: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "700",
  },
  productMetaText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
  },
  remainingHighlight: {
    color: WMS_COLORS.success,
    fontSize: 13,
    fontWeight: "800",
  },
  qtyControlRow: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.sm,
  },
  qtyControlLabel: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "600",
  },
  qtyButtonsGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: WMS_SPACING.sm,
  },
  qtyStepBtn: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    borderRadius: WMS_RADII.md,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyStepBtnText: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "800",
  },
  qtyInput: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surface,
    color: WMS_COLORS.text,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: 6,
    minWidth: 68,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  qtyMaxBtn: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.accentTint,
    borderWidth: 1,
    borderColor: WMS_COLORS.accentBorder,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    borderRadius: WMS_RADII.md,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyMaxBtnText: {
    color: WMS_COLORS.accent,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
  exceptionContainer: {
    gap: WMS_SPACING.sm,
  },
  toggleExceptionButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.warningTint,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: WMS_COLORS.warningBorder,
  },
  toggleExceptionText: {
    color: WMS_COLORS.warning,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
  exceptionForm: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.warningBorder,
    gap: WMS_SPACING.sm,
  },
  exceptionInput: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surface,
    color: WMS_COLORS.text,
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    fontSize: 13,
  },
  submitExceptionButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.warning,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  submitExceptionButtonText: {
    color: WMS_COLORS.accentContrast,
    fontSize: 13,
    fontWeight: "800",
  },
  stepsListSection: {
    gap: WMS_SPACING.sm,
  },
  sectionTitle: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.base,
    fontWeight: "700",
  },
  stepRowCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: 4,
  },
  stepRowCurrent: {
    borderColor: WMS_COLORS.accentBorder,
    backgroundColor: WMS_COLORS.surfaceHover,
  },
  stepRowCompleted: {
    opacity: 0.72,
    borderColor: WMS_COLORS.successBorder,
  },
  stepRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  stepSeqText: {
    color: WMS_COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  stepProductName: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
  },
  stepUnitsBadge: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
});
