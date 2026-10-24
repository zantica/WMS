// apps/mobile/app/tasks/putaway/[taskId].tsx
// Pantalla guiada de Putaway (Ubicación de Muelle RECEIVING a Estantería STORAGE).
// Guía al operario paso a paso en orden de secuencia (locationCode ASC),
// valida el escaneo con POST /api/v1/tasks/:id/steps/:stepId/confirm y permite reportar excepciones.

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
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>
            Cargando ruta de Putaway #{taskId}...
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
        {/* Cabecera de la tarea PUTAWAY */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>PUTAWAY · UBICACIÓN</Text>
            </View>
            <Text style={styles.statusText}>{task?.status ?? "UNKNOWN"}</Text>
          </View>
          <Text style={styles.taskTitle}>Putaway #{task?.id ?? taskId}</Text>
          {progress ? (
            <View style={styles.progressSection}>
              <View style={styles.progressLabelsRow}>
                <Text style={styles.progressLabel}>
                  Pasos: {progress.completedSteps}/{progress.totalSteps}
                </Text>
                <Text style={styles.progressLabel}>
                  Unidades ubicadas: {progress.scannedUnits}/
                  {progress.expectedUnits} ({progress.percent}%)
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

        {/* Banner de error de dominio */}
        {domainError ? (
          <View
            style={[
              styles.errorBanner,
              domainError.severity === "warning"
                ? styles.warningBanner
                : styles.criticalBanner,
            ]}
            testID="putaway-error-banner"
          >
            <View style={styles.errorHeaderRow}>
              <Text style={styles.errorTitle}>{domainError.title}</Text>
              <Text style={styles.errorCodeBadge}>{domainError.code}</Text>
            </View>
            <Text style={styles.errorMessage}>{domainError.message}</Text>
            <Text style={styles.errorHint}>{domainError.actionHint}</Text>
          </View>
        ) : null}

        {/* Banner de éxito */}
        {successNote ? (
          <View style={styles.successBanner} testID="putaway-success-banner">
            <Text style={styles.successBannerText}>{successNote}</Text>
          </View>
        ) : null}

        {/* Estado de finalización o paso guiado actual */}
        {!nextStep ? (
          <View style={styles.completedCard}>
            <Text style={styles.completedTitle}>
              {task?.status === "EXCEPTION"
                ? "Tarea Putaway con Incidencia Reportada"
                : "Putaway Completado Exitosamente"}
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
                Volver a la Cola de Tareas
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
              <Text style={styles.destinationCode}>
                {nextStep.locationCode}
              </Text>
              <View style={styles.productSummaryBox}>
                <Text style={styles.productNameText}>
                  {nextStep.productSku} — {nextStep.productName}
                </Text>
                <Text style={styles.productMetaText}>
                  EAN/Barcode: {nextStep.productBarcode ?? "Sin EAN"} · Ubicado:{" "}
                  {nextStep.scannedQty}/{nextStep.expectedQty} uds
                </Text>
                <Text style={styles.remainingHighlight}>
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
                  <Text style={styles.qtyStepBtnText}>-1</Text>
                </Pressable>
                <TextInput
                  style={styles.qtyInput}
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
                  <Text style={styles.qtyStepBtnText}>+1</Text>
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
                  <Text style={styles.qtyMaxBtnText}>Total Paso</Text>
                </Pressable>
              </View>
            </View>

            <BarcodeScannerBox
              onScan={(code) => {
                void handleConfirmStepScan(code);
              }}
              label={`Escanear Ubicación ${nextStep.locationCode} o Producto ${nextStep.productSku}`}
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
                    ? "Cancelar Reporte de Incidencia"
                    : "Reportar Incidencia (Ubicación Llena / Merma)"}
                </Text>
              </Pressable>

              {showExceptionForm ? (
                <View style={styles.exceptionForm}>
                  <TextInput
                    style={styles.exceptionInput}
                    value={exceptionNote}
                    onChangeText={setExceptionNote}
                    placeholder="Describe el motivo (ej. Ubicación A-01-01 bloqueada)..."
                    placeholderTextColor="#64748B"
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
                      Confirmar Incidencia en Paso #{nextStep.sequence}
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
            Ruta de Ubicación ({task?.steps.length ?? 0} paradas)
          </Text>
          {task?.steps.map((step) => {
            const isCurrent = nextStep?.id === step.id;
            const isCompleted = step.status === "COMPLETED";

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
                  <Text style={styles.stepSeqText}>
                    #{step.sequence} · Estantería {step.locationCode}
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
                <Text style={styles.stepProductName}>
                  {step.productSku} — {step.productName}
                </Text>
                <Text style={styles.stepUnitsBadge}>
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
    backgroundColor: "#38BDF8",
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
    backgroundColor: "#38BDF8",
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
  backToQueueButton: {
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  backToQueueButtonText: {
    color: "#052E16",
    fontSize: 14,
    fontWeight: "800",
  },
  guidedPanel: {
    gap: 12,
  },
  destinationCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: "#38BDF8",
    gap: 6,
  },
  stepSequenceLabel: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "800",
  },
  destinationInstruction: {
    color: "#CBD5E1",
    fontSize: 13,
  },
  destinationCode: {
    color: "#38BDF8",
    fontSize: 28,
    fontWeight: "900",
  },
  productSummaryBox: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    padding: 10,
    gap: 4,
    marginTop: 4,
  },
  productNameText: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  productMetaText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  remainingHighlight: {
    color: "#34D399",
    fontSize: 13,
    fontWeight: "800",
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
  exceptionContainer: {
    gap: 8,
  },
  toggleExceptionButton: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  toggleExceptionText: {
    color: "#FBBF24",
    fontSize: 12,
    fontWeight: "700",
  },
  exceptionForm: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#F59E0B",
    gap: 8,
  },
  exceptionInput: {
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#475569",
    fontSize: 13,
  },
  submitExceptionButton: {
    backgroundColor: "#F59E0B",
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  submitExceptionButtonText: {
    color: "#422006",
    fontSize: 13,
    fontWeight: "800",
  },
  stepsListSection: {
    gap: 8,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
  },
  stepRowCard: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 4,
  },
  stepRowCurrent: {
    borderColor: "#38BDF8",
  },
  stepRowCompleted: {
    opacity: 0.7,
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
  stepUnitsBadge: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "700",
  },
});
