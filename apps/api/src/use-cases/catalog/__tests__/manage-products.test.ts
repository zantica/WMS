// apps/api/src/use-cases/catalog/__tests__/manage-products.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryCatalogRepository } from "../../../adapters/in-memory-catalog-repository.js";
import {
  createCategory,
  updateCategory,
} from "../manage-categories.js";
import {
  createProduct,
  getProductById,
  searchProducts,
  updateProduct,
} from "../manage-products.js";

describe("Caso de Uso: Maestro de Productos y Búsqueda por SKU (F9.1)", () => {
  let catalogRepo: InMemoryCatalogRepository;
  const tenantA = "tenant_prod_a";
  const tenantB = "tenant_prod_b";

  beforeEach(() => {
    catalogRepo = new InMemoryCatalogRepository();
  });

  describe("1. Happy Path", () => {
    it("crea un producto con categoría activa y dimensiones completas", async () => {
      const cat = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "ROPA",
        name: "Ropa y Textiles",
      });

      const product = await createProduct(catalogRepo, tenantA, {
        sku: "TSHIRT-BLK-M",
        name: "Camiseta Negra Talla M",
        barcode: "841000000001",
        description: "Camiseta algodón 100%",
        categoryId: cat.id,
        weightGrams: 180,
        widthCm: 25,
        heightCm: 30,
        depthCm: 2,
        imageUrl: "https://example.com/img.png",
      });

      expect(product.id).toBeDefined();
      expect(product.sku).toBe("TSHIRT-BLK-M");
      expect(product.name).toBe("Camiseta Negra Talla M");
      expect(product.categoryId).toBe(cat.id);
      expect(product.categoryName).toBe("Ropa y Textiles");
      expect(product.categoryCode).toBe("ROPA");
      expect(product.isActive).toBe(true);
      expect(product.weightGrams).toBe(180);
    });

    it("obtiene un producto por ID con su categoría resuelta", async () => {
      const cat = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "CALZADO",
        name: "Calzado",
      });
      const created = await createProduct(catalogRepo, tenantA, {
        sku: "SHOE-42",
        name: "Zapato Deportivo 42",
        categoryId: cat.id,
      });

      const fetched = await getProductById(catalogRepo, tenantA, created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.sku).toBe("SHOE-42");
      expect(fetched.categoryCode).toBe("CALZADO");
    });

    it("busca productos por texto libre (q) en sku, nombre, barcode y descripción", async () => {
      await createProduct(catalogRepo, tenantA, {
        sku: "LAPTOP-PRO-15",
        name: "Ordenador Portátil 15 pulg",
        description: "Potente estación de trabajo",
      });
      await createProduct(catalogRepo, tenantA, {
        sku: "MOUSE-WIRELESS",
        name: "Ratón Óptico Inalámbrico",
        barcode: "998877665544",
      });

      // Búsqueda por SKU parcial
      const bySku = await searchProducts(catalogRepo, tenantA, { q: "LAPTOP" });
      expect(bySku.items).toHaveLength(1);
      expect(bySku.items[0]?.sku).toBe("LAPTOP-PRO-15");

      // Búsqueda por descripción
      const byDesc = await searchProducts(catalogRepo, tenantA, {
        q: "estación",
      });
      expect(byDesc.items).toHaveLength(1);
      expect(byDesc.items[0]?.sku).toBe("LAPTOP-PRO-15");

      // Búsqueda por código de barras
      const byBarcode = await searchProducts(catalogRepo, tenantA, {
        q: "998877",
      });
      expect(byBarcode.items).toHaveLength(1);
      expect(byBarcode.items[0]?.sku).toBe("MOUSE-WIRELESS");
    });

    it("filtra productos por categoryId y pagina los resultados", async () => {
      const cat1 = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "C1",
        name: "Cat 1",
      });
      const cat2 = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "C2",
        name: "Cat 2",
      });

      for (let i = 1; i <= 5; i++) {
        await createProduct(catalogRepo, tenantA, {
          sku: `PROD-C1-${i}`,
          name: `Producto C1 #${i}`,
          categoryId: cat1.id,
        });
      }
      await createProduct(catalogRepo, tenantA, {
        sku: "PROD-C2-1",
        name: "Producto C2 #1",
        categoryId: cat2.id,
      });

      // Página 1 limit 3 para C1
      const p1 = await searchProducts(catalogRepo, tenantA, {
        categoryId: cat1.id,
        page: 1,
        limit: 3,
      });

      expect(p1.items).toHaveLength(3);
      expect(p1.pagination.total).toBe(5);
      expect(p1.pagination.pages).toBe(2);
      expect(p1.pagination.page).toBe(1);

      // Página 2 limit 3 para C1
      const p2 = await searchProducts(catalogRepo, tenantA, {
        categoryId: cat1.id,
        page: 2,
        limit: 3,
      });
      expect(p2.items).toHaveLength(2);
      expect(p2.pagination.page).toBe(2);
    });

    it("actualiza producto modificando categoría, datos y estado activo/inactivo", async () => {
      const catA = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "A",
        name: "Cat A",
      });
      const catB = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "B",
        name: "Cat B",
      });

      const prod = await createProduct(catalogRepo, tenantA, {
        sku: "ITEM-01",
        name: "Original",
        categoryId: catA.id,
      });

      const updated = await updateProduct(catalogRepo, tenantA, prod.id, {
        name: "Modificado",
        categoryId: catB.id,
        weightGrams: 500,
        isActive: false,
      });

      expect(updated.name).toBe("Modificado");
      expect(updated.categoryId).toBe(catB.id);
      expect(updated.categoryCode).toBe("B");
      expect(updated.isActive).toBe(false);

      // Por defecto searchProducts oculta inactivos
      const active = await searchProducts(catalogRepo, tenantA);
      expect(active.items).toHaveLength(0);

      // Con includeInactive = true aparece
      const all = await searchProducts(catalogRepo, tenantA, {
        includeInactive: true,
      });
      expect(all.items).toHaveLength(1);
    });
  });

  describe("2. Casos Borde (Edge Cases)", () => {
    it("crea producto sin categoría (categoryId: null / undefined)", async () => {
      const prod = await createProduct(catalogRepo, tenantA, {
        sku: "SOLO-SKU",
        name: "Producto sin Categoría",
      });
      expect(prod.categoryId).toBeNull();
      expect(prod.categoryName).toBeNull();
    });

    it("permite desasociar categoría asignando null en updateProduct", async () => {
      const cat = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "TEST",
        name: "Test",
      });
      const prod = await createProduct(catalogRepo, tenantA, {
        sku: "CON-CAT",
        name: "Con Cat",
        categoryId: cat.id,
      });

      const updated = await updateProduct(catalogRepo, tenantA, prod.id, {
        categoryId: null,
      });
      expect(updated.categoryId).toBeNull();
      expect(updated.categoryName).toBeNull();
    });

    it("ajusta página inválida a 1 y límite máximo a 200", async () => {
      const res = await searchProducts(catalogRepo, tenantA, {
        page: -5,
        limit: 9999,
      });
      expect(res.pagination.page).toBe(1);
      expect(res.pagination.limit).toBe(200);
    });
  });

  describe("3. Errores de Dominio y Validación", () => {
    it("rechaza SKU vacío con 400 VALIDATION_ERROR", async () => {
      await expect(
        createProduct(catalogRepo, tenantA, {
          sku: "   ",
          name: "Válido",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 400,
        }),
      );
    });

    it("rechaza nombre vacío con 400 VALIDATION_ERROR", async () => {
      await expect(
        createProduct(catalogRepo, tenantA, {
          sku: "SKU-VAL",
          name: "  ",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 400,
        }),
      );
    });

    it("rechaza categoría inexistente con 404 CATEGORY_NOT_FOUND", async () => {
      await expect(
        createProduct(catalogRepo, tenantA, {
          sku: "PROD-FANTASMA",
          name: "Fantasma",
          categoryId: "cat_no_existe",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CATEGORY_NOT_FOUND",
          statusCode: 404,
        }),
      );
    });

    it("rechaza categoría inactiva con 422 VALIDATION_ERROR", async () => {
      const cat = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "INACTIVA",
        name: "Categoría Inactiva",
      });
      await updateCategory(catalogRepo, tenantA, "ADMIN", cat.id, {
        isActive: false,
      });

      await expect(
        createProduct(catalogRepo, tenantA, {
          sku: "PROD-RECHAZADO",
          name: "Rechazado",
          categoryId: cat.id,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 422,
        }),
      );
    });

    it("rechaza SKU duplicado en el mismo tenant con 409 VALIDATION_ERROR", async () => {
      await createProduct(catalogRepo, tenantA, {
        sku: "DUPLICADO-SKU",
        name: "Primero",
      });

      await expect(
        createProduct(catalogRepo, tenantA, {
          sku: "duplicado-sku",
          name: "Segundo",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 409,
        }),
      );
    });

    it("rechaza código de barras duplicado con 409 VALIDATION_ERROR", async () => {
      await createProduct(catalogRepo, tenantA, {
        sku: "PROD-BAR-1",
        name: "Primero",
        barcode: "1234567890123",
      });

      await expect(
        createProduct(catalogRepo, tenantA, {
          sku: "PROD-BAR-2",
          name: "Segundo",
          barcode: "1234567890123",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 409,
        }),
      );
    });

    it("rechaza actualizar SKU a vacío con 400 VALIDATION_ERROR", async () => {
      const prod = await createProduct(catalogRepo, tenantA, {
        sku: "SKU-ORIGINAL",
        name: "Prod",
      });

      await expect(
        updateProduct(catalogRepo, tenantA, prod.id, {
          sku: "   ",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 400,
        }),
      );
    });

    it("rechaza actualizar a categoría inexistente con 404 CATEGORY_NOT_FOUND", async () => {
      const prod = await createProduct(catalogRepo, tenantA, {
        sku: "PROD-CAT-BAD",
        name: "Prod",
      });

      await expect(
        updateProduct(catalogRepo, tenantA, prod.id, {
          categoryId: "cat_fantasma",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CATEGORY_NOT_FOUND",
          statusCode: 404,
        }),
      );
    });

    it("rechaza actualizar a categoría inactiva con 422 VALIDATION_ERROR", async () => {
      const cat = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "DESACTIVABLE",
        name: "Desactivable",
      });
      await updateCategory(catalogRepo, tenantA, "ADMIN", cat.id, {
        isActive: false,
      });

      const prod = await createProduct(catalogRepo, tenantA, {
        sku: "PROD-CAT-INACTIVA",
        name: "Prod",
      });

      await expect(
        updateProduct(catalogRepo, tenantA, prod.id, {
          categoryId: cat.id,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 422,
        }),
      );
    });

    it("rechaza getProductById inexistente con 404 PRODUCT_NOT_FOUND", async () => {
      await expect(
        getProductById(catalogRepo, tenantA, "prod_no_existe"),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "PRODUCT_NOT_FOUND",
          statusCode: 404,
        }),
      );
    });

    it("rechaza actualizar SKU a uno ya existente con 409", async () => {
      const p1 = await createProduct(catalogRepo, tenantA, {
        sku: "SKU-A",
        name: "Prod A",
      });
      await createProduct(catalogRepo, tenantA, {
        sku: "SKU-B",
        name: "Prod B",
      });

      await expect(
        updateProduct(catalogRepo, tenantA, p1.id, {
          sku: "SKU-B",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 409,
        }),
      );
    });
  });

  describe("4. Aislamiento Multi-Tenant", () => {
    it("permite el mismo SKU y código de barras en inquilinos distintos", async () => {
      const prodA = await createProduct(catalogRepo, tenantA, {
        sku: "COMUN-SKU",
        name: "Producto A",
        barcode: "111222333444",
      });
      const prodB = await createProduct(catalogRepo, tenantB, {
        sku: "COMUN-SKU",
        name: "Producto B",
        barcode: "111222333444",
      });

      expect(prodA.id).not.toBe(prodB.id);

      const listA = await searchProducts(catalogRepo, tenantA, {
        sku: "COMUN-SKU",
      });
      const listB = await searchProducts(catalogRepo, tenantB, {
        sku: "COMUN-SKU",
      });

      expect(listA.items).toHaveLength(1);
      expect(listA.items[0]?.name).toBe("Producto A");

      expect(listB.items).toHaveLength(1);
      expect(listB.items[0]?.name).toBe("Producto B");
    });

    it("no permite asociar una categoría perteneciente a Tenant B en un producto de Tenant A", async () => {
      const catB = await createCategory(catalogRepo, tenantB, "ADMIN", {
        code: "EXCLUSIVA-B",
        name: "Exclusiva de B",
      });

      await expect(
        createProduct(catalogRepo, tenantA, {
          sku: "INTENTO-CROSS",
          name: "Intento Cross",
          categoryId: catB.id,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CATEGORY_NOT_FOUND",
          statusCode: 404,
        }),
      );
    });

    it("no permite a Tenant B consultar o modificar un producto de Tenant A", async () => {
      const prodA = await createProduct(catalogRepo, tenantA, {
        sku: "PRIVADO-A",
        name: "Privado de A",
      });

      await expect(
        getProductById(catalogRepo, tenantB, prodA.id),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "PRODUCT_NOT_FOUND",
          statusCode: 404,
        }),
      );

      await expect(
        updateProduct(catalogRepo, tenantB, prodA.id, {
          name: "Alterado",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "PRODUCT_NOT_FOUND",
          statusCode: 404,
        }),
      );
    });
  });
});
