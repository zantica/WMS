// apps/mobile/src/theme/tokens.ts
// Adaptador móvil del Design System compartido de WMS SaaS (S5 dark-data-dense / P2 Refinada / T3).
// Re-exporta los tokens canónicos desde @wms/shared-types y añade utilidades tipográficas para React Native.

import {
  WMS_COLORS,
  WMS_DESIGN_TOKENS,
  WMS_FONT_SIZES,
  WMS_RADII,
  WMS_SPACING,
  buildWmsCssVariables,
  resolveOrderStatusVisual,
  resolveStepStatusVisual,
  resolveTaskStatusVisual,
  resolveTaskTypeVisual,
  resolveToneColors,
  type WmsOrderStatusVisual,
  type WmsStepStatusVisual,
  type WmsTaskStatusVisual,
  type WmsTaskTypeVisual,
  type WmsTone,
  type WmsToneColors,
} from "@wms/shared-types";
import type { TextStyle } from "react-native";

export {
  WMS_COLORS,
  WMS_DESIGN_TOKENS,
  WMS_FONT_SIZES,
  WMS_RADII,
  WMS_SPACING,
  buildWmsCssVariables,
  resolveOrderStatusVisual,
  resolveStepStatusVisual,
  resolveTaskStatusVisual,
  resolveTaskTypeVisual,
  resolveToneColors,
  type WmsOrderStatusVisual,
  type WmsStepStatusVisual,
  type WmsTaskStatusVisual,
  type WmsTaskTypeVisual,
  type WmsTone,
  type WmsToneColors,
};

/**
 * Target táctil mínimo de 44px exigido por la guía base de accesibilidad (Checklist C / D).
 */
export const WMS_MIN_TOUCH_TARGET = 44 as const;

/**
 * Target táctil ergonómico para operarios con guantes y uso a una mano (64dp).
 */
export const WMS_HANDHELD_TOUCH_TARGET = 64 as const;

/**
 * Escala tipográfica ergonómica para lectura rápida a distancia de brazo en almacén.
 */
export const WMS_HANDHELD_FONT_SIZES = {
  caption: 14,
  label: 16,
  body: 18,
  heading: 22,
  scanTarget: 32,
} as const;

export type WmsHandedness = "right" | "left";

/**
 * Estilo tipográfico para números tabulares en React Native (`tabular-nums`).
 */
export const tabularNums: TextStyle = {
  fontVariant: ["tabular-nums"],
};

/**
 * Estilo tipográfico monoespaciado con números tabulares para SKUs, ubicaciones, cantidades e IDs.
 */
export const monoText: TextStyle = {
  fontFamily: "monospace",
  fontVariant: ["tabular-nums"],
};
