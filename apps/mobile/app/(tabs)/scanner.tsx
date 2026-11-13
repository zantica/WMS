// apps/mobile/app/(tabs)/scanner.tsx
// Pantalla de escáner rápido para:
// 1. Ejecutar la tarea activa seleccionada desde la bandeja (RECEIVING / PUTAWAY / PICKING)
// 2. Consultar saldos en vivo (ATP / onHand / allocated) escaneando código de ubicación o SKU/barcode
// Rediseñada con el HUD contable S5 dark-data-dense (@wms/shared-types): cero hex crudos.

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import type {
  InventoryBalanceDTO,
  ProductDTO,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import { BarcodeScannerBox } from "../../src/components/BarcodeScannerBox";
import {
  WmsBanner,
  WmsEmptyState,
  WmsTag,
} from "../../src/components/WmsUiPrimitives";
import { useSession } from "../../src/context/session";
import { WmsApiClientError } from "../../src/api/client";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_MIN_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  monoText,
  resolveTaskStatusVisual,
  resolveTaskTypeVisual,
} from "../../src/theme/tokens";

export default function ScannerScreen(): JSX.Element {
  const params = useLocalSearchParams<{ taskId?: string }>();
  const { client } = useSession();

  const [activeTask, setActiveTask] = useState<WarehouseTaskDTO | null>(null);
  const [matchingBalances, setMatchingBalances] = useState<
    InventoryBalanceDTO[]
  >([]);
  const [matchingProducts, setMatchingProducts] = useState<ProductDTO[]>([]);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadActiveTask = useCallback(
    async (taskId: string) => {
      setIsBusy(true);
      try {
        const task = await client.getTask(taskId);
        setActiveTask(task);
      } catch (err) {
        const message =
          err instanceof WmsApiClientError
            ? `[${err.code}] ${err.message}`
            : "No se pudo cargar la tarea seleccionada.";
        setFeedbackBanner({ type: "error", text: message });
      } finally {
        setIsBusy(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (params.taskId && typeof params.taskId === "string") {
      void loadActiveTask(params.taskId);
    }
  }, [params.taskId, loadActiveTask]);

  const nextPendingStep = activeTask?.steps.find((s) => s.status === "PENDING");

  const handleScan = useCallback(
    async (scannedCode: string) => {
      setLastScannedCode(scannedCode);
      setFeedbackBanner(null);
      setIsBusy(true);

      try {
        // Si hay una tarea activa con un paso pendiente, confirmamos el escaneo contra la API
        if (activeTask && nextPendingStep) {
          if (activeTask.type === "RECEIVING") {
            const res = await client.confirmReceiptLine(activeTask.id, {
              productId: nextPendingStep.productId,
              scannedQty: 1,
              barcode: scannedCode,
            });
            setFeedbackBanner({
              type: "success",
              text: `Recepción confirmada (${res.scannedQty}/${res.expectedQty}).${
                res.putawayTaskId
                  ? ` Putaway generado: #${res.putawayTaskId}`
                  : ""
              }`,
            });
          } else {
            const res = await client.confirmTaskStep(
              activeTask.id,
              nextPendingStep.id,
              {
                scannedCode,
                quantity: 1,
              },
            );
            setFeedbackBanner({
              type: "success",
              text: `Paso confirmado (${res.scannedQty}/${res.expectedQty}) — Estado: ${res.stepStatus}`,
            });
          }
          await loadActiveTask(activeTask.id);
          return;
        }

        // Modo consulta rápida de stock por código de ubicación o SKU + Ficha de producto
        const [allBalances, foundProducts] = await Promise.all([
          client.getInventoryBalances(),
          client.searchProducts({ q: scannedCode, includeInactive: true }),
        ]);

        const normalized = scannedCode.toUpperCase();
        const filteredBalances = allBalances.filter(
          (b) =>
            b.locationCode.toUpperCase() === normalized ||
            b.productSku.toUpperCase() === normalized,
        );

        setMatchingBalances(filteredBalances);
        setMatchingProducts(foundProducts);

        const totalResults = foundProducts.length + filteredBalances.length;
        setFeedbackBanner({
          type: "success",
          text:
            totalResults > 0
              ? `Encontrado: ${foundProducts.length} producto(s) en catálogo y ${filteredBalances.length} saldo(s) en vivo.`
              : `Sin resultados para el código "${scannedCode}".`,
        });
      } catch (err) {
        if (err instanceof WmsApiClientError) {
          setFeedbackBanner({
            type: "error",
            text: `[${err.code}] ${err.message}`,
          });
        } else if (err instanceof Error) {
          setFeedbackBanner({ type: "error", text: err.message });
        } else {
          setFeedbackBanner({
            type: "error",
            text: "Error al procesar el código escaneado.",
          });
        }
      } finally {
        setIsBusy(false);
      }
    },
    [activeTask, nextPendingStep, client, loadActiveTask],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {activeTask ? (
          <View style={styles.activeTaskCard}>
            <View style={styles.activeTaskHeader}>
              <View style={styles.activeTaskBadges}>
                <WmsTag
                  label={resolveTaskTypeVisual(activeTask.type).code}
                  symbol={resolveTaskTypeVisual(activeTask.type).symbol}
                  tone={resolveTaskTypeVisual(activeTask.type).tone}
                />
                <WmsTag
                  label={`#${activeTask.id}`}
                  tone={resolveTaskStatusVisual(activeTask.status).tone}
                />
              </View>
              <Pressable
                onPress={() => setActiveTask(null)}
                style={styles.clearTaskButton}
              >
                <Text style={styles.clearTaskButtonText}>Modo consulta</Text>
              </Pressable>
            </View>
            {nextPendingStep ? (
              <View style={styles.stepPrompt}>
                <Text style={[styles.stepPromptLocation, monoText]}>
                  Dirigirse a ubicación: {nextPendingStep.locationCode}
                </Text>
                <Text style={styles.stepPromptProduct}>
                  Producto:{" "}
                  <Text style={monoText}>{nextPendingStep.productSku}</Text> —{" "}
                  {nextPendingStep.productName}
                </Text>
                <Text style={[styles.stepPromptQty, monoText]}>
                  Progreso: {nextPendingStep.scannedQty} /{" "}
                  {nextPendingStep.expectedQty} unidades
                </Text>
              </View>
            ) : (
              <Text style={styles.taskCompletedBanner}>
                ✓ Tarea completada ({activeTask.status}).
              </Text>
            )}
          </View>
        ) : null}

        <BarcodeScannerBox
          onScan={(code) => {
            void handleScan(code);
          }}
          label={
            nextPendingStep
              ? `Escanear ${nextPendingStep.productSku} o ubicación ${nextPendingStep.locationCode}`
              : "Consulta rápida de ubicación (ej. A-01-01) o SKU"
          }
          expectedCodeHint={
            nextPendingStep
              ? (nextPendingStep.productBarcode ?? nextPendingStep.productSku)
              : null
          }
          disabled={isBusy}
        />

        {isBusy ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={WMS_COLORS.accent} />
            <Text style={styles.loadingText}>Procesando lectura...</Text>
          </View>
        ) : null}

        {feedbackBanner ? (
          <WmsBanner
            title={
              feedbackBanner.type === "error"
                ? "⚠ Lectura rechazada"
                : "✓ Lectura procesada"
            }
            message={feedbackBanner.text}
            tone={feedbackBanner.type === "error" ? "rose" : "emerald"}
          />
        ) : null}

        {!activeTask && lastScannedCode ? (
          <View style={styles.resultsSection}>
            {/* 1. Ficha del Maestro de Producto WMS (F9.1) */}
            {matchingProducts.length > 0 ? (
              <View style={styles.subResultsSection}>
                <Text style={styles.sectionTitle}>
                  Maestro de Producto ({matchingProducts.length})
                </Text>
                {matchingProducts.map((p) => (
                  <View key={p.id} style={styles.productCard}>
                    <View style={styles.balanceHeader}>
                      <Text style={[styles.skuText, monoText]}>
                        {p.sku}
                      </Text>
                      <WmsTag
                        label={p.isActive ? "ACTIVO" : "INACTIVO"}
                        tone={p.isActive ? "emerald" : "slate"}
                      />
                    </View>
                    <Text style={styles.productTitleText}>{p.name}</Text>
                    <View style={styles.productMetaRow}>
                      <WmsTag
                        label={p.categoryCode ?? "SIN CATEGORÍA"}
                        symbol="🏷"
                        tone="blue"
                      />
                      {p.barcode ? (
                        <Text style={[styles.metaMuted, monoText]}>
                          EAN: {p.barcode}
                        </Text>
                      ) : null}
                      {p.weightGrams ? (
                        <Text style={[styles.metaMuted, monoText]}>
                          {p.weightGrams} g
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {/* 2. Saldos Contables en Vivo */}
            <View style={styles.subResultsSection}>
              <Text style={styles.sectionTitle}>
                Saldos contables en vivo para &quot;{lastScannedCode}&quot;
              </Text>
              {matchingBalances.length === 0 ? (
                <WmsEmptyState
                  title="Sin stock registrado para el código"
                  subtitle="Escanea otra ubicación (ej. A-01-01) o verifica el SKU en el catálogo."
                />
              ) : (
                matchingBalances.map((b) => (
                  <View
                    key={`${b.locationId}-${b.productId}`}
                    style={styles.balanceCard}
                  >
                    <View style={styles.balanceHeader}>
                      <WmsTag label={b.locationCode} symbol="◆" tone="blue" />
                      <Text style={[styles.skuText, monoText]}>
                        {b.productSku}
                      </Text>
                    </View>
                    <Text style={styles.productNameText}>{b.productName}</Text>
                    <View style={styles.metricsRow}>
                      <View style={styles.metricBlock}>
                        <Text style={styles.metricLabel}>ON HAND</Text>
                        <Text style={[styles.metricValue, monoText]}>
                          {b.onHandQty} uds
                        </Text>
                      </View>
                      <View style={styles.metricBlock}>
                        <Text style={styles.metricLabel}>ALLOCATED</Text>
                        <Text style={[styles.metricWarning, monoText]}>
                          {b.allocatedQty} uds
                        </Text>
                      </View>
                      <View style={styles.metricBlock}>
                        <Text style={styles.metricLabel}>ATP (PROMETIBLE)</Text>
                        <Text style={[styles.metricAtp, monoText]}>
                          {b.atpQty} uds
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        ) : null}
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
  },
  activeTaskCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.accentBorder,
    gap: WMS_SPACING.sm,
  },
  activeTaskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: WMS_SPACING.sm,
  },
  activeTaskBadges: {
    flexDirection: "row",
    gap: WMS_SPACING.xs,
    flexWrap: "wrap",
  },
  clearTaskButton: {
    minHeight: 36,
    backgroundColor: WMS_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    paddingHorizontal: WMS_SPACING.sm,
    paddingVertical: 6,
    borderRadius: WMS_RADII.sm,
    justifyContent: "center",
  },
  clearTaskButtonText: {
    color: WMS_COLORS.text,
    fontSize: 11,
    fontWeight: "700",
  },
  stepPrompt: {
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.md,
    padding: WMS_SPACING.sm,
    borderLeftWidth: 3,
    borderLeftColor: WMS_COLORS.accent,
    gap: 3,
  },
  stepPromptLocation: {
    color: WMS_COLORS.accent,
    fontSize: WMS_FONT_SIZES.base,
    fontWeight: "800",
  },
  stepPromptProduct: {
    color: WMS_COLORS.text,
    fontSize: 13,
  },
  stepPromptQty: {
    color: WMS_COLORS.success,
    fontSize: 13,
    fontWeight: "700",
  },
  taskCompletedBanner: {
    color: WMS_COLORS.success,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  loadingText: {
    color: WMS_COLORS.muted,
    fontSize: 13,
  },
  resultsSection: {
    gap: WMS_SPACING.md,
  },
  subResultsSection: {
    gap: WMS_SPACING.sm,
  },
  sectionTitle: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.base,
    fontWeight: "700",
  },
  productCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.xs,
  },
  productTitleText: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "600",
  },
  productMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: WMS_SPACING.sm,
    flexWrap: "wrap",
    marginTop: 2,
  },
  metaMuted: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
  },
  balanceCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.xs,
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skuText: {
    color: WMS_COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  productNameText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.md,
    padding: WMS_SPACING.sm,
    marginTop: WMS_SPACING.xs,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
  },
  metricBlock: {
    gap: 2,
  },
  metricLabel: {
    color: WMS_COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  metricValue: {
    color: WMS_COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  metricWarning: {
    color: WMS_COLORS.warning,
    fontSize: 13,
    fontWeight: "700",
  },
  metricAtp: {
    color: WMS_COLORS.success,
    fontSize: 13,
    fontWeight: "800",
  },
});
