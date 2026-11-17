// apps/api/src/adapters/in-memory-user-repository.ts
// Adaptador en memoria para administración de usuarios, roles y autenticación en tests unitarios.

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

function toPublicDTO(record: UserWithAuthRecord): TenantUserDTO {
  return {
    id: record.id,
    tenantId: record.tenantId,
    clerkId: record.clerkId,
    name: record.name,
    email: record.email,
    role: record.role,
    isActive: record.isActive,
  };
}

export class InMemoryUserRepository implements UserRepositoryPort {
  private users: UserWithAuthRecord[] = [];
  private tenants: Set<string> = new Set(["demo-tenant"]);
  private defaultTenantId: string | null = "demo-tenant";

  public async listUsers(
    tenantId: string,
    filters?: ListTenantUsersFilters,
  ): Promise<TenantUserDTO[]> {
    return this.users
      .filter((u) => {
        if (u.tenantId !== tenantId) return false;
        if (!filters?.includeInactive && !u.isActive) return false;
        if (filters?.role && u.role !== filters.role) return false;
        return true;
      })
      .map(toPublicDTO);
  }

  public async findUserById(
    tenantId: string,
    id: string,
  ): Promise<TenantUserDTO | null> {
    const found = this.users.find(
      (u) => u.tenantId === tenantId && u.id === id,
    );
    return found ? toPublicDTO(found) : null;
  }

  public async findUserByIdGlobal(id: string): Promise<TenantUserDTO | null> {
    const found = this.users.find((u) => u.id === id);
    return found ? toPublicDTO(found) : null;
  }

  public async findUserByEmail(
    tenantId: string,
    email: string,
  ): Promise<TenantUserDTO | null> {
    const normalized = email.trim().toLowerCase();
    const found = this.users.find(
      (u) =>
        u.tenantId === tenantId && u.email.trim().toLowerCase() === normalized,
    );
    return found ? toPublicDTO(found) : null;
  }

  public async findUserByEmailForAuth(
    email: string,
    tenantId?: string,
  ): Promise<UserWithAuthRecord | null> {
    const normalized = email.trim().toLowerCase();
    const matches = this.users.filter((u) => {
      if (u.email.trim().toLowerCase() !== normalized) return false;
      if (tenantId && u.tenantId !== tenantId) return false;
      return true;
    });

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

    return { ...matches[0]! };
  }

  public async findUserByClerkId(
    clerkId: string,
    tenantId?: string,
  ): Promise<TenantUserDTO | null> {
    const found = this.users.find((u) => {
      if (u.clerkId !== clerkId) return false;
      if (tenantId && u.tenantId !== tenantId) return false;
      return true;
    });
    return found ? toPublicDTO(found) : null;
  }

  public async countSuperusers(): Promise<number> {
    return this.users.filter((u) => u.role === "SUPERUSER").length;
  }

  public async resolveDefaultTenantId(): Promise<string | null> {
    return this.defaultTenantId;
  }

  public async tenantExists(tenantId: string): Promise<boolean> {
    return this.tenants.has(tenantId);
  }

  public async createUser(
    tenantId: string,
    input: CreateUserRepoInput,
  ): Promise<TenantUserDTO> {
    this.tenants.add(tenantId);
    const user: UserWithAuthRecord = {
      id: `usr_${crypto.randomUUID()}`,
      tenantId,
      clerkId: input.clerkId ?? `clerk_${crypto.randomUUID()}`,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      passwordHash: input.passwordHash ?? null,
      isActive: true,
    };
    this.users.push(user);
    return toPublicDTO(user);
  }

  public async updateUser(
    tenantId: string,
    id: string,
    input: UpdateUserRepoInput,
  ): Promise<TenantUserDTO> {
    const index = this.users.findIndex(
      (u) => u.tenantId === tenantId && u.id === id,
    );
    if (index === -1) {
      throw new Error(`User ${id} not found in tenant ${tenantId}`);
    }

    const current = this.users[index]!;
    const updated: UserWithAuthRecord = {
      ...current,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.email !== undefined
        ? { email: input.email.trim().toLowerCase() }
        : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.passwordHash !== undefined
        ? { passwordHash: input.passwordHash }
        : {}),
    };

    this.users[index] = updated;
    return toPublicDTO(updated);
  }

  // ── Métodos de prueba ──────────────────────────────────────
  public seedUser(
    user: TenantUserDTO & { passwordHash?: string | null | undefined },
  ): void {
    this.tenants.add(user.tenantId);
    this.users.push({
      ...user,
      passwordHash: user.passwordHash ?? null,
    });
  }

  public seedTenant(tenantId: string, makeDefault = false): void {
    this.tenants.add(tenantId);
    if (makeDefault) {
      this.defaultTenantId = tenantId;
    }
  }

  public setDefaultTenantId(tenantId: string | null): void {
    this.defaultTenantId = tenantId;
  }

  public clear(): void {
    this.users = [];
    this.tenants = new Set(["demo-tenant"]);
    this.defaultTenantId = "demo-tenant";
  }
}
