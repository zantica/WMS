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
  extractCookieValue,
  formatDate as formatDateIntl,
  formatDateTime as formatDateTimeIntl,
  formatNumber as formatNumberIntl,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  resolveLocale,
  type LocaleDetectorPort,
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

export interface LocaleContextValue {
  locale: SupportedLocale;
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
}

export function LocaleProvider({
  children,
  initialLocale,
  storage,
  detector,
}: LocaleProviderProps): JSX.Element {
  const storageAdapter = useMemo(
    () => storage ?? createBrowserLocaleStorage(),
    [storage],
  );
  const detectorAdapter = useMemo(
    () => detector ?? createBrowserLocaleDetector(),
    [detector],
  );

  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    if (initialLocale) return initialLocale;
    if (typeof document !== "undefined") {
      return resolveLocale({
        storage: storageAdapter,
        detector: detectorAdapter,
      });
    }
    return DEFAULT_LOCALE;
  });

  useEffect(() => {
    if (!initialLocale) {
      const resolved = resolveLocale({
        storage: storageAdapter,
        detector: detectorAdapter,
      });
      setLocaleState(resolved);
      syncDocumentLang(resolved);
    } else {
      syncDocumentLang(initialLocale);
    }
  }, [initialLocale, storageAdapter, detectorAdapter]);

  const setLocale = useCallback(
    (nextLocale: SupportedLocale) => {
      const normalized = normalizeLocale(nextLocale) ?? DEFAULT_LOCALE;
      setLocaleState(normalized);
      storageAdapter.setLocale(normalized);
      syncDocumentLang(normalized);
    },
    [storageAdapter],
  );

  const value = useMemo<LocaleContextValue>(() => {
    const t = createTranslator(locale);
    return {
      locale,
      setLocale,
      t,
      formatNumber: (val, options) => formatNumberIntl(locale, val, options),
      formatDate: (val, options) => formatDateIntl(locale, val, options),
      formatDateTime: (val, options) =>
        formatDateTimeIntl(locale, val, options),
    };
  }, [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

const FALLBACK_CONTEXT_VALUE: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
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
