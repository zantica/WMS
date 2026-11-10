// apps/mobile/src/components/TaskScreenCommon.tsx
// Componentes y estilos comunes para pantallas de tareas operativas (@wms/mobile).
// Elimina la duplicación entre Putaway, Picking y Receiving manteniendo el Design System S5.

import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  WMS_COLORS,
  WMS_FONT_SIZES,
  WMS_MIN_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  monoText,
} from "../theme/tokens.js";

export const commonTaskStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: WMS_COLORS.bg,
  },
  container: {
    padding: WMS_SPACING.md,
    gap: WMS_SPACING.md,
    paddingBottom: 48,
  },
  centerBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: WMS_SPACING.xl,
    gap: WMS_SPACING.md,
  },
  loadingText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.sm,
  },
  headerCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.sm,
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  taskTitle: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.lg,
    fontWeight: "800",
  },
  activeStepPanel: {
    gap: WMS_SPACING.md,
  },
  productSummaryBox: {
    backgroundColor: WMS_COLORS.bg,
    borderRadius: WMS_RADII.md,
    padding: WMS_SPACING.sm,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: 4,
    marginTop: WMS_SPACING.xs,
  },
  productNameText: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "700",
  },
  productMetaText: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
  },
  remainingHighlight: {
    color: WMS_COLORS.success,
    fontSize: 13,
    fontWeight: "800",
  },
  qtyControlRow: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: WMS_SPACING.sm,
  },
  qtyControlLabel: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "600",
  },
  qtyButtonsGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: WMS_SPACING.sm,
  },
  qtyStepBtn: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surfaceHover,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    borderRadius: WMS_RADII.md,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyStepBtnText: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.sm,
    fontWeight: "800",
  },
  qtyInput: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surface,
    color: WMS_COLORS.text,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: 6,
    minWidth: 68,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
  qtyMaxBtn: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.accentTint,
    borderWidth: 1,
    borderColor: WMS_COLORS.accentBorder,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    borderRadius: WMS_RADII.md,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyMaxBtnText: {
    color: WMS_COLORS.accent,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
  exceptionContainer: {
    gap: WMS_SPACING.sm,
  },
  toggleExceptionButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.warningTint,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: WMS_COLORS.warningBorder,
  },
  toggleExceptionText: {
    color: WMS_COLORS.warning,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
  exceptionForm: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.warningBorder,
    gap: WMS_SPACING.sm,
  },
  exceptionInput: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.surface,
    color: WMS_COLORS.text,
    borderRadius: WMS_RADII.md,
    paddingHorizontal: WMS_SPACING.md,
    paddingVertical: WMS_SPACING.sm,
    borderWidth: 1,
    borderColor: WMS_COLORS.borderStrong,
    fontSize: 13,
  },
  submitExceptionButton: {
    minHeight: WMS_MIN_TOUCH_TARGET,
    backgroundColor: WMS_COLORS.warning,
    borderRadius: WMS_RADII.md,
    paddingVertical: WMS_SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  submitExceptionButtonText: {
    color: WMS_COLORS.accentContrast,
    fontSize: 13,
    fontWeight: "800",
  },
  stepsListSection: {
    gap: WMS_SPACING.sm,
  },
  sectionTitle: {
    color: WMS_COLORS.text,
    fontSize: WMS_FONT_SIZES.base,
    fontWeight: "700",
  },
  stepRowCard: {
    backgroundColor: WMS_COLORS.surfaceCard,
    borderRadius: WMS_RADII.lg,
    padding: WMS_SPACING.md,
    borderWidth: 1,
    borderColor: WMS_COLORS.border,
    gap: 4,
  },
  stepRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: WMS_SPACING.sm,
  },
  stepSeqText: {
    color: WMS_COLORS.text,
    fontSize: 13,
    fontWeight: "700",
  },
  stepProductName: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
  },
  stepUnitsBadge: {
    color: WMS_COLORS.muted,
    fontSize: WMS_FONT_SIZES.xs,
    fontWeight: "700",
  },
});

