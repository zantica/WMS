// apps/mobile/app/login.tsx
// Pantalla de configuración de servidor API, API Key multi-tenant y diagnóstico de conexión (/health).

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
          <Text style={styles.title}>Configuración del Terminal</Text>
          <Text style={styles.subtitle}>
            Configura el endpoint de @wms/api y la credencial multi-tenant del
            operario.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>URL Base de API (@wms/api)</Text>
            <TextInput
              style={styles.input}
              value={apiBaseUrl}
              onChangeText={setApiBaseUrl}
              placeholder="http://localhost:3001"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Tenant API Key (x-api-key)</Text>
            <TextInput
              style={styles.input}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="demo-api-key-12345"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>ID de Almacén (Warehouse)</Text>
            <TextInput
              style={styles.input}
              value={warehouseId}
              onChangeText={setWarehouseId}
              placeholder="warehouse-demo"
              placeholderTextColor="#64748B"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Identificador de Operario</Text>
            <TextInput
              style={styles.input}
              value={operatorName}
              onChangeText={setOperatorName}
              placeholder="Operario Turno A"
              placeholderTextColor="#64748B"
            />
          </View>

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {statusMessage ? (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>{statusMessage}</Text>
            </View>
          ) : null}

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
              <ActivityIndicator size="small" color="#052E16" />
            ) : (
              <Text style={styles.primaryButtonText}>
                Verificar /health y Guardar
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
              Guardar sin verificar y continuar
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
    backgroundColor: "#0F172A",
  },
  container: {
    padding: 16,
  },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 14,
  },
  title: {
    color: "#F8FAFC",
    fontSize: 20,
    fontWeight: "800",
  },
  subtitle: {
    color: "#94A3B8",
    fontSize: 13,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#475569",
  },
  errorBanner: {
    backgroundColor: "#450A0A",
    borderColor: "#EF4444",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "600",
  },
  successBanner: {
    backgroundColor: "#064E3B",
    borderColor: "#10B981",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  successText: {
    color: "#6EE7B7",
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#052E16",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#475569",
  },
  secondaryButtonText: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600",
  },
});
