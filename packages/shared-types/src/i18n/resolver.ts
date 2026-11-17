// packages/shared-types/src/i18n/resolver.ts
// Normalización de variantes regionales y resolución jerárquica Cookie -> Navegador -> Fallback.

import type { LocaleDetectorPort, LocaleStoragePort } from "./ports.js";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  type SupportedLocale,
} from "./types.js";

/**
 * Normaliza un código de idioma o etiqueta BCP-47 a uno de los 5 locales soportados.
 * Reglas:
 * - 'es' | 'es-ES' -> 'es-ES'
 * - 'es-419' | 'es-MX' | 'es-AR' | 'es-CO' | 'es-CL' | 'es-*' -> 'es-419'
 * - 'en' | 'en-*' -> 'en-US'
 * - 'pt-BR' | 'pt-BR-*' -> 'pt-BR'
 * - 'pt' | 'pt-PT' | 'pt-*' -> 'pt-PT'
 */
export function normalizeLocale(
  raw: string | null | undefined,
): SupportedLocale | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/_/g, "-").toLowerCase();
  if (cleaned.length === 0 || cleaned === "*") return null;

  if (cleaned === "es" || cleaned === "es-es") {
    return "es-ES";
  }
  if (cleaned.startsWith("es-")) {
    return "es-419";
  }
  if (cleaned === "en" || cleaned.startsWith("en-")) {
    return "en-US";
  }
  if (cleaned === "pt-br" || cleaned.startsWith("pt-br-")) {
    return "pt-BR";
  }
  if (cleaned === "pt" || cleaned === "pt-pt" || cleaned.startsWith("pt-")) {
    return "pt-PT";
  }

  return null;
}

/**
 * Parsea una cabecera HTTP `Accept-Language` ordenando por peso `q` descendente
 * y manteniendo el orden relativo en empates. Ignora entradas con `q=0`.
 */
export function parseAcceptLanguage(header: string): string[] {
  if (!header.trim()) return [];

  const entries = header
    .split(",")
    .map((part, index) => {
      const segments = part.trim().split(";");
      const lang = (segments[0] ?? "").trim();
      let q = 1.0;

      for (let i = 1; i < segments.length; i += 1) {
        const param = (segments[i] ?? "").trim().toLowerCase();
        if (param.startsWith("q=")) {
          const parsed = Number.parseFloat(param.slice(2));
          if (!Number.isNaN(parsed)) {
            q = Math.max(0, Math.min(1, parsed));
          }
        }
      }

      return { lang, q, index };
    })
    .filter((entry) => entry.lang.length > 0 && entry.q > 0);

  entries.sort((a, b) => {
    if (b.q !== a.q) return b.q - a.q;
    return a.index - b.index;
  });

  return entries.map((entry) => entry.lang);
}

/**
 * Extrae el valor de una cookie específica desde una cabecera `Cookie` o `document.cookie`.
 */
export function extractCookieValue(
  cookieHeader: string,
  cookieName: string = LOCALE_COOKIE_NAME,
): string | null {
  if (!cookieHeader.trim()) return null;

  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = pair.slice(0, eqIndex).trim();
    if (key === cookieName) {
      const rawValue = pair.slice(eqIndex + 1).trim();
      try {
        return decodeURIComponent(rawValue);
      } catch {
        return rawValue;
      }
    }
  }
  return null;
}

function resolveFromCookieInput(
  cookieHeaderOrValue: string | null | undefined,
): SupportedLocale | null {
  if (!cookieHeaderOrValue) return null;
  const trimmed = cookieHeaderOrValue.trim();
  if (!trimmed) return null;

  // Si contiene '=' o ';', puede ser una cabecera Cookie completa ("a=1; wms_locale=pt-BR")
  if (trimmed.includes("=")) {
    const extracted = extractCookieValue(trimmed, LOCALE_COOKIE_NAME);
    if (extracted) {
      return normalizeLocale(extracted);
    }
    // Si no contiene wms_locale pero sí otro '=', no es un valor directo válido
    return null;
  }

  return normalizeLocale(trimmed);
}

function resolveFromBrowserLanguages(
  input: readonly string[] | string | null | undefined,
): SupportedLocale | null {
  if (!input) return null;
  const candidates =
    typeof input === "string" ? parseAcceptLanguage(input) : input;

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized) return normalized;
  }
  return null;
}

export interface ResolveLocaleOptions {
  cookieHeaderOrValue?: string | null | undefined;
  acceptLanguageOrNavigatorLanguages?:
    | string
    | readonly string[]
    | null
    | undefined;
  storage?: LocaleStoragePort | undefined;
  detector?: LocaleDetectorPort | undefined;
}

/**
 * Resuelve el idioma activo aplicando la jerarquía estricta:
 * 1) Cookie `wms_locale` (vía `cookieHeaderOrValue` o `storage`)
 * 2) Autodetección del navegador (`Accept-Language` / `navigator.languages` o `detector`)
 * 3) Fallback `DEFAULT_LOCALE` ('es-ES')
 */
export function resolveLocale(options?: ResolveLocaleOptions): SupportedLocale {
  if (!options) return DEFAULT_LOCALE;

  const cookieCandidate =
    options.cookieHeaderOrValue ?? options.storage?.getLocale();
  const fromCookie = resolveFromCookieInput(cookieCandidate);
  if (fromCookie) return fromCookie;

  const browserCandidate =
    options.acceptLanguageOrNavigatorLanguages ??
    options.detector?.getPreferredLanguages();
  const fromBrowser = resolveFromBrowserLanguages(browserCandidate);
  if (fromBrowser) return fromBrowser;

  return DEFAULT_LOCALE;
}
