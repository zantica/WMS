// packages/shared-types/src/i18n/ports.ts
// Puertos hexagonales puros para persistencia y detección de idioma (sin acoplamiento a DOM/HTTP).

import type { SupportedLocale } from "./types.js";

export interface LocaleStoragePort {
  getLocale(): string | null | undefined;
  setLocale(locale: SupportedLocale): void;
}

export interface LocaleDetectorPort {
  getPreferredLanguages(): readonly string[] | string | null | undefined;
}
