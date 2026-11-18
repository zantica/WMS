// apps/web/src/context/__tests__/locale-context.test.tsx
// Tests unitarios para LocaleProvider, adaptadores de cookie/navegador, cambio de idioma en sesión y vistas traducidas.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  LOCALE_COOKIE_NAME,
  SUPPORTED_LOCALES,
  type LocaleDetectorPort,
  type LocaleStoragePort,
  type SupportedLocale,
} from "@wms/shared-types";
import {
  createBrowserLocaleDetector,
  createBrowserLocaleStorage,
  LocaleProvider,
  syncDocumentLang,
  useTranslation,
} from "../locale-context.js";
import { DashboardShell } from "../../components/dashboard-shell.js";
import { LabelPrintModal } from "../../components/labels/label-print-modal.js";

vi.mock("../supervisor-session", () => ({
  useSupervisorSession: () => ({
    session: {
      apiBaseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      warehouseId: "wh-demo",
      supervisorName: "Ana Torres",
      isConnected: true,
    },
    client: {
      generateLocationLabels: vi.fn(),
      generateProductLabels: vi.fn(),
    },
    updateSession: vi.fn(),
    testConnection: vi.fn(),
  }),
}));

function TranslationProbe(): React.JSX.Element {
  const { locale, region, availableLocales, t, formatNumber } =
    useTranslation();
  return (
    <div
      data-locale={locale}
      data-region={region}
      data-available={availableLocales.join(",")}
    >
      <span data-testid="nav-dash">{t("nav.dashboard")}</span>
      <span data-testid="delivery">{t("domain.deliveryNote")}</span>
      <span data-testid="num">{formatNumber(1234.5)}</span>
    </div>
  );
}

