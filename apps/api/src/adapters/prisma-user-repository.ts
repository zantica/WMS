// apps/api/src/adapters/prisma-user-repository.ts
// Adaptador Prisma para administración de usuarios, roles y lookup controlado de autenticación con RLS.

import {
  prisma,
  withAuthClerkLookup,
  withAuthEmailLookup,
  withAuthSuperuserCheck,
  withTenantContext,
  type User as PrismaUser,
} from "@wms/db";
import type {
  ListTenantUsersFilters,
  TenantUserDTO,
} from "@wms/shared-types";
import { WmsError } from "../plugins/error-handler.js";
import type {
  CreateUserRepoInput,
  UpdateUserRepoInput,
  UserRepositoryPort,
  UserWithAuthRecord,
} from "../ports/user-repository.js";

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

function mapPrismaUserToAuthRecord(user: PrismaUser): UserWithAuthRecord {
  return {
    ...mapPrismaUserToDTO(user),
    passwordHash: user.passwordHash ?? null,
  };
}

export class PrismaUserRepositoryAdapter implements UserRepositoryPort {
  public async listUsers(
    tenantId: string,
    filters?: ListTenantUsersFilters,
  ): Promise<TenantUserDTO[]> {
    const users = await withTenantContext(prisma, tenantId, async (tx) =>
      tx.user.findMany({
        where: {
          tenantId,
          ...(filters?.includeInactive ? {} : { isActive: true }),
          ...(filters?.role ? { role: filters.role } : {}),
        },
        orderBy: { name: "asc" },
      }),
    );

    return users.map(mapPrismaUserToDTO);
  }

  public async findUserById(
    tenantId: string,
    id: string,
  ): Promise<TenantUserDTO | null> {
    const user = await withTenantContext(prisma, tenantId, async (tx) =>
      tx.user.findFirst({
        where: { id, tenantId },
      }),
    );
    return user ? mapPrismaUserToDTO(user) : null;
  }

  public async findUserByIdGlobal(id: string): Promise<TenantUserDTO | null> {
    const user = await withAuthSuperuserCheck(prisma, async (tx) =>
      tx.user.findUnique({
        where: { id },
      }),
    );
    return user ? mapPrismaUserToDTO(user) : null;
  }

  public async findUserByEmail(
    tenantId: string,
    email: string,
  ): Promise<TenantUserDTO | null> {
    const normalized = email.trim().toLowerCase();
    const user = await withTenantContext(prisma, tenantId, async (tx) =>
      tx.user.findFirst({
        where: {
          tenantId,
          email: { equals: normalized, mode: "insensitive" },
        },
      }),
    );
    return user ? mapPrismaUserToDTO(user) : null;
  }

  public async findUserByEmailForAuth(
    email: string,
    tenantId?: string,
  ): Promise<UserWithAuthRecord | null> {
    const normalized = email.trim().toLowerCase();
    const matches = await withAuthEmailLookup(
      prisma,
      normalized,
      async (tx) =>
        tx.user.findMany({
          where: {
            email: { equals: normalized, mode: "insensitive" },
            ...(tenantId ? { tenantId } : {}),
          },
          orderBy: { id: "asc" },
        }),
    );

    if (matches.length === 0) {
      return null;
    }

    if (matches.length > 1) {
      throw new WmsError(
        "CONFLICT",
        "Multiple tenant accounts match this email; specify tenantId",
        409,
      );
    }

    return mapPrismaUserToAuthRecord(matches[0]!);
  }

  public async findUserByClerkId(
    clerkId: string,
    tenantId?: string,
  ): Promise<TenantUserDTO | null> {
    if (tenantId) {
      const user = await withTenantContext(prisma, tenantId, async (tx) =>
        tx.user.findFirst({
          where: { clerkId, tenantId },
        }),
      );
      return user ? mapPrismaUserToDTO(user) : null;
    }

    const user = await withAuthClerkLookup(prisma, clerkId, async (tx) =>
      tx.user.findFirst({
        where: { clerkId },
      }),
    );
    return user ? mapPrismaUserToDTO(user) : null;
  }

  public async countSuperusers(): Promise<number> {
    return withAuthSuperuserCheck(prisma, async (tx) =>
      tx.user.count({
        where: { role: "SUPERUSER" },
      }),
    );
  }

  public async resolveDefaultTenantId(): Promise<string | null> {
    const demoTenant = await prisma.tenant.findUnique({
      where: { slug: "demo-tenant" },
      select: { id: true },
    });
    if (demoTenant) {
      return demoTenant.id;
    }

    const firstTenant = await prisma.tenant.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return firstTenant?.id ?? null;
  }

  public async tenantExists(tenantId: string): Promise<boolean> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    return tenant !== null;
  }

  public async createUser(
    tenantId: string,
    input: CreateUserRepoInput,
  ): Promise<TenantUserDTO> {
    const user = await withTenantContext(prisma, tenantId, async (tx) =>
      tx.user.create({
        data: {
          tenantId,
          clerkId: input.clerkId ?? `clerk_${crypto.randomUUID()}`,
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          role: input.role,
          passwordHash: input.passwordHash ?? null,
          isActive: true,
        },
      }),
    );
    return mapPrismaUserToDTO(user);
  }

  public async updateUser(
    tenantId: string,
    id: string,
    input: UpdateUserRepoInput,
  ): Promise<TenantUserDTO> {
    const user = await withTenantContext(prisma, tenantId, async (tx) =>
      tx.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.email !== undefined
            ? { email: input.email.trim().toLowerCase() }
            : {}),
          ...(input.role !== undefined ? { role: input.role } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.passwordHash !== undefined
            ? { passwordHash: input.passwordHash }
            : {}),
        },
      }),
    );
    return mapPrismaUserToDTO(user);
  }
}
