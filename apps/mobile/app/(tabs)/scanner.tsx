// apps/mobile/app/(tabs)/scanner.tsx
// Pantalla de escáner rápido para:
// 1. Ejecutar la tarea activa seleccionada desde la bandeja (RECEIVING / PUTAWAY / PICKING)
// 2. Consultar saldos en vivo (ATP / onHand / allocated) escaneando código de ubicación o SKU/barcode

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
import type { InventoryBalanceDTO, WarehouseTaskDTO } from "@wms/shared-types";
import { BarcodeScannerBox } from "../../src/components/BarcodeScannerBox";
import { useSession } from "../../src/context/session";
import { WmsApiClientError } from "../../src/api/client";

export default function ScannerScreen(): JSX.Element {
  const params = useLocalSearchParams<{ taskId?: string }>();
  const { client } = useSession();

  const [activeTask, setActiveTask] = useState<WarehouseTaskDTO | null>(null);
  const [matchingBalances, setMatchingBalances] = useState<
    InventoryBalanceDTO[]
  >([]);
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

        // Modo consulta rápida de stock por código de ubicación o SKU
        const allBalances = await client.getInventoryBalances();
        const normalized = scannedCode.toUpperCase();
        const filtered = allBalances.filter(
          (b) =>
            b.locationCode.toUpperCase() === normalized ||
            b.productSku.toUpperCase() === normalized,
        );
        setMatchingBalances(filtered);
        setFeedbackBanner({
          type: "success",
          text:
            filtered.length > 0
              ? `Se encontraron ${filtered.length} registros de saldo para "${scannedCode}".`
              : `Sin stock activo para el código "${scannedCode}".`,
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
              <Text style={styles.activeTaskTitle}>
                Tarea Activa: {activeTask.type} (#{activeTask.id})
              </Text>
              <Pressable
                onPress={() => setActiveTask(null)}
                style={styles.clearTaskButton}
              >
                <Text style={styles.clearTaskButtonText}>Modo Consulta</Text>
              </Pressable>
            </View>
            {nextPendingStep ? (
              <View style={styles.stepPrompt}>
                <Text style={styles.stepPromptLocation}>
                  Dirigirse a ubicación: {nextPendingStep.locationCode}
                </Text>
                <Text style={styles.stepPromptProduct}>
                  Producto: {nextPendingStep.productSku} —{" "}
                  {nextPendingStep.productName}
                </Text>
                <Text style={styles.stepPromptQty}>
                  Progreso: {nextPendingStep.scannedQty} /{" "}
                  {nextPendingStep.expectedQty} unidades
                </Text>
              </View>
            ) : (
              <Text style={styles.taskCompletedBanner}>
                Tarea completada ({activeTask.status}).
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
              ? `Escanear ${nextPendingStep.productSku} o Ubicación ${nextPendingStep.locationCode}`
              : "Consulta Rápida de Ubicación (ej. A-01-01) o SKU"
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
            <ActivityIndicator size="small" color="#38BDF8" />
            <Text style={styles.loadingText}>Procesando lectura...</Text>
          </View>
        ) : null}

        {feedbackBanner ? (
          <View
            style={[
              styles.feedbackBox,
              feedbackBanner.type === "error"
                ? styles.feedbackError
                : styles.feedbackSuccess,
            ]}
          >
            <Text
              style={
                feedbackBanner.type === "error"
                  ? styles.feedbackErrorText
                  : styles.feedbackSuccessText
              }
            >
              {feedbackBanner.text}
            </Text>
          </View>
        ) : null}

        {!activeTask && lastScannedCode ? (
          <View style={styles.resultsSection}>
            <Text style={styles.sectionTitle}>
              Saldos en vivo para &quot;{lastScannedCode}&quot;
            </Text>
            {matchingBalances.map((b) => (
              <View
                key={`${b.locationId}-${b.productId}`}
                style={styles.balanceCard}
              >
                <View style={styles.balanceHeader}>
                  <Text style={styles.locationBadge}>{b.locationCode}</Text>
                  <Text style={styles.skuText}>{b.productSku}</Text>
                </View>
                <Text style={styles.productNameText}>{b.productName}</Text>
                <View style={styles.metricsRow}>
                  <Text style={styles.metricItem}>
                    Físico (OnHand): {b.onHandQty}
                  </Text>
                  <Text style={styles.metricItem}>
                    Reservado: {b.allocatedQty}
                  </Text>
                  <Text style={styles.metricAtp}>ATP: {b.atpQty}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
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
  },
  activeTaskCard: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#38BDF8",
    gap: 8,
  },
  activeTaskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  activeTaskTitle: {
    color: "#38BDF8",
    fontSize: 14,
    fontWeight: "800",
  },
  clearTaskButton: {
    backgroundColor: "#334155",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  clearTaskButtonText: {
    color: "#E2E8F0",
    fontSize: 11,
    fontWeight: "600",
  },
  stepPrompt: {
    gap: 3,
  },
  stepPromptLocation: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "800",
  },
  stepPromptProduct: {
    color: "#CBD5E1",
    fontSize: 13,
  },
  stepPromptQty: {
    color: "#34D399",
    fontSize: 13,
    fontWeight: "700",
  },
  taskCompletedBanner: {
    color: "#34D399",
    fontSize: 14,
    fontWeight: "700",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: "#94A3B8",
    fontSize: 13,
  },
  feedbackBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  feedbackError: {
    backgroundColor: "#450A0A",
    borderColor: "#EF4444",
  },
  feedbackSuccess: {
    backgroundColor: "#064E3B",
    borderColor: "#10B981",
  },
  feedbackErrorText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "700",
  },
  feedbackSuccessText: {
    color: "#6EE7B7",
    fontSize: 13,
    fontWeight: "700",
  },
  resultsSection: {
    gap: 10,
  },
  sectionTitle: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700",
  },
  balanceCard: {
    backgroundColor: "#1E293B",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 6,
  },
  balanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  locationBadge: {
    color: "#38BDF8",
    fontSize: 14,
    fontWeight: "800",
  },
  skuText: {
    color: "#E2E8F0",
    fontSize: 13,
    fontWeight: "700",
  },
  productNameText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 4,
  },
  metricItem: {
    color: "#CBD5E1",
    fontSize: 12,
  },
  metricAtp: {
    color: "#34D399",
    fontSize: 12,
    fontWeight: "800",
  },
});
