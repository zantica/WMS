// packages/shared-types/src/design-tokens.ts
// Fuente única de verdad (Single Source of Truth) del Design System de WMS SaaS:
// Estilo S5 dark-data-dense (Industrial Data Tower), Paleta P2 Refinada y Tipografía T3 (DM Sans + JetBrains Mono).
// Agnóstico al framework: consumido tanto por @wms/web (Next.js / CSS Variables) como por @wms/mobile (Expo / React Native StyleSheet).

import type {
  OrderStatus,
  StepStatus,
  TaskStatus,
  TaskType,
} from "./index.js";

export const WMS_COLORS = {
  bg: "#0B1120",
  surface: "#111A2E",
  surfaceCard: "#162238",
  surfaceHover: "#1E2D4A",
  border: "#23334D",
  borderStrong: "#334A6E",
  text: "#E8EEF6",
  muted: "#8CA0BA",
  accent: "#38BDF8",
  accentHover: "#7DD3FC",
  accentContrast: "#08172A",
  support: "#34D399",
  success: "#34D399",
  warning: "#FBBF24",
  danger: "#F43F5E",

  // Tintes y bordes semánticos traslúcidos (HUD y tags de estado)
  accentTint: "rgba(56, 189, 248, 0.12)",
  accentBorder: "rgba(56, 189, 248, 0.42)",
  successTint: "rgba(52, 211, 153, 0.12)",
  successBorder: "rgba(52, 211, 153, 0.42)",
  warningTint: "rgba(251, 191, 36, 0.13)",
  warningBorder: "rgba(251, 191, 36, 0.42)",
  dangerTint: "rgba(244, 63, 94, 0.13)",
  dangerBorder: "rgba(244, 63, 94, 0.45)",
  neutralTint: "rgba(140, 160, 186, 0.12)",

  // Overlays de cámara y backdrops
  scannerFrameBg: "rgba(11, 17, 32, 0.88)",
  overlayBackdrop: "rgba(2, 6, 23, 0.72)",
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
): WmsTaskStatusVisual {
  switch (status) {
    case "PENDING":
      return {
        label: "Pendiente de inicio",
        shortLabel: "PENDIENTE",
        symbol: "●",
        tone: "slate",
        colors: resolveToneColors("slate"),
      };
    case "IN_PROGRESS":
      return {
        label: "En ejecución en piso",
        shortLabel: "EN CURSO",
        symbol: "▲",
        tone: "amber",
        colors: resolveToneColors("amber"),
      };
    case "COMPLETED":
      return {
        label: "Completada y contabilizada",
        shortLabel: "COMPLETADA",
        symbol: "✓",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "EXCEPTION":
      return {
        label: "Detenida por incidencia",
        shortLabel: "EXCEPCIÓN",
        symbol: "⚠",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
    case "CANCELLED":
      return {
        label: "Cancelada",
        shortLabel: "CANCELADA",
        symbol: "✕",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
  }
}

/**
 * Resuelve la semántica visual para un tipo de tarea operativa (`TaskType`).
 */
export function resolveTaskTypeVisual(type: TaskType): WmsTaskTypeVisual {
  switch (type) {
    case "RECEIVING":
      return {
        label: "Recepción en muelle",
        code: "INBOUND · RECEIVING",
        symbol: "↓",
        tone: "blue",
        colors: resolveToneColors("blue"),
      };
    case "PUTAWAY":
      return {
        label: "Putaway a estantería",
        code: "STORAGE · PUTAWAY",
        symbol: "→",
        tone: "blue",
        colors: resolveToneColors("blue"),
      };
    case "PICKING":
      return {
        label: "Picking guiado",
        code: "OUTBOUND · PICKING",
        symbol: "◆",
        tone: "amber",
        colors: resolveToneColors("amber"),
      };
    case "PACKING":
      return {
        label: "Mesa de empaquetado",
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
): WmsStepStatusVisual {
  switch (status) {
    case "PENDING":
      return {
        label: "PENDIENTE",
        symbol: "○",
        tone: "blue",
        colors: resolveToneColors("blue"),
      };
    case "COMPLETED":
      return {
        label: "COMPLETADO",
        symbol: "✓",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "EXCEPTION":
      return {
        label: "EXCEPCIÓN",
        symbol: "⚠",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
    case "SKIPPED":
      return {
        label: "OMITIDO",
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
): WmsOrderStatusVisual {
  switch (status) {
    case "PENDING":
      return {
        label: "PENDING",
        recommendedAction: "Lanzar reserva ATP (Allocate)",
        symbol: "●",
        tone: "slate",
        colors: resolveToneColors("slate"),
      };
    case "ALLOCATED":
      return {
        label: "ALLOCATED",
        recommendedAction: "En cola de picking móvil",
        symbol: "◆",
        tone: "blue",
        colors: resolveToneColors("blue"),
      };
    case "PICKING":
      return {
        label: "PICKING",
        recommendedAction: "Operario recolectando en pasillo",
        symbol: "▲",
        tone: "amber",
        colors: resolveToneColors("amber"),
      };
    case "PACKED":
      return {
        label: "PACKED",
        recommendedAction: "Listos para confirmar despacho",
        symbol: "✓",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "SHIPPED":
      return {
        label: "SHIPPED",
        recommendedAction: "Despachado fuera del almacén",
        symbol: "✓",
        tone: "emerald",
        colors: resolveToneColors("emerald"),
      };
    case "ON_HOLD":
      return {
        label: "ON_HOLD",
        recommendedAction: "Ejecutar reabastecimiento o ajuste",
        symbol: "⚠",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
    case "CANCELLED":
      return {
        label: "CANCELLED",
        recommendedAction: "Pedido cancelado y reservas liberadas",
        symbol: "✕",
        tone: "rose",
        colors: resolveToneColors("rose"),
      };
  }
}
