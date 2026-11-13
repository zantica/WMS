// apps/api/src/adapters/in-memory-catalog-repository.ts
// Adaptador en memoria para el catálogo (Categorías y Productos) útil para tests unitarios y TDD.

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
import type {
  CatalogRepositoryPort,
  ProductConflictResult,
} from "../ports/catalog-repository.js";

interface StoredCategory extends CategoryDTO {
  tenantId: string;
}

interface StoredProduct {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  barcode: string | null;
  description: string | null;
  categoryId: string | null;
  weightGrams: number | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  imageUrl: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class InMemoryCatalogRepository implements CatalogRepositoryPort {
  private categories: StoredCategory[] = [];
  private products: StoredProduct[] = [];

  // ── Helpers ────────────────────────────────────────────────
  private resolveProductDTO(product: StoredProduct): ProductDTO {
    const category = product.categoryId
      ? this.categories.find(
          (c) => c.tenantId === product.tenantId && c.id === product.categoryId,
        )
      : undefined;

    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      barcode: product.barcode,
      description: product.description,
      categoryId: product.categoryId,
      categoryName: category?.name ?? null,
      categoryCode: category?.code ?? null,
      weightGrams: product.weightGrams,
      widthCm: product.widthCm,
      heightCm: product.heightCm,
      depthCm: product.depthCm,
      imageUrl: product.imageUrl,
      isActive: product.isActive,
    };
  }

  // ── Categorías ─────────────────────────────────────────────
  public async listCategories(
    tenantId: string,
    options?: { includeInactive?: boolean },
  ): Promise<CategoryDTO[]> {
    return this.categories
      .filter((c) => {
        if (c.tenantId !== tenantId) return false;
        if (!options?.includeInactive && !c.isActive) return false;
        return true;
      })
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(({ tenantId: _t, ...rest }) => rest);
  }

  public async findCategoryById(
    tenantId: string,
    id: string,
  ): Promise<CategoryDTO | null> {
    const found = this.categories.find(
      (c) => c.tenantId === tenantId && c.id === id,
    );
    if (!found) return null;
    const { tenantId: _t, ...rest } = found;
    return rest;
  }

  public async findCategoryByCode(
    tenantId: string,
    code: string,
  ): Promise<CategoryDTO | null> {
    const normalized = code.trim().toUpperCase();
    const found = this.categories.find(
      (c) => c.tenantId === tenantId && c.code.toUpperCase() === normalized,
    );
    if (!found) return null;
    const { tenantId: _t, ...rest } = found;
    return rest;
  }

  public async createCategory(
    tenantId: string,
    input: CreateCategoryInput,
  ): Promise<CategoryDTO> {
    const now = new Date().toISOString();
    const category: StoredCategory = {
      id: `cat_${crypto.randomUUID()}`,
      tenantId,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    this.categories.push(category);
    const { tenantId: _t, ...rest } = category;
    return rest;
  }

  public async updateCategory(
    tenantId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryDTO> {
    const index = this.categories.findIndex(
      (c) => c.tenantId === tenantId && c.id === id,
    );
    if (index === -1) {
      throw new Error(`Category ${id} not found`);
    }

    const current = this.categories[index]!;
    const updated: StoredCategory = {
      ...current,
      ...(input.code !== undefined
        ? { code: input.code.trim().toUpperCase() }
        : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date().toISOString(),
    };

    this.categories[index] = updated;
    const { tenantId: _t, ...rest } = updated;
    return rest;
  }

  // ── Productos ──────────────────────────────────────────────
  public async searchProducts(
    tenantId: string,
    filters: ListProductsFilters,
  ): Promise<{ items: ProductDTO[]; pagination: PaginationMetaDTO }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const normalizedSku = filters.sku?.trim().toLowerCase();
    const normalizedBarcode = filters.barcode?.trim();
    const normalizedQ = filters.q?.trim().toLowerCase();

    const filtered = this.products.filter((p) => {
      if (p.tenantId !== tenantId) return false;
      if (!filters.includeInactive && !p.isActive) return false;
      if (filters.categoryId && p.categoryId !== filters.categoryId)
        return false;
      if (normalizedSku && !p.sku.toLowerCase().includes(normalizedSku))
        return false;
      if (normalizedBarcode && p.barcode !== normalizedBarcode) return false;
      if (normalizedQ) {
        const inSku = p.sku.toLowerCase().includes(normalizedQ);
        const inName = p.name.toLowerCase().includes(normalizedQ);
        const inBarcode =
          p.barcode !== null && p.barcode.toLowerCase().includes(normalizedQ);
        const inDesc =
          p.description !== null &&
          p.description.toLowerCase().includes(normalizedQ);
        if (!inSku && !inName && !inBarcode && !inDesc) return false;
      }
      return true;
    });

    filtered.sort((a, b) => a.sku.localeCompare(b.sku));

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = filtered
      .slice(start, start + limit)
      .map((p) => this.resolveProductDTO(p));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        pages,
      },
    };
  }

