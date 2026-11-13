// apps/api/src/adapters/prisma-catalog-repository.ts
// Adaptador de base de datos con Prisma para el catálogo (Categorías y Productos).

import { prisma, type Prisma } from "@wms/db";
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

type PrismaProductWithCategory = Prisma.ProductGetPayload<{
  include: { category: true };
}>;

function mapCategoryToDTO(cat: {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CategoryDTO {
  return {
    id: cat.id,
    code: cat.code,
    name: cat.name,
    description: cat.description,
    isActive: cat.isActive,
    createdAt: cat.createdAt.toISOString(),
    updatedAt: cat.updatedAt.toISOString(),
  };
}

function mapProductToDTO(p: PrismaProductWithCategory): ProductDTO {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    barcode: p.barcode,
    description: p.description,
    categoryId: p.categoryId,
    categoryName: p.category?.name ?? null,
    categoryCode: p.category?.code ?? null,
    weightGrams: p.weightGrams,
    widthCm: p.widthCm,
    heightCm: p.heightCm,
    depthCm: p.depthCm,
    imageUrl: p.imageUrl,
    isActive: p.isActive,
  };
}

export class PrismaCatalogRepositoryAdapter implements CatalogRepositoryPort {
  // ── Categorías ─────────────────────────────────────────────
  public async listCategories(
    tenantId: string,
    options?: { includeInactive?: boolean },
  ): Promise<CategoryDTO[]> {
    const categories = await prisma.category.findMany({
      where: {
        tenantId,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      orderBy: { code: "asc" },
    });

    return categories.map(mapCategoryToDTO);
  }

  public async findCategoryById(
    tenantId: string,
    id: string,
  ): Promise<CategoryDTO | null> {
    const category = await prisma.category.findFirst({
      where: { id, tenantId },
    });
    return category ? mapCategoryToDTO(category) : null;
  }

  public async findCategoryByCode(
    tenantId: string,
    code: string,
  ): Promise<CategoryDTO | null> {
    const normalized = code.trim().toUpperCase();
    const category = await prisma.category.findFirst({
      where: {
        tenantId,
        code: { equals: normalized, mode: "insensitive" },
      },
    });
    return category ? mapCategoryToDTO(category) : null;
  }

  public async createCategory(
    tenantId: string,
    input: CreateCategoryInput,
  ): Promise<CategoryDTO> {
    const created = await prisma.category.create({
      data: {
        tenantId,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        isActive: true,
      },
    });
    return mapCategoryToDTO(created);
  }

  public async updateCategory(
    tenantId: string,
    id: string,
    input: UpdateCategoryInput,
  ): Promise<CategoryDTO> {
    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...(input.code !== undefined
          ? { code: input.code.trim().toUpperCase() }
          : {}),
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return mapCategoryToDTO(updated);
  }

  // ── Productos ──────────────────────────────────────────────
  public async searchProducts(
    tenantId: string,
    filters: ListProductsFilters,
  ): Promise<{ items: ProductDTO[]; pagination: PaginationMetaDTO }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      tenantId,
      ...(filters.includeInactive ? {} : { isActive: true }),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.sku
        ? { sku: { contains: filters.sku.trim(), mode: "insensitive" } }
        : {}),
      ...(filters.barcode ? { barcode: filters.barcode.trim() } : {}),
    };

    if (filters.q && filters.q.trim().length > 0) {
      const q = filters.q.trim();
      where.OR = [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: { category: true },
        orderBy: { sku: "asc" },
        skip,
        take: limit,
      }),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));

    return {
      items: products.map(mapProductToDTO),
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
    const product = await prisma.product.findFirst({
      where: { id, tenantId },
      include: { category: true },
    });
    return product ? mapProductToDTO(product) : null;
  }

  public async findProductConflict(
    tenantId: string,
    sku: string,
    barcode?: string | null,
    excludeId?: string,
  ): Promise<ProductConflictResult | null> {
    const normalizedSku = sku.trim();
    const normalizedBarcode = barcode?.trim();

    const orClauses: Prisma.ProductWhereInput[] = [
      { sku: { equals: normalizedSku, mode: "insensitive" } },
    ];

    if (normalizedBarcode && normalizedBarcode.length > 0) {
      orClauses.push({ barcode: normalizedBarcode });
    }

    const conflict = await prisma.product.findFirst({
      where: {
        tenantId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: orClauses,
      },
      include: { category: true },
    });

    if (!conflict) return null;

    const conflictBy: "sku" | "barcode" =
      conflict.sku.toLowerCase() === normalizedSku.toLowerCase()
        ? "sku"
        : "barcode";

    return {
      conflictBy,
      product: mapProductToDTO(conflict),
    };
  }

  public async createProduct(
    tenantId: string,
    input: CreateProductInput,
  ): Promise<ProductDTO> {
    const created = await prisma.product.create({
      data: {
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
      },
      include: { category: true },
    });

    return mapProductToDTO(created);
  }

  public async updateProduct(
    tenantId: string,
    id: string,
    input: UpdateProductInput,
  ): Promise<ProductDTO> {
    const updated = await prisma.product.update({
      where: { id },
      data: {
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
      },
      include: { category: true },
    });

    return mapProductToDTO(updated);
  }
}
