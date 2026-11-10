// apps/mobile/app/_layout.tsx
// Layout raíz de Expo Router con proveedor de sesión multi-tenant y tema oscuro industrial
// unificado bajo el Design System S5 dark-data-dense / P2 Refinada / T3.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/context/session";
import { WMS_COLORS } from "../src/theme/tokens";

export default function RootLayout(): JSX.Element {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: WMS_COLORS.surface },
          headerTintColor: WMS_COLORS.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: WMS_COLORS.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{
            title: "Terminal WMS — Conexión",
            presentation: "modal",
          }}
        />
        <Stack.Screen
          name="tasks/receiving/[taskId]"
          options={{
            title: "Recepción en muelle (Inbound)",
          }}
        />
        <Stack.Screen
          name="tasks/putaway/[taskId]"
          options={{
            title: "Putaway guiado a estantería",
          }}
        />
        <Stack.Screen
          name="tasks/picking/[taskId]"
          options={{
            title: "Picking guiado y packing",
          }}
        />
      </Stack>
    </SessionProvider>
  );
}
