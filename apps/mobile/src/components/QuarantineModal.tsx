// apps/mobile/src/components/QuarantineModal.tsx
// Modal de inspección y resolución de mutaciones en Cuarentena (Server-Wins / CONFLICT / REJECTED).
// Diseñado bajo el Design System S5 dark-data-dense (cero hex crudos, tokens de theme).

import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useOfflineSync } from "../context/offline-sync.js";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_MIN_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  monoText,
} from "../theme/tokens.js";
import { WmsBanner, WmsTag } from "./WmsUiPrimitives.js";
import type { OfflineQueueItem } from "../offline/types.js";

export interface QuarantineModalProps {
  visible: boolean;
  onClose: () => void;
}

function formatPayloadSummary(item: OfflineQueueItem): string {
  if (item.action === "CONFIRM_STEP") {
    const p = item.payload as {
      taskId: string;
      stepId: string;
      scannedCode: string;
      quantity?: number;
    };
    return `Tarea: ${p.taskId.slice(0, 8)}… | Paso: ${p.stepId.slice(0, 8)}… | Código: ${p.scannedCode}${
      p.quantity !== undefined ? ` | Qty: ${p.quantity}` : ""
    }`;
  }
  const r = item.payload as {
    taskId: string;
    productId: string;
    scannedQty: number;
  };
  return `Recepción: ${r.taskId.slice(0, 8)}… | Prod: ${r.productId.slice(0, 8)}… | Qty: ${r.scannedQty}`;
}

export function QuarantineModal({
  visible,
  onClose,
}: QuarantineModalProps): JSX.Element | null {
  const { snapshot, retryQuarantined, discardQuarantined, clearQuarantined } =
    useOfflineSync();

  if (!visible) {
    return null;
  }

  const quarantinedItems = snapshot.items.filter(
    (item) => item.status === "QUARANTINED",
  );

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>Cuarentena de Sincronización</Text>
            <WmsTag
              label={`${quarantinedItems.length} CONFLICTOS`}
              tone="rose"
            />
          </View>
          <Text style={styles.headerSubtitle}>
            Mutaciones rechazadas por el servidor (política Server-Wins).
            Revise el motivo antes de reintentar o descartar.
          </Text>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          {quarantinedItems.length === 0 ? (
            <WmsBanner
              tone="emerald"
              title="Cola limpia"
              message="No hay operaciones en conflicto ni en cuarentena en este momento."
            />
          ) : (
            quarantinedItems.map((item) => (
              <View key={item.idempotencyKey} style={styles.card}>
                <View style={styles.cardHeader}>
                  <WmsTag
                    label={item.action}
                    tone="blue"
                  />
                  <Text style={[styles.timestampText, monoText]}>
                    {new Date(item.occurredAt).toLocaleTimeString()}
                  </Text>
                </View>

                <Text style={[styles.payloadSummary, monoText]}>
                  {formatPayloadSummary(item)}
                </Text>

                <View style={styles.reasonContainer}>
                  <Text style={styles.reasonCode}>
                    {item.quarantineReason?.code ?? "CONFLICT"}
                  </Text>
                  <Text style={styles.reasonMessage}>
                    {item.quarantineReason?.message ??
                      "Operación rechazada por conflicto en el servidor."}
                  </Text>
                </View>

                <View style={styles.actionsRow}>
                  <Pressable
                    style={[styles.actionButton, styles.retryButton]}
                    onPress={() => void retryQuarantined(item.idempotencyKey)}
                  >
                    <Text style={[styles.actionButtonText, styles.retryText]}>
                      Reintentar
                    </Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionButton, styles.discardButton]}
                    onPress={() => void discardQuarantined(item.idempotencyKey)}
                  >
                    <Text style={[styles.actionButtonText, styles.discardText]}>
                      Descartar
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.footer}>
          {quarantinedItems.length > 0 ? (
            <Pressable
              style={styles.clearAllButton}
              onPress={() => void clearQuarantined()}
            >
              <Text style={styles.clearAllText}>Descartar Todos</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Cerrar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: WMS_COLORS.bg,
    zIndex: 9999,
  },
  safeArea: {
    flex: 1,
    backgroundColor: WMS_COLORS.bg,
  },
  header: {
    padding: WMS_SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: WMS_COLORS.border,
    backgroundColor: WMS_COLORS.surface,
  },
  headerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: WMS_SPACING.xs,
  },
  headerTitle: {
    fontSize: WMS_FONT_SIZES.lg,
    fontWeight: "700",
    color: WMS_COLORS.text,
  },
  headerSubtitle: {
    fontSize: WMS_FONT_SIZES.sm,
    color: WMS_COLORS.muted,
    lineHeight: 18,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: WMS_SPACING.md,
    gap: WMS_SPACING.md,
  },
  card: {
    backgroundColor: WMS_COLORS.surface,
    borderColor: WMS_COLORS.border,
    borderWidth: 1,
    borderRadius: WMS_RADII.md,
    padding: WMS_SPACING.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: WMS_SPACING.sm,
  },
  timestampText: {
    fontSize: WMS_FONT_SIZES.xs,
    color: WMS_COLORS.muted,
  },
  payloadSummary: {
    fontSize: WMS_FONT_SIZES.xs,
    color: WMS_COLORS.muted,
    marginBottom: WMS_SPACING.sm,
  },
  reasonContainer: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderColor: WMS_COLORS.borderStrong,
    borderWidth: 1,
    borderRadius: WMS_RADII.sm,
    padding: WMS_SPACING.sm,
    marginBottom: WMS_SPACING.md,
  },
  reasonCode: {
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
    color: WMS_COLORS.danger,
    marginBottom: 2,
  },
  reasonMessage: {
    fontSize: WMS_FONT_SIZES.xs,
    color: WMS_COLORS.text,
  },
  actionsRow: {
    flexDirection: "row",
    gap: WMS_SPACING.sm,
  },
  actionButton: {
    flex: 1,
    height: WMS_MIN_TOUCH_TARGET,
    borderRadius: WMS_RADII.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  retryButton: {
    backgroundColor: WMS_COLORS.accentTint,
    borderColor: WMS_COLORS.accentBorder,
  },
  discardButton: {
    backgroundColor: WMS_COLORS.dangerTint,
    borderColor: WMS_COLORS.dangerBorder,
  },
  actionButtonText: {
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "700",
  },
  retryText: {
    color: WMS_COLORS.accent,
  },
  discardText: {
    color: WMS_COLORS.danger,
  },
  footer: {
    padding: WMS_SPACING.md,
    borderTopWidth: 1,
    borderTopColor: WMS_COLORS.border,
    backgroundColor: WMS_COLORS.surface,
    flexDirection: "row",
    gap: WMS_SPACING.sm,
  },
  clearAllButton: {
    flex: 1,
    height: WMS_MIN_TOUCH_TARGET,
    borderRadius: WMS_RADII.sm,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: WMS_COLORS.dangerBorder,
    backgroundColor: WMS_COLORS.dangerTint,
  },
  clearAllText: {
    color: WMS_COLORS.danger,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "700",
  },
  closeButton: {
    flex: 1,
    height: WMS_MIN_TOUCH_TARGET,
    borderRadius: WMS_RADII.sm,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: WMS_COLORS.surfaceCard,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
  },
  closeButtonText: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "700",
  },
});
