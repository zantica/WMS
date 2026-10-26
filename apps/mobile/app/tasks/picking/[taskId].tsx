// apps/mobile/app/tasks/picking/[taskId].tsx
// Pantalla guiada de Picking y Packing paso a paso (Estantería STORAGE -> Mesa PACKING -> Despacho SHIPPED).
// Guía al operario según el recorrido óptimo (locationCode ASC), exige doble validación de escaneo
// (1º Ubicación STORAGE -> 2º Producto Barcode/SKU), gestiona excepciones y re-asignaciones en vivo (F3.2),
// y habilita el cierre en Mesa de Packing con confirmación de despacho del pedido.

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
import type {
  OrderStatus,
  TaskStepDTO,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import { BarcodeScannerBox } from "../../../src/components/BarcodeScannerBox";
import { useSession } from "../../../src/context/session";
import { WmsApiClientError } from "../../../src/api/client";
import {
  calculateTaskProgress,
  formatDomainErrorBanner,
  getRemainingStepQty,
  type DomainErrorBanner,
} from "../../../src/workflows/inbound-putaway";
import {
  advanceDualScanState,
  createInitialDualScanState,
  formatPickingExceptionFeedback,
  getNextPickingStep,
  sortPickingStepsByLocation,
  type DualScanState,
  type PickingExceptionFeedback,
} from "../../../src/workflows/picking";

export default function PickingTaskScreen(): JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string }>();
  const taskId = typeof params.taskId === "string" ? params.taskId : "";
  const { client } = useSession();

  const [task, setTask] = useState<WarehouseTaskDTO | null>(null);
  const [dualScan, setDualScan] = useState<DualScanState>(
    createInitialDualScanState(""),
  );
  const [qtyInput, setQtyInput] = useState<string>("1");
  const [showExceptionForm, setShowExceptionForm] = useState<boolean>(false);
  const [exceptionNote, setExceptionNote] = useState<string>("");
  const [exceptionFeedback, setExceptionFeedback] =
    useState<PickingExceptionFeedback | null>(null);
  const [dispatchedOrderStatus, setDispatchedOrderStatus] =
    useState<OrderStatus | null>(null);
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
            "No se especificó el identificador de la tarea de Picking.",
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
      // Si la tarea PICKING aún está en PENDING, la iniciamos automáticamente
      if (fetched.status === "PENDING") {
        await client.startTask(taskId);
        fetched = await client.getTask(taskId);
      }
      setTask(fetched);

      const next = getNextPickingStep(fetched.steps);
      if (next) {
        setQtyInput(String(Math.max(1, getRemainingStepQty(next))));
        setDualScan((prev) =>
          prev.stepId === next.id
            ? prev
            : createInitialDualScanState(next.id),
        );
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

  const orderedSteps: TaskStepDTO[] = useMemo(
    () => (task ? sortPickingStepsByLocation(task.steps) : []),
    [task],
  );

  const progress = useMemo(
    () => (task ? calculateTaskProgress(task) : null),
    [task],
  );

  const nextStep: TaskStepDTO | null = useMemo(
    () => (task ? getNextPickingStep(task.steps) : null),
    [task],
  );

  const parsedQty = useMemo(() => {
    const n = Number(qtyInput);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }, [qtyInput]);

  const handleResetLocationScan = useCallback(() => {
    if (!nextStep) return;
    setDomainError(null);
    setDualScan(createInitialDualScanState(nextStep.id));
  }, [nextStep]);

  const handleDualScanInput = useCallback(
    async (scannedCode: string) => {
      if (!task || !nextStep) return;
      setDomainError(null);
      setSuccessNote(null);

      const transition = advanceDualScanState(dualScan, nextStep, scannedCode);

      if (!transition.valid) {
        setDualScan({
          stepId: nextStep.id,
          stage: transition.nextStage,
          verifiedLocationCode: transition.verifiedLocationCode,
          matchedProductCode: transition.matchedProductCode,
        });
        setDomainError(
          formatDomainErrorBanner(
            new WmsApiClientError(
              transition.errorCode ?? "INVALID_SCAN",
              transition.errorMessage ?? "Código escaneado inválido.",
              422,
            ),
          ),
        );
        return;
      }

      // 1º Escaneo completado: Ubicación STORAGE verificada -> pasamos a pedir Producto
      if (transition.nextStage === "AWAITING_PRODUCT") {
        setDualScan({
          stepId: nextStep.id,
          stage: "AWAITING_PRODUCT",
          verifiedLocationCode: transition.verifiedLocationCode,
          matchedProductCode: null,
        });
        setSuccessNote(
          `Ubicación ${transition.verifiedLocationCode} verificada ✓. Ahora escanea el código de barras o SKU del producto (${nextStep.productSku}).`,
        );
        return;
      }

      // 2º Escaneo completado: Producto verificado -> confirmamos extracción ante @wms/api
      const productCodeToSend =
        transition.matchedProductCode ??
        nextStep.productBarcode ??
        nextStep.productSku;

      setIsSubmitting(true);
      try {
        const res = await client.confirmTaskStep(task.id, nextStep.id, {
          scannedCode: productCodeToSend,
          quantity: parsedQty,
        });

        setSuccessNote(
          `Extraído de ${nextStep.locationCode} hacia PACKING: ${res.scannedQty}/${res.expectedQty} uds (${res.stepStatus}).`,
        );
        setShowExceptionForm(false);
        setExceptionNote("");
        setDualScan(createInitialDualScanState(""));
        await loadTask();
      } catch (err) {
        setDomainError(formatDomainErrorBanner(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [task, nextStep, dualScan, parsedQty, client, loadTask],
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
          : `Rotura de stock / ubicación vacía en ${nextStep.locationCode}`;

      const res = await client.confirmTaskStep(task.id, nextStep.id, {
        scannedCode: nextStep.locationCode,
        reportException: true,
        exceptionNote: note,
      });

      const feedback = formatPickingExceptionFeedback(res, nextStep);
      setExceptionFeedback(feedback);
      setShowExceptionForm(false);
      setExceptionNote("");
      setDualScan(createInitialDualScanState(""));
      await loadTask();
    } catch (err) {
      setDomainError(formatDomainErrorBanner(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [task, nextStep, exceptionNote, client, loadTask]);

  const handleDispatchOrder = useCallback(async () => {
    if (!task?.orderId) return;
    setDomainError(null);
    setSuccessNote(null);
    setIsSubmitting(true);

    try {
      const result = await client.dispatchOrder(task.orderId);
      setDispatchedOrderStatus(result.status);
      setSuccessNote(
        `Pedido #${result.orderId} empaquetado y despachado (${result.status}).`,
      );
    } catch (err) {
      setDomainError(formatDomainErrorBanner(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [task?.orderId, client]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>
            Cargando ruta de Picking #{taskId}...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isLocationVerified =
    nextStep !== null &&
    dualScan.stepId === nextStep.id &&
    dualScan.stage === "AWAITING_PRODUCT";

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cabecera de la tarea de Picking & Packing */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>PICKING · PACKING</Text>
            </View>
            <Text style={styles.statusText}>{task?.status ?? "UNKNOWN"}</Text>
          </View>
          <Text style={styles.taskTitle}>
            Picking #{task?.id ?? taskId}
            {task?.orderId ? ` · Pedido #${task.orderId}` : ""}
          </Text>
          {progress ? (
            <View style={styles.progressSection}>
              <View style={styles.progressLabelsRow}>
                <Text style={styles.progressLabel}>
                  Paradas: {progress.completedSteps}/{progress.totalSteps}
                </Text>
                <Text style={styles.progressLabel}>
                  Unidades recogidas: {progress.scannedUnits}/
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

        {/* Banner de resultado de Excepción / Re-asignación en tiempo real (F3.2) */}
        {exceptionFeedback ? (
          <View
            style={[
              styles.exceptionFeedbackBanner,
              exceptionFeedback.reallocated
                ? styles.reallocatedBanner
                : styles.onHoldBanner,
            ]}
            testID="picking-exception-feedback-banner"
          >
            <View style={styles.errorHeaderRow}>
              <Text style={styles.exceptionFeedbackTitle}>
                {exceptionFeedback.title}
              </Text>
              <Text style={styles.exceptionOrderStatusBadge}>
                Pedido: {exceptionFeedback.orderStatus}
              </Text>
            </View>
            <Text style={styles.exceptionFeedbackSummary}>
              {exceptionFeedback.summary}
            </Text>
            {exceptionFeedback.replacementLocations.length > 0 ? (
              <Text style={styles.replacementListText}>
                Nuevas ubicaciones asignadas:{" "}
                {exceptionFeedback.replacementLocations.join(" · ")}
              </Text>
            ) : null}
            <Text style={styles.exceptionFeedbackHint}>
              {exceptionFeedback.actionHint}
            </Text>
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
            testID="picking-error-banner"
          >
            <View style={styles.errorHeaderRow}>
              <Text style={styles.errorTitle}>{domainError.title}</Text>
              <Text style={styles.errorCodeBadge}>{domainError.code}</Text>
            </View>
            <Text style={styles.errorMessage}>{domainError.message}</Text>
            <Text style={styles.errorHint}>{domainError.actionHint}</Text>
          </View>
        ) : null}

        {/* Banner de confirmación / avance */}
        {successNote ? (
          <View style={styles.successBanner} testID="picking-success-banner">
            <Text style={styles.successBannerText}>{successNote}</Text>
          </View>
        ) : null}

        {/* Panel de Mesa de Packing y Despacho cuando no quedan pasos pendientes */}
        {!nextStep ? (
          <View
            style={[
              styles.packingStationCard,
              task?.status === "EXCEPTION"
                ? styles.packingExceptionCard
                : null,
            ]}
            testID="packing-station-panel"
          >
            <Text style={styles.packingTitle}>
              {task?.status === "EXCEPTION"
                ? "Tarea de Picking Detenida por Falta de Stock (ON_HOLD)"
                : "Mesa de Packing y Despacho Final"}
            </Text>
            <Text style={styles.packingSubtitle}>
              {task?.status === "EXCEPTION"
                ? "El pedido quedó en espera (ON_HOLD) tras reportarse rotura de stock sin ubicaciones STORAGE alternativas."
                : `Todas las unidades (${progress?.scannedUnits ?? 0} uds) fueron transferidas de STORAGE a la zona PACKING en el Ledger.`}
            </Text>

            {task?.status === "COMPLETED" && task.orderId ? (
              <View style={styles.dispatchActionsBox}>
                <Text style={styles.dispatchStatusLabel}>
                  Estado de Despacho:{" "}
                  <Text style={styles.dispatchStatusHighlight}>
                    {dispatchedOrderStatus ?? "PACKED (Listo para envío)"}
                  </Text>
                </Text>
                {dispatchedOrderStatus !== "SHIPPED" ? (
                  <Pressable
                    onPress={() => {
                      void handleDispatchOrder();
                    }}
                    disabled={isSubmitting}
                    style={styles.dispatchButton}
                    testID="picking-dispatch-order-btn"
                  >
                    <Text style={styles.dispatchButtonText}>
                      {isSubmitting
                        ? "Confirmando Despacho..."
                        : `Confirmar Cierre de Packing y Despachar Pedido #${task.orderId}`}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

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
            {/* Tarjeta de parada actual y estado de Doble Escaneo */}
            <View style={styles.destinationCard}>
              <Text style={styles.stepSequenceLabel}>
                PARADA ACTIVA #{nextStep.sequence} · RECORRIDO STORAGE → PACKING
              </Text>
              <Text style={styles.destinationInstruction}>
                1º Dirígete a la estantería STORAGE:
              </Text>
              <Text style={styles.destinationCode}>
                {nextStep.locationCode}
              </Text>

              {/* Indicador visual de Doble Validación de Escaneo */}
              <View style={styles.dualScanChecklist}>
                <View
                  style={[
                    styles.scanStepBadge,
                    isLocationVerified
                      ? styles.scanStepVerified
                      : styles.scanStepActive,
                  ]}
                  testID="dual-scan-location-badge"
                >
                  <Text style={styles.scanStepBadgeText}>
                    {isLocationVerified
                      ? `1. Ubicación Verificada ✓ (${dualScan.verifiedLocationCode})`
                      : `1. Pendiente Escanear Ubicación (${nextStep.locationCode})`}
                  </Text>
                </View>

                <View
                  style={[
                    styles.scanStepBadge,
                    isLocationVerified
                      ? styles.scanStepActive
                      : styles.scanStepWaiting,
                  ]}
                  testID="dual-scan-product-badge"
                >
                  <Text style={styles.scanStepBadgeText}>
                    2. Escanear Producto (
                    {nextStep.productBarcode ?? nextStep.productSku})
                  </Text>
                </View>
              </View>

              {isLocationVerified ? (
                <Pressable
                  onPress={handleResetLocationScan}
                  disabled={isSubmitting}
                  style={styles.resetLocationBtn}
                  testID="reset-location-scan-btn"
                >
                  <Text style={styles.resetLocationBtnText}>
                    Re-escanear Ubicación
                  </Text>
                </Pressable>
              ) : null}

              <View style={styles.productSummaryBox}>
                <Text style={styles.productNameText}>
                  {nextStep.productSku} — {nextStep.productName}
                </Text>
                <Text style={styles.productMetaText}>
                  EAN/Barcode: {nextStep.productBarcode ?? "Sin EAN"} · Recogido:{" "}
                  {nextStep.scannedQty}/{nextStep.expectedQty} uds
                </Text>
                <Text style={styles.remainingHighlight}>
                  Cantidad a extraer ahora: {getRemainingStepQty(nextStep)}{" "}
                  unidades
                </Text>
              </View>
            </View>

            {/* Control de cantidad (habilitado para confirmar en el paso 2 de producto) */}
            <View style={styles.qtyControlRow}>
              <Text style={styles.qtyControlLabel}>
                Cantidad a recoger de {nextStep.locationCode}:
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
                  testID="picking-qty-input"
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
                  <Text style={styles.qtyMaxBtnText}>Total Parada</Text>
                </Pressable>
              </View>
            </View>

            <BarcodeScannerBox
              onScan={(code) => {
                void handleDualScanInput(code);
              }}
              label={
                isLocationVerified
                  ? `Paso 2/2: Escanear Producto ${nextStep.productSku}`
                  : `Paso 1/2: Escanear Estantería ${nextStep.locationCode}`
              }
              placeholder={
                isLocationVerified
                  ? "Escanea el EAN/SKU del producto a extraer..."
                  : "Escanea el código QR de la ubicación STORAGE..."
              }
              expectedCodeHint={
                isLocationVerified
                  ? `${nextStep.productBarcode ?? nextStep.productSku}`
                  : `${nextStep.locationCode}`
              }
              disabled={isSubmitting}
            />

            {/* Reporte de excepción en tiempo real (F3.2: Ubicación vacía / Rotura de stock) */}
            <View style={styles.exceptionContainer}>
              <Pressable
                onPress={() => setShowExceptionForm((prev) => !prev)}
                style={styles.toggleExceptionButton}
              >
                <Text style={styles.toggleExceptionText}>
                  {showExceptionForm
                    ? "Cancelar Reporte de Incidencia"
                    : "Reportar Rotura de Stock / Ubicación Vacía"}
                </Text>
              </Pressable>

              {showExceptionForm ? (
                <View style={styles.exceptionForm}>
                  <TextInput
                    style={styles.exceptionInput}
                    value={exceptionNote}
                    onChangeText={setExceptionNote}
                    placeholder="Motivo (ej. Stock dañado o ubicación vacía en A-01-01)..."
                    placeholderTextColor="#64748B"
                    editable={!isSubmitting}
                    testID="picking-exception-input"
                  />
                  <Pressable
                    onPress={() => {
                      void handleReportException();
                    }}
                    disabled={isSubmitting}
                    style={styles.submitExceptionButton}
                    testID="picking-submit-exception-btn"
                  >
                    <Text style={styles.submitExceptionButtonText}>
                      Reportar Excepción y Solicitar Re-asignación
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Recorrido completo de Picking ordenado por locationCode ASC */}
        <View style={styles.stepsListSection}>
          <Text style={styles.sectionTitle}>
            Recorrido de Picking ({orderedSteps.length} paradas · orden{" "}
            locationCode ASC)
          </Text>
          {orderedSteps.map((step) => {
            const isCurrent = nextStep?.id === step.id;
            const isCompleted = step.status === "COMPLETED";
            const isException = step.status === "EXCEPTION";

            return (
              <View
                key={step.id}
                style={[
                  styles.stepRowCard,
                  isCurrent ? styles.stepRowCurrent : null,
                  isCompleted ? styles.stepRowCompleted : null,
                  isException ? styles.stepRowException : null,
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
                        : isException
                          ? styles.stepStatusException
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
  exceptionFeedbackBanner: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    gap: 4,
  },
  reallocatedBanner: {
    backgroundColor: "#0C4A6E",
    borderColor: "#38BDF8",
  },
  onHoldBanner: {
    backgroundColor: "#422006",
    borderColor: "#F59E0B",
  },
  exceptionFeedbackTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "800",
  },
  exceptionOrderStatusBadge: {
    color: "#7DD3FC",
    fontSize: 11,
    fontWeight: "800",
  },
  exceptionFeedbackSummary: {
    color: "#E2E8F0",
    fontSize: 13,
  },
  replacementListText: {
    color: "#34D399",
    fontSize: 12,
    fontWeight: "700",
  },
  exceptionFeedbackHint: {
    color: "#BAE6FD",
    fontSize: 12,
    fontWeight: "600",
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
  packingStationCard: {
    backgroundColor: "#064E3B",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#10B981",
    gap: 12,
  },
  packingExceptionCard: {
    backgroundColor: "#422006",
    borderColor: "#F59E0B",
  },
  packingTitle: {
    color: "#ECFDF5",
    fontSize: 16,
    fontWeight: "800",
  },
  packingSubtitle: {
    color: "#A7F3D0",
    fontSize: 13,
  },
  dispatchActionsBox: {
    backgroundColor: "#0F172A",
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  dispatchStatusLabel: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
  },
  dispatchStatusHighlight: {
    color: "#38BDF8",
    fontWeight: "800",
  },
  dispatchButton: {
    backgroundColor: "#38BDF8",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  dispatchButtonText: {
    color: "#082F49",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
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
    gap: 8,
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
  dualScanChecklist: {
    gap: 6,
    marginTop: 2,
  },
  scanStepBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
  },
  scanStepVerified: {
    backgroundColor: "#064E3B",
    borderColor: "#10B981",
  },
  scanStepActive: {
    backgroundColor: "#0C4A6E",
    borderColor: "#38BDF8",
  },
  scanStepWaiting: {
    backgroundColor: "#0F172A",
    borderColor: "#334155",
  },
  scanStepBadgeText: {
    color: "#F8FAFC",
    fontSize: 12,
    fontWeight: "700",
  },
  resetLocationBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#334155",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  resetLocationBtnText: {
    color: "#CBD5E1",
    fontSize: 11,
    fontWeight: "700",
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
  stepRowException: {
    borderColor: "#F59E0B",
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
  stepStatusException: {
    color: "#FBBF24",
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
