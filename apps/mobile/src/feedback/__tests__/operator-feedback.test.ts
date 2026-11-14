// apps/mobile/src/feedback/__tests__/operator-feedback.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Vibration: {
    vibrate: vi.fn(),
  },
}));

import * as ReactNative from "react-native";
import {
  resolveFeedbackPattern,
  triggerOperatorFeedback,
} from "../operator-feedback.js";

describe("operator-feedback (multisensorial)", () => {
  it("resolves distinct patterns for success, warning and error", () => {
    const ok = resolveFeedbackPattern("success");
    const warn = resolveFeedbackPattern("warning");
    const err = resolveFeedbackPattern("error");

    expect(ok.beepCount).toBe(1);
    expect(ok.toneHz).toBeGreaterThan(warn.toneHz);
    expect(warn.toneHz).toBeGreaterThan(err.toneHz);
    expect(err.vibrationPattern.length).toBeGreaterThan(
      ok.vibrationPattern.length,
    );
  });

  it("triggers haptic vibration when enabled and skips when disabled", () => {
    const vibrateMock = vi.mocked(
      (ReactNative as unknown as { Vibration: { vibrate: (p: number[]) => void } })
        .Vibration.vibrate,
    );
    vibrateMock.mockClear();

    triggerOperatorFeedback("error", { hapticEnabled: true, soundEnabled: false });
    expect(vibrateMock).toHaveBeenCalledTimes(1);
    expect(vibrateMock).toHaveBeenCalledWith([0, 160, 70, 160]);

    vibrateMock.mockClear();
    triggerOperatorFeedback("success", { hapticEnabled: false, soundEnabled: false });
    expect(vibrateMock).not.toHaveBeenCalled();
  });
});
