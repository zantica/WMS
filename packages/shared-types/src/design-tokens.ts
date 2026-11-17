// packages/shared-types/src/design-tokens.ts
// Fuente única de verdad (Single Source of Truth) del Design System de WMS SaaS:
// Estilo S5 dark-data-dense (Industrial Data Tower), Paleta P2 Refinada y Tipografía T3 (DM Sans + JetBrains Mono).
// Agnóstico al framework: consumido tanto por @wms/web (Next.js / CSS Variables) como por @wms/mobile (Expo / React Native StyleSheet).

import type {
  LocationStatus,
  OrderStatus,
  StepStatus,
  StorageType,
  TaskStatus,
  TaskType,
} from "./index.js";
import { translate } from "./i18n/translator.js";
import { DEFAULT_LOCALE, type SupportedLocale } from "./i18n/types.js";

export const WMS_COLORS = {
  bg: "#061815",
  surface: "#0A221D",
  surfaceCard: "#0F2D26",
  surfaceHover: "#163A32",
  border: "#1F4A40",
  borderStrong: "#2E6356",
  text: "#E6F4F0",
  muted: "#8FB3A9",
  brand: "#0F6E56", // nuevo: rellenos de marca, texto blanco encima
  accent: "#2DD4BF",
  accentHover: "#5EEAD4",
  accentContrast: "#04342C",
  support: "#4ADE80",
  success: "#4ADE80",
  warning: "#FBBF24", // sin cambios
  danger: "#F43F5E", // sin cambios

  // Tintes y bordes semánticos traslúcidos (HUD y tags de estado)
  accentTint: "rgba(45, 212, 191, 0.12)",
  accentBorder: "rgba(45, 212, 191, 0.42)",
  successTint: "rgba(74, 222, 128, 0.12)",
  successBorder: "rgba(74, 222, 128, 0.42)",
  warningTint: "rgba(251, 191, 36, 0.13)",
  warningBorder: "rgba(251, 191, 36, 0.42)",
  dangerTint: "rgba(244, 63, 94, 0.13)",
  dangerBorder: "rgba(244, 63, 94, 0.45)",
  neutralTint: "rgba(143, 179, 169, 0.12)",

  // Overlays de cámara y backdrops
  scannerFrameBg: "rgba(6, 24, 21, 0.88)",
  overlayBackdrop: "rgba(2, 12, 10, 0.72)",
} as const;

export const WMS_RADII = {
  sm: 4,
  md: 6,
  lg: 8,
  pill: 999,
} as const;

export const WMS_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const WMS_FONT_SIZES = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  display: 30,
} as const;

export const WMS_DESIGN_TOKENS = {
  style: "S5 dark-data-dense",
  palette: "P2 Refinada",
  typography: "T3 DM Sans + JetBrains Mono",
  colors: WMS_COLORS,
  radii: WMS_RADII,
  spacing: WMS_SPACING,
  fontSizes: WMS_FONT_SIZES,
} as const;

export type WmsTone = "emerald" | "blue" | "amber" | "rose" | "slate";

export interface WmsToneColors {
  text: string;
  bg: string;
  border: string;
  webTagClass:
    | "wms-tag-emerald"
    | "wms-tag-blue"
    | "wms-tag-amber"
    | "wms-tag-rose"
    | "wms-tag-slate";
}

export interface WmsTaskStatusVisual {
  label: string;
  shortLabel: string;
  symbol: string;
  tone: WmsTone;
  colors: WmsToneColors;
}

export interface WmsTaskTypeVisual {
  label: string;
  code: string;
  symbol: string;
  tone: WmsTone;
  colors: WmsToneColors;
}

export interface WmsStepStatusVisual {
  label: string;
  symbol: string;
  tone: WmsTone;
  colors: WmsToneColors;
}

export interface WmsOrderStatusVisual {
  label: string;
  recommendedAction: string;
  symbol: string;
  tone: WmsTone;
  colors: WmsToneColors;
}

