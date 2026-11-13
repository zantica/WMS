// apps/api/src/use-cases/catalog/manage-categories.ts
// Caso de uso: Gestión de categorías de catálogo operativas WMS.

import type {
  CategoryDTO,
  CreateCategoryInput,
  UpdateCategoryInput,
  UserRole,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type { CatalogRepositoryPort } from "../../ports/catalog-repository.js";

function assertCanManageCategories(actorRole: UserRole): void {
  if (actorRole !== "ADMIN" && actorRole !== "SUPERVISOR") {
    throw new WmsError(
      "FORBIDDEN",
      "Solo administradores y supervisores pueden gestionar categorías de catálogo",
      403,
    );
  }
}

export async function listCategories(
  catalogRepo: CatalogRepositoryPort,
  tenantId: string,
  options?: { includeInactive?: boolean },
): Promise<CategoryDTO[]> {
  return catalogRepo.listCategories(tenantId, options);
}

export async function createCategory(
  catalogRepo: CatalogRepositoryPort,
  tenantId: string,
  actorRole: UserRole,
  input: CreateCategoryInput,
): Promise<CategoryDTO> {
  assertCanManageCategories(actorRole);

  const normalizedCode = input.code.trim().toUpperCase();
  if (normalizedCode.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "El código de la categoría no puede estar vacío",
      400,
    );
  }

  const normalizedName = input.name.trim();
  if (normalizedName.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "El nombre de la categoría no puede estar vacío",
      400,
    );
  }

  const existing = await catalogRepo.findCategoryByCode(
    tenantId,
    normalizedCode,
  );
  if (existing) {
    throw new WmsError(
      "CONFLICT",
      `La categoría con código "${normalizedCode}" ya existe en este tenant`,
      409,
    );
  }

  return catalogRepo.createCategory(tenantId, {
    code: normalizedCode,
    name: normalizedName,
    description: input.description?.trim(),
  });
}

export async function updateCategory(
  catalogRepo: CatalogRepositoryPort,
  tenantId: string,
  actorRole: UserRole,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryDTO> {
  assertCanManageCategories(actorRole);

  const existing = await catalogRepo.findCategoryById(tenantId, id);
  if (!existing) {
    throw new WmsError(
      "CATEGORY_NOT_FOUND",
      `Categoría con ID "${id}" no encontrada`,
      404,
    );
  }

  let normalizedCode: string | undefined;
  if (input.code !== undefined) {
    normalizedCode = input.code.trim().toUpperCase();
    if (normalizedCode.length === 0) {
      throw new WmsError(
        "VALIDATION_ERROR",
        "El código de categoría no puede estar vacío",
        400,
      );
    }

    if (normalizedCode !== existing.code) {
      const conflict = await catalogRepo.findCategoryByCode(
        tenantId,
        normalizedCode,
      );
      if (conflict && conflict.id !== id) {
        throw new WmsError(
          "CONFLICT",
          `La categoría con código "${normalizedCode}" ya existe en este tenant`,
          409,
        );
      }
    }
  }

  return catalogRepo.updateCategory(tenantId, id, {
    ...(normalizedCode !== undefined ? { code: normalizedCode } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined
      ? { description: input.description }
      : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  });
}
