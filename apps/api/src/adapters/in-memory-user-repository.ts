// apps/api/src/adapters/in-memory-user-repository.ts
// Adaptador en memoria para administración de usuarios de inquilinos (Tenant).

import type {
  CreateTenantUserInput,
  ListTenantUsersFilters,
  TenantUserDTO,
  UpdateTenantUserInput,
} from "@wms/shared-types";
import type { UserRepositoryPort } from "../ports/user-repository.js";

export class InMemoryUserRepository implements UserRepositoryPort {
  private users: TenantUserDTO[] = [];

  public async listUsers(
    tenantId: string,
    filters?: ListTenantUsersFilters,
  ): Promise<TenantUserDTO[]> {
    return this.users.filter((u) => {
      if (u.tenantId !== tenantId) return false;
      if (!filters?.includeInactive && !u.isActive) return false;
      if (filters?.role && u.role !== filters.role) return false;
      return true;
    });
  }

  public async findUserById(
    tenantId: string,
    id: string,
  ): Promise<TenantUserDTO | null> {
    const found = this.users.find(
      (u) => u.tenantId === tenantId && u.id === id,
    );
    return found ? { ...found } : null;
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
    return found ? { ...found } : null;
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
    return found ? { ...found } : null;
  }

  public async createUser(
    tenantId: string,
    input: CreateTenantUserInput,
  ): Promise<TenantUserDTO> {
    const user: TenantUserDTO = {
      id: `usr_${crypto.randomUUID()}`,
      tenantId,
      clerkId: input.clerkId ?? `clerk_${crypto.randomUUID()}`,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: input.role,
      isActive: true,
    };
    this.users.push(user);
    return { ...user };
  }

  public async updateUser(
    tenantId: string,
    id: string,
    input: UpdateTenantUserInput,
  ): Promise<TenantUserDTO> {
    const index = this.users.findIndex(
      (u) => u.tenantId === tenantId && u.id === id,
    );
    if (index === -1) {
      throw new Error(`User ${id} not found in tenant ${tenantId}`);
    }

    const current = this.users[index]!;
    const updated: TenantUserDTO = {
      ...current,
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.email !== undefined
        ? { email: input.email.trim().toLowerCase() }
        : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    this.users[index] = updated;
    return { ...updated };
  }

  // ── Métodos de prueba ──────────────────────────────────────
  public seedUser(user: TenantUserDTO): void {
    this.users.push({ ...user });
  }

  public clear(): void {
    this.users = [];
  }
}
