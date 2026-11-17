// apps/api/src/use-cases/labels/__tests__/generate-labels.test.ts
// Tests unitarios exhaustivos para casos de uso de generación de etiquetas (Happy path, Edge cases, Errores y Multi-tenant).

import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryCatalogRepository } from "../../../adapters/in-memory-catalog-repository.js";
import { InMemoryLabelRendererAdapter } from "../../../adapters/in-memory-label-renderer.js";
import { InMemoryLocationRepository } from "../../../adapters/in-memory-location-repository.js";
import { SvgLabelRendererAdapter } from "../../../adapters/svg-label-renderer.js";
import { generateLocationLabels } from "../generate-location-labels.js";
import { generateProductLabels } from "../generate-product-labels.js";

describe("Generate Labels Use Cases (F5.2)", () => {
  const tenantA = "tenant_alpha";
  const tenantB = "tenant_beta";

  let locationRepo: InMemoryLocationRepository;
  let catalogRepo: InMemoryCatalogRepository;
  let inMemoryRenderer: InMemoryLabelRendererAdapter;
  let realSvgRenderer: SvgLabelRendererAdapter;

  beforeEach(async () => {
    locationRepo = new InMemoryLocationRepository();
    catalogRepo = new InMemoryCatalogRepository();
    inMemoryRenderer = new InMemoryLabelRendererAdapter();
    realSvgRenderer = new SvgLabelRendererAdapter();

    // Sembrar ubicaciones
    locationRepo.seed([
      {
        id: "loc_01",
        tenantId: tenantA,
        warehouseId: "wh_01",
        code: "A-01-01",
        type: "STORAGE",
        description: "Estantería A1",
        isActive: true,
      },
      {
        id: "loc_02",
        tenantId: tenantA,
        warehouseId: "wh_01",
        code: "B-02-01",
        type: "RECEIVING",
        description: "Muelle Recepción",
        isActive: true,
      },
      {
        id: "loc_beta",
        tenantId: tenantB,
        warehouseId: "wh_beta",
        code: "Z-99-99",
        type: "STORAGE",
        description: "Almacén Beta",
        isActive: true,
      },
    ]);

    // Sembrar categorías y productos
    const cat = await catalogRepo.createCategory(tenantA, {
      code: "ROPA",
      name: "Ropa y Textil",
    });

    await catalogRepo.createProduct(tenantA, {
      sku: "TSHIRT-BLK-M",
      name: "Camiseta Algodón Negra M",
      barcode: "7501234567890",
      categoryId: cat.id,
    });

    await catalogRepo.createProduct(tenantA, {
      sku: "JEANS-BLU-32",
      name: "Pantalón Denim Azul 32",
      barcode: undefined,
    });

    await catalogRepo.createProduct(tenantB, {
      sku: "BETA-ITEM",
      name: "Item de Tenant B",
    });
  });

  describe("generateLocationLabels", () => {
    it("genera etiquetas QR para ubicaciones sin prefijo LOC: (código limpio en mayúsculas) y SVG real", async () => {
      const result = await generateLocationLabels(
        locationRepo,
        realSvgRenderer,
        tenantA,
        {
          locationCodes: ["A-01-01", "B-02-01"],
          symbology: "QR",
          widthMm: 70,
          heightMm: 35,
        },
      );

      expect(result.count).toBe(2);
      expect(result.symbology).toBe("QR");
      expect(result.dimensions).toEqual({ widthMm: 70, heightMm: 35 });

      const first = result.labels[0]!;
      expect(first.code).toBe("A-01-01");
      expect(first.barcodePayload).toBe("A-01-01");
      expect(first.humanReadableText).toBe("A-01-01");
      expect(first.title).toBe("Ubicación A-01-01");
      expect(first.subtitle).toContain("STORAGE");
      expect(first.svg).toContain('width="70mm"');
      expect(first.svg).toContain('height="35mm"');
      expect(first.svg).toContain("A-01-01");
      expect(first.svg).not.toContain("LOC:");
      expect(first.dataUri).toContain("data:image/svg+xml;utf8,");
    });

    it("soporta generación de ubicaciones con simbología CODE128", async () => {
      const result = await generateLocationLabels(
        locationRepo,
        inMemoryRenderer,
        tenantA,
        {
          locationIds: ["loc_01"],
          symbology: "CODE128",
        },
      );

      expect(result.count).toBe(1);
      expect(result.symbology).toBe("CODE128");
      expect(inMemoryRenderer.renderedLabels[0]?.payload).toBe("A-01-01");
      expect(inMemoryRenderer.renderedLabels[0]?.humanReadableText).toBe("A-01-01");
      expect(inMemoryRenderer.renderedLabels[0]?.symbology).toBe("CODE128");
    });

    it("falla con VALIDATION_ERROR si no se envían IDs ni códigos", async () => {
      await expect(
        generateLocationLabels(locationRepo, inMemoryRenderer, tenantA, {
          locationIds: [],
          locationCodes: [],
        }),
      ).rejects.toThrow("Debe especificar al menos un locationId o locationCode");
    });

    it("falla con LOCATION_NOT_FOUND si las ubicaciones no existen", async () => {
      await expect(
        generateLocationLabels(locationRepo, inMemoryRenderer, tenantA, {
          locationCodes: ["NON-EXISTENT"],
        }),
      ).rejects.toThrow("No se encontraron ubicaciones");
    });

    it("garantiza aislamiento multi-tenant: tenantA no puede generar etiquetas de ubicaciones de tenantB", async () => {
      await expect(
        generateLocationLabels(locationRepo, inMemoryRenderer, tenantA, {
          locationCodes: ["Z-99-99"],
        }),
      ).rejects.toThrow("No se encontraron ubicaciones");
    });
  });

  describe("generateProductLabels", () => {
    it("genera etiquetas CODE128 para productos sin prefijo SKU: (código limpio) y SVG real", async () => {
      const result = await generateProductLabels(
        catalogRepo,
        realSvgRenderer,
        tenantA,
        {
          skus: ["TSHIRT-BLK-M"],
          symbology: "CODE128",
          widthMm: 80,
          heightMm: 40,
        },
      );

      expect(result.count).toBe(1);
      expect(result.symbology).toBe("CODE128");
      expect(result.dimensions).toEqual({ widthMm: 80, heightMm: 40 });

      const label = result.labels[0]!;
      expect(label.code).toBe("TSHIRT-BLK-M");
      expect(label.barcodePayload).toBe("TSHIRT-BLK-M");
      expect(label.humanReadableText).toBe("TSHIRT-BLK-M");
      expect(label.title).toBe("Camiseta Algodón Negra M");
      expect(label.subtitle).toContain("Ropa y Textil");
      expect(label.svg).toContain('width="80mm"');
      expect(label.svg).toContain("TSHIRT-BLK-M");
      expect(label.svg).not.toContain("SKU:TSHIRT-BLK-M");
    });

    it("usa el barcode comercial limpio sin prefijo EAN: cuando useBarcodeAsPayload es true y tiene barcode", async () => {
      const result = await generateProductLabels(
        catalogRepo,
        inMemoryRenderer,
        tenantA,
        {
          skus: ["TSHIRT-BLK-M"],
          useBarcodeAsPayload: true,
        },
      );

      expect(result.count).toBe(1);
      const label = result.labels[0]!;
      expect(label.barcodePayload).toBe("7501234567890");
      expect(label.humanReadableText).toBe("7501234567890");
    });

    it("hace fallback a SKU limpio si useBarcodeAsPayload es true pero el producto no tiene barcode", async () => {
      const result = await generateProductLabels(
        catalogRepo,
        inMemoryRenderer,
        tenantA,
        {
          skus: ["JEANS-BLU-32"],
          useBarcodeAsPayload: true,
        },
      );

      expect(result.count).toBe(1);
      const label = result.labels[0]!;
      expect(label.barcodePayload).toBe("JEANS-BLU-32");
      expect(label.humanReadableText).toBe("JEANS-BLU-32");
    });

    it("falla con VALIDATION_ERROR si no se envían productIds ni skus", async () => {
      await expect(
        generateProductLabels(catalogRepo, inMemoryRenderer, tenantA, {
          productIds: [],
          skus: [],
        }),
      ).rejects.toThrow("Debe especificar al menos un productId o sku");
    });

    it("falla con PRODUCT_NOT_FOUND si el SKU no existe en el catálogo", async () => {
      await expect(
        generateProductLabels(catalogRepo, inMemoryRenderer, tenantA, {
          skus: ["DOES-NOT-EXIST"],
        }),
      ).rejects.toThrow("No se encontraron productos");
    });

    it("garantiza aislamiento multi-tenant: tenantA no puede generar etiquetas de productos de tenantB", async () => {
      await expect(
        generateProductLabels(catalogRepo, inMemoryRenderer, tenantA, {
          skus: ["BETA-ITEM"],
        }),
      ).rejects.toThrow("No se encontraron productos");
    });
  });
});
