// apps/mobile/src/theme/__tests__/tokens.test.ts
// Suite de tests unitarios para los tokens de diseño compartidos (@wms/shared-types -> @wms/mobile),
// resolutores semánticos de estados (TaskStatus, TaskType, StepStatus, OrderStatus) y utilidades tipográficas.

import { describe, expect, it } from "vitest";
import {
  WMS_COLORS,
  WMS_DESIGN_TOKENS,
  WMS_FONT_SIZES,
  WMS_HANDHELD_FONT_SIZES,
  WMS_HANDHELD_TOUCH_TARGET,
  WMS_MIN_TOUCH_TARGET,
  WMS_RADII,
  WMS_SPACING,
  buildWmsCssVariables,
  monoText,
  resolveOrderStatusVisual,
  resolveStepStatusVisual,
  resolveTaskStatusVisual,
  resolveTaskTypeVisual,
  resolveToneColors,
  tabularNums,
} from "../tokens.js";

describe("mobile theme tokens & shared design system (@wms/mobile)", () => {
  it("exposes canonical S5 dark-data-dense / P2 Refinada / T3 tokens from @wms/shared-types", () => {
    expect(WMS_DESIGN_TOKENS.style).toBe("S5 dark-data-dense");
    expect(WMS_DESIGN_TOKENS.palette).toBe("P2 Refinada");
    expect(WMS_DESIGN_TOKENS.typography).toBe("T3 DM Sans + JetBrains Mono");

    expect(WMS_COLORS.bg).toBe("#0B1120");
    expect(WMS_COLORS.surface).toBe("#111A2E");
    expect(WMS_COLORS.surfaceCard).toBe("#162238");
    expect(WMS_COLORS.surfaceHover).toBe("#1E2D4A");
    expect(WMS_COLORS.border).toBe("#23334D");
    expect(WMS_COLORS.borderStrong).toBe("#334A6E");
    expect(WMS_COLORS.text).toBe("#E8EEF6");
    expect(WMS_COLORS.muted).toBe("#8CA0BA");
    expect(WMS_COLORS.accent).toBe("#38BDF8");
    expect(WMS_COLORS.accentContrast).toBe("#08172A");
    expect(WMS_COLORS.support).toBe("#34D399");
    expect(WMS_COLORS.warning).toBe("#FBBF24");
    expect(WMS_COLORS.danger).toBe("#F43F5E");

    expect(WMS_RADII).toEqual({
      sm: 4,
      md: 6,
      lg: 8,
      pill: 999,
    });

    expect(WMS_SPACING).toEqual({
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
      xxl: 24,
    });

    expect(WMS_FONT_SIZES.display).toBe(30);
    expect(WMS_MIN_TOUCH_TARGET).toBe(44);
    expect(WMS_HANDHELD_TOUCH_TARGET).toBe(64);
    expect(WMS_HANDHELD_FONT_SIZES).toEqual({
      caption: 14,
      label: 16,
      body: 18,
      heading: 22,
      scanTarget: 32,
    });
    expect(tabularNums.fontVariant).toEqual(["tabular-nums"]);
    expect(monoText.fontFamily).toBe("monospace");
    expect(monoText.fontVariant).toEqual(["tabular-nums"]);
  });

  it("resolves all semantic tones (emerald, blue, amber, rose, slate) with text, bg, border, and webTagClass", () => {
    const emerald = resolveToneColors("emerald");
    expect(emerald.text).toBe(WMS_COLORS.success);
    expect(emerald.bg).toBe(WMS_COLORS.successTint);
    expect(emerald.border).toBe(WMS_COLORS.successBorder);
    expect(emerald.webTagClass).toBe("wms-tag-emerald");

    const blue = resolveToneColors("blue");
    expect(blue.text).toBe(WMS_COLORS.accent);
    expect(blue.webTagClass).toBe("wms-tag-blue");

    const amber = resolveToneColors("amber");
    expect(amber.text).toBe(WMS_COLORS.warning);
    expect(amber.webTagClass).toBe("wms-tag-amber");

    const rose = resolveToneColors("rose");
    expect(rose.text).toBe(WMS_COLORS.danger);
    expect(rose.webTagClass).toBe("wms-tag-rose");

    const slate = resolveToneColors("slate");
    expect(slate.text).toBe(WMS_COLORS.muted);
    expect(slate.webTagClass).toBe("wms-tag-slate");
  });

  it("maps TaskStatus, TaskType, StepStatus, and OrderStatus to accessible symbols and tones", () => {
    expect(resolveTaskStatusVisual("PENDING")).toMatchObject({
      shortLabel: "PENDIENTE",
      symbol: "●",
      tone: "slate",
    });
    expect(resolveTaskStatusVisual("IN_PROGRESS")).toMatchObject({
      shortLabel: "EN CURSO",
      symbol: "▲",
      tone: "amber",
    });
    expect(resolveTaskStatusVisual("COMPLETED")).toMatchObject({
      shortLabel: "COMPLETADA",
      symbol: "✓",
      tone: "emerald",
    });
    expect(resolveTaskStatusVisual("EXCEPTION")).toMatchObject({
      shortLabel: "EXCEPCIÓN",
      symbol: "⚠",
      tone: "rose",
    });
    expect(resolveTaskStatusVisual("CANCELLED")).toMatchObject({
      shortLabel: "CANCELADA",
      symbol: "✕",
      tone: "rose",
    });

    expect(resolveTaskTypeVisual("RECEIVING").code).toBe("INBOUND · RECEIVING");
    expect(resolveTaskTypeVisual("PUTAWAY").code).toBe("STORAGE · PUTAWAY");
    expect(resolveTaskTypeVisual("PICKING").tone).toBe("amber");
    expect(resolveTaskTypeVisual("PACKING").tone).toBe("emerald");

    expect(resolveStepStatusVisual("PENDING").symbol).toBe("○");
    expect(resolveStepStatusVisual("COMPLETED").symbol).toBe("✓");
    expect(resolveStepStatusVisual("EXCEPTION").symbol).toBe("⚠");
    expect(resolveStepStatusVisual("SKIPPED").symbol).toBe("—");

    expect(resolveOrderStatusVisual("PENDING").tone).toBe("slate");
    expect(resolveOrderStatusVisual("ALLOCATED").tone).toBe("blue");
    expect(resolveOrderStatusVisual("PICKING").tone).toBe("amber");
    expect(resolveOrderStatusVisual("PACKED").tone).toBe("emerald");
    expect(resolveOrderStatusVisual("SHIPPED").tone).toBe("emerald");
    expect(resolveOrderStatusVisual("ON_HOLD").tone).toBe("rose");
    expect(resolveOrderStatusVisual("CANCELLED").tone).toBe("rose");

    const cssVars = buildWmsCssVariables();
    expect(cssVars["--bg"]).toBe("#0B1120");
    expect(cssVars["--accent"]).toBe("#38BDF8");
  });
});
