// apps/api/src/shared/__tests__/barcode-payload.test.ts
// Tests unitarios enfocados para esquemas de payload de etiquetas con prefijo tipado y validación de escaneo.

import { describe, expect, it } from "vitest";
import {
  buildBarcodePayload,
  buildLocationBarcode,
  buildProductEanBarcode,
  buildProductSkuBarcode,
  extractLocationCode,
  extractProductCode,
  isLocationBarcode,
  isProductBarcode,
  parseBarcodePayload,
  validateBarcodePayload,
} from "@wms/shared-types";

describe("Barcode Payload Schemas & Helpers (@wms/shared-types)", () => {
  describe("buildBarcodePayload & builders específicos", () => {
    it("construye un payload de ubicación en mayúsculas con prefijo LOC:", () => {
      expect(buildLocationBarcode("a-01-02")).toBe("LOC:A-01-02");
      expect(buildLocationBarcode("  B-03-04  ")).toBe("LOC:B-03-04");
    });

    it("no duplica el prefijo si ya viene prefijado", () => {
      expect(buildLocationBarcode("LOC:A-01-02")).toBe("LOC:A-01-02");
      expect(buildLocationBarcode("loc:a-01-02")).toBe("LOC:A-01-02");
      expect(buildProductSkuBarcode("SKU:TSHIRT-BLK-M")).toBe("SKU:TSHIRT-BLK-M");
      expect(buildProductSkuBarcode("sku:TSHIRT-BLK-M")).toBe("SKU:TSHIRT-BLK-M");
    });

    it("construye payloads de SKU y EAN correctamente", () => {
      expect(buildProductSkuBarcode("SHOE-RED-42")).toBe("SKU:SHOE-RED-42");
      expect(buildProductEanBarcode("7501031311309")).toBe("EAN:7501031311309");
    });

    it("lanza error si el valor está vacío", () => {
      expect(() => buildLocationBarcode("   ")).toThrow(
        "El valor para la etiqueta con prefijo 'LOC' no puede estar vacío.",
      );
      expect(() => buildBarcodePayload("SKU", "SKU:")).toThrow(
        "El valor de 'SKU' no puede estar vacío tras el prefijo.",
      );
    });
  });

  describe("parseBarcodePayload", () => {
    it("parsea strings con prefijos reconocidos de forma case-insensitive", () => {
      const parsedLoc = parseBarcodePayload("loc:A-01-01");
      expect(parsedLoc).toEqual({
        raw: "loc:A-01-01",
        hasPrefix: true,
        prefix: "LOC",
        value: "A-01-01",
        entityType: "LOC",
      });

      const parsedSku = parseBarcodePayload("SKU:PROD-999");
      expect(parsedSku).toEqual({
        raw: "SKU:PROD-999",
        hasPrefix: true,
        prefix: "SKU",
        value: "PROD-999",
        entityType: "SKU",
      });
    });

    it("identifica códigos sin prefijo como UNKNOWN", () => {
      const parsed = parseBarcodePayload("A-01-01");
      expect(parsed).toEqual({
        raw: "A-01-01",
        hasPrefix: false,
        prefix: null,
        value: "A-01-01",
        entityType: "UNKNOWN",
      });
    });

    it("maneja strings vacíos o solo espacios", () => {
      const parsed = parseBarcodePayload("   ");
      expect(parsed).toEqual({
        raw: "",
        hasPrefix: false,
        prefix: null,
        value: "",
        entityType: "UNKNOWN",
      });
    });
  });

  describe("validateBarcodePayload", () => {
    it("valida exitosamente cuando coincide el prefijo esperado", () => {
      const res = validateBarcodePayload("LOC:A-02-01", "LOC");
      expect(res.valid).toBe(true);
      expect(res.value).toBe("A-02-01");
      expect(res.prefix).toBe("LOC");
      expect(res.hasPrefix).toBe(true);
      expect(res.errorMessage).toBeUndefined();
    });

    it("rechaza cuando el prefijo corresponde a otra entidad (ej. SKU en vez de LOC)", () => {
      const res = validateBarcodePayload("SKU:TSHIRT-01", "LOC");
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toContain(
        "Tipo de etiqueta no coincide. Se esperaba 'LOC' pero se escaneó 'SKU'.",
      );
    });

    it("rechaza código sin prefijo si allowRawFallback es false (por defecto)", () => {
      const res = validateBarcodePayload("A-02-01", "LOC");
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toContain(
        "El código escaneado no contiene el prefijo obligatorio 'LOC:'.",
      );
    });

    it("acepta código sin prefijo si allowRawFallback es true", () => {
      const res = validateBarcodePayload("A-02-01", "LOC", {
        allowRawFallback: true,
      });
      expect(res.valid).toBe(true);
      expect(res.value).toBe("A-02-01");
      expect(res.prefix).toBeNull();
      expect(res.hasPrefix).toBe(false);
    });

    it("rechaza strings vacíos", () => {
      const res = validateBarcodePayload("   ", "LOC");
      expect(res.valid).toBe(false);
      expect(res.errorMessage).toBe("El código escaneado está vacío.");
    });
  });

  describe("Helpers de clasificación y extracción segura", () => {
    it("isLocationBarcode y isProductBarcode funcionan correctamente", () => {
      expect(isLocationBarcode("LOC:A-01-01")).toBe(true);
      expect(isLocationBarcode("SKU:ITEM-1")).toBe(false);

      expect(isProductBarcode("SKU:ITEM-1")).toBe(true);
      expect(isProductBarcode("EAN:1234567890123")).toBe(true);
      expect(isProductBarcode("LOC:A-01-01")).toBe(false);
    });

    it("extractLocationCode y extractProductCode extraen limpiamente el valor", () => {
      expect(extractLocationCode("LOC:a-01-01")).toBe("A-01-01");
      expect(extractLocationCode("b-02-03")).toBe("B-02-03");

      expect(extractProductCode("SKU:Prod-XyZ")).toBe("Prod-XyZ");
      expect(extractProductCode("Prod-XyZ")).toBe("Prod-XyZ");
    });
  });
});
