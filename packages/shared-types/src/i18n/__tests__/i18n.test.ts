// packages/shared-types/src/i18n/__tests__/i18n.test.ts
// Suite de tests unitarios para el motor i18n, paridad de diccionarios y resolutores visuales.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTranslator,
  DEFAULT_LOCALE,
  DICTIONARIES,
  extractCookieValue,
  formatDate,
  formatDateTime,
  formatNumber,
  LOCALE_COOKIE_NAME,
  LOCALE_METADATA,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  resolveOrderStatusVisual,
  resolveStepStatusVisual,
  resolveTaskStatusVisual,
  resolveTaskTypeVisual,
  SUPPORTED_LOCALES,
  translate,
  type LocaleDetectorPort,
  type LocaleStoragePort,
  type SupportedLocale,
} from "../../index.js";

function collectLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectLeafKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe("@wms/shared-types i18n", () => {
  describe("paridad de diccionarios (5 locales)", () => {
    it("tiene paridad del 100% de claves entre es-ES y las otras 4 variantes", () => {
      const baseKeys = collectLeafKeys(
        DICTIONARIES["es-ES"] as unknown as Record<string, unknown>,
      );
      expect(baseKeys.length).toBeGreaterThan(200);

      for (const locale of SUPPORTED_LOCALES) {
        const localeKeys = collectLeafKeys(
          DICTIONARIES[locale] as unknown as Record<string, unknown>,
        );
        expect(localeKeys, `Paridad fallida en ${locale}`).toEqual(baseKeys);
      }
    });

    it("mantiene sincronizados los módulos TS con los 5 JSON canónicos", () => {
      const localesDir = path.resolve(process.cwd(), "src/i18n/locales");

      for (const locale of SUPPORTED_LOCALES) {
        const raw = fs.readFileSync(
          path.join(localesDir, `${locale}.json`),
          "utf8",
        );
        const parsed = JSON.parse(raw) as unknown;
        expect(DICTIONARIES[locale]).toEqual(parsed);
      }
    });

    it("expone metadata completa para los 5 locales soportados", () => {
      expect(SUPPORTED_LOCALES).toEqual([
        "es-ES",
        "es-419",
        "en-US",
        "pt-BR",
        "pt-PT",
      ]);
      expect(DEFAULT_LOCALE).toBe("es-ES");
      expect(LOCALE_COOKIE_NAME).toBe("wms_locale");
      for (const locale of SUPPORTED_LOCALES) {
        expect(LOCALE_METADATA[locale].locale).toBe(locale);
        expect(LOCALE_METADATA[locale].shortLabel).toBe(
          locale.toUpperCase(),
        );
        expect(LOCALE_METADATA[locale].nativeName.length).toBeGreaterThan(3);
      }
    });
  });

  describe("traducción e interpolación", () => {
    it("traduce términos regionales específicos correctamente", () => {
      expect(translate("es-ES", "domain.deliveryNote")).toBe("Albarán");
      expect(translate("es-419", "domain.deliveryNote")).toBe("Nota de entrega");
      expect(translate("en-US", "domain.deliveryNote")).toBe("Delivery note");
      expect(translate("pt-BR", "domain.deliveryNote")).toBe(
        "Comprovante de entrega",
      );
      expect(translate("pt-PT", "domain.deliveryNote")).toBe("Guia de remessa");

      expect(translate("pt-BR", "domain.picking")).toBe("Separação");
      expect(translate("pt-PT", "domain.picking")).toBe("Picking");
      expect(translate("pt-BR", "domain.rack")).toBe("Porta-paletes");
      expect(translate("pt-PT", "domain.rack")).toBe("Estanteria");
    });

    it("interpola parámetros {param} incluyendo valores 0", () => {
      expect(
        translate("es-ES", "common.confirmDelete", { name: "RACK-01" }),
      ).toBe("¿Seguro que quieres eliminar RACK-01?");
      expect(
        translate("en-US", "locations.totalToCreate", { count: 0 }),
      ).toBe("Locations to create: 0");
      expect(
        translate("pt-BR", "locations.generationSuccess", { count: 24 }),
      ).toBe("24 endereços criados");

      // Parámetro no provisto se conserva como placeholder legible
      expect(translate("es-ES", "common.confirmDelete")).toBe(
        "¿Seguro que quieres eliminar {name}?",
      );
    });

    it("createTranslator vincula el locale seleccionado", () => {
      const t = createTranslator("en-US");
      expect(t("nav.dashboard")).toBe("Dashboard");
      expect(t("validation.minValue", { min: 1 })).toBe("Minimum value: 1");
    });
  });

  describe("formateo nativo Intl", () => {
    it("formatea números según las convenciones regionales", () => {
      expect(formatNumber("en-US", 1234.5)).toBe("1,234.5");
      expect(formatNumber("es-ES", 1234.5, { minimumFractionDigits: 1 })).toContain(
        "234,5",
      );
      expect(formatNumber("pt-BR", 1234.5)).toBe("1.234,5");
    });

    it("formatea fechas válidas y devuelve cadena vacía ante fecha inválida", () => {
      const sample = "2026-11-17T12:00:00Z";
      expect(formatDate("en-US", sample).length).toBeGreaterThan(4);
      expect(formatDate("es-ES", sample).length).toBeGreaterThan(4);
      expect(formatDateTime("pt-BR", sample).length).toBeGreaterThan(6);
      expect(formatDate("es-ES", "invalid-date")).toBe("");
    });
  });

  describe("normalizeLocale y resolución jerárquica", () => {
    it("normaliza alias cortos y variantes regionales", () => {
      const cases: Array<[string | null | undefined, SupportedLocale | null]> = [
        ["es", "es-ES"],
        ["es-ES", "es-ES"],
        ["es_es", "es-ES"],
        ["es-419", "es-419"],
        ["es-MX", "es-419"],
        ["es-AR", "es-419"],
        ["es-CO", "es-419"],
        ["es-CL", "es-419"],
        ["en", "en-US"],
        ["en-US", "en-US"],
        ["en-GB", "en-US"],
        ["pt-BR", "pt-BR"],
        ["pt_br", "pt-BR"],
        ["pt", "pt-PT"],
        ["pt-PT", "pt-PT"],
        ["pt-AO", "pt-PT"],
        ["fr-FR", null],
        ["*", null],
        ["", null],
        [null, null],
        [undefined, null],
      ];

      for (const [input, expected] of cases) {
        expect(normalizeLocale(input), `input=${String(input)}`).toBe(expected);
      }
    });

    it("parsea Accept-Language respetando pesos q-value", () => {
      expect(
        parseAcceptLanguage("fr-FR,en-GB;q=0.7,pt-BR;q=0.9,de;q=0"),
      ).toEqual(["fr-FR", "pt-BR", "en-GB"]);
    });

    it("extrae wms_locale de cabeceras Cookie completas", () => {
      expect(
        extractCookieValue("theme=dark; wms_locale=pt-BR; foo=bar"),
      ).toBe("pt-BR");
      expect(extractCookieValue("theme=dark; foo=bar")).toBeNull();
    });

    it("aplica jerarquía estricta Cookie -> Navegador -> Fallback es-ES", () => {
      // 1) Cookie gana sobre navegador
      expect(
        resolveLocale({
          cookieHeaderOrValue: "foo=1; wms_locale=pt-PT",
          acceptLanguageOrNavigatorLanguages: "en-US,es-MX;q=0.9",
        }),
      ).toBe("pt-PT");

      // Cookie con alias corto normalizado
      expect(
        resolveLocale({
          cookieHeaderOrValue: "en",
          acceptLanguageOrNavigatorLanguages: ["es-MX"],
        }),
      ).toBe("en-US");

      // 2) Cookie inválida/ausente -> Autodetección navegador
      expect(
        resolveLocale({
          cookieHeaderOrValue: "wms_locale=fr-FR",
          acceptLanguageOrNavigatorLanguages: ["de-DE", "es-AR", "en-US"],
        }),
      ).toBe("es-419");

      expect(
        resolveLocale({
          acceptLanguageOrNavigatorLanguages: "fr-CH,pt-BR;q=0.8,en;q=0.7",
        }),
      ).toBe("pt-BR");

      // 3) Puertos inyectados (Hexagonal)
      const storage: LocaleStoragePort = {
        getLocale: () => null,
        setLocale: () => {},
      };
      const detector: LocaleDetectorPort = {
        getPreferredLanguages: () => ["en-GB"],
      };
      expect(resolveLocale({ storage, detector })).toBe("en-US");

      // 4) Fallback final a 'es-ES'
      expect(
        resolveLocale({
          cookieHeaderOrValue: "",
          acceptLanguageOrNavigatorLanguages: ["fr-FR", "ja-JP"],
        }),
      ).toBe("es-ES");
      expect(resolveLocale()).toBe("es-ES");
    });
  });

  describe("resolutores visuales retrocompatibles en design-tokens", () => {
    it("mantiene 100% retrocompatibilidad sin parámetro locale (default es-ES)", () => {
      expect(resolveTaskStatusVisual("PENDING").label).toBe(
        "Pendiente de inicio",
      );
      expect(resolveTaskStatusVisual("IN_PROGRESS").shortLabel).toBe("EN CURSO");
      expect(resolveTaskTypeVisual("RECEIVING").label).toBe(
        "Recepción en muelle",
      );
      expect(resolveStepStatusVisual("SKIPPED").label).toBe("OMITIDO");
      expect(resolveOrderStatusVisual("ALLOCATED").recommendedAction).toBe(
        "En cola de picking móvil",
      );
    });

    it("traduce etiquetas visuales cuando se pasa locale explícito", () => {
      expect(resolveTaskStatusVisual("COMPLETED", "en-US").label).toBe(
        "Completed and posted",
      );
      expect(resolveTaskStatusVisual("EXCEPTION", "pt-PT").shortLabel).toBe(
        "OCORRÊNCIA",
      );
      expect(resolveTaskTypeVisual("PICKING", "pt-BR").label).toBe(
        "Separação guiada",
      );
      expect(resolveStepStatusVisual("COMPLETED", "en-US").label).toBe(
        "COMPLETED",
      );
      expect(
        resolveOrderStatusVisual("SHIPPED", "pt-PT").recommendedAction,
      ).toBe("Expedido do armazém");
    });
  });
});
