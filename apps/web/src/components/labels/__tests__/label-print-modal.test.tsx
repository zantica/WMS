// apps/web/src/components/labels/__tests__/label-print-modal.test.tsx
// Tests unitarios para el componente modal de impresión de etiquetas logísticas (@wms/web).
// Cubre renderizado de diálogo, portal DOM, aislamiento en @media print, auto-regeneración,
// ajuste interactivo de copias y eliminación de ítems de la cola.

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LabelBatchResponseDTO } from "@wms/shared-types";
import {
  DIMENSION_PRESETS,
  expandPrintLabels,
  LabelPrintModal,
  removeItemFromQueue,
  resolvePresetDimensions,
  updateItemCopies,
  type ModalItemState,
} from "../label-print-modal.js";

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

const SAMPLE_BATCH_DATA: LabelBatchResponseDTO = {
  symbology: "QR",
  dimensions: { widthMm: 70, heightMm: 35 },
  count: 2,
  labels: [
    {
      id: "lbl-1",
      entityType: "LOCATION",
      entityId: "loc-1",
      code: "A-01-01",
      barcodePayload: "LOC:A-01-01",
      humanReadableText: "A-01-01",
      title: "Ubicación A-01-01",
      subtitle: "RACK",
      symbology: "QR",
      widthMm: 70,
      heightMm: 35,
      svg: '<svg viewBox="0 0 70 35"><rect width="70" height="35" fill="black"/></svg>',
      dataUri: "data:image/svg+xml;utf8,<svg></svg>",
    },
    {
      id: "lbl-2",
      entityType: "LOCATION",
      entityId: "loc-2",
      code: "B-02-01",
      barcodePayload: "LOC:B-02-01",
      humanReadableText: "B-02-01",
      title: "Ubicación B-02-01",
      subtitle: "RECEIVING",
      symbology: "QR",
      widthMm: 70,
      heightMm: 35,
      svg: '<svg viewBox="0 0 70 35"><circle cx="10" cy="10" r="5"/></svg>',
      dataUri: "data:image/svg+xml;utf8,<svg></svg>",
    },
  ],
};

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
    expect(html).toContain("2 elementos en cola");
    expect(html).toContain("QR Code");
    expect(html).toContain("Code 128 (1D)");
    expect(html).toContain("70 × 35 mm");
    expect(html).toContain("Texto legible");
    expect(html).toContain("Imprimir Cuadrícula");
  });

  it("garantiza aislamiento para @media print con las clases semánticas requeridas", () => {
    const items = [
      { id: "1", code: "A-01-01", title: "Ubicación A-01-01" },
    ];

    const html = renderToStaticMarkup(
      <LabelPrintModal
        isOpen={true}
        onClose={() => {}}
        entityType="LOCATION"
        items={items}
      />,
    );

    // Contenedor raíz aislado del modal
    expect(html).toContain('class="wms-label-modal-root"');

    // Clases .wms-no-print para controles de cabecera, barra de herramientas y pie
    expect(html).toContain("wms-label-modal-header wms-no-print");
    expect(html).toContain("wms-label-modal-toolbar wms-no-print");
    expect(html).toContain("wms-label-modal-footer wms-no-print");

    // Hoja dedicada de impresión (.wms-label-print-sheet)
    expect(html).toContain('class="wms-label-print-sheet"');
  });

  it("muestra opción de EAN comercial marcada por defecto cuando entityType es PRODUCT", () => {
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
    expect(html).toContain("Code 128 (1D)");
    expect(html).toContain(
      '<input type="checkbox" checked=""/><span>Usar EAN comercial si existe</span>',
    );
  });

  it("renderiza la cuadrícula interactiva y la hoja de impresión con datos generados", () => {
    const items = [
      { id: "1", code: "A-01-01", title: "Ubicación A-01-01" },
      { id: "2", code: "B-02-01", title: "Ubicación B-02-01" },
    ];

    const html = renderToStaticMarkup(
      <LabelPrintModal
        isOpen={true}
        onClose={() => {}}
        entityType="LOCATION"
        items={items}
        initialBatchData={SAMPLE_BATCH_DATA}
      />,
    );

    // Previsualización interactiva con payload tipado y SVG
    expect(html).toContain("LOC:A-01-01");
    expect(html).toContain("LOC:B-02-01");
    expect(html).toContain('<svg viewBox="0 0 70 35">');
    expect(html).toContain("wms-label-preview-card");
    expect(html).toContain("Copias:");
    expect(html).toContain("✕ Quitar");

    // Hoja dedicada de impresión con dimensiones en mm y tarjetas físicas
    expect(html).toContain('class="wms-label-print-card"');
    expect(html).toContain("width:70mm;height:35mm");
  });

  describe("Lógica de negocio de la cola de impresión", () => {
    const initialItems: ModalItemState[] = [
      { id: "1", code: "LOC-A", title: "Loc A", copies: 1 },
      { id: "2", code: "LOC-B", title: "Loc B", copies: 2 },
    ];

    it("permite modificar copias con incremento, decremento y valor exacto dentro de 1..50", () => {
      // Incrementar
      const plusOne = updateItemCopies(initialItems, "1", +1);
      expect(plusOne.find((i) => i.id === "1")?.copies).toBe(2);

      // Decrementar con piso en 1
      const minusOne = updateItemCopies(initialItems, "1", -1);
      expect(minusOne.find((i) => i.id === "1")?.copies).toBe(1);

      // Asignar valor exacto válido
      const exactTen = updateItemCopies(initialItems, "1", { exact: 10 });
      expect(exactTen.find((i) => i.id === "1")?.copies).toBe(10);

      // Clamping al máximo de 50
      const clampedMax = updateItemCopies(initialItems, "1", { exact: 99 });
      expect(clampedMax.find((i) => i.id === "1")?.copies).toBe(50);

      // Clamping al mínimo de 1 si pasan 0 o negativo
      const clampedMin = updateItemCopies(initialItems, "1", { exact: 0 });
      expect(clampedMin.find((i) => i.id === "1")?.copies).toBe(1);
    });

    it("permite quitar un item de la cola de impresión", () => {
      const reduced = removeItemFromQueue(initialItems, "1");
      expect(reduced).toHaveLength(1);
      expect(reduced[0]?.id).toBe("2");

      const empty = removeItemFromQueue(reduced, "2");
      expect(empty).toHaveLength(0);
    });

    it("resuelve dimensiones físicas exactas a partir de presets predefinidos", () => {
      expect(resolvePresetDimensions("70x35")).toEqual({ widthMm: 70, heightMm: 35 });
      expect(resolvePresetDimensions("50x25")).toEqual({ widthMm: 50, heightMm: 25 });
      expect(resolvePresetDimensions("100x50")).toEqual({ widthMm: 100, heightMm: 50 });
      expect(resolvePresetDimensions("custom")).toBeNull();
      expect(resolvePresetDimensions("nonexistent")).toBeNull();
      expect(DIMENSION_PRESETS.length).toBeGreaterThanOrEqual(4);
    });

    it("expande las etiquetas según la cantidad de copias para la hoja física de impresión", () => {
      const itemsWithCopies: ModalItemState[] = [
        { id: "1", code: "A-01-01", title: "A", copies: 3 },
        { id: "2", code: "B-02-01", title: "B", copies: 1 },
      ];

      const expanded = expandPrintLabels(itemsWithCopies, SAMPLE_BATCH_DATA.labels);
      // 3 copias de A-01-01 + 1 copia de B-02-01 = 4 etiquetas en la hoja de impresión
      expect(expanded).toHaveLength(4);
      expect(expanded.filter((e) => e.label.code === "A-01-01")).toHaveLength(3);
      expect(expanded.filter((e) => e.label.code === "B-02-01")).toHaveLength(1);
      expect(expanded[0]?.key).toBe("1-copy-0");
      expect(expanded[1]?.key).toBe("1-copy-1");
      expect(expanded[2]?.key).toBe("1-copy-2");
      expect(expanded[3]?.key).toBe("2-copy-0");
    });
  });
});
