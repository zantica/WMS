// apps/api/src/use-cases/catalog/__tests__/manage-categories.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryCatalogRepository } from "../../../adapters/in-memory-catalog-repository.js";
import { WmsError } from "../../../plugins/error-handler.js";
import {
  createCategory,
  listCategories,
  updateCategory,
} from "../manage-categories.js";

describe("Caso de Uso: Gestión de Categorías de Catálogo (F9.1)", () => {
  let catalogRepo: InMemoryCatalogRepository;
  const tenantA = "tenant_cat_a";
  const tenantB = "tenant_cat_b";

  beforeEach(() => {
    catalogRepo = new InMemoryCatalogRepository();
  });

  describe("1. Happy Path", () => {
    it("crea una categoría con rol ADMIN normalizando código a mayúsculas", async () => {
      const created = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "  electronica ",
        name: "  Electrónica y Gadgets ",
        description: "Dispositivos electrónicos",
      });

      expect(created.id).toBeDefined();
      expect(created.code).toBe("ELECTRONICA");
      expect(created.name).toBe("Electrónica y Gadgets");
      expect(created.description).toBe("Dispositivos electrónicos");
      expect(created.isActive).toBe(true);
    });

    it("crea una categoría con rol SUPERVISOR", async () => {
      const created = await createCategory(catalogRepo, tenantA, "SUPERVISOR", {
        code: "HOGAR",
        name: "Hogar y Cocina",
      });

      expect(created.code).toBe("HOGAR");
    });

    it("lista categorías activas del tenant ordenadas alfabéticamente por código", async () => {
      await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "ZAPATOS",
        name: "Zapatos",
      });
      await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "ACCESORIOS",
        name: "Accesorios",
      });

      const list = await listCategories(catalogRepo, tenantA);
      expect(list).toHaveLength(2);
      expect(list[0]?.code).toBe("ACCESORIOS");
      expect(list[1]?.code).toBe("ZAPATOS");
    });

    it("actualiza datos, código e isActive de una categoría", async () => {
      const created = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "FERRETERIA",
        name: "Ferretería",
      });

      const updated = await updateCategory(
        catalogRepo,
        tenantA,
        "ADMIN",
        created.id,
        {
          code: "BRICOLAJE",
          name: "Bricolaje y Herramientas",
          isActive: false,
        },
      );

      expect(updated.code).toBe("BRICOLAJE");
      expect(updated.name).toBe("Bricolaje y Herramientas");
      expect(updated.isActive).toBe(false);

      // Listar sin includeInactive no la devuelve
      const activeList = await listCategories(catalogRepo, tenantA);
      expect(activeList).toHaveLength(0);

      // Con includeInactive sí
      const allList = await listCategories(catalogRepo, tenantA, {
        includeInactive: true,
      });
      expect(allList).toHaveLength(1);
      expect(allList[0]?.code).toBe("BRICOLAJE");
    });
  });

  describe("2. Casos Borde (Edge Cases)", () => {
    it("permite descripción opcional o vacía", async () => {
      const created = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "JUGUETES",
        name: "Juguetes",
      });
      expect(created.description).toBeNull();
    });

    it("actualiza sin modificar el código si no se envía", async () => {
      const created = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "ALIMENTOS",
        name: "Alimentos",
      });

      const updated = await updateCategory(
        catalogRepo,
        tenantA,
        "SUPERVISOR",
        created.id,
        {
          name: "Alimentos y Bebidas",
        },
      );

      expect(updated.code).toBe("ALIMENTOS");
      expect(updated.name).toBe("Alimentos y Bebidas");
    });
  });

  describe("3. Errores de Dominio y Validación", () => {
    it("rechaza creación si el rol es OPERATOR (403 FORBIDDEN)", async () => {
      await expect(
        createCategory(catalogRepo, tenantA, "OPERATOR", {
          code: "ROPA",
          name: "Ropa",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "FORBIDDEN",
          statusCode: 403,
        }),
      );
    });

    it("rechaza actualización si el rol es OPERATOR (403 FORBIDDEN)", async () => {
      const created = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "ROPA",
        name: "Ropa",
      });

      await expect(
        updateCategory(catalogRepo, tenantA, "OPERATOR", created.id, {
          name: "Nuevo Nombre",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "FORBIDDEN",
          statusCode: 403,
        }),
      );
    });

    it("rechaza código vacío con 400 VALIDATION_ERROR", async () => {
      await expect(
        createCategory(catalogRepo, tenantA, "ADMIN", {
          code: "   ",
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
        createCategory(catalogRepo, tenantA, "ADMIN", {
          code: "VALIDO",
          name: "  ",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 400,
        }),
      );
    });

    it("rechaza actualizar categoría con código vacío con 400 VALIDATION_ERROR", async () => {
      const cat = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "VALIDA",
        name: "Válida",
      });

      await expect(
        updateCategory(catalogRepo, tenantA, "ADMIN", cat.id, {
          code: "   ",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 400,
        }),
      );
    });

    it("rechaza categoría duplicada por código en el mismo tenant con 409 CONFLICT", async () => {
      await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "TEXTIL",
        name: "Textiles",
      });

      await expect(
        createCategory(catalogRepo, tenantA, "ADMIN", {
          code: "textil",
          name: "Otro Textil",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CONFLICT",
          statusCode: 409,
        }),
      );
    });

    it("rechaza actualización de categoría inexistente con 404 CATEGORY_NOT_FOUND", async () => {
      await expect(
        updateCategory(catalogRepo, tenantA, "ADMIN", "cat_inexistente", {
          name: "Nombre",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CATEGORY_NOT_FOUND",
          statusCode: 404,
        }),
      );
    });

    it("rechaza actualizar código a uno ya existente con 409 CONFLICT", async () => {
      const cat1 = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "CAT1",
        name: "Cat 1",
      });
      await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "CAT2",
        name: "Cat 2",
      });

      await expect(
        updateCategory(catalogRepo, tenantA, "ADMIN", cat1.id, {
          code: "CAT2",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CONFLICT",
          statusCode: 409,
        }),
      );
    });
  });

  describe("4. Aislamiento Multi-Tenant", () => {
    it("permite el mismo código de categoría en tenants diferentes sin colisión", async () => {
      const catA = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "COMUN",
        name: "Común en Tenant A",
      });
      const catB = await createCategory(catalogRepo, tenantB, "ADMIN", {
        code: "COMUN",
        name: "Común en Tenant B",
      });

      expect(catA.id).not.toBe(catB.id);
      expect(catA.code).toBe("COMUN");
      expect(catB.code).toBe("COMUN");

      const listA = await listCategories(catalogRepo, tenantA);
      const listB = await listCategories(catalogRepo, tenantB);

      expect(listA).toHaveLength(1);
      expect(listA[0]?.name).toBe("Común en Tenant A");

      expect(listB).toHaveLength(1);
      expect(listB[0]?.name).toBe("Común en Tenant B");
    });

    it("no permite a Tenant B modificar una categoría de Tenant A", async () => {
      const catA = await createCategory(catalogRepo, tenantA, "ADMIN", {
        code: "SECRETO",
        name: "Categoría de A",
      });

      await expect(
        updateCategory(catalogRepo, tenantB, "ADMIN", catA.id, {
          name: "Hackeado",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CATEGORY_NOT_FOUND",
          statusCode: 404,
        }),
      );
    });
  });
});