describe("@wms/web LocaleProvider & i18n integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hace fallback seguro a es-ES cuando useTranslation se invoca fuera de LocaleProvider", () => {
    const html = renderToStaticMarkup(<TranslationProbe />);
    expect(html).toContain('data-locale="es-ES"');
    expect(html).toContain("Albarán");
  });

  it("renderiza traducciones correctas para los 5 locales cuando se provee initialLocale", () => {
    const expectedDeliveryNotes: Record<SupportedLocale, string> = {
      "es-ES": "Albarán",
      "es-419": "Nota de entrega",
      "en-US": "Delivery note",
      "pt-BR": "Comprovante de entrega",
      "pt-PT": "Guia de remessa",
    };

    for (const locale of SUPPORTED_LOCALES) {
      const html = renderToStaticMarkup(
        <LocaleProvider initialLocale={locale}>
          <TranslationProbe />
        </LocaleProvider>,
      );
      expect(html).toContain(`data-locale="${locale}"`);
      expect(html).toContain(expectedDeliveryNotes[locale]);
    }
  });

  it("renderiza DashboardShell con selector compacto por siglas (ES/PT/EN) filtrado por región y navegación traducida", () => {
    const htmlEn = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <LocaleProvider initialLocale="en-US" timeZone="Europe/Madrid">
          <DashboardShell>
            <div>Child</div>
          </DashboardShell>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(htmlEn).toContain('data-testid="wms-locale-select"');
    expect(htmlEn).toContain('role="group"');
    expect(htmlEn).toContain('title="Español (España) (EU)"');
    expect(htmlEn).toContain('title="Português (Portugal) (EU)"');
    expect(htmlEn).toContain('title="English (US) (EU)"');
    expect(htmlEn).toContain(">ES</button>");
    expect(htmlEn).toContain(">PT</button>");
    expect(htmlEn).toContain(">EN</button>");
    expect(htmlEn).toContain('aria-pressed="true" data-locale="en-US"');
    expect(htmlEn).toContain("Control Tower");
    expect(htmlEn).toContain("Master catalog");
    expect(htmlEn).toContain("Test connection (/health)");

    const htmlPtBr = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <LocaleProvider initialLocale="pt-BR" timeZone="America/Sao_Paulo">
          <DashboardShell>
            <div>Child</div>
          </DashboardShell>
        </LocaleProvider>
      </MemoryRouter>,
    );
    expect(htmlPtBr).toContain('title="Português (Brasil) (SA)"');
    expect(htmlPtBr).toContain('title="Español (Latam) (SA)"');
    expect(htmlPtBr).toContain("Depósito ativo");
    expect(htmlPtBr).toContain("Estoque e kardex");
  });

  it("filtra availableLocales según región EU / SA y respeta initialLocale forzado", () => {
    const htmlEu = renderToStaticMarkup(
      <LocaleProvider initialLocale="es-ES" timeZone="Europe/Madrid">
        <TranslationProbe />
      </LocaleProvider>,
    );
    expect(htmlEu).toContain('data-region="EU"');
    expect(htmlEu).toContain('data-available="es-ES,pt-PT,en-US"');

    const htmlSa = renderToStaticMarkup(
      <LocaleProvider initialLocale="es-419" timeZone="America/Bogota">
        <TranslationProbe />
      </LocaleProvider>,
    );
    expect(htmlSa).toContain('data-region="SA"');
    expect(htmlSa).toContain('data-available="es-419,pt-BR,en-US"');

    // Si initialLocale='pt-BR' se fuerza en un navegador con zona horaria EU, adapta la región para incluir pt-BR
    const htmlForced = renderToStaticMarkup(
      <LocaleProvider initialLocale="pt-BR" timeZone="Europe/Madrid">
        <TranslationProbe />
      </LocaleProvider>,
    );
    expect(htmlForced).toContain('data-region="SA"');
    expect(htmlForced).toContain('data-available="es-419,pt-BR,en-US"');

    // Fallback por navigator.languages cuando la zona horaria es neutra (UTC)
    vi.stubGlobal("navigator", {
      languages: ["pt-BR", "en-US"],
      language: "pt-BR",
    });
    vi.stubGlobal("document", {
      cookie: "",
      documentElement: { lang: "es-ES" },
    });
    const htmlFallbackSa = renderToStaticMarkup(
      <LocaleProvider timeZone="UTC">
        <TranslationProbe />
      </LocaleProvider>,
    );
    expect(htmlFallbackSa).toContain('data-locale="pt-BR"');
    expect(htmlFallbackSa).toContain('data-region="SA"');
    expect(htmlFallbackSa).toContain('data-available="es-419,pt-BR,en-US"');
  });

  it("traduce LabelPrintModal según el locale activo en LocaleProvider", () => {
    const htmlEn = renderToStaticMarkup(
      <LocaleProvider initialLocale="en-US">
        <LabelPrintModal
          isOpen={true}
          onClose={() => {}}
          entityType="LOCATION"
          items={[{ id: "1", code: "A-01-01", title: "Loc A-01-01" }]}
        />
      </LocaleProvider>,
    );
    expect(htmlEn).toContain("Location Label Printing");
    expect(htmlEn).toContain("Human-readable text");
    expect(htmlEn).toContain("Print Grid");
  });

  it("persiste cookie wms_locale con SameSite=Lax, Path=/ y Max-Age=31536000 y actualiza <html lang>", () => {
    const fakeDocument = {
      cookie: "",
      documentElement: { lang: "es-ES" },
    };
    vi.stubGlobal("document", fakeDocument);

    const storage = createBrowserLocaleStorage();
    storage.setLocale("pt-BR");

    expect(fakeDocument.cookie).toContain(`${LOCALE_COOKIE_NAME}=pt-BR`);
    expect(fakeDocument.cookie).toContain("Path=/");
    expect(fakeDocument.cookie).toContain(
      `Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}`,
    );
    expect(fakeDocument.cookie).toContain("SameSite=Lax");
    expect(storage.getLocale()).toBe("pt-BR");

    syncDocumentLang("pt-BR");
    expect(fakeDocument.documentElement.lang).toBe("pt-BR");
  });

  it("detecta navigator.languages mediante createBrowserLocaleDetector y resuelve jerarquía", () => {
    vi.stubGlobal("navigator", {
      languages: ["fr-FR", "es-MX", "en-US"],
      language: "fr-FR",
    });

    const detector = createBrowserLocaleDetector();
    expect(detector.getPreferredLanguages()).toEqual([
      "fr-FR",
      "es-MX",
      "en-US",
    ]);

    const mockStorage: LocaleStoragePort = {
      getLocale: () => null,
      setLocale: vi.fn(),
    };
    const mockDetector: LocaleDetectorPort = detector;

    vi.stubGlobal("document", {
      cookie: "",
      documentElement: { lang: "es-ES" },
    });

    const html = renderToStaticMarkup(
      <LocaleProvider storage={mockStorage} detector={mockDetector}>
        <TranslationProbe />
      </LocaleProvider>,
    );
    expect(html).toContain('data-locale="es-419"');
    expect(html).toContain("Nota de entrega");
  });
});
