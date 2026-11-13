// apps/api/src/adapters/prisma-user-repository.ts
// Adaptador Prisma para la administración de usuarios y roles del inquilino (Tenant).

import { prisma, type User as PrismaUser } from "@wms/db";
import type {
  CreateTenantUserInput,
  ListTenantUsersFilters,
  TenantUserDTO,
  UpdateTenantUserInput,
} from "@wms/shared-types";
import type { UserRepositoryPort } from "../ports/user-repository.js";

function mapPrismaUserToDTO(user: PrismaUser): TenantUserDTO {
  return {
    id: user.id,
    tenantId: user.tenantId,
    clerkId: user.clerkId,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}

export class PrismaUserRepositoryAdapter implements UserRepositoryPort {
  public async listUsers(
    tenantId: string,
    filters?: ListTenantUsersFilters,
  ): Promise<TenantUserDTO[]> {
    const users = await prisma.user.findMany({
      where: {
        tenantId,
        ...(filters?.includeInactive ? {} : { isActive: true }),
        ...(filters?.role ? { role: filters.role } : {}),
      },
      orderBy: { name: "asc" },
    });

    return users.map(mapPrismaUserToDTO);
  }

  public async findUserById(
    tenantId: string,
    id: string,
  ): Promise<TenantUserDTO | null> {
    const user = await prisma.user.findFirst({
      where: { id, tenantId },
    });
    return user ? mapPrismaUserToDTO(user) : null;
  }

  public async findUserByEmail(
    tenantId: string,
    email: string,
  ): Promise<TenantUserDTO | null> {
    const normalized = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        tenantId,
        email: { equals: normalized, mode: "insensitive" },
      },
    });
    return user ? mapPrismaUserToDTO(user) : null;
  }

  public async findUserByClerkId(
    clerkId: string,
    tenantId?: string,
  ): Promise<TenantUserDTO | null> {
    const user = await prisma.user.findFirst({
      where: {
        clerkId,
        ...(tenantId ? { tenantId } : {}),
      },
    });
    return user ? mapPrismaUserToDTO(user) : null;
  }

  public async createUser(
    tenantId: string,
    input: CreateTenantUserInput,
  ): Promise<TenantUserDTO> {
    const user = await prisma.user.create({
      data: {
        tenantId,
        clerkId: input.clerkId ?? `clerk_${crypto.randomUUID()}`,
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        role: input.role,
        isActive: true,
      },
    });
    return mapPrismaUserToDTO(user);
  }

  public async updateUser(
    tenantId: string,
    id: string,
    input: UpdateTenantUserInput,
  ): Promise<TenantUserDTO> {
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.email !== undefined
          ? { email: input.email.trim().toLowerCase() }
          : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
    return mapPrismaUserToDTO(user);
  }
}
