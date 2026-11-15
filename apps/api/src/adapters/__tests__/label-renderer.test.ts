// apps/api/src/adapters/__tests__/label-renderer.test.ts
// Tests unitarios enfocados para adaptadores de renderizado de etiquetas (QR, Code128 y SVG compuesto).

import { describe, expect, it } from "vitest";
import { generateCode128Svg } from "../pure-code128-renderer.js";
import { generateQrSvg } from "../pure-qr-renderer.js";
import { SvgLabelRendererAdapter } from "../svg-label-renderer.js";

describe("Label Renderers (QR + Code128)", () => {
  describe("Pure Code 128 Renderer (ISO/IEC 15417)", () => {
    it("genera SVG válido con rectángulos y texto legible para SKU:TSHIRT-01", () => {
      const svg = generateCode128Svg("SKU:TSHIRT-01", { heightMm: 25, includeText: true });
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
      expect(svg).toContain('<rect');
      expect(svg).toContain("SKU:TSHIRT-01");
    });

    it("genera SVG sin texto legible cuando includeText es false", () => {
      const svg = generateCode128Svg("LOC:A-01-01", { includeText: false });
      expect(svg).toContain("<svg");
      expect(svg).not.toContain("<text");
    });

    it("lanza error si la cadena está vacía", () => {
      expect(() => generateCode128Svg("   ")).toThrow(
        "El texto a codificar en Code 128 no puede estar vacío.",
      );
    });

    it("lanza error ante caracteres no ASCII imprimibles", () => {
      expect(() => generateCode128Svg("SKU:CAFÉ-01")).toThrow(
        "Carácter no soportado en Code 128",
      );
    });
  });

  describe("Pure QR Renderer (ISO/IEC 18004)", () => {
    it("genera SVG válido con matriz y path para ubicaciones con prefijo LOC:A-01-02", () => {
      const svg = generateQrSvg("LOC:A-01-02");
      expect(svg).toContain("<svg");
      expect(svg).toContain("<path d=");
      expect(svg).toContain("</svg>");
    });

    it("genera QR para un payload largo de SKU", () => {
      const svg = generateQrSvg("SKU:VERY-LONG-IDENTIFIER-ABC-123456789-EXTRA-SPEC");
      expect(svg).toContain("<svg");
      expect(svg).toContain("<path d=");
    });

    it("lanza error ante string vacío", () => {
      expect(() => generateQrSvg("   ")).toThrow(
        "El texto a codificar en QR no puede estar vacío.",
      );
    });
  });

  describe("SvgLabelRendererAdapter (LabelRendererPort)", () => {
    const renderer = new SvgLabelRendererAdapter();

    it("renderiza etiqueta completa apaisada con QR y dimensiones en mm", async () => {
      const svg = await renderer.renderLabel({
        payload: "LOC:A-01-01",
        symbology: "QR",
        widthMm: 70,
        heightMm: 35,
        title: "Ubicación A-01-01",
        subtitle: "Zona: STORAGE",
        humanReadableText: "LOC:A-01-01",
      });

      expect(svg).toContain('width="70mm"');
      expect(svg).toContain('height="35mm"');
      expect(svg).toContain("Ubicación A-01-01");
      expect(svg).toContain("Zona: STORAGE");
      expect(svg).toContain("LOC:A-01-01");
      expect(svg).toContain("<path"); // QR path
    });

    it("renderiza etiqueta completa vertical con QR", async () => {
      const svg = await renderer.renderLabel({
        payload: "LOC:B-02-01",
        symbology: "QR",
        widthMm: 40,
        heightMm: 50,
        title: "B-02-01",
      });

      expect(svg).toContain('width="40mm"');
      expect(svg).toContain('height="50mm"');
      expect(svg).toContain("B-02-01");
    });

    it("renderiza etiqueta completa con Code128", async () => {
      const svg = await renderer.renderLabel({
        payload: "SKU:ITEM-999",
        symbology: "CODE128",
        widthMm: 70,
        heightMm: 35,
        title: "Camiseta Deportiva Negra",
        subtitle: "Categoría: Ropa",
        humanReadableText: "SKU:ITEM-999",
      });

      expect(svg).toContain('width="70mm"');
      expect(svg).toContain('height="35mm"');
      expect(svg).toContain("Camiseta Deportiva Negra");
      expect(svg).toContain("SKU:ITEM-999");
      expect(svg).toContain("<rect");
    });

    it("renderBarcodeSvg delega adecuadamente a QR y Code128", async () => {
      const qrSvg = await renderer.renderBarcodeSvg("LOC:C-01", "QR");
      expect(qrSvg).toContain("<path");

      const codeSvg = await renderer.renderBarcodeSvg("SKU:D-02", "CODE128");
      expect(codeSvg).toContain("<rect");
    });

    it("falla si las dimensiones son inválidas", async () => {
      await expect(
        renderer.renderLabel({
          payload: "LOC:A",
          symbology: "QR",
          widthMm: 0,
          heightMm: 35,
          title: "Test",
        }),
      ).rejects.toThrow("Las dimensiones físicas de la etiqueta deben ser mayores a cero");
    });
  });
});
