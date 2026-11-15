// apps/web/src/components/labels/__tests__/label-print-modal.test.tsx
// Tests unitarios para el componente modal de impresión de cuadrículas de etiquetas (@wms/web).

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LabelPrintModal } from "../label-print-modal.js";

const mockGenerateLocationLabels = vi.fn();
const mockGenerateProductLabels = vi.fn();

vi.mock("../../../context/supervisor-session.js", () => ({
  useSupervisorSession: () => ({
    client: {
      generateLocationLabels: mockGenerateLocationLabels,
      generateProductLabels: mockGenerateProductLabels,
    },
    session: { warehouseId: "wh-01" },
  }),
}));

vi.mock("../../../context/supervisor-session", () => ({
  useSupervisorSession: () => ({
    client: {
      generateLocationLabels: mockGenerateLocationLabels,
      generateProductLabels: mockGenerateProductLabels,
    },
    session: { warehouseId: "wh-01" },
  }),
}));

describe("LabelPrintModal (@wms/web)", () => {
  it("no renderiza nada cuando isOpen es false", () => {
    const html = renderToStaticMarkup(
      <LabelPrintModal
        isOpen={false}
        onClose={() => {}}
        entityType="LOCATION"
        items={[{ id: "1", code: "A-01-01", title: "Ubicación A-01-01" }]}
      />,
    );
    expect(html).toBe("");
  });

  it("renderiza el diálogo con controles de simbología, dimensiones y botón de impresión", () => {
    const items = [
      { id: "1", code: "A-01-01", title: "Ubicación A-01-01", subtitle: "STORAGE" },
      { id: "2", code: "B-02-01", title: "Ubicación B-02-01", subtitle: "RECEIVING" },
    ];

    const html = renderToStaticMarkup(
      <LabelPrintModal
        isOpen={true}
        onClose={() => {}}
        entityType="LOCATION"
        items={items}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Impresión de Etiquetas de Ubicación");
    expect(html).toContain("2 elementos seleccionados");
    expect(html).toContain("QR Code");
    expect(html).toContain("Code 128 (1D)");
    expect(html).toContain("70 × 35 mm");
    expect(html).toContain("Texto legible");
    expect(html).toContain("Imprimir Cuadrícula");
  });

  it("muestra opción de EAN comercial cuando entityType es PRODUCT", () => {
    const items = [
      { id: "p1", code: "TSHIRT-BLK", title: "Camiseta Negra", subtitle: "Ropa" },
    ];

    const html = renderToStaticMarkup(
      <LabelPrintModal
        isOpen={true}
        onClose={() => {}}
        entityType="PRODUCT"
        items={items}
      />,
    );

    expect(html).toContain("Impresión de Etiquetas de Producto");
    expect(html).toContain("Usar EAN comercial si existe");
  });
});