export interface TaskQuantityControlProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeValue: (text: string) => void;
  readonly onAdjust: (delta: number) => void;
  readonly maxPendingQty?: number | undefined;
  readonly onSelectMax?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
  readonly inputTestID?: string | undefined;
}

export function TaskQuantityControl({
  label,
  value,
  onChangeValue,
  onAdjust,
  maxPendingQty,
  onSelectMax,
  disabled = false,
  inputTestID,
}: TaskQuantityControlProps): JSX.Element {
  return (
    <View style={commonTaskStyles.qtyControlRow}>
      <Text style={commonTaskStyles.qtyControlLabel}>{label}</Text>
      <View style={commonTaskStyles.qtyButtonsGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restar 10 unidades"
          style={commonTaskStyles.qtyStepBtn}
          onPress={() => onAdjust(-10)}
          disabled={disabled}
        >
          <Text style={[commonTaskStyles.qtyStepBtnText, monoText]}>-10</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restar 1 unidad"
          style={commonTaskStyles.qtyStepBtn}
          onPress={() => onAdjust(-1)}
          disabled={disabled}
        >
          <Text style={[commonTaskStyles.qtyStepBtnText, monoText]}>-1</Text>
        </Pressable>
        <TextInput
          style={[commonTaskStyles.qtyInput, monoText]}
          keyboardType="numeric"
          value={value}
          onChangeText={onChangeValue}
          accessibilityLabel="Cantidad manual"
          editable={!disabled}
          testID={inputTestID}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sumar 1 unidad"
          style={commonTaskStyles.qtyStepBtn}
          onPress={() => onAdjust(1)}
          disabled={disabled}
        >
          <Text style={[commonTaskStyles.qtyStepBtnText, monoText]}>+1</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sumar 10 unidades"
          style={commonTaskStyles.qtyStepBtn}
          onPress={() => onAdjust(10)}
          disabled={disabled}
        >
          <Text style={[commonTaskStyles.qtyStepBtnText, monoText]}>+10</Text>
        </Pressable>
        {maxPendingQty !== undefined && onSelectMax ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Seleccionar cantidad máxima pendiente"
            style={commonTaskStyles.qtyMaxBtn}
            onPress={onSelectMax}
            disabled={disabled}
          >
            <Text style={commonTaskStyles.qtyMaxBtnText}>
              MÁX ({maxPendingQty})
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export interface TaskExceptionSectionProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly note: string;
  readonly onChangeNote: (text: string) => void;
  readonly onSubmit: () => void;
  readonly isSubmitting: boolean;
  readonly toggleLabelClosed?: string;
  readonly toggleLabelOpen?: string;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly inputTestID?: string | undefined;
  readonly submitTestID?: string | undefined;
}

export function TaskExceptionSection({
  isOpen,
  onToggle,
  note,
  onChangeNote,
  onSubmit,
  isSubmitting,
  toggleLabelClosed = "⚠ Reportar rotura de stock / incidencia",
  toggleLabelOpen = "✕ Cancelar reporte de incidencia",
  placeholder = "Motivo (ej. Ubicación vacía, caja rota, SKU incorrecto)",
  submitLabel = "Confirmar reporte de excepción",
  inputTestID,
  submitTestID,
}: TaskExceptionSectionProps): JSX.Element {
  return (
    <View style={commonTaskStyles.exceptionContainer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={toggleLabelClosed}
        style={commonTaskStyles.toggleExceptionButton}
        onPress={onToggle}
      >
        <Text style={commonTaskStyles.toggleExceptionText}>
          {isOpen ? toggleLabelOpen : toggleLabelClosed}
        </Text>
      </Pressable>

      {isOpen ? (
        <View style={commonTaskStyles.exceptionForm}>
          <TextInput
            style={commonTaskStyles.exceptionInput}
            placeholder={placeholder}
            placeholderTextColor={WMS_COLORS.muted}
            value={note}
            onChangeText={onChangeNote}
            multiline
            editable={!isSubmitting}
            testID={inputTestID}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
            style={commonTaskStyles.submitExceptionButton}
            disabled={isSubmitting}
            onPress={onSubmit}
            testID={submitTestID}
          >
            <Text style={commonTaskStyles.submitExceptionButtonText}>
              {submitLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

