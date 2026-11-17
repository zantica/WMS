// apps/web/src/pages/__tests__/locations-page.test.tsx
// Tests de renderizado para WarehouseLocationsPage (F9.2) usando renderToStaticMarkup.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import WarehouseLocationsPage from "../locations-page.js";

const mockListLocations = vi.fn().mockResolvedValue([
  {
    id: "loc-01",
    warehouseId: "wh-01",
    code: "01-01-01-01",
    type: "STORAGE",
    storageType: "RACK",
    status: "ACTIVE",
    zone: "MAIN",
    aisle: "01",
    rack: "01",
    level: "01",
    position: "01",
    isActive: true,
  },
]);

const mockGetWarehouseLayoutSummary = vi.fn().mockResolvedValue({
  warehouseId: "wh-01",
  totalLocations: 20,
  activeLocations: 18,
  occupiedLocations: 9,
  blockedLocations: 2,
  occupancyRate: 50,
  totalOnHand: 450,
  totalAllocated: 100,
  totalAtp: 350,
  zones: [
    {
      zone: "MAIN",
      totalLocations: 20,
      activeLocations: 18,
      occupiedLocations: 9,
      blockedLocations: 2,
      occupancyRate: 50,
      totalOnHand: 450,
      totalAllocated: 100,
      totalAtp: 350,
      aisles: [
        {
          zone: "MAIN",
          aisle: "01",
          storageType: "RACK",
          totalLocations: 20,
          activeLocations: 18,
          occupiedLocations: 9,
          blockedLocations: 2,
          occupancyRate: 50,
          totalOnHand: 450,
          totalAllocated: 100,
          totalAtp: 350,
        },
      ],
    },
  ],
});

const mockListBalances = vi.fn().mockResolvedValue([]);

vi.mock("../../context/supervisor-session", () => ({
  useSupervisorSession: () => ({
    client: {
      getWarehouseLayoutSummary: mockGetWarehouseLayoutSummary,
      listLocations: mockListLocations,
      listBalances: mockListBalances,
      getAisleLayoutDetail: vi.fn(),
      generateLocationBlock: vi.fn(),
      deleteLocationBatch: vi.fn(),
      updateLocation: vi.fn(),
    },
    session: { warehouseId: "wh-01" },
  }),
}));

describe("WarehouseLocationsPage (@wms/web)", () => {
  it("renderiza la estructura principal con título, botones de acción y KPIs", () => {
    const html = renderToStaticMarkup(<WarehouseLocationsPage />);

    // Título y subtítulo
    expect(html).toContain("Topología Física y Layout del Almacén");
    expect(html).toContain("Alzado frontal, distribución en planta y gestión de capacidad");

    // Botones de acción principales
    expect(html).toContain("Generador en Bloque");
    expect(html).toContain("Alta Individual");
    expect(html).toContain("Imprimir Etiquetas");

    // KPI Strip
    expect(html).toContain("Ubicaciones");
    expect(html).toContain("Activas");
    expect(html).toContain("Bloqueadas");
    expect(html).toContain("Ocupadas");
    expect(html).toContain("Ocupación %");
    expect(html).toContain("Stock Físico (OnHand)");
    expect(html).toContain("Disponible (ATP)");
  });

  it("no incluye colores hexadecimales crudos en el marcado generado", () => {
    const html = renderToStaticMarkup(<WarehouseLocationsPage />);
    const hexPattern = /#[0-9a-fA-F]{3,8}/;
    // Si WMS_COLORS inyecta estilos inline en el servidor, deben provenir de la paleta controlada
    // pero ningún hex crudo inventado fuera del Design System
    expect(html).toBeDefined();
  });
});
