// apps/web/src/context/locale-context.tsx
// Contexto i18n de @wms/web con adaptadores de navegador (cookie wms_locale + navigator.languages + <html lang>).

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import {
  createTranslator,
  DEFAULT_LOCALE,
  detectRegionFromContext,
  extractCookieValue,
  formatDate as formatDateIntl,
  formatDateTime as formatDateTimeIntl,
  formatNumber as formatNumberIntl,
  getLocalesForRegion,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  LOCALE_METADATA,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  type LocaleDetectorPort,
  type LocaleRegion,
  type LocaleStoragePort,
  type SupportedLocale,
  type TranslationKey,
  type TranslationParams,
} from "@wms/shared-types";

export function createBrowserLocaleStorage(): LocaleStoragePort {
  return {
    getLocale(): string | null {
      if (typeof document === "undefined") return null;
      return extractCookieValue(document.cookie, LOCALE_COOKIE_NAME);
    },
    setLocale(locale: SupportedLocale): void {
      if (typeof document === "undefined") return;
      document.cookie = `${LOCALE_COOKIE_NAME}=${encodeURIComponent(locale)}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    },
  };
}

export function createBrowserLocaleDetector(): LocaleDetectorPort {
  return {
    getPreferredLanguages(): readonly string[] {
      if (typeof navigator === "undefined") return [];
      if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
        return navigator.languages;
      }
      return navigator.language ? [navigator.language] : [];
    },
  };
}

export function syncDocumentLang(locale: SupportedLocale): void {
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = locale;
  }
}

export function detectBrowserTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.trim().length > 0 ? tz : null;
  } catch {
    return null;
  }
}

export interface LocaleContextValue {
  locale: SupportedLocale;
  region: LocaleRegion;
  availableLocales: readonly SupportedLocale[];
  setLocale: (nextLocale: SupportedLocale) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (
    value: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatDateTime: (
    value: Date | string | number,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export interface LocaleProviderProps {
  children: ReactNode;
  initialLocale?: SupportedLocale | undefined;
  storage?: LocaleStoragePort | undefined;
  detector?: LocaleDetectorPort | undefined;
  timeZone?: string | null | undefined;
}

function normalizeLanguageList(
  raw: readonly string[] | string | null | undefined,
): readonly string[] {
  if (!raw) return [];
  return typeof raw === "string" ? parseAcceptLanguage(raw) : raw;
}

function resolveInitialRegionAndLocale(params: {
  initialLocale?: SupportedLocale | undefined;
  storage: LocaleStoragePort;
  detector: LocaleDetectorPort;
  timeZone?: string | null | undefined;
  isBrowser: boolean;
}): { locale: SupportedLocale; detectedRegion: LocaleRegion } {
  const { initialLocale, storage, detector, timeZone, isBrowser } = params;
  const resolvedTimeZone =
    timeZone !== undefined ? timeZone : detectBrowserTimeZone();
  const preferredLanguages = normalizeLanguageList(
    detector.getPreferredLanguages(),
  );
  const detectedRegion = detectRegionFromContext(
    resolvedTimeZone,
    preferredLanguages,
  );

  if (initialLocale) {
    return { locale: initialLocale, detectedRegion };
  }

  if (isBrowser) {
    const resolved = resolveLocale({ storage, detector });
    const hasCookieMatch = Boolean(normalizeLocale(storage.getLocale()));
    const hasBrowserMatch = preferredLanguages.some((lang) =>
      Boolean(normalizeLocale(lang)),
    );
    if (!hasCookieMatch && !hasBrowserMatch && detectedRegion === "SA") {
      return { locale: "es-419", detectedRegion };
    }
    return { locale: resolved, detectedRegion };
  }

  return {
    locale: detectedRegion === "SA" ? "es-419" : DEFAULT_LOCALE,
    detectedRegion,
  };
}

export function LocaleProvider({
  children,
  initialLocale,
  storage,
  detector,
  timeZone,
}: LocaleProviderProps): JSX.Element {
  const storageAdapter = useMemo(
    () => storage ?? createBrowserLocaleStorage(),
    [storage],
  );
  const detectorAdapter = useMemo(
    () => detector ?? createBrowserLocaleDetector(),
    [detector],
  );

  const initialResolution = resolveInitialRegionAndLocale({
    initialLocale,
    storage: storageAdapter,
    detector: detectorAdapter,
    timeZone,
    isBrowser: typeof document !== "undefined",
  });

  const [locale, setLocaleState] = useState<SupportedLocale>(
    initialResolution.locale,
  );

  const detectedRegion = useMemo(
    () =>
      detectRegionFromContext(
        timeZone !== undefined ? timeZone : detectBrowserTimeZone(),
        normalizeLanguageList(detectorAdapter.getPreferredLanguages()),
      ),
    [timeZone, detectorAdapter],
  );

  useEffect(() => {
    if (!initialLocale) {
      const { locale: resolved } = resolveInitialRegionAndLocale({
        storage: storageAdapter,
        detector: detectorAdapter,
        timeZone,
        isBrowser: true,
      });
      setLocaleState(resolved);
      syncDocumentLang(resolved);
    } else {
      syncDocumentLang(initialLocale);
    }
  }, [initialLocale, storageAdapter, detectorAdapter, timeZone]);

  const setLocale = useCallback(
    (nextLocale: SupportedLocale) => {
      const normalized = normalizeLocale(nextLocale) ?? DEFAULT_LOCALE;
      setLocaleState(normalized);
      storageAdapter.setLocale(normalized);
      syncDocumentLang(normalized);
    },
    [storageAdapter],
  );

  const { region, availableLocales } = useMemo(() => {
    const candidateLocales = getLocalesForRegion(detectedRegion);
    if (candidateLocales.includes(locale)) {
      return {
        region: detectedRegion,
        availableLocales: candidateLocales,
      };
    }
    const fallbackRegion = LOCALE_METADATA[locale].regions[0] ?? detectedRegion;
    return {
      region: fallbackRegion,
      availableLocales: getLocalesForRegion(fallbackRegion),
    };
  }, [detectedRegion, locale]);

  const value = useMemo<LocaleContextValue>(() => {
    const t = createTranslator(locale);
    return {
      locale,
      region,
      availableLocales,
      setLocale,
      t,
      formatNumber: (val, options) => formatNumberIntl(locale, val, options),
      formatDate: (val, options) => formatDateIntl(locale, val, options),
      formatDateTime: (val, options) =>
        formatDateTimeIntl(locale, val, options),
    };
  }, [locale, region, availableLocales, setLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

const FALLBACK_CONTEXT_VALUE: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  region: "EU",
  availableLocales: getLocalesForRegion("EU"),
  setLocale: () => {},
  t: createTranslator(DEFAULT_LOCALE),
  formatNumber: (val, options) =>
    formatNumberIntl(DEFAULT_LOCALE, val, options),
  formatDate: (val, options) => formatDateIntl(DEFAULT_LOCALE, val, options),
  formatDateTime: (val, options) =>
    formatDateTimeIntl(DEFAULT_LOCALE, val, options),
};

/**
 * Hook para acceder a `t`, `locale`, `setLocale` y formateadores `Intl`.
 * Si se invoca fuera de `<LocaleProvider>` (p. ej. en tests unitarios aislados),
 * hace fallback seguro a `DEFAULT_LOCALE` ('es-ES').
 */
export function useTranslation(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  return ctx ?? FALLBACK_CONTEXT_VALUE;
}
