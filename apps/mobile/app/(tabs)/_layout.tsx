// apps/mobile/app/(tabs)/_layout.tsx
// Navegación por pestañas inferiores para el operario de piso:
// 1. Bandeja de Tareas (RECEIVING / PUTAWAY / PICKING)
// 2. Escáner Rápido de Ubicación / Producto / Tarea
// Estilado con tokens compartidos S5 dark-data-dense (@wms/shared-types).

import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useSession } from "../../src/context/session";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_RADII,
  WMS_SPACING,
  monoText,
} from "../../src/theme/tokens";

export default function TabsLayout(): JSX.Element {
  const router = useRouter();
  const { session } = useSession();

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
          <Pressable
            onPress={() => router.push("/login")}
            style={[
              styles.configButton,
              session.isConnected
                ? styles.configButtonOnline
                : styles.configButtonOffline,
            ]}
          >
            <Text
              style={[
                styles.configButtonText,
                monoText,
                session.isConnected
                  ? styles.configTextOnline
                  : styles.configTextOffline,
              ]}
            >
              {session.isConnected ? "● ONLINE" : "○ CONEXIÓN"}
            </Text>
          </Pressable>
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
  configButton: {
    marginRight: WMS_SPACING.md,
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
    color: WMS_COLORS.accent,
  },
});
