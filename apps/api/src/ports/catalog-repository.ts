// apps/api/src/ports/catalog-repository.ts
// Puerto hexagonal para operaciones de persistencia del catálogo (Categorías y Productos).

import type {
  CategoryDTO,
  CreateCategoryInput,
  CreateProductInput,
  ListProductsFilters,
  PaginationMetaDTO,
  ProductDTO,
  UpdateCategoryInput,
  UpdateProductInput,
} from "@wms/shared-types";

export interface ProductConflictResult {
  conflictBy: "sku" | "barcode";
  product: ProductDTO;
}

export interface CatalogRepositoryPort {
  // ── Categorías ─────────────────────────────────────────────
  listCategories(
    tenantId: string,
    options?: { includeInactive?: boolean },
  ): Promise<CategoryDTO[]>;

  findCategoryById(tenantId: string, id: string): Promise<CategoryDTO | null>;

  findCategoryByCode(
    tenantId: string,
    code: string,
  ): Promise<CategoryDTO | null>;

  createCategory(
    tenantId: string,
    input: CreateCategoryInput,
  ): Promise<CategoryDTO>;

  updateCategory(
    tenantId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryDTO>;

  // ── Productos ──────────────────────────────────────────────
  searchProducts(
    tenantId: string,
    filters: ListProductsFilters,
  ): Promise<{ items: ProductDTO[]; pagination: PaginationMetaDTO }>;

  findProductById(tenantId: string, id: string): Promise<ProductDTO | null>;

  findProductConflict(
    tenantId: string,
    sku: string,
    barcode?: string | null,
    excludeId?: string,
  ): Promise<ProductConflictResult | null>;

  createProduct(
    tenantId: string,
    input: CreateProductInput,
  ): Promise<ProductDTO>;

  updateProduct(
    tenantId: string,
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductDTO>;
}
