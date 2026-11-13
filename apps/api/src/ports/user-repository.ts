// apps/api/src/ports/user-repository.ts
// Puerto hexagonal para la administración de usuarios y roles del inquilino (Tenant).

import type {
  CreateTenantUserInput,
  ListTenantUsersFilters,
  TenantUserDTO,
  UpdateTenantUserInput,
} from "@wms/shared-types";

export interface UserRepositoryPort {
  listUsers(
    tenantId: string,
    filters?: ListTenantUsersFilters,
  ): Promise<TenantUserDTO[]>;

  findUserById(tenantId: string, id: string): Promise<TenantUserDTO | null>;

  findUserByEmail(tenantId: string, email: string): Promise<TenantUserDTO | null>;

  findUserByClerkId(
    clerkId: string,
    tenantId?: string,
  ): Promise<TenantUserDTO | null>;

  createUser(
    tenantId: string,
    input: CreateTenantUserInput,
  ): Promise<TenantUserDTO>;

  updateUser(
    tenantId: string,
    id: string,
    input: UpdateTenantUserInput,
  ): Promise<TenantUserDTO>;
}
