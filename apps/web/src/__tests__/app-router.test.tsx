// apps/web/src/__tests__/app-router.test.tsx
// Tests de integración del enrutamiento SPA (React Router) y bootstrap de configuración (@wms/web).

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppRoutes } from "../App.js";
import { resolveBootstrapSession } from "../bootstrap.js";

describe("AppRoutes (SPA Client Router)", () => {
  it.each([
    { route: "/", expectedText: "Control Tower" },
    { route: "/catalog", expectedText: "Catálogo" },
    { route: "/inventory", expectedText: "Kardex" },
    { route: "/locations", expectedText: "Topología Física" },
    { route: "/operations", expectedText: "Pedidos" },
    { route: "/users", expectedText: "Usuarios" },
  ])(
    "renderiza correctamente la ruta $route dentro del DashboardShell",
    ({ route, expectedText }) => {
      const html = renderToStaticMarkup(
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes initialLocale="es-ES" />
        </MemoryRouter>,
      );

      expect(html).toContain('class="wms-shell"');
      expect(html).toContain(
        `aria-current="page" class="wms-nav-link wms-nav-link-active" href="${route}"`,
      );
      expect(html).toContain(expectedText);
    },
  );

  it("renderiza correctamente la ruta /login con AuthTemplate y LoginForm", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/login"]}>
        <AppRoutes initialLocale="es-ES" />
      </MemoryRouter>,
    );

    expect(html).toContain('data-testid="auth-template"');
    expect(html).toContain('data-testid="login-form"');
    expect(html).toContain("Navelo WMS");
  });

  it("renderiza el fallback 404 SPA para rutas desconocidas", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/ruta-desconocida"]}>
        <AppRoutes initialLocale="es-ES" />
      </MemoryRouter>,
    );

    expect(html).toContain("404");
    expect(html).toContain("/ruta-desconocida");
    expect(html).toContain('href="/"');
  });
});

describe("resolveBootstrapSession (Composition Root Env Mapping)", () => {
  it("devuelve objeto vacío cuando no hay variables de entorno definidas", () => {
    expect(resolveBootstrapSession({})).toEqual({});
  });

  it("resuelve apiBaseUrl (incluyendo cadena vacía para proxy), apiKey y warehouseId", () => {
    expect(
      resolveBootstrapSession({
        VITE_API_BASE_URL: "  https://api.navelo.wms/  ",
        VITE_API_KEY: "  prod-key-999  ",
        VITE_WAREHOUSE_ID: " wh-mad-01 ",
      }),
    ).toEqual({
      apiBaseUrl: "https://api.navelo.wms/",
      apiKey: "prod-key-999",
      warehouseId: "wh-mad-01",
    });

    expect(
      resolveBootstrapSession({
        VITE_API_BASE_URL: "",
        VITE_API_KEY: "   ",
      }),
    ).toEqual({
      apiBaseUrl: "",
    });
  });
});
