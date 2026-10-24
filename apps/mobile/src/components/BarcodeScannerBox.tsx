// apps/mobile/src/components/BarcodeScannerBox.tsx
// Componente reutilizable de escaneo para terminales de almacén:
// Soporta cámara (expo-camera) y entrada rápida por teclado/lector láser HID (Zebra/Honeywell).

import { useCallback, useState } from "react";
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

export interface BarcodeScannerBoxProps {
  onScan: (scannedCode: string) => void;
  label?: string;
  placeholder?: string;
  expectedCodeHint?: string | null;
  disabled?: boolean;
  defaultMode?: "camera" | "manual";
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
  label = "Escanear Código de Ubicación o Producto",
  placeholder = "Escanea con gatillo láser o escribe el código...",
  expectedCodeHint,
  disabled = false,
  defaultMode = "manual",
}: BarcodeScannerBoxProps): JSX.Element {
  const [mode, setMode] = useState<"camera" | "manual">(defaultMode);
  const [manualCode, setManualCode] = useState<string>("");
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [cameraLocked, setCameraLocked] = useState<boolean>(false);
  const [permission, requestPermission] = useCameraPermissions();

  const triggerScan = useCallback(
    (rawCode: string) => {
      if (disabled) return;
      const normalized = rawCode.trim();
      if (!normalized) return;
      setLastScanned(normalized);
      onScan(normalized);
    },
    [disabled, onScan],
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
        <Text style={styles.label}>{label}</Text>
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
            Esperado: <Text style={styles.hintCode}>{expectedCodeHint}</Text>
          </Text>
        </View>
      ) : null}

      {mode === "manual" ? (
        <View style={styles.manualContainer}>
          <TextInput
            style={styles.input}
            value={manualCode}
            onChangeText={setManualCode}
            onSubmitEditing={handleManualSubmit}
            placeholder={placeholder}
            placeholderTextColor="#64748B"
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
            <Text style={styles.confirmButtonText}>Confirmar</Text>
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
                  Habilitar Cámara
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
                  <Text style={styles.overlayText}>
                    Código capturado: {lastScanned}
                  </Text>
                  <Pressable
                    onPress={() => setCameraLocked(false)}
                    style={styles.rescanButton}
                  >
                    <Text style={styles.rescanButtonText}>
                      Escanear Otro Código
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
          Última lectura: <Text style={styles.lastScannedCode}>{lastScanned}</Text>
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  label: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  modeSwitch: {
    flexDirection: "row",
    backgroundColor: "#0F172A",
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: "#2563EB",
  },
  modeButtonText: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
  },
  modeButtonTextActive: {
    color: "#FFFFFF",
  },
  hintBanner: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: "#38BDF8",
  },
  hintText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  hintCode: {
    color: "#38BDF8",
    fontWeight: "700",
  },
  manualContainer: {
    flexDirection: "row",
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#0F172A",
    color: "#F8FAFC",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#475569",
  },
  confirmButton: {
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  confirmButtonDisabled: {
    backgroundColor: "#334155",
  },
  confirmButtonText: {
    color: "#052E16",
    fontWeight: "800",
    fontSize: 14,
  },
  cameraWrapper: {
    minHeight: 180,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#0F172A",
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
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },
  overlayText: {
    color: "#34D399",
    fontSize: 14,
    fontWeight: "700",
  },
  rescanButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rescanButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  permissionBox: {
    padding: 16,
    alignItems: "center",
    gap: 10,
  },
  permissionText: {
    color: "#CBD5E1",
    fontSize: 13,
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  lastScannedText: {
    color: "#94A3B8",
    fontSize: 12,
  },
  lastScannedCode: {
    color: "#F8FAFC",
    fontWeight: "700",
  },
});