/**
 * Construye el mapa canónico de variables CSS (`--bg`, `--surface`, etc.)
 * para verificar o inyectar consistencia entre `@wms/shared-types` y `apps/web/src/app/globals.css`.
 */
export function buildWmsCssVariables(): Record<string, string> {
  return {
    "--bg": WMS_COLORS.bg,
    "--surface": WMS_COLORS.surface,
    "--surface-card": WMS_COLORS.surfaceCard,
    "--surface-hover": WMS_COLORS.surfaceHover,
    "--border": WMS_COLORS.border,
    "--border-strong": WMS_COLORS.borderStrong,
    "--text": WMS_COLORS.text,
    "--muted": WMS_COLORS.muted,
    "--brand": WMS_COLORS.brand,
    "--accent": WMS_COLORS.accent,
    "--accent-hover": WMS_COLORS.accentHover,
    "--accent-contrast": WMS_COLORS.accentContrast,
    "--support": WMS_COLORS.support,
    "--success": WMS_COLORS.success,
    "--warning": WMS_COLORS.warning,
    "--danger": WMS_COLORS.danger,
    "--accent-tint": WMS_COLORS.accentTint,
    "--accent-border": WMS_COLORS.accentBorder,
    "--success-tint": WMS_COLORS.successTint,
    "--success-border": WMS_COLORS.successBorder,
    "--warning-tint": WMS_COLORS.warningTint,
    "--warning-border": WMS_COLORS.warningBorder,
    "--danger-tint": WMS_COLORS.dangerTint,
    "--danger-border": WMS_COLORS.dangerBorder,
    "--neutral-tint": WMS_COLORS.neutralTint,
    "--radius-sm": `${WMS_RADII.sm}px`,
    "--radius-md": `${WMS_RADII.md}px`,
    "--radius-lg": `${WMS_RADII.lg}px`,
  };
}

/**
 * Resuelve los colores de texto, fondo, borde y clase CSS para un tono semántico (`WmsTone`).
 */
export function resolveToneColors(tone: WmsTone): WmsToneColors {
  switch (tone) {
    case "emerald":
      return {
        text: WMS_COLORS.success,
        bg: WMS_COLORS.successTint,
        border: WMS_COLORS.successBorder,
        webTagClass: "wms-tag-emerald",
      };
    case "blue":
      return {
        text: WMS_COLORS.accent,
        bg: WMS_COLORS.accentTint,
        border: WMS_COLORS.accentBorder,
        webTagClass: "wms-tag-blue",
      };
    case "amber":
      return {
        text: WMS_COLORS.warning,
        bg: WMS_COLORS.warningTint,
        border: WMS_COLORS.warningBorder,
        webTagClass: "wms-tag-amber",
      };
    case "rose":
      return {
        text: WMS_COLORS.danger,
        bg: WMS_COLORS.dangerTint,
        border: WMS_COLORS.dangerBorder,
        webTagClass: "wms-tag-rose",
      };
    case "slate":
      return {
        text: WMS_COLORS.muted,
        bg: WMS_COLORS.neutralTint,
        border: WMS_COLORS.border,
        webTagClass: "wms-tag-slate",
      };
  }
}

/**
 * Resuelve la semántica visual (etiqueta, símbolo de accesibilidad no-solo-color y paleta)
 * para un estado de tarea (`TaskStatus`).
 */
