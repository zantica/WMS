// apps/mobile/app/login.tsx
// Pantalla de configuración de servidor API, API Key multi-tenant y diagnóstico de conexión (/health).
// Diseñada bajo el sistema S5 dark-data-dense / P2 Refinada / T3 (@wms/shared-types): cero hex crudos.

import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSession } from "../src/context/session";
import { WmsApiClientError } from "../src/api/client";
import { WmsBanner, WmsTag } from "../src/components/WmsUiPrimitives";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_MIN_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  monoText,
} from "../src/theme/tokens";

export default function LoginScreen(): JSX.Element {
  const router = useRouter();
  const { session, updateSession, testConnection } = useSession();

  const [apiBaseUrl, setApiBaseUrl] = useState<string>(session.apiBaseUrl);
  const [apiKey, setApiKey] = useState<string>(session.apiKey);
  const [warehouseId, setWarehouseId] = useState<string>(session.warehouseId);
  const [operatorName, setOperatorName] = useState<string>(
    session.operatorName,
  );
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSaveAndTest = useCallback(async () => {
    setIsTesting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    updateSession({
      apiBaseUrl: apiBaseUrl.trim(),
      apiKey: apiKey.trim(),
      warehouseId: warehouseId.trim(),
      operatorName: operatorName.trim(),
    });

    try {
      const health = await testConnection({
        apiBaseUrl: apiBaseUrl.trim(),
        apiKey: apiKey.trim(),
      });
      setStatusMessage(
        `Conectado a ${health.service} (${health.status.toUpperCase()}) — ${health.timestamp}`,
      );
      router.replace("/(tabs)");
    } catch (err) {
      if (err instanceof WmsApiClientError) {
        setErrorMessage(`[${err.code}] ${err.message}`);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage("No se pudo conectar con el servidor WMS API.");
      }
    } finally {
      setIsTesting(false);
    }
  }, [
    apiBaseUrl,
    apiKey,
    warehouseId,
    operatorName,
    updateSession,
    testConnection,
    router,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <WmsTag label="TERMINAL HANDHELD" symbol="◆" tone="blue" />
            <WmsTag
              label={session.isConnected ? "ONLINE" : "PENDIENTE SYNC"}
              symbol={session.isConnected ? "●" : "○"}
              tone={session.isConnected ? "emerald" : "amber"}
            />
          </View>

          <Text style={styles.title}>Configuración del terminal móvil</Text>
          <Text style={styles.subtitle}>
            Enlaza el lector con el endpoint de @wms/api y define la credencial
            multi-tenant (x-api-key) del operario en turno.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>URL base de API (@wms/api)</Text>
            <TextInput
              style={[styles.input, monoText]}
              value={apiBaseUrl}
              onChangeText={setApiBaseUrl}
              placeholder="http://localhost:3001"
              placeholderTextColor={WMS_COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Tenant API Key (x-api-key)</Text>
            <TextInput
              style={[styles.input, monoText]}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="demo-api-key-12345"
              placeholderTextColor={WMS_COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>ID de almacén (Warehouse)</Text>
            <TextInput
              style={[styles.input, monoText]}
              value={warehouseId}
              onChangeText={setWarehouseId}
              placeholder="warehouse-demo"
              placeholderTextColor={WMS_COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Identificador de operario</Text>
            <TextInput
              style={styles.input}
              value={operatorName}
              onChangeText={setOperatorName}
              placeholder="Operario Turno A"
              placeholderTextColor={WMS_COLORS.muted}
            />
          </View>

          {errorMessage ? (
            <WmsBanner
              title="⚠ Fallo de verificación de enlace"
              message={errorMessage}
              actionHint="Verifica que el servidor Fastify esté activo y que la red Wi-Fi del almacén alcance el host."
              tone="rose"
            />
          ) : null}

          {statusMessage ? (
            <WmsBanner
              title="✓ Enlace verificado"
              message={statusMessage}
              tone="emerald"
            />
          ) : null}

          {/* Único CTA primario en la vista */}
          <Pressable
            onPress={() => {
              void handleSaveAndTest();
            }}
            disabled={isTesting}
            style={[
              styles.primaryButton,
              isTesting ? styles.buttonDisabled : null,
            ]}
          >
            {isTesting ? (
              <ActivityIndicator size="small" color={WMS_COLORS.accentContrast} />
            ) : (
              <Text style={styles.primaryButtonText}>
                Verificar /health y guardar sesión
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              updateSession({
                apiBaseUrl: apiBaseUrl.trim(),
                apiKey: apiKey.trim(),
                warehouseId: warehouseId.trim(),
                operatorName: operatorName.trim(),
              });
              router.replace("/(tabs)");
            }}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              Guardar parámetros sin verificar
            </Text>
          </Pressable>
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
  },
  card: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.lg,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.md,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  title: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.xl,
    fontWeight: "800",
  },
  subtitle: {
    color: WMS_COLORS.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "600",
  },
  input: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surface,
    color: WMS_COLORS.text,
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    fontSize: WMS_FONT_SIZES.sm,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
  },
  primaryButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.accent,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.md,
    alignItems: "center",
    justifyContent: "center",
    marginTop: WMS_SPACING.xs,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: WMS_COLORS.accentContrast,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: WMS_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
  },
  secondaryButtonText: {
    color: WMS_COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
});
