// apps/web/src/components/__tests__/dashboard-shell.test.tsx
// Tests para DashboardShell con la marca Navelo y verificación de assets estáticos y manifest.

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../context/locale-context.js";
import { DashboardShell } from "../dashboard-shell.js";

const mockUseSupervisorSession = vi.fn(() => ({
  session: {
    apiBaseUrl: "http://localhost:3001",
    apiKey: "demo-api-key-12345",
    warehouseId: "wh-demo",
    supervisorName: "Ana Torres",
    currentUser: null as null | {
      id: string;
      tenantId: string;
      name: string;
      email: string;
      role: "SUPERVISOR";
      isActive: boolean;
    },
    isConnected: true,
  },
  sessionFeedback: null as null | {
    type: "success" | "info" | "warning";
    message: string;
  },
  clearSessionFeedback: vi.fn(),
  updateSession: vi.fn(),
  testConnection: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("../../context/supervisor-session", () => ({
  useSupervisorSession: () => mockUseSupervisorSession(),
}));

describe("DashboardShell — Marca Navelo y Assets de Marca", () => {
  it("renderiza el icono de Navelo en .wms-brand-badge en lugar de texto plano", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <LocaleProvider initialLocale="es-ES">
          <DashboardShell>
            <div data-testid="child-content">Contenido de prueba</div>
          </DashboardShell>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(html).toContain('class="wms-brand-badge"');
    expect(html).toContain('src="/icons/navelo-icon.svg"');
    expect(html).toContain('class="wms-brand-icon"');
    expect(html).toContain('width="36"');
    expect(html).toContain('height="36"');
    expect(html).toContain('data-testid="child-content"');
    expect(html).toContain('aria-current="page"');
  });

  it("marca como activo el enlace correspondiente al pathname actual en React Router", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/locations"]}>
        <LocaleProvider initialLocale="es-ES">
          <DashboardShell>
            <div>Mapa</div>
          </DashboardShell>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(html).toContain(
      'aria-current="page" class="wms-nav-link wms-nav-link-active" href="/locations"',
    );
  });

  it("renderiza el selector de idioma compacto por siglas (ES/PT/EN) con región EU/SA y el trigger limpio de login", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <LocaleProvider initialLocale="es-ES" timeZone="Europe/Madrid">
          <DashboardShell>
            <div>Contenido</div>
          </DashboardShell>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('data-testid="wms-locale-select"');
    expect(html).toContain('class="wms-locale-segmented"');
    expect(html).toContain('title="Español (España) (EU)"');
    expect(html).toContain('title="Português (Portugal) (EU)"');
    expect(html).toContain('title="English (US) (EU)"');
    expect(html).toContain(">ES</button>");
    expect(html).toContain(">PT</button>");
    expect(html).toContain(">EN</button>");
    expect(html).not.toContain("<select");
    expect(html).not.toContain("ES-ES");
    expect(html).toContain("wms-login-trigger");
    expect(html).not.toContain('class="wms-session-chip"');
  });

  it("muestra el banner descartable de sessionFeedback cuando existe feedback de sesión", () => {
    mockUseSupervisorSession.mockReturnValueOnce({
      session: {
        apiBaseUrl: "http://localhost:3001",
        apiKey: "",
        warehouseId: "wh-demo",
        supervisorName: "Ana Torres",
        currentUser: {
          id: "u-1",
          tenantId: "demo-tenant",
          name: "Ana Torres",
          email: "ana@navelo.dev",
          role: "SUPERVISOR",
          isActive: true,
        },
        isConnected: true,
      },
      sessionFeedback: {
        type: "success",
        message: "Sesión iniciada como Ana Torres (SUPERVISOR).",
      },
      clearSessionFeedback: vi.fn(),
      updateSession: vi.fn(),
      testConnection: vi.fn(),
      logout: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/"]}>
        <LocaleProvider initialLocale="es-ES" timeZone="Europe/Madrid">
          <DashboardShell>
            <div>Contenido</div>
          </DashboardShell>
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(html).toContain('data-testid="session-feedback-banner"');
    expect(html).toContain("wms-session-feedback-success");
    expect(html).toContain("Sesión iniciada como Ana Torres (SUPERVISOR).");
    expect(html).toContain("wms-session-chip-active");
    expect(html).toContain("wms-session-active-dot");
    expect(html).toContain(">AT</span>");
  });

  it("verifica la existencia de los assets de marca en apps/web/public", () => {
    const webRoot = path.resolve(__dirname, "../../..");
    const faviconPath = path.join(webRoot, "public/favicon.ico");
    const iconSvgPath = path.join(webRoot, "public/icon.svg");
    const appleIconPath = path.join(webRoot, "public/apple-icon.png");
    const publicIconSvg = path.join(webRoot, "public/icons/navelo-icon.svg");
    const publicIcon192 = path.join(webRoot, "public/icons/navelo-icon-192.png");
    const publicIcon512 = path.join(webRoot, "public/icons/navelo-icon-512.png");
    const manifestPath = path.join(webRoot, "public/manifest.webmanifest");

    expect(fs.existsSync(faviconPath)).toBe(true);
    expect(fs.existsSync(iconSvgPath)).toBe(true);
    expect(fs.existsSync(appleIconPath)).toBe(true);
    expect(fs.existsSync(publicIconSvg)).toBe(true);
    expect(fs.existsSync(publicIcon192)).toBe(true);
    expect(fs.existsSync(publicIcon512)).toBe(true);
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("verifica el contenido y esquema de manifest.webmanifest", () => {
    const manifestPath = path.resolve(
      __dirname,
      "../../../public/manifest.webmanifest",
    );
    const content = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

    expect(content.theme_color).toBe("#0F6E56");
    expect(content.background_color).toBe("#061815");
    expect(content.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icons/navelo-icon-192.png",
          sizes: "192x192",
          type: "image/png",
        }),
        expect.objectContaining({
          src: "/icons/navelo-icon-512.png",
          sizes: "512x512",
          type: "image/png",
        }),
      ]),
    );
  });
});
