// apps/mobile/app/tasks/receiving/[taskId].tsx
// Pantalla guiada de Recepción en Muelle (Inbound RECEIVING).
// Consume GET /api/v1/tasks/:id y POST /api/v1/receipts/:taskId/confirm-line,
// valida escaneos QR/EAN/SKU y permite saltar directamente a la tarea PUTAWAY generada.
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
  matchReceivingStepByScan,
  type DomainErrorBanner,
} from "../../../src/workflows/inbound-putaway";

export default function ReceivingTaskScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string }>();
  const taskId = typeof params.taskId === "string" ? params.taskId : "";
  const { client } = useSession();

  const [task, setTask] = useState<WarehouseTaskDTO | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [qtyInput, setQtyInput] = useState<string>("1");
  const [generatedPutawayTaskId, setGeneratedPutawayTaskId] = useState<
    string | null
  >(null);
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
            "No se especificó el identificador de la tarea de recepción.",
            404,
          ),
        ),
      );
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const fetched = await client.getTask(taskId);
      setTask(fetched);
      const nextStep = getNextActiveStep(fetched.steps);
      if (nextStep) {
        setSelectedStepId(nextStep.id);
        setQtyInput(String(Math.max(1, getRemainingStepQty(nextStep))));
      } else {
        setSelectedStepId(null);
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

  const activeStep: TaskStepDTO | null = useMemo(() => {
    if (!task) return null;
    if (selectedStepId) {
      const found = task.steps.find((s) => s.id === selectedStepId);
      if (found) return found;
    }
    return getNextActiveStep(task.steps);
  }, [task, selectedStepId]);

  const parsedQty = useMemo(() => {
    const n = Number(qtyInput);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }, [qtyInput]);

  const handleSelectStep = useCallback((step: TaskStepDTO) => {
    setSelectedStepId(step.id);
    const rem = getRemainingStepQty(step);
    setQtyInput(String(rem > 0 ? rem : 1));
    setDomainError(null);
    setSuccessNote(null);
  }, []);

  const handleAdjustQty = useCallback(
    (delta: number) => {
      const maxAllowed = activeStep
        ? Math.max(1, getRemainingStepQty(activeStep))
        : 9999;
      const nextVal = Math.min(maxAllowed, Math.max(1, parsedQty + delta));
      setQtyInput(String(nextVal));
    },
    [activeStep, parsedQty],
  );

  const handleConfirmScan = useCallback(
    async (scannedCode: string) => {
      if (!task) return;
      setDomainError(null);
      setSuccessNote(null);
      setIsSubmitting(true);

      try {
        // 1. Intentar identificar la línea por el código escaneado (barcode o SKU)
        const matchedStep = matchReceivingStepByScan(task.steps, scannedCode);
        const targetStep = matchedStep ?? activeStep;

        if (!targetStep) {
          throw new WmsApiClientError(
            "INVALID_SCAN",
            `El código "${scannedCode}" no coincide con ningún producto esperado en esta recepción.`,
            422,
          );
        }

        const remaining = getRemainingStepQty(targetStep);
        const qtyToConfirm =
          matchedStep && matchedStep.id !== activeStep?.id
            ? Math.max(1, remaining)
            : parsedQty;

        const response = await client.confirmReceiptLine(task.id, {
          productId: targetStep.productId,
          scannedQty: qtyToConfirm,
          barcode: scannedCode,
        });

        if (response.putawayTaskId) {
          setGeneratedPutawayTaskId(response.putawayTaskId);
        }

        setSuccessNote(
          `Recibido ${targetStep.productSku}: ${response.scannedQty}/${response.expectedQty} uds (${response.stepStatus}).`,
        );

        await loadTask();
      } catch (err) {
        setDomainError(formatDomainErrorBanner(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [task, activeStep, parsedQty, client, loadTask],
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={WMS_COLORS.accent} />
          <Text style={styles.loadingText}>
            Cargando orden de recepción #{taskId}...
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
        {/* Cabecera y progreso de la recepción */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <WmsTag label="INBOUND · RECEIVING" symbol="↓" tone="blue" />
            {taskStatusVisual ? (
              <WmsTag
                label={taskStatusVisual.shortLabel}
                symbol={taskStatusVisual.symbol}
                tone={taskStatusVisual.tone}
              />
            ) : null}
          </View>
          <Text style={[styles.taskTitle, monoText]}>
            Recepción #{task?.id ?? taskId}
          </Text>
          {progress ? (
            <WmsProgressBar
              percent={progress.percent}
              leftLabel={`Líneas: ${progress.completedSteps}/${progress.totalSteps}`}
              rightLabel={`Unidades: ${progress.scannedUnits}/${progress.expectedUnits} (${progress.percent}%)`}
              tone="emerald"
            />
          ) : null}
        </View>

        {/* Banner de transición directa a PUTAWAY cuando la recepción finaliza */}
        {generatedPutawayTaskId || task?.status === "COMPLETED" ? (
          <View style={styles.completedCard}>
            <WmsTag label="LEDGER INBOUND VERIFICADO" symbol="✓" tone="emerald" />
            <Text style={styles.completedTitle}>
              Recepción completada en muelle
            </Text>
            <Text style={styles.completedSubtitle}>
              {generatedPutawayTaskId
                ? `Se ha generado automáticamente la tarea de ubicación en estantería (Putaway #${generatedPutawayTaskId}).`
                : "Todas las líneas de entrada han sido verificadas y contabilizadas en el Ledger."}
            </Text>
            {generatedPutawayTaskId ? (
              <Pressable
                onPress={() => {
                  router.push(
                    `/tasks/putaway/${encodeURIComponent(generatedPutawayTaskId)}`,
                  );
                }}
                style={styles.putawayCtaButton}
                testID="go-to-putaway-btn"
              >
                <Text style={styles.putawayCtaButtonText}>
                  Iniciar Putaway generado (#{generatedPutawayTaskId}) →
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                router.push("/(tabs)");
              }}
              style={styles.secondaryBackButton}
            >
              <Text style={styles.secondaryBackButtonText}>
                Volver a bandeja de tareas
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Banner de error de dominio */}
        {domainError ? (
          <WmsBanner
            title={domainError.title}
            codeBadge={domainError.code}
            message={domainError.message}
            actionHint={domainError.actionHint}
            tone={domainError.severity === "warning" ? "amber" : "rose"}
            testID="domain-error-banner"
          />
        ) : null}

        {/* Confirmación exitosa del último escaneo */}
        {successNote ? (
          <WmsBanner
            title="✓ Conteo registrado en muelle"
            message={successNote}
            tone="emerald"
            testID="receiving-success-banner"
          />
        ) : null}

        {/* Panel de escaneo y cantidad si aún hay pasos pendientes */}
        {activeStep && task?.status !== "COMPLETED" ? (
          <View style={styles.activeStepPanel}>
            <Text style={styles.sectionTitle}>
              Línea activa seleccionada (#{activeStep.sequence})
            </Text>
            <View style={styles.stepDetailBox}>
              <Text style={[styles.locationBadge, monoText]}>
                Muelle: {activeStep.locationCode}
              </Text>
              <Text style={styles.productTitle}>
                <Text style={monoText}>{activeStep.productSku}</Text> —{" "}
                {activeStep.productName}
              </Text>
              <Text style={styles.barcodeMeta}>
                Barcode esperado:{" "}
                <Text style={[styles.barcodeHighlight, monoText]}>
                  {activeStep.productBarcode ?? activeStep.productSku}
                </Text>
              </Text>
              <Text style={[styles.qtyCounterText, monoText]}>
                Recibido: {activeStep.scannedQty} / {activeStep.expectedQty} uds
                (Pendiente: {getRemainingStepQty(activeStep)} uds)
              </Text>
            </View>

            {/* Selector de cantidad a confirmar en este escaneo */}
            <View style={styles.qtyControlRow}>
              <Text style={styles.qtyControlLabel}>
                Cantidad a confirmar en este escaneo:
              </Text>
              <View style={styles.qtyButtonsGroup}>
                <Pressable
                  onPress={() => handleAdjustQty(-1)}
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
                  testID="receiving-qty-input"
                />
                <Pressable
                  onPress={() => handleAdjustQty(1)}
                  disabled={isSubmitting}
                  style={styles.qtyStepBtn}
                >
                  <Text style={[styles.qtyStepBtnText, monoText]}>+1</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    setQtyInput(
                      String(Math.max(1, getRemainingStepQty(activeStep))),
                    )
                  }
                  disabled={isSubmitting}
                  style={styles.qtyMaxBtn}
                >
                  <Text style={styles.qtyMaxBtnText}>Total restante</Text>
                </Pressable>
              </View>
            </View>

            <BarcodeScannerBox
              onScan={(code) => {
                void handleConfirmScan(code);
              }}
              label={`Escanear producto (${activeStep.productSku})`}
              placeholder="Escanea EAN/QR o escribe el código del producto..."
              expectedCodeHint={
                activeStep.productBarcode ?? activeStep.productSku
              }
              disabled={isSubmitting}
            />
          </View>
        ) : null}

        {/* Lista completa de líneas de la recepción */}
        <View style={styles.stepsListSection}>
          <Text style={styles.sectionTitle}>
            Líneas de entrada ({task?.steps.length ?? 0})
          </Text>
          {task?.steps.map((step) => {
            const isSelected = activeStep?.id === step.id;
            const isCompleted = step.status === "COMPLETED";
            const stepVisual = resolveStepStatusVisual(step.status);

            return (
              <Pressable
                key={step.id}
                onPress={() => handleSelectStep(step)}
                style={[
                  styles.stepRowCard,
                  isSelected ? styles.stepRowSelected : null,
                  isCompleted ? styles.stepRowCompleted : null,
                ]}
              >
                <View style={styles.stepRowHeader}>
                  <Text style={[styles.stepSeqText, monoText]}>
                    Línea #{step.sequence} · {step.productSku}
                  </Text>
                  <WmsTag
                    label={stepVisual.label}
                    symbol={stepVisual.symbol}
                    tone={stepVisual.tone}
                  />
                </View>
                <Text style={styles.stepProductName}>{step.productName}</Text>
                <View style={styles.stepFooterRow}>
                  <Text style={[styles.stepBarcodeSmall, monoText]}>
                    EAN: {step.productBarcode ?? "N/A"} · Muelle:{" "}
                    {step.locationCode}
                  </Text>
                  <Text style={[styles.stepUnitsBadge, monoText]}>
                    {step.scannedQty}/{step.expectedQty} uds
                  </Text>
                </View>
              </Pressable>
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
  putawayCtaButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.accent,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: WMS_SPACING.xs,
  },
  putawayCtaButtonText: {
    color: WMS_COLORS.accentContrast,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "800",
  },
  secondaryBackButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
  },
  secondaryBackButtonText: {
    color: WMS_COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  activeStepPanel: {
    gap: WMS_SPACING.md,
  },
  sectionTitle: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.base,
    fontWeight: "700",
  },
  stepDetailBox: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    borderLeftWidth: 4,
    borderLeftColor: WMS_COLORS.accent,
    gap: 4,
  },
  locationBadge: {
    color: WMS_COLORS.accent,
    fontSize: 13,
    fontWeight: "800",
  },
  productTitle: {
    color: WMS_COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  barcodeMeta: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
  },
  barcodeHighlight: {
    color: WMS_COLORS.text,
    fontWeight: "700",
  },
  qtyCounterText: {
    color: WMS_COLORS.success,
    fontSize: 13,
    fontWeight: "700",
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
  stepsListSection: {
    gap: WMS_SPACING.sm,
  },
  stepRowCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: 4,
  },
  stepRowSelected: {
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
  stepFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  stepBarcodeSmall: {
    color: WMS_COLORS.muted,
    fontSize: 11,
  },
  stepUnitsBadge: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
});
