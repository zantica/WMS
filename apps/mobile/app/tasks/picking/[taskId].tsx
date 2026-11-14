// apps/mobile/app/tasks/picking/[taskId].tsx
// Pantalla guiada de Picking y Packing paso a paso (Estantería STORAGE -> Mesa PACKING -> Despacho SHIPPED).
// Guía al operario según el recorrido óptimo (locationCode ASC), exige doble validación de escaneo
// (1º Ubicación STORAGE -> 2º Producto Barcode/SKU), gestiona excepciones y re-asignaciones en vivo (F3.2),
// y habilita el cierre en Mesa de Packing con confirmación de despacho del pedido.
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
import type {
  OrderStatus,
  TaskStepDTO,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import { BarcodeScannerBox } from "../../../src/components/BarcodeScannerBox";
import { OfflineSyncStatusBar } from "../../../src/components/OfflineSyncStatusBar";
import {
  commonTaskStyles,
  TaskExceptionSection,
  TaskQuantityControl,
} from "../../../src/components/TaskScreenCommon";
import { handleOfflineTaskLoad } from "../../../src/offline/task-screen-offline";
import {
  WmsBanner,
  WmsProgressBar,
  WmsTag,
} from "../../../src/components/WmsUiPrimitives";
import { useSession } from "../../../src/context/session";
import { useOfflineSync } from "../../../src/context/offline-sync";
import { WmsApiClientError } from "../../../src/api/client";
import { triggerOperatorFeedback } from "../../../src/feedback/operator-feedback";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_HANDHELD_FONT_SIZES,
  WMS_HANDHELD_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  monoText,
  resolveStepStatusVisual,
  resolveTaskStatusVisual,
} from "../../../src/theme/tokens";
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
  const { client, session } = useSession();
  const { cache, isOnline } = useOfflineSync();

  const feedbackOptions = useMemo(
    () => ({
      soundEnabled: session.soundEnabled,
      hapticEnabled: session.hapticEnabled,
    }),
    [session.soundEnabled, session.hapticEnabled],
  );

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

    if (!isOnline) {
      const { task: cached, domainError: offErr } = handleOfflineTaskLoad(
        taskId,
        cache,
      );
      if (cached) {
        setTask(cached);
        const next = getNextPickingStep(cached.steps);
        if (next) {
          setQtyInput(String(Math.max(1, getRemainingStepQty(next))));
          setDualScan((prev) =>
            prev.stepId === next.id
              ? prev
              : createInitialDualScanState(next.id),
          );
        }
      } else {
        setDomainError(offErr);
      }
      setIsLoading(false);
      return;
    }

    try {
      let fetched = await client.getTask(taskId);
      // Si la tarea PICKING aún está en PENDING, la iniciamos automáticamente
      if (fetched.status === "PENDING") {
        await client.startTask(taskId);
        fetched = await client.getTask(taskId);
      }
      cache.upsertTask(fetched);
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
      const { task: cached } = handleOfflineTaskLoad(taskId, cache);
      if (cached) {
        setTask(cached);
        const next = getNextPickingStep(cached.steps);
        if (next) {
          setQtyInput(String(Math.max(1, getRemainingStepQty(next))));
          setDualScan((prev) =>
            prev.stepId === next.id
              ? prev
              : createInitialDualScanState(next.id),
          );
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
        triggerOperatorFeedback("error", feedbackOptions);
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
        triggerOperatorFeedback("success", feedbackOptions);
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

        triggerOperatorFeedback("success", feedbackOptions);
        setSuccessNote(
          `Extraído de ${nextStep.locationCode} hacia PACKING: ${res.scannedQty}/${res.expectedQty} uds (${res.stepStatus}).`,
        );
        setShowExceptionForm(false);
        setExceptionNote("");
        setDualScan(createInitialDualScanState(""));
        await loadTask();
      } catch (err) {
        triggerOperatorFeedback("error", feedbackOptions);
        setDomainError(formatDomainErrorBanner(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [task, nextStep, dualScan, parsedQty, client, loadTask, feedbackOptions],
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

      triggerOperatorFeedback("warning", feedbackOptions);
      const feedback = formatPickingExceptionFeedback(res, nextStep);
      setExceptionFeedback(feedback);
      setShowExceptionForm(false);
      setExceptionNote("");
      setDualScan(createInitialDualScanState(""));
      await loadTask();
    } catch (err) {
      triggerOperatorFeedback("error", feedbackOptions);
      setDomainError(formatDomainErrorBanner(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [task, nextStep, exceptionNote, client, loadTask, feedbackOptions]);

  const handleDispatchOrder = useCallback(async () => {
    if (!task?.orderId) return;
    setDomainError(null);
    setSuccessNote(null);
    setIsSubmitting(true);

    try {
      const result = await client.dispatchOrder(task.orderId);
      triggerOperatorFeedback("success", feedbackOptions);
      setDispatchedOrderStatus(result.status);
      setSuccessNote(
        `Pedido #${result.orderId} empaquetado y despachado (${result.status}).`,
      );
    } catch (err) {
      triggerOperatorFeedback("error", feedbackOptions);
      setDomainError(formatDomainErrorBanner(err));
    } finally {
      setIsSubmitting(false);
    }
  }, [task?.orderId, client, feedbackOptions]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={WMS_COLORS.accent} />
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
  const taskStatusVisual = task ? resolveTaskStatusVisual(task.status) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineSyncStatusBar />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Cabecera de la tarea de Picking & Packing */}
        <View style={styles.headerCard}>
          <View style={styles.headerTopRow}>
            <WmsTag label="OUTBOUND · PICKING & PACKING" symbol="◆" tone="amber" />
            {taskStatusVisual ? (
              <WmsTag
                label={taskStatusVisual.shortLabel}
                symbol={taskStatusVisual.symbol}
                tone={taskStatusVisual.tone}
              />
            ) : null}
          </View>
          <Text style={[styles.taskTitle, monoText]}>
            Picking #{task?.id ?? taskId}
            {task?.orderId ? ` · Pedido #${task.orderId}` : ""}
          </Text>
          {progress ? (
            <WmsProgressBar
              percent={progress.percent}
              leftLabel={`Paradas: ${progress.completedSteps}/${progress.totalSteps}`}
              rightLabel={`Unidades recogidas: ${progress.scannedUnits}/${progress.expectedUnits} (${progress.percent}%)`}
              tone={task?.status === "EXCEPTION" ? "rose" : "amber"}
            />
          ) : null}
        </View>

        {/* Banner de resultado de Excepción / Re-asignación en tiempo real (F3.2) */}
        {exceptionFeedback ? (
          <WmsBanner
            title={exceptionFeedback.title}
            codeBadge={`Pedido: ${exceptionFeedback.orderStatus}`}
            message={exceptionFeedback.summary}
            actionHint={exceptionFeedback.actionHint}
            tone={exceptionFeedback.reallocated ? "blue" : "amber"}
            testID="picking-exception-feedback-banner"
          >
            {exceptionFeedback.replacementLocations.length > 0 ? (
              <Text style={[styles.replacementListText, monoText]}>
                Nuevas ubicaciones asignadas:{" "}
                {exceptionFeedback.replacementLocations.join(" · ")}
              </Text>
            ) : null}
          </WmsBanner>
        ) : null}

        {/* Banner de error de dominio */}
        {domainError ? (
          <WmsBanner
            title={domainError.title}
            codeBadge={domainError.code}
            message={domainError.message}
            actionHint={domainError.actionHint}
            tone={domainError.severity === "warning" ? "amber" : "rose"}
            testID="picking-error-banner"
          />
        ) : null}

        {/* Banner de confirmación / avance */}
        {successNote ? (
          <WmsBanner
            title="✓ Movimiento registrado"
            message={successNote}
            tone="emerald"
            testID="picking-success-banner"
          />
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
            <WmsTag
              label={
                task?.status === "EXCEPTION"
                  ? "ON_HOLD · FALTA DE STOCK"
                  : "MESA DE PACKING Y DESPACHO"
              }
              symbol={task?.status === "EXCEPTION" ? "⚠" : "✓"}
              tone={task?.status === "EXCEPTION" ? "amber" : "emerald"}
            />
            <Text style={styles.packingTitle}>
              {task?.status === "EXCEPTION"
                ? "Tarea de Picking detenida por falta de stock (ON_HOLD)"
                : "Mesa de Packing y despacho final"}
            </Text>
            <Text style={styles.packingSubtitle}>
              {task?.status === "EXCEPTION"
                ? "El pedido quedó en espera (ON_HOLD) tras reportarse rotura de stock sin ubicaciones STORAGE alternativas."
                : `Todas las unidades (${progress?.scannedUnits ?? 0} uds) fueron transferidas de STORAGE a la zona PACKING en el Ledger.`}
            </Text>

            {task?.status === "COMPLETED" && task.orderId ? (
              <View style={styles.dispatchActionsBox}>
                <Text style={styles.dispatchStatusLabel}>
                  Estado de despacho:{" "}
                  <Text style={[styles.dispatchStatusHighlight, monoText]}>
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
                        ? "Confirmando despacho..."
                        : `Confirmar cierre de Packing y despachar pedido #${task.orderId} →`}
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
                Volver a la cola de tareas
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
              <Text style={[styles.destinationCode, monoText]}>
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
                  <Text style={[styles.scanStepBadgeText, monoText]}>
                    {isLocationVerified
                      ? `1. Ubicación verificada ✓ (${dualScan.verifiedLocationCode})`
                      : `1. Pendiente escanear ubicación (${nextStep.locationCode})`}
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
                  <Text style={[styles.scanStepBadgeText, monoText]}>
                    2. Escanear producto (
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
                    Re-escanear ubicación
                  </Text>
                </Pressable>
              ) : null}

              <View style={commonTaskStyles.productSummaryBox}>
                <Text style={commonTaskStyles.productNameText}>
                  <Text style={monoText}>{nextStep.productSku}</Text> —{" "}
                  {nextStep.productName}
                </Text>
                <Text style={[commonTaskStyles.productMetaText, monoText]}>
                  EAN/Barcode: {nextStep.productBarcode ?? "Sin EAN"} · Recogido:{" "}
                  {nextStep.scannedQty}/{nextStep.expectedQty} uds
                </Text>
                <Text style={[commonTaskStyles.remainingHighlight, monoText]}>
                  Cantidad a extraer ahora: {getRemainingStepQty(nextStep)}{" "}
                  unidades
                </Text>
              </View>
            </View>

            {/* Control de cantidad (habilitado para confirmar en el paso 2 de producto) */}
            <TaskQuantityControl
              label={`Cantidad a recoger de ${nextStep.locationCode}:`}
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
              handedness={session.handedness}
              inputTestID="picking-qty-input"
            />

            <BarcodeScannerBox
              onScan={(code) => {
                void handleDualScanInput(code);
              }}
              label={
                isLocationVerified
                  ? `Paso 2/2: Escanear producto ${nextStep.productSku}`
                  : `Paso 1/2: Escanear estantería ${nextStep.locationCode}`
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
              handedness={session.handedness}
            />

            {/* Reporte de excepción en tiempo real (F3.2: Ubicación vacía / Rotura de stock) */}
            <TaskExceptionSection
              isOpen={showExceptionForm}
              onToggle={() => setShowExceptionForm((prev) => !prev)}
              note={exceptionNote}
              onChangeNote={setExceptionNote}
              onSubmit={() => void handleReportException()}
              isSubmitting={isSubmitting}
              toggleLabelOpen="Cancelar reporte de incidencia"
              toggleLabelClosed="⚠ Reportar rotura de stock / ubicación vacía"
              placeholder="Motivo (ej. Stock dañado o ubicación vacía en A-01-01)..."
              submitLabel="Reportar excepción y solicitar re-asignación"
              inputTestID="picking-exception-input"
              submitTestID="picking-submit-exception-btn"
            />
          </View>
        )}

        {/* Recorrido completo de Picking ordenado por locationCode ASC */}
        <View style={commonTaskStyles.stepsListSection}>
          <Text style={commonTaskStyles.sectionTitle}>
            Recorrido de Picking ({orderedSteps.length} paradas · orden{" "}
            locationCode ASC)
          </Text>
          {orderedSteps.map((step) => {
            const isCurrent = nextStep?.id === step.id;
            const isCompleted = step.status === "COMPLETED";
            const isException = step.status === "EXCEPTION";
            const stepVisual = resolveStepStatusVisual(step.status);

            return (
              <View
                key={step.id}
                style={[
                  commonTaskStyles.stepRowCard,
                  isCurrent ? styles.stepRowCurrent : null,
                  isCompleted ? styles.stepRowCompleted : null,
                  isException ? styles.stepRowException : null,
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
  replacementListText: {
    color: WMS_COLORS.success,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
  packingStationCard: {
    backgroundColor: WMS_COLORS.successTint,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.lg,
    borderWidth: 1,
    borderColor: WMS_COLORS.successBorder,
    gap: WMS_SPACING.md,
  },
  packingExceptionCard: {
    backgroundColor: WMS_COLORS.warningTint,
    borderColor: WMS_COLORS.warningBorder,
  },
  packingTitle: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.base,
    fontWeight: "800",
  },
  packingSubtitle: {
    color: WMS_COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  dispatchActionsBox: {
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.md,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.sm,
  },
  dispatchStatusLabel: {
    color: WMS_COLORS.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  dispatchStatusHighlight: {
    color: WMS_COLORS.accent,
    fontWeight: "800",
  },
  dispatchButton: {
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.accent,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    paddingHorizontal: WMS_SPACING.md,
    alignItems: "center",
    justifyContent: "center",
  },
  dispatchButtonText: {
    color: WMS_COLORS.accentContrast,
    fontSize: WMS_HANDHELD_FONT_SIZES.body,
    fontWeight: "800",
    textAlign: "center",
  },
  backToQueueButton: {
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
  },
  backToQueueButtonText: {
    color: WMS_COLORS.text,
    fontSize: WMS_HANDHELD_FONT_SIZES.label,
    fontWeight: "700",
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
    gap: WMS_SPACING.sm,
  },
  stepSequenceLabel: {
    color: WMS_COLORS.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  destinationInstruction: {
    color: WMS_COLORS.muted,
    fontSize: WMS_HANDHELD_FONT_SIZES.label,
  },
  destinationCode: {
    color: WMS_COLORS.accent,
    fontSize: WMS_HANDHELD_FONT_SIZES.scanTarget,
    fontWeight: "900",
  },
  dualScanChecklist: {
    gap: 6,
    marginTop: 2,
  },
  scanStepBadge: {
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.sm,
    paddingVertical: WMS_SPACING.sm,
    borderWidth: 1,
  },
  scanStepVerified: {
    backgroundColor: WMS_COLORS.successTint,
    borderColor: WMS_COLORS.successBorder,
  },
  scanStepActive: {
    backgroundColor: WMS_COLORS.accentTint,
    borderColor: WMS_COLORS.accentBorder,
  },
  scanStepWaiting: {
    backgroundColor: WMS_COLORS.bg,
    borderColor: WMS_COLORS.border,
  },
  scanStepBadgeText: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
  resetLocationBtn: {
    alignSelf: "flex-start",
    backgroundColor: WMS_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    paddingHorizontal: WMS_SPACING.sm,
    paddingVertical: 6,
    borderRadius: WMS_RADII.sm,
  },
  resetLocationBtnText: {
    color: WMS_COLORS.text,
    fontSize: 11,
    fontWeight: "700",
  },
  stepRowCurrent: {
    borderColor: WMS_COLORS.accentBorder,
    backgroundColor: WMS_COLORS.surfaceHover,
  },
  stepRowCompleted: {
    opacity: 0.72,
    borderColor: WMS_COLORS.successBorder,
  },
  stepRowException: {
    borderColor: WMS_COLORS.warningBorder,
  },
});
