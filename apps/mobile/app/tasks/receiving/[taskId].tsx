// apps/mobile/app/tasks/receiving/[taskId].tsx
// Pantalla guiada de Recepción en Muelle (Inbound RECEIVING).
// Consume GET /api/v1/tasks/:id y POST /api/v1/receipts/:taskId/confirm-line,
// valida escaneos QR/EAN/SKU y permite saltar directamente a la tarea PUTAWAY generada.

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
import { useSession } from "../../../src/context/session";
import { WmsApiClientError } from "../../../src/api/client";
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
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>
            Cargando orden de recepción #{taskId}...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cabecera y progreso de la recepción */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>RECEIVING · MUELLE</Text>
            </View>
            <Text style={styles.statusText}>{task?.status ?? "UNKNOWN"}</Text>
          </View>
          <Text style={styles.taskTitle}>Recepción #{task?.id ?? taskId}</Text>
          {progress ? (
            <View style={styles.progressSection}>
              <View style={styles.progressLabelsRow}>
                <Text style={styles.progressLabel}>
                  Líneas: {progress.completedSteps}/{progress.totalSteps}
                </Text>
                <Text style={styles.progressLabel}>
                  Unidades: {progress.scannedUnits}/{progress.expectedUnits} (
                  {progress.percent}%)
                </Text>
              </View>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${progress.percent}%` },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </View>

        {/* Banner de transición directa a PUTAWAY cuando la recepción finaliza */}
        {generatedPutawayTaskId || task?.status === "COMPLETED" ? (
          <View style={styles.completedCard}>
            <Text style={styles.completedTitle}>
              Recepción Completada en Muelle
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
                  Iniciar Putaway Generado (#{generatedPutawayTaskId})
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
                Volver a Bandeja de Tareas
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Banner de error de dominio */}
        {domainError ? (
          <View
            style={[
              styles.errorBanner,
              domainError.severity === "warning"
                ? styles.warningBanner
                : styles.criticalBanner,
            ]}
            testID="domain-error-banner"
          >
            <View style={styles.errorHeaderRow}>
              <Text style={styles.errorTitle}>{domainError.title}</Text>
              <Text style={styles.errorCodeBadge}>{domainError.code}</Text>
            </View>
            <Text style={styles.errorMessage}>{domainError.message}</Text>
            <Text style={styles.errorHint}>{domainError.actionHint}</Text>
          </View>
        ) : null}

        {/* Confirmación exitosa del último escaneo */}
        {successNote ? (
          <View style={styles.successBanner} testID="receiving-success-banner">
            <Text style={styles.successBannerText}>{successNote}</Text>
          </View>
        ) : null}

        {/* Panel de escaneo y cantidad si aún hay pasos pendientes */}
        {activeStep && task?.status !== "COMPLETED" ? (
          <View style={styles.activeStepPanel}>
            <Text style={styles.sectionTitle}>
              Línea Seleccionada (#{activeStep.sequence})
            </Text>
            <View style={styles.stepDetailBox}>
              <Text style={styles.locationBadge}>
                Muelle: {activeStep.locationCode}
              </Text>
              <Text style={styles.productTitle}>
                {activeStep.productSku} — {activeStep.productName}
              </Text>
              <Text style={styles.barcodeMeta}>
                Barcode esperado:{" "}
                <Text style={styles.barcodeHighlight}>
                  {activeStep.productBarcode ?? activeStep.productSku}
                </Text>
              </Text>
              <Text style={styles.qtyCounterText}>
                Recibido: {activeStep.scannedQty} / {activeStep.expectedQty} uds
                (Pendiente: {getRemainingStepQty(activeStep)} uds)
              </Text>
            </View>

            {/* Selector de cantidad a confirmar en este escaneo */}
            <View style={styles.qtyControlRow}>
              <Text style={styles.qtyControlLabel}>Cantidad a confirmar:</Text>
              <View style={styles.qtyButtonsGroup}>
                <Pressable
                  onPress={() => handleAdjustQty(-1)}
                  disabled={isSubmitting}
                  style={styles.qtyStepBtn}
                >
                  <Text style={styles.qtyStepBtnText}>-1</Text>
                </Pressable>
                <TextInput
                  style={styles.qtyInput}
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
                  <Text style={styles.qtyStepBtnText}>+1</Text>
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
                  <Text style={styles.qtyMaxBtnText}> Total Restante</Text>
                </Pressable>
              </View>
            </View>

            <BarcodeScannerBox
              onScan={(code) => {
                void handleConfirmScan(code);
              }}
              label={`Escanear Producto (${activeStep.productSku})`}
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
            Líneas de Entrada ({task?.steps.length ?? 0})
          </Text>
          {task?.steps.map((step) => {
            const isSelected = activeStep?.id === step.id;
            const isCompleted = step.status === "COMPLETED";

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
                  <Text style={styles.stepSeqText}>
                    Línea #{step.sequence} · {step.productSku}
                  </Text>
                  <Text
                    style={[
                      styles.stepStatusPill,
                      isCompleted
                        ? styles.stepStatusDone
                        : styles.stepStatusPending,
                    ]}
                  >
                    {step.status}
                  </Text>
                </View>
                <Text style={styles.stepProductName}>{step.productName}</Text>
                <View style={styles.stepFooterRow}>
                  <Text style={styles.stepBarcodeSmall}>
                    EAN: {step.productBarcode ?? "N/A"} · Muelle:{" "}
                    {step.locationCode}
                  </Text>
                  <Text style={styles.stepUnitsBadge}>
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
    backgroundColor: "#0F172A",
  },
  container: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
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
  headerCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 8,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  statusText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
  },
  taskTitle: {
    color: "#F8FAFC",
    fontSize: 17,
    fontWeight: "800",
  },
  progressSection: {
    gap: 6,
    marginTop: 4,
  },
  progressLabelsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressLabel: {
    color: "#CBD5E1",
    fontSize: 12,
    fontWeight: "600",
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: "#0F172A",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#10B981",
  },
  completedCard: {
    backgroundColor: "#064E3B",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#10B981",
    gap: 10,
  },
  completedTitle: {
    color: "#ECFDF5",
    fontSize: 16,
    fontWeight: "800",
  },
  completedSubtitle: {
    color: "#A7F3D0",
    fontSize: 13,
  },
  putawayCtaButton: {
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  putawayCtaButtonText: {
    color: "#052E16",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryBackButton: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#34D399",
  },
  secondaryBackButtonText: {
    color: "#6EE7B7",
    fontSize: 13,
    fontWeight: "700",
  },
  errorBanner: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    gap: 4,
  },
  criticalBanner: {
    backgroundColor: "#450A0A",
    borderColor: "#EF4444",
  },
  warningBanner: {
    backgroundColor: "#422006",
    borderColor: "#F59E0B",
  },
  errorHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorTitle: {
    color: "#FECACA",
    fontSize: 14,
    fontWeight: "800",
  },
  errorCodeBadge: {
    color: "#FCA5A5",
    fontSize: 11,
    fontWeight: "700",
  },
  errorMessage: {
    color: "#FEE2E2",
    fontSize: 13,
  },
  errorHint: {
    color: "#F87171",
    fontSize: 12,
    fontWeight: "600",
  },
  successBanner: {
    backgroundColor: "#064E3B",
    borderColor: "#10B981",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  successBannerText: {
    color: "#6EE7B7",
    fontSize: 13,
    fontWeight: "700",
  },
  activeStepPanel: {
    gap: 12,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
  },
  stepDetailBox: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#38BDF8",
    gap: 4,
  },
  locationBadge: {
    color: "#38BDF8",
    fontSize: 13,
    fontWeight: "800",
  },
  productTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
  },
  barcodeMeta: {
    color: "#94A3B8",
    fontSize: 12,
  },
  barcodeHighlight: {
    color: "#E2E8F0",
    fontWeight: "700",
  },
  qtyCounterText: {
    color: "#34D399",
    fontSize: 13,
    fontWeight: "700",
  },
  qtyControlRow: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 8,
  },
  qtyControlLabel: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
  },
  qtyButtonsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyStepBtn: {
    backgroundColor: "#334155",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  qtyStepBtnText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
  qtyInput: {
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 64,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  qtyMaxBtn: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  qtyMaxBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  stepsListSection: {
    gap: 8,
  },
  stepRowCard: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 4,
  },
  stepRowSelected: {
    borderColor: "#38BDF8",
    backgroundColor: "#1E293B",
  },
  stepRowCompleted: {
    opacity: 0.75,
    borderColor: "#065F46",
  },
  stepRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stepSeqText: {
    color: "#F8FAFC",
    fontSize: 13,
    fontWeight: "700",
  },
  stepStatusPill: {
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stepStatusDone: {
    color: "#34D399",
  },
  stepStatusPending: {
    color: "#38BDF8",
  },
  stepProductName: {
    color: "#CBD5E1",
    fontSize: 12,
  },
  stepFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
  },
  stepBarcodeSmall: {
    color: "#94A3B8",
    fontSize: 11,
  },
  stepUnitsBadge: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "700",
  },
});