export function resolveTaskStatusVisual(
  status: TaskStatus,
  locale: SupportedLocale = DEFAULT_LOCALE,
): WmsTaskStatusVisual {
  switch (status) {
    case "PENDING":
      return {
        label: translate(locale, "visuals.taskStatus.pendingLabel"),
        shortLabel: translate(locale, "visuals.taskStatus.pendingShort"),
        symbol: "●",
        tone: "slate",
        colors: resolveToneColors("slate"),
      };
    case "IN_PROGRESS":
      return {
        label: translate(locale, "visuals.taskStatus.inProgressLabel"),
        shortLabel: translate(locale, "visuals.taskStatus.inProgressShort"),
        symbol: "▲",
        tone: "amber",
        colors: resolveToneColors("amber"),
      };
    case "COMPLETED":
      return {
        label: translate(locale, "visuals.taskStatus.completedLabel"),
        shortLabel: translate(locale, "visuals.taskStatus.completedShort"),
        symbol: "✓",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "EXCEPTION":
      return {
        label: translate(locale, "visuals.taskStatus.exceptionLabel"),
        shortLabel: translate(locale, "visuals.taskStatus.exceptionShort"),
        symbol: "⚠",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
    case "CANCELLED":
      return {
        label: translate(locale, "visuals.taskStatus.cancelledLabel"),
        shortLabel: translate(locale, "visuals.taskStatus.cancelledShort"),
        symbol: "✕",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
  }
}

/**
 * Resuelve la semántica visual para un tipo de tarea operativa (`TaskType`).
 */
export function resolveTaskTypeVisual(
  type: TaskType,
  locale: SupportedLocale = DEFAULT_LOCALE,
): WmsTaskTypeVisual {
  switch (type) {
    case "RECEIVING":
      return {
        label: translate(locale, "visuals.taskType.receivingLabel"),
        code: "INBOUND · RECEIVING",
        symbol: "↓",
        tone: "blue",
        colors: resolveToneColors("blue"),
      };
    case "PUTAWAY":
      return {
        label: translate(locale, "visuals.taskType.putawayLabel"),
        code: "STORAGE · PUTAWAY",
        symbol: "→",
        tone: "blue",
        colors: resolveToneColors("blue"),
      };
    case "PICKING":
      return {
        label: translate(locale, "visuals.taskType.pickingLabel"),
        code: "OUTBOUND · PICKING",
        symbol: "◆",
        tone: "amber",
        colors: resolveToneColors("amber"),
      };
    case "PACKING":
      return {
        label: translate(locale, "visuals.taskType.packingLabel"),
        code: "DISPATCH · PACKING",
        symbol: "■",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
  }
}

/**
 * Resuelve la semántica visual para el estado de un paso individual (`StepStatus`).
 */
export function resolveStepStatusVisual(
  status: StepStatus,
  locale: SupportedLocale = DEFAULT_LOCALE,
): WmsStepStatusVisual {
  switch (status) {
    case "PENDING":
      return {
        label: translate(locale, "visuals.stepStatus.pendingLabel"),
        symbol: "○",
        tone: "blue",
        colors: resolveToneColors("blue"),
      };
    case "COMPLETED":
      return {
        label: translate(locale, "visuals.stepStatus.completedLabel"),
        symbol: "✓",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "EXCEPTION":
      return {
        label: translate(locale, "visuals.stepStatus.exceptionLabel"),
        symbol: "⚠",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
    case "SKIPPED":
      return {
        label: translate(locale, "visuals.stepStatus.skippedLabel"),
        symbol: "—",
        tone: "slate",
        colors: resolveToneColors("slate"),
      };
  }
}

/**
 * Resuelve la semántica visual y acción recomendada para el estado de un pedido (`OrderStatus`).
 */
export function resolveOrderStatusVisual(
  status: OrderStatus,
  locale: SupportedLocale = DEFAULT_LOCALE,
): WmsOrderStatusVisual {
  switch (status) {
    case "PENDING":
      return {
        label: "PENDING",
        recommendedAction: translate(locale, "visuals.orderStatus.pendingAction"),
        symbol: "●",
        tone: "slate",
        colors: resolveToneColors("slate"),
      };
    case "ALLOCATED":
      return {
        label: "ALLOCATED",
        recommendedAction: translate(locale, "visuals.orderStatus.allocatedAction"),
        symbol: "◆",
        tone: "blue",
        colors: resolveToneColors("blue"),
      };
    case "PICKING":
      return {
        label: "PICKING",
        recommendedAction: translate(locale, "visuals.orderStatus.pickingAction"),
        symbol: "▲",
        tone: "amber",
        colors: resolveToneColors("amber"),
      };
    case "PACKED":
      return {
        label: "PACKED",
        recommendedAction: translate(locale, "visuals.orderStatus.packedAction"),
        symbol: "✓",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "SHIPPED":
      return {
        label: "SHIPPED",
        recommendedAction: translate(locale, "visuals.orderStatus.shippedAction"),
        symbol: "✓",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "ON_HOLD":
      return {
        label: "ON_HOLD",
        recommendedAction: translate(locale, "visuals.orderStatus.onHoldAction"),
        symbol: "⚠",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
    case "CANCELLED":
      return {
        label: "CANCELLED",
        recommendedAction: translate(locale, "visuals.orderStatus.cancelledAction"),
        symbol: "✕",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
  }
}

export interface WmsStorageTypeVisual {
  label: string;
  code: string;
  symbol: string;
  tone: WmsTone;
  colors: WmsToneColors;
}

/**
 * Resuelve la semántica visual para el tipo físico de almacenamiento (`StorageType`).
 */
export function resolveStorageTypeVisual(type: StorageType): WmsStorageTypeVisual {
  switch (type) {
    case "RACK":
      return {
        label: "Rack de Palets",
        code: "RACK",
        symbol: "▤",
        tone: "blue",
        colors: resolveToneColors("blue"),
      };
    case "SHELVING":
      return {
        label: "Estantería Picking",
        code: "SHELVING",
        symbol: "⊞",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "FLOOR":
      return {
        label: "Planta / Suelo",
        code: "FLOOR",
        symbol: "⬚",
        tone: "amber",
        colors: resolveToneColors("amber"),
      };
  }
}

export interface WmsLocationStatusVisual {
  label: string;
  code: string;
  symbol: string;
  tone: WmsTone;
  colors: WmsToneColors;
}

/**
 * Resuelve la semántica visual para el estado operativo de la ubicación (`LocationStatus`).
 */
export function resolveLocationStatusVisual(
  status: LocationStatus,
): WmsLocationStatusVisual {
  switch (status) {
    case "ACTIVE":
      return {
        label: "Activa",
        code: "ACTIVE",
        symbol: "●",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "BLOCKED":
      return {
        label: "Bloqueada",
        code: "BLOCKED",
        symbol: "⊘",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
  }
}

export interface WmsLocationCellVisual {
  state: "EMPTY" | "OCCUPIED" | "RESERVED" | "BLOCKED";
  label: string;
  symbol: string;
  tone: WmsTone;
  colors: WmsToneColors;
}

/**
 * Resuelve la representación visual y térmica de una celda del layout según sus saldos y estado:
 * 1. BLOCKED -> Bloqueada (rose)
 * 2. VACÍA (onHand === 0) -> Disponible (slate)
 * 3. RESERVADA 100% (atp === 0 y onHand > 0) -> Totalmente asignada (amber)
 * 4. OCUPADA (atp > 0) -> Con stock disponible (emerald)
 */
export function resolveLocationCellVisual(params: {
  status: LocationStatus;
  onHandQty: number;
  atpQty: number;
}): WmsLocationCellVisual {
  if (params.status === "BLOCKED") {
    return {
      state: "BLOCKED",
      label: "Bloqueada",
      symbol: "⊘",
      tone: "rose",
      colors: resolveToneColors("rose"),
    };
  }

  if (params.onHandQty <= 0) {
    return {
      state: "EMPTY",
      label: "Vacía",
      symbol: "○",
      tone: "slate",
      colors: resolveToneColors("slate"),
    };
  }

  if (params.atpQty <= 0) {
    return {
      state: "RESERVED",
      label: "Reservada 100%",
      symbol: "■",
      tone: "amber",
      colors: resolveToneColors("amber"),
    };
  }

  return {
    state: "OCCUPIED",
    label: "Ocupada (ATP > 0)",
    symbol: "●",
    tone: "emerald",
    colors: resolveToneColors("emerald"),
  };
}
