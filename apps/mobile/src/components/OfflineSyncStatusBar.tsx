// apps/mobile/src/components/OfflineSyncStatusBar.tsx
// Barra de estado e indicador visual permanente de telemetría y sincronización offline en @wms/mobile.
// Muestra el estado ONLINE / OFFLINE / SYNCING, contadores de cola y acceso directo a Cuarentena.
// Diseñado con Design System S5 dark-data-dense / P2 Refinada / T3: cero hex crudos.

import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useOfflineSync } from "../context/offline-sync.js";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_RADII,
  WMS_SPACING,
  monoText,
  tabularNums,
  type WmsTone,
} from "../theme/tokens.js";
import { WmsTag } from "./WmsUiPrimitives.js";
import { QuarantineModal } from "./QuarantineModal.js";

export interface OfflineSyncStatusBarProps {
  showSimulateToggle?: boolean;
}

export function OfflineSyncStatusBar({
  showSimulateToggle = false,
}: OfflineSyncStatusBarProps): JSX.Element {
  const { snapshot, syncNow, isOnline, setOnline } = useOfflineSync();
  const [modalVisible, setModalVisible] = useState(false);

  const { networkStatus, pendingCount, quarantinedCount } = snapshot;

  const tone: WmsTone =
    networkStatus === "ONLINE"
      ? "emerald"
      : networkStatus === "SYNCING"
        ? "blue"
        : "amber";

  const statusLabel =
    networkStatus === "ONLINE"
      ? "ONLINE"
      : networkStatus === "SYNCING"
        ? "SINCRONIZANDO…"
        : "OFFLINE";

  const statusSymbol =
    networkStatus === "ONLINE"
      ? "●"
      : networkStatus === "SYNCING"
        ? "↻"
        : "○";

  return (
    <>
      <View style={styles.container}>
        <View style={styles.statusGroup}>
          <Pressable
            style={styles.statusPill}
            onPress={() => {
              if (showSimulateToggle) {
                setOnline(!isOnline);
              }
            }}
          >
            {networkStatus === "SYNCING" ? (
              <View style={styles.spinnerWrap}>
                <ActivityIndicator
                  size="small"
                  color={WMS_COLORS.accent}
                />
              </View>
            ) : null}
            <WmsTag
              label={statusLabel}
              symbol={statusSymbol}
              tone={tone}
              mono
            />
          </Pressable>

          {pendingCount > 0 ? (
            <Pressable
              style={styles.pendingBadge}
              onPress={() => {
                if (isOnline) {
                  void syncNow();
                }
              }}
            >
              <Text style={[styles.pendingText, monoText, tabularNums]}>
                Cola: {pendingCount}
              </Text>
              {isOnline ? (
                <Text style={styles.syncIcon}>↻</Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>

        <View style={styles.actionsGroup}>
          {quarantinedCount > 0 ? (
            <Pressable
              style={styles.quarantinePill}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.quarantineWarningIcon}>⚠️</Text>
              <Text style={[styles.quarantineText, monoText, tabularNums]}>
                Cuarentena ({quarantinedCount})
              </Text>
            </Pressable>
          ) : null}

          {showSimulateToggle ? (
            <Pressable
              style={styles.toggleButton}
              onPress={() => setOnline(!isOnline)}
            >
              <Text style={[styles.toggleText, monoText]}>
                {isOnline ? "Simular Offline" : "Conectar"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <QuarantineModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: WMS_COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: WMS_COLORS.border,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 40,
  },
  statusGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
  },
  spinnerWrap: {
    marginRight: WMS_SPACING.xs,
  },
  pendingBadge: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderColor: WMS_COLORS.borderStrong,
    borderWidth: 1,
    borderRadius: WMS_RADII.sm,
    paddingHorizontal: WMS_SPACING.sm,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
  },
  pendingText: {
    fontSize: WMS_FONT_SIZES.xs,
    color: WMS_COLORS.accent,
    fontWeight: "600",
  },
  syncIcon: {
    fontSize: WMS_FONT_SIZES.xs,
    color: WMS_COLORS.accent,
    fontWeight: "700",
  },
  actionsGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  quarantinePill: {
    backgroundColor: WMS_COLORS.dangerTint,
    borderColor: WMS_COLORS.dangerBorder,
    borderWidth: 1,
    borderRadius: WMS_RADII.sm,
    paddingHorizontal: WMS_SPACING.sm,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
  },
  quarantineWarningIcon: {
    fontSize: WMS_FONT_SIZES.xs,
  },
  quarantineText: {
    fontSize: WMS_FONT_SIZES.xs,
    color: WMS_COLORS.danger,
    fontWeight: "700",
  },
  toggleButton: {
    paddingHorizontal: WMS_SPACING.xs,
    paddingVertical: 2,
    borderRadius: WMS_RADII.sm,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    backgroundColor: WMS_COLORS.surfaceCard,
  },
  toggleText: {
    fontSize: 10,
    color: WMS_COLORS.muted,
  },
});
