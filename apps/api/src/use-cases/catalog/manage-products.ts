// apps/api/src/use-cases/catalog/manage-products.ts
// Caso de uso: Gestión y búsqueda del maestro de productos del catálogo WMS.

import { randomInt } from "node:crypto";
import type {
  CreateProductInput,
  ListProductsFilters,
  PaginationMetaDTO,
  ProductDTO,
  UpdateProductInput,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type { CatalogRepositoryPort } from "../../ports/catalog-repository.js";

/**
 * Calcula el dígito de control estándar para un código de barras EAN-13
 * dado sus primeros 12 dígitos numéricos utilizando el algoritmo de ponderación módulo 10.
 */
export function calculateEan13Checksum(first12Digits: string): number {
  if (first12Digits.length !== 12 || !/^\d{12}$/.test(first12Digits)) {
    throw new Error(
      "El cálculo del dígito de control EAN-13 requiere exactamente 12 dígitos numéricos",
    );
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number.parseInt(first12Digits.charAt(i), 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Genera un código de barras EAN-13 interno de distribución restringida (prefijo '20')
 * con 10 dígitos numéricos aleatorios generados de forma segura con crypto.randomInt
 * y su respectivo dígito de control EAN-13 válido (CP-7).
 */
export function generateEan13Barcode(): string {
  let digits = "20";
  for (let i = 0; i < 10; i++) {
    digits += randomInt(0, 10).toString();
  }
  const checksum = calculateEan13Checksum(digits);
  return `${digits}${checksum}`;
}

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
  const normalizedName = input.name?.trim();
  if (!normalizedName || normalizedName.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "El nombre del producto no puede estar vacío",
      400,
    );
  }

  // Validación de categoría si se proporciona
  let categoryCode: string | null = null;
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
    categoryCode = category.code;
  }

  // ── 1. Resolución de SKU (explícito o autogenerado F9.4) ─────
  const rawSku = input.sku?.trim();
  let resolvedSku = "";

  if (rawSku && rawSku.length > 0) {
    resolvedSku = rawSku;
    const skuConflict = await catalogRepo.findProductConflict(
      tenantId,
      resolvedSku,
      undefined,
    );
    if (skuConflict) {
      throw new WmsError(
        "VALIDATION_ERROR",
        `Ya existe un producto con el SKU "${resolvedSku}" en este tenant`,
        409,
        { conflictBy: "sku", existingProductId: skuConflict.product.id },
      );
    }
  } else {
    const prefix = categoryCode ? categoryCode.trim().toUpperCase() : "GEN";
    let seq = 1;
    while (true) {
      const seqStr = seq.toString().padStart(3, "0");
      const candidateSku = `${prefix}-${seqStr}`;
      const conflict = await catalogRepo.findProductConflict(
        tenantId,
        candidateSku,
        undefined,
      );
      if (!conflict) {
        resolvedSku = candidateSku;
        break;
      }
      seq++;
    }
  }

  // ── 2. Resolución de Barcode (explícito o autogenerado EAN-13 F9.4) ─
  const rawBarcode = input.barcode?.trim();
  let resolvedBarcode: string | undefined = undefined;

  if (rawBarcode && rawBarcode.length > 0) {
    resolvedBarcode = rawBarcode;
    const barcodeConflict = await catalogRepo.findProductConflict(
      tenantId,
      resolvedSku,
      resolvedBarcode,
    );
    if (barcodeConflict) {
      const fieldName =
        barcodeConflict.conflictBy === "sku" ? "SKU" : "código de barras";
      const value =
        barcodeConflict.conflictBy === "sku" ? resolvedSku : resolvedBarcode;
      throw new WmsError(
        "VALIDATION_ERROR",
        `Ya existe un producto con el ${fieldName} "${value}" en este tenant`,
        409,
        {
          conflictBy: barcodeConflict.conflictBy,
          existingProductId: barcodeConflict.product.id,
        },
      );
    }
  } else {
    while (true) {
      const candidateBarcode = generateEan13Barcode();
      const conflict = await catalogRepo.findProductConflict(
        tenantId,
        resolvedSku,
        candidateBarcode,
      );
      if (!conflict) {
        resolvedBarcode = candidateBarcode;
        break;
      }
    }
  }

  return catalogRepo.createProduct(tenantId, {
    ...input,
    sku: resolvedSku,
    name: normalizedName,
    barcode: resolvedBarcode,
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
