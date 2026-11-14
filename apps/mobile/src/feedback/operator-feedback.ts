// apps/mobile/src/feedback/operator-feedback.ts
// Feedback multisensorial inmediato (<300ms) para operarios de almacén en entornos ruidosos:
// combina vibración diferenciada + señal sonora (beep) + estado visual semántico.

import * as ReactNative from "react-native";

export type OperatorFeedbackKind = "success" | "error" | "warning";

export interface FeedbackPattern {
  /** Patrón de vibración en ms (compatible con React Native Vibration.vibrate). */
  readonly vibrationPattern: readonly number[];
  /** Frecuencia del tono principal en Hz (cuando hay salida de audio disponible). */
  readonly toneHz: number;
  /** Duración del tono en ms. */
  readonly toneDurationMs: number;
  /** Repeticiones del beep para diferenciar OK (1) de Error/Warning (2). */
  readonly beepCount: number;
}

const FEEDBACK_PATTERNS: Record<OperatorFeedbackKind, FeedbackPattern> = {
  success: {
    vibrationPattern: [0, 60],
    toneHz: 880,
    toneDurationMs: 90,
    beepCount: 1,
  },
  warning: {
    vibrationPattern: [0, 80, 60, 80],
    toneHz: 587,
    toneDurationMs: 120,
    beepCount: 2,
  },
  error: {
    vibrationPattern: [0, 160, 70, 160],
    toneHz: 240,
    toneDurationMs: 180,
    beepCount: 2,
  },
};

export function resolveFeedbackPattern(
  kind: OperatorFeedbackKind,
): FeedbackPattern {
  return FEEDBACK_PATTERNS[kind];
}

function playWebAudioBeep(pattern: FeedbackPattern): void {
  const globalObj = globalThis as typeof globalThis & {
    AudioContext?: new () => {
      currentTime: number;
      destination: unknown;
      createOscillator: () => {
        type: string;
        frequency: { setValueAtTime: (freq: number, time: number) => void };
        connect: (dest: unknown) => void;
        start: (time: number) => void;
        stop: (time: number) => void;
      };
      createGain: () => {
        gain: { setValueAtTime: (val: number, time: number) => void };
        connect: (dest: unknown) => void;
      };
      close?: () => Promise<void>;
    };
  };

  if (typeof globalObj.AudioContext !== "function") {
    return;
  }

  try {
    const ctx = new globalObj.AudioContext();
    const stepSec = (pattern.toneDurationMs + 50) / 1000;
    const durSec = pattern.toneDurationMs / 1000;

    for (let i = 0; i < pattern.beepCount; i += 1) {
      const startAt = ctx.currentTime + i * stepSec;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = pattern.toneHz < 400 ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(pattern.toneHz, startAt);
      gain.gain.setValueAtTime(0.18, startAt);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + durSec);
    }
  } catch {
    // Silenciar errores de audio en entornos sin permiso de reproducción
  }
}

export interface OperatorFeedbackOptions {
  readonly soundEnabled?: boolean;
  readonly hapticEnabled?: boolean;
}

/**
 * Dispara feedback háptico y sonoro inmediato tras un escaneo o acción operativa.
 * Nunca lanza excepciones si el hardware o entorno de test no soporta vibración/audio.
 */
export function triggerOperatorFeedback(
  kind: OperatorFeedbackKind,
  options: OperatorFeedbackOptions = {},
): FeedbackPattern {
  const { soundEnabled = true, hapticEnabled = true } = options;
  const pattern = resolveFeedbackPattern(kind);

  const rnVibration = (
    ReactNative as unknown as {
      Vibration?: { vibrate?: (pattern: number[]) => void };
    }
  ).Vibration;

  if (hapticEnabled && typeof rnVibration?.vibrate === "function") {
    try {
      rnVibration.vibrate([...pattern.vibrationPattern]);
    } catch {
      // Ignorar en entornos sin soporte de vibración
    }
  }

  if (soundEnabled) {
    playWebAudioBeep(pattern);
  }

  return pattern;
}
