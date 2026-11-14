// apps/mobile/src/components/BarcodeScannerBox.tsx
// Componente reutilizable de escaneo para terminales de almacén:
// Soporta cámara (expo-camera) y entrada rápida por teclado/lector láser HID (Zebra/Honeywell).
// Alineado con el Design System S5 dark-data-dense (@wms/shared-types): cero hex crudos y targets >= 44px.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_HANDHELD_FONT_SIZES,
  WMS_HANDHELD_TOUCH_TARGET,
  WMS_MIN_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  monoText,
  type WmsHandedness,
} from "../theme/tokens";
import { WmsTag } from "./WmsUiPrimitives";

export interface BarcodeScannerBoxProps {
  onScan: (scannedCode: string) => void;
  label?: string;
  placeholder?: string;
  expectedCodeHint?: string | null;
  disabled?: boolean;
  defaultMode?: "camera" | "manual";
  autoFocus?: boolean;
  continuousCamera?: boolean;
  continuousCooldownMs?: number;
  handedness?: WmsHandedness;
}

const SUPPORTED_BARCODE_TYPES = [
  "qr",
  "ean13",
  "ean8",
  "code128",
  "code39",
  "upc_a",
  "upc_e",
];

export function BarcodeScannerBox({
  onScan,
  label = "Escanear código de ubicación o producto",
  placeholder = "Escanea con gatillo láser o escribe el código...",
  expectedCodeHint,
  disabled = false,
  defaultMode = "manual",
  autoFocus = true,
  continuousCamera = true,
  continuousCooldownMs = 1200,
  handedness = "right",
}: BarcodeScannerBoxProps): JSX.Element {
  const [mode, setMode] = useState<"camera" | "manual">(defaultMode);
  const [manualCode, setManualCode] = useState<string>("");
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [cameraLocked, setCameraLocked] = useState<boolean>(false);
  const [permission, requestPermission] = useCameraPermissions();
  const inputRef = useRef<{ focus?: () => void } | null>(null);

  const refocusInput = useCallback(() => {
    if (!autoFocus || disabled || mode !== "manual") return;
    setTimeout(() => {
      inputRef.current?.focus?.();
    }, 50);
  }, [autoFocus, disabled, mode]);

  useEffect(() => {
    refocusInput();
  }, [refocusInput, expectedCodeHint]);

  useEffect(() => {
    if (!cameraLocked || !continuousCamera) return;
    const timer = setTimeout(() => {
      setCameraLocked(false);
    }, continuousCooldownMs);
    return () => clearTimeout(timer);
  }, [cameraLocked, continuousCamera, continuousCooldownMs]);

  const triggerScan = useCallback(
    (rawCode: string) => {
      if (disabled) return;
      const normalized = rawCode.trim();
      if (!normalized) return;
      setLastScanned(normalized);
      onScan(normalized);
      refocusInput();
    },
    [disabled, onScan, refocusInput],
  );

  const handleManualSubmit = useCallback(() => {
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    setManualCode("");
    triggerScan(trimmed);
  }, [manualCode, triggerScan]);

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (disabled || cameraLocked) return;
      const code = result.data.trim();
      if (!code) return;
      setCameraLocked(true);
      triggerScan(code);
    },
    [cameraLocked, disabled, triggerScan],
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.labelGroup}>
          <WmsTag label="HID / QR" symbol="◆" tone="blue" />
          <Text style={styles.label}>{label}</Text>
        </View>
        <View style={styles.modeSwitch}>
          <Pressable
            onPress={() => setMode("manual")}
            style={[
              styles.modeButton,
              mode === "manual" ? styles.modeButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.modeButtonText,
                mode === "manual" ? styles.modeButtonTextActive : null,
              ]}
            >
              Láser / Manual
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setCameraLocked(false);
              setMode("camera");
            }}
            style={[
              styles.modeButton,
              mode === "camera" ? styles.modeButtonActive : null,
            ]}
          >
            <Text
              style={[
                styles.modeButtonText,
                mode === "camera" ? styles.modeButtonTextActive : null,
              ]}
            >
              Cámara QR/EAN
            </Text>
          </Pressable>
        </View>
      </View>

      {expectedCodeHint ? (
        <View style={styles.hintBanner}>
          <Text style={styles.hintText}>
            Objetivo esperado:{" "}
            <Text style={[styles.hintCode, monoText]}>{expectedCodeHint}</Text>
          </Text>
        </View>
      ) : null}

      {mode === "manual" ? (
        <View
          style={[
            styles.manualContainer,
            handedness === "left" ? styles.manualContainerLeft : null,
          ]}
        >
          <TextInput
            {...({ ref: inputRef, blurOnSubmit: false } as Record<
              string,
              unknown
            >)}
            style={[styles.input, monoText]}
            value={manualCode}
            onChangeText={setManualCode}
            onSubmitEditing={handleManualSubmit}
            placeholder={placeholder}
            placeholderTextColor={WMS_COLORS.muted}
            autoFocus={autoFocus}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            editable={!disabled}
            testID="barcode-manual-input"
          />
          <Pressable
            onPress={handleManualSubmit}
            disabled={disabled || manualCode.trim().length === 0}
            style={[
              styles.confirmButton,
              disabled || manualCode.trim().length === 0
                ? styles.confirmButtonDisabled
                : null,
            ]}
            testID="barcode-submit-btn"
          >
            <Text
              style={[
                styles.confirmButtonText,
                disabled || manualCode.trim().length === 0
                  ? styles.confirmButtonTextDisabled
                  : null,
              ]}
            >
              Confirmar
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cameraWrapper}>
          {!permission ? (
            <Text style={styles.permissionText}>
              Verificando permisos de cámara...
            </Text>
          ) : !permission.granted ? (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>
                Se requiere permiso de cámara para leer códigos de barras y QR.
              </Text>
              <Pressable
                onPress={() => {
                  void requestPermission();
                }}
                style={styles.permissionButton}
              >
                <Text style={styles.permissionButtonText}>
                  Habilitar cámara
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.cameraViewport}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: SUPPORTED_BARCODE_TYPES,
                }}
                onBarcodeScanned={handleBarcodeScanned}
              />
              {cameraLocked ? (
                <View style={styles.cameraOverlay}>
                  <Text style={[styles.overlayText, monoText]}>
                    ✓ Código capturado: {lastScanned}
                  </Text>
                  <Pressable
                    onPress={() => setCameraLocked(false)}
                    style={styles.rescanButton}
                  >
                    <Text style={styles.rescanButtonText}>
                      Escanear otro código
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
        </View>
      )}

      {lastScanned ? (
        <Text style={styles.lastScannedText}>
          Última lectura:{" "}
          <Text style={[styles.lastScannedCode, monoText]}>{lastScanned}</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.sm,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: WMS_SPACING.sm,
  },
  labelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: WMS_SPACING.sm,
    flex: 1,
  },
  label: {
    color: WMS_COLORS.text,
    fontSize: WMS_HANDHELD_FONT_SIZES.label,
    fontWeight: "700",
    flexShrink: 1,
  },
  modeSwitch: {
    flexDirection: "row",
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    padding: 2,
  },
  modeButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    justifyContent: "center",
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: 6,
    borderRadius: WMS_RADII.sm,
  },
  modeButtonActive: {
    backgroundColor: WMS_COLORS.accentTint,
    borderWidth: 1,
    borderColor: WMS_COLORS.accentBorder,
  },
  modeButtonText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_HANDHELD_FONT_SIZES.caption,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: WMS_COLORS.accent,
    fontWeight: "700",
  },
  hintBanner: {
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    borderLeftWidth: 4,
    borderLeftColor: WMS_COLORS.accent,
  },
  hintText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_HANDHELD_FONT_SIZES.caption,
  },
  hintCode: {
    color: WMS_COLORS.accent,
    fontSize: WMS_HANDHELD_FONT_SIZES.body,
    fontWeight: "800",
  },
  manualContainer: {
    flexDirection: "row",
    gap: WMS_SPACING.sm,
  },
  manualContainerLeft: {
    flexDirection: "row-reverse",
  },
  input: {
    flex: 1,
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surface,
    color: WMS_COLORS.text,
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    fontSize: WMS_HANDHELD_FONT_SIZES.body,
    borderWidth: 2,
    borderColor: WMS_COLORS.accentBorder,
  },
  confirmButton: {
    minHeight: WMS_HANDHELD_TOUCH_TARGET,
    minWidth: 112,
    backgroundColor: WMS_COLORS.accent,
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.lg,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmButtonDisabled: {
    backgroundColor: WMS_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
  },
  confirmButtonText: {
    color: WMS_COLORS.accentContrast,
    fontWeight: "800",
    fontSize: WMS_HANDHELD_FONT_SIZES.body,
  },
  confirmButtonTextDisabled: {
    color: WMS_COLORS.muted,
  },
  cameraWrapper: {
    minHeight: 180,
    borderRadius: WMS_RADII.md,
    overflow: "hidden",
    backgroundColor: WMS_COLORS.bg,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  cameraViewport: {
    width: "100%",
    height: 190,
    position: "relative",
  },
  camera: {
    width: "100%",
    height: "100%",
  },
  cameraOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: WMS_COLORS.scannerFrameBg,
    justifyContent: "center",
    alignItems: "center",
    gap: WMS_SPACING.sm,
    padding: WMS_SPACING.md,
  },
  overlayText: {
    color: WMS_COLORS.success,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "700",
  },
  rescanButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.accent,
    paddingHorizontal: WMS_SPACING.lg,
    paddingVertical: WMS_SPACING.sm,
    borderRadius: WMS_RADII.md,
    justifyContent: "center",
    alignItems: "center",
  },
  rescanButtonText: {
    color: WMS_COLORS.accentContrast,
    fontWeight: "800",
    fontSize: 13,
  },
  permissionBox: {
    padding: WMS_SPACING.lg,
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  permissionText: {
    color: WMS_COLORS.muted,
    fontSize: 13,
    textAlign: "center",
  },
  permissionButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.accent,
    paddingHorizontal: WMS_SPACING.lg,
    paddingVertical: WMS_SPACING.sm,
    borderRadius: WMS_RADII.md,
    justifyContent: "center",
    alignItems: "center",
  },
  permissionButtonText: {
    color: WMS_COLORS.accentContrast,
    fontWeight: "800",
    fontSize: 13,
  },
  lastScannedText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
  },
  lastScannedCode: {
    color: WMS_COLORS.text,
    fontWeight: "700",
  },
});
