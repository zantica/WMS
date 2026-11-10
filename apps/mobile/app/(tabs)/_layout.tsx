// apps/mobile/app/(tabs)/_layout.tsx
// Navegación por pestañas inferiores para el operario de piso:
// 1. Bandeja de Tareas (RECEIVING / PUTAWAY / PICKING)
// 2. Escáner Rápido de Ubicación / Producto / Tarea
// Estilado con tokens compartidos S5 dark-data-dense (@wms/shared-types).

import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "../../src/context/session";
import { useOfflineSync } from "../../src/context/offline-sync";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_RADII,
  WMS_SPACING,
  monoText,
  tabularNums,
} from "../../src/theme/tokens";

export default function TabsLayout(): JSX.Element {
  const router = useRouter();
  const { session } = useSession();
  const { snapshot, syncNow } = useOfflineSync();

  const isOnline = snapshot.networkStatus === "ONLINE";
  const isSyncing = snapshot.networkStatus === "SYNCING";

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: WMS_COLORS.surface },
        headerTintColor: WMS_COLORS.text,
        headerTitleStyle: { fontWeight: "700" },
        tabBarStyle: {
          backgroundColor: WMS_COLORS.surface,
          borderTopColor: WMS_COLORS.border,
          height: 62,
          paddingBottom: WMS_SPACING.sm,
          paddingTop: 6,
        },
        tabBarActiveTintColor: WMS_COLORS.accent,
        tabBarInactiveTintColor: WMS_COLORS.muted,
        headerRight: () => (
          <View style={styles.headerRightContainer}>
            {snapshot.quarantinedCount > 0 ? (
              <View style={styles.quarantineTag}>
                <Text style={[styles.quarantineTagText, monoText, tabularNums]}>
                  ⚠️ {snapshot.quarantinedCount}
                </Text>
              </View>
            ) : null}

            {snapshot.pendingCount > 0 ? (
              <Pressable
                onPress={() => {
                  if (isOnline) void syncNow();
                }}
                style={styles.pendingTag}
              >
                <Text style={[styles.pendingTagText, monoText, tabularNums]}>
                  {snapshot.pendingCount} pend.
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              onPress={() => router.push("/login")}
              style={[
                styles.configButton,
                isSyncing
                  ? styles.configButtonSyncing
                  : isOnline && session.isConnected
                    ? styles.configButtonOnline
                    : styles.configButtonOffline,
              ]}
            >
              <Text
                style={[
                  styles.configButtonText,
                  monoText,
                  isSyncing
                    ? styles.configTextSyncing
                    : isOnline && session.isConnected
                      ? styles.configTextOnline
                      : styles.configTextOffline,
                ]}
              >
                {isSyncing
                  ? "↻ SYNC"
                  : isOnline && session.isConnected
                    ? "● ONLINE"
                    : "○ OFFLINE"}
              </Text>
            </Pressable>
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Cola operativa de piso",
          tabBarLabel: "Tareas",
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Terminal de escaneo y ATP",
          tabBarLabel: "Escáner",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerRightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: WMS_SPACING.xs,
    marginRight: WMS_SPACING.md,
  },
  quarantineTag: {
    backgroundColor: WMS_COLORS.dangerTint,
    borderColor: WMS_COLORS.dangerBorder,
    borderWidth: 1,
    borderRadius: WMS_RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  quarantineTagText: {
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
    color: WMS_COLORS.danger,
  },
  pendingTag: {
    backgroundColor: WMS_COLORS.accentTint,
    borderColor: WMS_COLORS.accentBorder,
    borderWidth: 1,
    borderRadius: WMS_RADII.sm,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  pendingTagText: {
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
    color: WMS_COLORS.accent,
  },
  configButton: {
    paddingHorizontal: WMS_SPACING.sm,
    paddingVertical: 6,
    borderRadius: WMS_RADII.sm,
    borderWidth: 1,
  },
  configButtonOnline: {
    backgroundColor: WMS_COLORS.successTint,
    borderColor: WMS_COLORS.successBorder,
  },
  configButtonOffline: {
    backgroundColor: WMS_COLORS.warningTint,
    borderColor: WMS_COLORS.warningBorder,
  },
  configButtonSyncing: {
    backgroundColor: WMS_COLORS.accentTint,
    borderColor: WMS_COLORS.accentBorder,
  },
  configButtonText: {
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
  configTextOnline: {
    color: WMS_COLORS.success,
  },
  configTextOffline: {
    color: WMS_COLORS.warning,
  },
  configTextSyncing: {
    color: WMS_COLORS.accent,
  },
});
