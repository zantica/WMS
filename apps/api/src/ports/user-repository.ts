// apps/api/src/ports/user-repository.ts
// Puerto hexagonal para la administración de usuarios, roles y lookup controlado de autenticación.

import type {
  CreateTenantUserInput,
  ListTenantUsersFilters,
  TenantUserDTO,
  UpdateTenantUserInput,
} from "@wms/shared-types";

export interface UserWithAuthRecord extends TenantUserDTO {
  passwordHash: string | null;
}

export interface CreateUserRepoInput extends CreateTenantUserInput {
  passwordHash?: string | null | undefined;
}

export interface UpdateUserRepoInput extends UpdateTenantUserInput {
  passwordHash?: string | null | undefined;
}

export interface UserRepositoryPort {
  listUsers(
    tenantId: string,
    filters?: ListTenantUsersFilters,
  ): Promise<TenantUserDTO[]>;

  findUserById(tenantId: string, id: string): Promise<TenantUserDTO | null>;

  findUserByIdGlobal(id: string): Promise<TenantUserDTO | null>;

  findUserByEmail(tenantId: string, email: string): Promise<TenantUserDTO | null>;

  findUserByEmailForAuth(
    email: string,
    tenantId?: string,
  ): Promise<UserWithAuthRecord | null>;

  findUserByClerkId(
    clerkId: string,
    tenantId?: string,
  ): Promise<TenantUserDTO | null>;

  countSuperusers(): Promise<number>;

  resolveDefaultTenantId(): Promise<string | null>;

  tenantExists(tenantId: string): Promise<boolean>;

  createUser(
    tenantId: string,
    input: CreateUserRepoInput,
  ): Promise<TenantUserDTO>;

  updateUser(
    tenantId: string,
    id: string,
    input: UpdateUserRepoInput,
  ): Promise<TenantUserDTO>;
}
