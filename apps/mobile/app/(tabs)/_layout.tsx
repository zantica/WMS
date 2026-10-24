// apps/mobile/app/(tabs)/_layout.tsx
// Navegación por pestañas inferiores para el operario de piso:
// 1. Bandeja de Tareas (RECEIVING / PUTAWAY / PICKING)
// 2. Escáner Rápido de Ubicación / Producto / Tarea

import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text } from "react-native";
import { useSession } from "../../src/context/session";

export default function TabsLayout(): JSX.Element {
  const router = useRouter();
  const { session } = useSession();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0F172A" },
        headerTintColor: "#F8FAFC",
        headerTitleStyle: { fontWeight: "800" },
        tabBarStyle: {
          backgroundColor: "#0F172A",
          borderTopColor: "#1E293B",
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: "#38BDF8",
        tabBarInactiveTintColor: "#64748B",
        headerRight: () => (
          <Pressable
            onPress={() => router.push("/login")}
            style={styles.configButton}
          >
            <Text style={styles.configButtonText}>
              {session.isConnected ? "● Online" : "○ Config"}
            </Text>
          </Pressable>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Tareas Operativas",
          tabBarLabel: "Tareas",
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Escáner Rápido",
          tabBarLabel: "Escáner",
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  configButton: {
    marginRight: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  configButtonText: {
    color: "#38BDF8",
    fontSize: 12,
    fontWeight: "700",
  },
});
