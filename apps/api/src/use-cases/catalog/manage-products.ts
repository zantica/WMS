// apps/api/src/use-cases/catalog/manage-products.ts
// Caso de uso: Gestión y búsqueda del maestro de productos del catálogo WMS.

import type {
  CreateProductInput,
  ListProductsFilters,
  PaginationMetaDTO,
  ProductDTO,
  UpdateProductInput,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type { CatalogRepositoryPort } from "../../ports/catalog-repository.js";

export async function searchProducts(
  catalogRepo: CatalogRepositoryPort,
  tenantId: string,
  filters: ListProductsFilters = {},
): Promise<{ items: ProductDTO[]; pagination: PaginationMetaDTO }> {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(200, Math.max(1, filters.limit ?? 50));

  return catalogRepo.searchProducts(tenantId, {
    ...filters,
    page,
    limit,
  });
}

export async function getProductById(
  catalogRepo: CatalogRepositoryPort,
  tenantId: string,
  id: string,
): Promise<ProductDTO> {
  const product = await catalogRepo.findProductById(tenantId, id);
  if (!product) {
    throw new WmsError(
      "PRODUCT_NOT_FOUND",
      `Producto con ID "${id}" no encontrado en el catálogo`,
      404,
    );
  }
  return product;
}

export async function createProduct(
  catalogRepo: CatalogRepositoryPort,
  tenantId: string,
  input: CreateProductInput,
): Promise<ProductDTO> {
  const normalizedSku = input.sku.trim();
  if (normalizedSku.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "El SKU del producto no puede estar vacío",
      400,
    );
  }

  const normalizedName = input.name.trim();
  if (normalizedName.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "El nombre del producto no puede estar vacío",
      400,
    );
  }

  const normalizedBarcode = input.barcode?.trim() || undefined;

  // Validación de categoría si se proporciona
  if (input.categoryId) {
    const category = await catalogRepo.findCategoryById(
      tenantId,
      input.categoryId,
    );
    if (!category) {
      throw new WmsError(
        "CATEGORY_NOT_FOUND",
        `Categoría con ID "${input.categoryId}" no encontrada`,
        404,
      );
    }
    if (!category.isActive) {
      throw new WmsError(
        "VALIDATION_ERROR",
        `No se puede asociar una categoría inactiva ("${category.name}") a un producto nuevo`,
        422,
      );
    }
  }

  // Validación de unicidad de SKU y barcode
  const conflict = await catalogRepo.findProductConflict(
    tenantId,
    normalizedSku,
    normalizedBarcode,
  );

  if (conflict) {
    const fieldName = conflict.conflictBy === "sku" ? "SKU" : "código de barras";
    const value =
      conflict.conflictBy === "sku" ? normalizedSku : normalizedBarcode;
    throw new WmsError(
      "VALIDATION_ERROR",
      `Ya existe un producto con el ${fieldName} "${value}" en este tenant`,
      409,
      { conflictBy: conflict.conflictBy, existingProductId: conflict.product.id },
    );
  }

  return catalogRepo.createProduct(tenantId, {
    ...input,
    sku: normalizedSku,
    name: normalizedName,
    barcode: normalizedBarcode,
    description: input.description?.trim(),
  });
}

export async function updateProduct(
  catalogRepo: CatalogRepositoryPort,
  tenantId: string,
  id: string,
  input: UpdateProductInput,
): Promise<ProductDTO> {
  const existing = await catalogRepo.findProductById(tenantId, id);
  if (!existing) {
    throw new WmsError(
      "PRODUCT_NOT_FOUND",
      `Producto con ID "${id}" no encontrado en el catálogo`,
      404,
    );
  }

  const normalizedSku = input.sku !== undefined ? input.sku.trim() : existing.sku;
  if (normalizedSku.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "El SKU del producto no puede estar vacío",
      400,
    );
  }

  let normalizedBarcode: string | null | undefined = input.barcode;
  if (normalizedBarcode !== undefined) {
    normalizedBarcode = normalizedBarcode ? normalizedBarcode.trim() : null;
  } else {
    normalizedBarcode = existing.barcode;
  }

  // Validación de categoría si se actualiza
  if (input.categoryId !== undefined) {
    if (input.categoryId !== null && input.categoryId.trim().length > 0) {
      const category = await catalogRepo.findCategoryById(
        tenantId,
        input.categoryId,
      );
      if (!category) {
        throw new WmsError(
          "CATEGORY_NOT_FOUND",
          `Categoría con ID "${input.categoryId}" no encontrada`,
          404,
        );
      }
      if (!category.isActive && existing.categoryId !== input.categoryId) {
        throw new WmsError(
          "VALIDATION_ERROR",
          `No se puede asociar la categoría inactiva "${category.name}" al producto`,
          422,
        );
      }
    }
  }

  // Validación de conflictos en caso de cambio de SKU o Barcode
  if (
    normalizedSku.toLowerCase() !== existing.sku.toLowerCase() ||
    (normalizedBarcode ?? "") !== (existing.barcode ?? "")
  ) {
    const conflict = await catalogRepo.findProductConflict(
      tenantId,
      normalizedSku,
      normalizedBarcode,
      id,
    );

    if (conflict) {
      const fieldName =
        conflict.conflictBy === "sku" ? "SKU" : "código de barras";
      const value =
        conflict.conflictBy === "sku" ? normalizedSku : normalizedBarcode;
      throw new WmsError(
        "VALIDATION_ERROR",
        `Ya existe otro producto con el ${fieldName} "${value}" en este tenant`,
        409,
        { conflictBy: conflict.conflictBy, existingProductId: conflict.product.id },
      );
    }
  }

  return catalogRepo.updateProduct(tenantId, id, {
    ...input,
    ...(input.sku !== undefined ? { sku: normalizedSku } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.barcode !== undefined ? { barcode: normalizedBarcode } : {}),
    ...(input.description !== undefined
      ? { description: input.description?.trim() ?? null }
      : {}),
    ...(input.categoryId !== undefined
      ? { categoryId: input.categoryId ? input.categoryId.trim() : null }
      : {}),
  });
}
