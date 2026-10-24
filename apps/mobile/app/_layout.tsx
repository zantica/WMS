// apps/mobile/app/_layout.tsx
// Layout raíz de Expo Router con proveedor de sesión multi-tenant y tema oscuro industrial.

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "../src/context/session";

export default function RootLayout(): JSX.Element {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0F172A" },
          headerTintColor: "#F8FAFC",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#0F172A" },
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
            title: "Recepción en Muelle (Inbound)",
          }}
        />
        <Stack.Screen
          name="tasks/putaway/[taskId]"
          options={{
            title: "Putaway Guiado a Estantería",
          }}
        />
      </Stack>
    </SessionProvider>
  );
}
