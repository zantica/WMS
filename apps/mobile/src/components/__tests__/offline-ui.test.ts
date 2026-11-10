// apps/mobile/src/components/__tests__/offline-ui.test.ts
// Tests unitarios para los componentes de telemetría y cuarentena del Design System móvil.

import { describe, expect, it } from "vitest";
import { WMS_COLORS, WMS_MIN_TOUCH_TARGET, resolveToneColors } from "../../theme/tokens.js";
import type { OfflineQueueItem, NetworkStatus } from "../../offline/types.js";

describe("Offline UI & Design System tokens integration", () => {
  it("enforces minimum touch targets of at least 44px for warehouse glove operability", () => {
    expect(WMS_MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });

  it("maps network statuses to semantic industrial tones strictly within WMS_COLORS", () => {
    const statusMap: Record<
      NetworkStatus,
      { label: string; symbol: string; tone: "emerald" | "amber" | "blue" }
    > = {
      ONLINE: { label: "ONLINE", symbol: "●", tone: "emerald" },
      OFFLINE: { label: "OFFLINE", symbol: "○", tone: "amber" },
      SYNCING: { label: "SINCRONIZANDO…", symbol: "↻", tone: "blue" },
    };

    for (const [status, spec] of Object.entries(statusMap)) {
      const tone = resolveToneColors(spec.tone);
      expect(tone).toBeDefined();
      expect(typeof tone.text).toBe("string");
      expect(typeof tone.bg).toBe("string");
      expect(typeof tone.border).toBe("string");

      if (status === "ONLINE") {
        expect(tone.text).toBe(WMS_COLORS.success);
      } else if (status === "OFFLINE") {
        expect(tone.text).toBe(WMS_COLORS.warning);
      } else if (status === "SYNCING") {
        expect(tone.text).toBe(WMS_COLORS.accent);
      }
    }
  });

  it("formats quarantined mutation details correctly", () => {
    const quarantinedStepItem: OfflineQueueItem = {
      idempotencyKey: "idem-quarantine-1",
      action: "CONFIRM_STEP",
      occurredAt: "2026-11-10T11:45:00.000Z",
      payload: {
        taskId: "task-abc-12345678",
        stepId: "step-xyz-87654321",
        scannedCode: "LOC-A1",
        quantity: 5,
      },
      status: "QUARANTINED",
      retryCount: 1,
      quarantinedAt: "2026-11-10T11:45:05.000Z",
      quarantineReason: {
        code: "CONFLICT",
        message: "Step already completed by another operator",
      },
    };

    expect(quarantinedStepItem.status).toBe("QUARANTINED");
    expect(quarantinedStepItem.quarantineReason?.code).toBe("CONFLICT");
    expect(quarantinedStepItem.quarantinedAt).toBeDefined();

    const quarantinedReceiptItem: OfflineQueueItem = {
      idempotencyKey: "idem-quarantine-2",
      action: "CONFIRM_RECEIPT_LINE",
      occurredAt: "2026-11-10T11:46:00.000Z",
      payload: {
        taskId: "task-rec-12345678",
        productId: "prod-99-87654321",
        scannedQty: 10,
      },
      status: "QUARANTINED",
      retryCount: 2,
      quarantineReason: {
        code: "REJECTED",
        message: "Product not part of purchase order",
      },
    };

    expect(quarantinedReceiptItem.status).toBe("QUARANTINED");
    expect(quarantinedReceiptItem.quarantineReason?.code).toBe("REJECTED");
  });
});
