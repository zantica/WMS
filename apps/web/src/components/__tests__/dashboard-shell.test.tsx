// apps/web/src/components/__tests__/dashboard-shell.test.tsx
// Tests para DashboardShell con la marca Navelo y verificación de assets estáticos y manifest.

import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../context/locale-context.js";
import { DashboardShell } from "../dashboard-shell.js";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../../context/supervisor-session", () => ({
  useSupervisorSession: () => ({
    session: {
      apiBaseUrl: "http://localhost:3001",
      apiKey: "demo-api-key-12345",
      warehouseId: "wh-demo",
      supervisorName: "Ana Torres",
    },
    saveSession: vi.fn(),
    resetSession: vi.fn(),
  }),
}));

describe("DashboardShell — Marca Navelo y Assets de Marca", () => {
  it("renderiza el icono de Navelo en .wms-brand-badge en lugar de texto plano", () => {
    const html = renderToStaticMarkup(
      <LocaleProvider initialLocale="es-ES">
        <DashboardShell>
          <div data-testid="child-content">Contenido de prueba</div>
        </DashboardShell>
      </LocaleProvider>,
    );

    expect(html).toContain('class="wms-brand-badge"');
    expect(html).toContain('src="/icons/navelo-icon.svg"');
    expect(html).toContain('class="wms-brand-icon"');
    expect(html).toContain('width="36"');
    expect(html).toContain('height="36"');
    expect(html).toContain('data-testid="child-content"');
  });

  it("verifica la existencia de los assets de marca en apps/web", () => {
    const webRoot = path.resolve(__dirname, "../../..");
    const faviconPath = path.join(webRoot, "src/app/favicon.ico");
    const iconSvgPath = path.join(webRoot, "src/app/icon.svg");
    const appleIconPath = path.join(webRoot, "src/app/apple-icon.png");
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