  public async findProductById(
    tenantId: string,
    id: string,
  ): Promise<ProductDTO | null> {
    const found = this.products.find(
      (p) => p.tenantId === tenantId && p.id === id,
    );
    if (!found) return null;
    return this.resolveProductDTO(found);
  }

  public async findProductConflict(
    tenantId: string,
    sku: string,
    barcode?: string | null,
    excludeId?: string,
  ): Promise<ProductConflictResult | null> {
    const targetSku = sku.trim().toLowerCase();
    const targetBarcode = barcode?.trim();

    for (const p of this.products) {
      if (p.tenantId !== tenantId) continue;
      if (excludeId && p.id === excludeId) continue;

      if (p.sku.toLowerCase() === targetSku) {
        return { conflictBy: "sku", product: this.resolveProductDTO(p) };
      }
      if (
        targetBarcode &&
        p.barcode &&
        p.barcode.toLowerCase() === targetBarcode.toLowerCase()
      ) {
        return { conflictBy: "barcode", product: this.resolveProductDTO(p) };
      }
    }

    return null;
  }

  public async createProduct(
    tenantId: string,
    input: CreateProductInput,
  ): Promise<ProductDTO> {
    const now = new Date().toISOString();
    const product: StoredProduct = {
      id: `prod_${crypto.randomUUID()}`,
      tenantId,
      sku: input.sku.trim(),
      name: input.name.trim(),
      barcode: input.barcode?.trim() ?? null,
      description: input.description?.trim() ?? null,
      categoryId: input.categoryId ?? null,
      weightGrams: input.weightGrams ?? null,
      widthCm: input.widthCm ?? null,
      heightCm: input.heightCm ?? null,
      depthCm: input.depthCm ?? null,
      imageUrl: input.imageUrl?.trim() ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.products.push(product);
    return this.resolveProductDTO(product);
  }

  public async updateProduct(
    tenantId: string,
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductDTO> {
    const index = this.products.findIndex(
      (p) => p.tenantId === tenantId && p.id === id,
    );
    if (index === -1) {
      throw new Error(`Product ${id} not found`);
    }

    const current = this.products[index]!;
    const updated: StoredProduct = {
      ...current,
      ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.barcode !== undefined
        ? { barcode: input.barcode ? input.barcode.trim() : null }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.categoryId !== undefined
        ? { categoryId: input.categoryId }
        : {}),
      ...(input.weightGrams !== undefined
        ? { weightGrams: input.weightGrams }
        : {}),
      ...(input.widthCm !== undefined ? { widthCm: input.widthCm } : {}),
      ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
      ...(input.depthCm !== undefined ? { depthCm: input.depthCm } : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date().toISOString(),
    };

    this.products[index] = updated;
    return this.resolveProductDTO(updated);
  }

  // ── Métodos para configuración en tests ─────────────────────
  public seedCategory(category: CategoryDTO & { tenantId: string }): void {
    this.categories.push({ ...category });
  }

  public seedProduct(
    product: ProductDTO & { tenantId: string },
  ): void {
    const now = new Date().toISOString();
    this.products.push({
      id: product.id,
      tenantId: product.tenantId,
      sku: product.sku,
      name: product.name,
      barcode: product.barcode ?? null,
      description: product.description ?? null,
      categoryId: product.categoryId ?? null,
      weightGrams: product.weightGrams ?? null,
      widthCm: product.widthCm ?? null,
      heightCm: product.heightCm ?? null,
      depthCm: product.depthCm ?? null,
      imageUrl: product.imageUrl ?? null,
      isActive: product.isActive,
      createdAt: now,
      updatedAt: now,
    });
  }

  public clear(): void {
    this.categories = [];
    this.products = [];
  }
}
