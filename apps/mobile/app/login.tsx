// apps/mobile/app/login.tsx
// Acceso rápido de operario (PIN 4 dígitos o escaneo de credencial) + preferencias ergonómicas
// (modo zurdo/diestro, sonido y vibración) y configuración técnica de terminal colapsable para IT.

import { useState } from "react";
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
import { triggerOperatorFeedback } from "../src/feedback/operator-feedback";
import { WmsBanner, WmsTag } from "../src/components/WmsUiPrimitives";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_HANDHELD_FONT_SIZES,
  WMS_HANDHELD_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  WmsHandedness,
  monoText,
} from "../src/theme/tokens";

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];

export default function LoginScreen(): JSX.Element {
  const router = useRouter();
  const { session, updateSession, testConnection } = useSession();

  const [pin, setPin] = useState<string>("");
  const [badgeCode, setBadgeCode] = useState<string>("");
  const [handedness, setHandedness] = useState<WmsHandedness>(
    session.handedness,
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    session.soundEnabled,
  );
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(
    session.hapticEnabled,
  );

  const [showTechConfig, setShowTechConfig] = useState<boolean>(false);
  const [apiBaseUrl, setApiBaseUrl] = useState<string>(session.apiBaseUrl);
  const [apiKey, setApiKey] = useState<string>(session.apiKey);
  const [warehouseId, setWarehouseId] = useState<string>(session.warehouseId);
  const [operatorName, setOperatorName] = useState<string>(
    session.operatorName,
  );

  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const feedbackOptions = { soundEnabled, hapticEnabled };

  const handlePinKeyPress = (key: string) => {
    setErrorMessage(null);
    if (key === "C") {
      setPin("");
      return;
    }
    if (key === "⌫") {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    setPin((prev) => (prev.length < 4 ? `${prev}${key}` : prev));
  };

  const handleQuickOperatorLogin = () => {
    setErrorMessage(null);
    const trimmedBadge = badgeCode.trim();
    if (trimmedBadge.length === 0 && pin.length < 4) {
      triggerOperatorFeedback("error", feedbackOptions);
      setErrorMessage(
        "Introduce tu PIN de 4 dígitos o escanea tu credencial de operario.",
      );
      return;
    }

    const resolvedOperator =
      trimmedBadge.length > 0
        ? trimmedBadge
        : operatorName.trim() || `Operario PIN-${pin}`;

    triggerOperatorFeedback("success", feedbackOptions);
    updateSession({
      apiBaseUrl: apiBaseUrl.trim(),
      apiKey: apiKey.trim(),
      warehouseId: warehouseId.trim(),
      operatorName: resolvedOperator,
      handedness,
      soundEnabled,
      hapticEnabled,
    });
    router.replace("/(tabs)");
  };

  const handleSaveAndTest = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsTesting(true);

    updateSession({
      apiBaseUrl: apiBaseUrl.trim(),
      apiKey: apiKey.trim(),
      warehouseId: warehouseId.trim(),
      operatorName: operatorName.trim(),
      handedness,
      soundEnabled,
      hapticEnabled,
    });

    try {
      await testConnection();
      triggerOperatorFeedback("success", feedbackOptions);
      setStatusMessage("Conexión verificada correctamente con @wms/api.");
      router.replace("/(tabs)");
    } catch (err) {
      triggerOperatorFeedback("error", feedbackOptions);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "No se pudo verificar la conexión con @wms/api.",
      );
    } finally {
      setIsTesting(false);
    }
  };

  const handleToggleHandedness = (next: WmsHandedness) => {
    setHandedness(next);
    updateSession({ handedness: next });
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    updateSession({ soundEnabled: next });
  };

  const handleToggleHaptic = () => {
    const next = !hapticEnabled;
    setHapticEnabled(next);
    updateSession({ hapticEnabled: next });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>WMS Handheld · Turno</Text>
            <WmsTag label={warehouseId || "ALMACÉN"} symbol="◆" tone="blue" mono />
          </View>
          <Text style={styles.subtitle}>
            Escanea tu credencial o marca tu PIN de 4 dígitos para comenzar a
            operar.
          </Text>

          {/* Escaneo rápido de credencial / NFC */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Credencial / Gafete (escaneo rápido)</Text>
            <TextInput
              style={[styles.input, monoText]}
              value={badgeCode}
              onChangeText={setBadgeCode}
              placeholder="Escanea código de credencial (opcional si usas PIN)..."
              placeholderTextColor={WMS_COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleQuickOperatorLogin}
              testID="login-badge-input"
            />
          </View>

          {/* PIN numérico de 4 dígitos */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>PIN de operario (4 dígitos)</Text>
            <View style={styles.pinDisplayRow}>
              {[0, 1, 2, 3].map((idx) => {
                const filled = idx < pin.length;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.pinDotBox,
                      filled ? styles.pinDotBoxFilled : null,
                    ]}
                  >
                    <Text style={[styles.pinDotText, monoText]}>
                      {filled ? "●" : "○"}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.pinPadGrid}>
              {PIN_KEYS.map((key) => (
                <Pressable
                  key={key}
                  onPress={() => handlePinKeyPress(key)}
                  style={styles.pinKeyButton}
                  testID={`pin-key-${key}`}
                >
                  <Text style={[styles.pinKeyText, monoText]}>{key}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Preferencias ergonómicas de operario */}
          <View style={styles.ergonomicBox}>
            <Text style={styles.ergonomicTitle}>ERGONOMÍA DEL TERMINAL</Text>
            <View style={styles.toggleRow}>
              <Pressable
                onPress={() => handleToggleHandedness("right")}
                style={[
                  styles.toggleChip,
                  handedness === "right" ? styles.toggleChipActive : null,
                ]}
                testID="handedness-right-btn"
              >
                <Text
                  style={[
                    styles.toggleChipText,
                    handedness === "right" ? styles.toggleChipTextActive : null,
                  ]}
                >
                  Diestro
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleToggleHandedness("left")}
                style={[
                  styles.toggleChip,
                  handedness === "left" ? styles.toggleChipActive : null,
                ]}
                testID="handedness-left-btn"
              >
                <Text
                  style={[
                    styles.toggleChipText,
                    handedness === "left" ? styles.toggleChipTextActive : null,
                  ]}
                >
                  Zurdo
                </Text>
              </Pressable>
            </View>

            <View style={styles.toggleRow}>
              <Pressable
                onPress={handleToggleSound}
                style={[
                  styles.toggleChip,
                  soundEnabled ? styles.toggleChipActive : null,
                ]}
                testID="toggle-sound-btn"
              >
                <Text
                  style={[
                    styles.toggleChipText,
                    soundEnabled ? styles.toggleChipTextActive : null,
                  ]}
                >
                  {soundEnabled ? "🔊 Sonido ON" : "🔇 Sonido OFF"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleToggleHaptic}
                style={[
                  styles.toggleChip,
                  hapticEnabled ? styles.toggleChipActive : null,
                ]}
                testID="toggle-haptic-btn"
              >
                <Text
                  style={[
                    styles.toggleChipText,
                    hapticEnabled ? styles.toggleChipTextActive : null,
                  ]}
                >
                  {hapticEnabled ? "📳 Vibración ON" : "📴 Vibración OFF"}
                </Text>
              </Pressable>
            </View>
          </View>

          {errorMessage ? (
            <WmsBanner
              title="⚠ Atención"
              message={errorMessage}
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

          {/* CTA primario de acceso rápido */}
          <Pressable
            onPress={handleQuickOperatorLogin}
            style={styles.primaryButton}
            testID="quick-login-btn"
          >
            <Text style={styles.primaryButtonText}>Iniciar turno →</Text>
          </Pressable>

          {/* Configuración técnica colapsable (solo IT / supervisor) */}
          <Pressable
            onPress={() => setShowTechConfig((prev) => !prev)}
            style={styles.techToggleButton}
            testID="toggle-tech-config-btn"
          >
            <Text style={styles.techToggleText}>
              {showTechConfig
                ? "▲ Ocultar configuración técnica (IT)"
                : "⚙ Configuración técnica de terminal (IT)"}
            </Text>
          </Pressable>

          {showTechConfig ? (
            <View style={styles.techSection}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>URL base de API (@wms/api)</Text>
                <TextInput
                  style={[styles.input, monoText]}
                  value={apiBaseUrl}
                  onChangeText={setApiBaseUrl}
                  placeholder="http://192.168.1.10:3000"
                  placeholderTextColor={WMS_COLORS.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Clave API de dispositivo (X-API-Key)</Text>
                <TextInput
                  style={[styles.input, monoText]}
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder="dev-api-key"
                  placeholderTextColor={WMS_COLORS.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>ID de Almacén (Warehouse)</Text>
                <TextInput
                  style={[styles.input, monoText]}
                  value={warehouseId}
                  onChangeText={setWarehouseId}
                  placeholder="wh-main"
                  placeholderTextColor={WMS_COLORS.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Nombre por defecto del operario</Text>
                <TextInput
                  style={styles.input}
                  value={operatorName}
                  onChangeText={setOperatorName}
                  placeholder="Operario Handheld #1"
                  placeholderTextColor={WMS_COLORS.muted}
                />
              </View>

              <Pressable
                onPress={() => {
                  void handleSaveAndTest();
                }}
                disabled={isTesting}
                style={[
                  styles.secondaryButton,
                  isTesting ? styles.buttonDisabled : null,
                ]}
              >
                {isTesting ? (
                  <ActivityIndicator size="small" color={WMS_COLORS.text} />
                ) : (
                  <Text style={styles.secondaryButtonText}>
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
                    handedness,
                    soundEnabled,
                    hapticEnabled,
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
          ) : null}
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
    fontSize: WMS_HANDHELD_FONT_SIZES.heading,
    fontWeight: "800",
  },
  subtitle: {
    color: WMS_COLORS.muted,
    fontSize: WMS_HANDHELD_FONT_SIZES.label,
    lineHeight: 22,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    color: WMS_COLORS.muted,
    fontSize: WMS_HANDHELD_FONT_SIZES.caption,
    fontWeight: "700",
  },
  input: {
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surface,
    color: WMS_COLORS.text,
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    fontSize: WMS_HANDHELD_FONT_SIZES.body,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
  },
  pinDisplayRow: {
    flexDirection: "row",
    gap: WMS_SPACING.sm,
    justifyContent: "center",
    marginVertical: WMS_SPACING.xs,
  },
  pinDotBox: {
    width: 56,
    height: 56,
    borderRadius: WMS_RADII.md,
    backgroundColor: WMS_COLORS.surface,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  pinDotBoxFilled: {
    borderColor: WMS_COLORS.accent,
    backgroundColor: WMS_COLORS.accentTint,
  },
  pinDotText: {
    color: WMS_COLORS.accent,
    fontSize: WMS_HANDHELD_FONT_SIZES.heading,
    fontWeight: "900",
  },
  pinPadGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: WMS_SPACING.sm,
    justifyContent: "space-between",
  },
  pinKeyButton: {
    width: "30%",
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surfaceHover,
    borderRadius: WMS_RADII.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  pinKeyText: {
    color: WMS_COLORS.text,
    fontSize: WMS_HANDHELD_FONT_SIZES.heading,
    fontWeight: "800",
  },
  ergonomicBox: {
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.md,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.sm,
  },
  ergonomicTitle: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  toggleRow: {
    flexDirection: "row",
    gap: WMS_SPACING.sm,
  },
  toggleChip: {
    flex: 1,
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
    borderRadius: WMS_RADII.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    backgroundColor: WMS_COLORS.surfaceCard,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: WMS_SPACING.sm,
  },
  toggleChipActive: {
    backgroundColor: WMS_COLORS.accentTint,
    borderColor: WMS_COLORS.accentBorder,
  },
  toggleChipText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_HANDHELD_FONT_SIZES.label,
    fontWeight: "700",
  },
  toggleChipTextActive: {
    color: WMS_COLORS.accent,
  },
  primaryButton: {
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
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
    fontSize: WMS_HANDHELD_FONT_SIZES.body,
    fontWeight: "800",
  },
  techToggleButton: {
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: WMS_SPACING.sm,
  },
  techToggleText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_HANDHELD_FONT_SIZES.label,
    fontWeight: "600",
  },
  techSection: {
    gap: WMS_SPACING.md,
    paddingTop: WMS_SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: WMS_COLORS.border,
  },
  secondaryButton: {
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
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
    fontSize: WMS_HANDHELD_FONT_SIZES.label,
    fontWeight: "600",
  },
});
