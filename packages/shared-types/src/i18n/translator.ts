// packages/shared-types/src/i18n/translator.ts
// Motor puro de traducción con interpolación {param} y formateadores nativos Intl.

import { enUS } from "./locales/en-US.js";
import { es419 } from "./locales/es-419.js";
import { esES } from "./locales/es-ES.js";
import { ptBR } from "./locales/pt-BR.js";
import { ptPT } from "./locales/pt-PT.js";
import {
  DEFAULT_LOCALE,
  type SupportedLocale,
  type TranslationDictionary,
  type TranslationKey,
  type TranslationParams,
} from "./types.js";

export const DICTIONARIES: Readonly<
  Record<SupportedLocale, TranslationDictionary>
> = {
  "es-ES": esES,
  "es-419": es419,
  "en-US": enUS,
  "pt-BR": ptBR,
  "pt-PT": ptPT,
} as const;

export function getDictionary(locale: SupportedLocale): TranslationDictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

function lookupKey(
  dictionary: TranslationDictionary,
  key: string,
): string | undefined {
  const parts = key.split(".");
  let current: unknown = dictionary;

  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : undefined;
}

function interpolate(
  template: string,
  params?: TranslationParams,
): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, paramName: string) => {
    if (Object.prototype.hasOwnProperty.call(params, paramName)) {
      const value = params[paramName];
      return value !== undefined ? String(value) : match;
    }
    return match;
  });
}

/**
 * Traduce una clave tipada al locale indicado, con interpolación `{param}`.
 */
export function translate(
  locale: SupportedLocale,
  key: TranslationKey,
  params?: TranslationParams,
): string {
  const primary = lookupKey(getDictionary(locale), key);
  const template =
    primary ?? lookupKey(getDictionary(DEFAULT_LOCALE), key) ?? key;
  return interpolate(template, params);
}

export type TranslatorFn = (
  key: TranslationKey,
  params?: TranslationParams,
) => string;

export function createTranslator(locale: SupportedLocale): TranslatorFn {
  return (key: TranslationKey, params?: TranslationParams) =>
    translate(locale, key, params);
}

/**
 * Formatea un número usando `Intl.NumberFormat` nativo para el locale activo.
 */
export function formatNumber(
  locale: SupportedLocale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Formatea una fecha usando `Intl.DateTimeFormat` nativo para el locale activo.
 */
export function formatDate(
  locale: SupportedLocale,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * Formatea fecha y hora cortas usando `Intl.DateTimeFormat` nativo.
 */
export function formatDateTime(
  locale: SupportedLocale,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  return formatDate(locale, value, {
    dateStyle: "short",
    timeStyle: "short",
    ...options,
  });
}
