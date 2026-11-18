// packages/shared-types/src/i18n/types.ts
// Tipos puros y metadata regional del sistema i18n (@wms/shared-types).

import type { esES } from "./locales/es-ES.js";

export type SupportedLocale = "es-ES" | "es-419" | "en-US" | "pt-BR" | "pt-PT";

export type LocaleRegion = "EU" | "SA";

export type LocaleShortCode = "ES" | "PT" | "EN";

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  "es-ES",
  "es-419",
  "en-US",
  "pt-BR",
  "pt-PT",
] as const;

export const DEFAULT_LOCALE: SupportedLocale = "es-ES";
export const LOCALE_COOKIE_NAME = "wms_locale" as const;
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 31536000 as const; // 1 año (365 días)

export interface LocaleMetadata {
  readonly locale: SupportedLocale;
  readonly code: LocaleShortCode;
  readonly shortLabel: string;
  readonly nativeName: string;
  readonly htmlLang: SupportedLocale;
  readonly regions: readonly LocaleRegion[];
}

export const LOCALE_METADATA: Readonly<Record<SupportedLocale, LocaleMetadata>> = {
  "es-ES": {
    locale: "es-ES",
    code: "ES",
    shortLabel: "ES-ES",
    nativeName: "Español (España)",
    htmlLang: "es-ES",
    regions: ["EU"],
  },
  "es-419": {
    locale: "es-419",
    code: "ES",
    shortLabel: "ES-419",
    nativeName: "Español (Latam)",
    htmlLang: "es-419",
    regions: ["SA"],
  },
  "en-US": {
    locale: "en-US",
    code: "EN",
    shortLabel: "EN-US",
    nativeName: "English (US)",
    htmlLang: "en-US",
    regions: ["EU", "SA"],
  },
  "pt-BR": {
    locale: "pt-BR",
    code: "PT",
    shortLabel: "PT-BR",
    nativeName: "Português (Brasil)",
    htmlLang: "pt-BR",
    regions: ["SA"],
  },
  "pt-PT": {
    locale: "pt-PT",
    code: "PT",
    shortLabel: "PT-PT",
    nativeName: "Português (Portugal)",
    htmlLang: "pt-PT",
    regions: ["EU"],
  },
} as const;

export type DeepStringRecord<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : DeepStringRecord<T[K]>;
};

export type TranslationDictionary = DeepStringRecord<typeof esES>;

type NestedKeysLevel2<T> = {
  [K in Extract<keyof T, string>]: T[K] extends string
    ? K
    : T[K] extends Record<string, unknown>
      ? `${K}.${Extract<keyof T[K], string>}`
      : never;
}[Extract<keyof T, string>];

type NestedKeys<T> = {
  [K in Extract<keyof T, string>]: T[K] extends string
    ? K
    : T[K] extends Record<string, unknown>
      ? `${K}.${NestedKeysLevel2<T[K]>}`
      : never;
}[Extract<keyof T, string>];

export type TranslationKey = NestedKeys<typeof esES>;

export type TranslationParams = Readonly<Record<string, string | number>>;
