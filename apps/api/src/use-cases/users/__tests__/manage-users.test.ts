// apps/api/src/use-cases/users/__tests__/manage-users.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryUserRepository } from "../../../adapters/in-memory-user-repository.js";
import {
  createTenantUser,
  listTenantUsers,
  updateTenantUser,
} from "../manage-users.js";

describe("Caso de Uso: Gestión de Usuarios y Roles de Tenant (F9.1)", () => {
  let userRepo: InMemoryUserRepository;
  const tenantA = "tenant_user_a";
  const tenantB = "tenant_user_b";

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
  });

  describe("1. Happy Path", () => {
    it("permite a un ADMIN crear un nuevo usuario con rol SUPERVISOR", async () => {
      const created = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "  Carlos Pérez  ",
        email: "  Carlos.Perez@Empresa.com  ",
        role: "SUPERVISOR",
        clerkId: "clerk_carlos_123",
      });

      expect(created.id).toBeDefined();
      expect(created.name).toBe("Carlos Pérez");
      expect(created.email).toBe("carlos.perez@empresa.com");
      expect(created.role).toBe("SUPERVISOR");
      expect(created.clerkId).toBe("clerk_carlos_123");
      expect(created.isActive).toBe(true);
    });

    it("permite listar usuarios a un SUPERVISOR filtrando por rol", async () => {
      await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Admin User",
        email: "admin@test.com",
        role: "ADMIN",
      });
      await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Operador 1",
        email: "op1@test.com",
        role: "OPERATOR",
      });
      await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Operador 2",
        email: "op2@test.com",
        role: "OPERATOR",
      });

      const operators = await listTenantUsers(
        userRepo,
        tenantA,
        "SUPERVISOR",
        {
          role: "OPERATOR",
        },
      );

      expect(operators).toHaveLength(2);
      expect(operators.every((u) => u.role === "OPERATOR")).toBe(true);
    });

    it("actualiza rol, nombre y estado activo de un usuario", async () => {
      const admin = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Super Admin",
        email: "root@test.com",
        role: "ADMIN",
      });

      const user = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Pepe Operador",
        email: "pepe@test.com",
        role: "OPERATOR",
      });

      const updated = await updateTenantUser(
        userRepo,
        tenantA,
        "ADMIN",
        admin.id,
        user.id,
        {
          role: "SUPERVISOR",
          name: "Pepe Supervisor",
          isActive: false,
        },
      );

      expect(updated.role).toBe("SUPERVISOR");
      expect(updated.name).toBe("Pepe Supervisor");
      expect(updated.isActive).toBe(false);

      // Listar activos no incluye a pepe
      const activeUsers = await listTenantUsers(
        userRepo,
        tenantA,
        "ADMIN",
      );
      expect(activeUsers.find((u) => u.id === user.id)).toBeUndefined();

      // Listar con includeInactive sí
      const allUsers = await listTenantUsers(userRepo, tenantA, "ADMIN", {
        includeInactive: true,
      });
      expect(allUsers.find((u) => u.id === user.id)).toBeDefined();
    });
  });

  describe("2. Casos Borde (Edge Cases)", () => {
    it("genera un identificador Clerk único si no se proporciona", async () => {
      const user = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Sin Clerk",
        email: "sinclerk@test.com",
        role: "OPERATOR",
      });

      expect(user.clerkId).toBeDefined();
      expect(user.clerkId).toMatch(/^clerk_/);
    });

    it("permite actualizar solo el nombre sin tocar email ni rol", async () => {
      const admin = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Admin",
        email: "admin@test.com",
        role: "ADMIN",
      });
      const user = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Viejo Nombre",
        email: "fijo@test.com",
        role: "OPERATOR",
      });

      const updated = await updateTenantUser(
        userRepo,
        tenantA,
        "ADMIN",
        admin.id,
        user.id,
        {
          name: "Nuevo Nombre",
        },
      );

      expect(updated.name).toBe("Nuevo Nombre");
      expect(updated.email).toBe("fijo@test.com");
      expect(updated.role).toBe("OPERATOR");
    });
  });

  describe("3. Errores de Dominio y Validación", () => {
    it("rechaza listar usuarios a un OPERATOR con 403 FORBIDDEN", async () => {
      await expect(
        listTenantUsers(userRepo, tenantA, "OPERATOR"),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "FORBIDDEN",
          statusCode: 403,
        }),
      );
    });

    it("rechaza crear usuario a un SUPERVISOR u OPERATOR con 403 FORBIDDEN", async () => {
      await expect(
        createTenantUser(userRepo, tenantA, "SUPERVISOR", {
          name: "Nuevo",
          email: "nuevo@test.com",
          role: "OPERATOR",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "FORBIDDEN",
          statusCode: 403,
        }),
      );
    });

    it("rechaza crear usuario con nombre vacío con 400 VALIDATION_ERROR", async () => {
      await expect(
        createTenantUser(userRepo, tenantA, "ADMIN", {
          name: "   ",
          email: "test@test.com",
          role: "OPERATOR",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 400,
        }),
      );
    });

    it("permite actualizar email a uno nuevo válido", async () => {
      const admin = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Admin",
        email: "admin-update@test.com",
        role: "ADMIN",
      });
      const user = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "User",
        email: "viejo@test.com",
        role: "OPERATOR",
      });

      const updated = await updateTenantUser(
        userRepo,
        tenantA,
        "ADMIN",
        admin.id,
        user.id,
        {
          email: "nuevo.email@test.com",
        },
      );

      expect(updated.email).toBe("nuevo.email@test.com");
    });

    it("rechaza actualizar email con formato inválido con 400 VALIDATION_ERROR", async () => {
      const admin = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Admin",
        email: "admin-bad@test.com",
        role: "ADMIN",
      });
      const user = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "User",
        email: "normal@test.com",
        role: "OPERATOR",
      });

      await expect(
        updateTenantUser(
          userRepo,
          tenantA,
          "ADMIN",
          admin.id,
          user.id,
          {
            email: "email-invalido",
          },
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 400,
        }),
      );
    });

    it("rechaza actualizar email a uno ya existente con 409 CONFLICT", async () => {
      const admin = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Admin",
        email: "admin-col@test.com",
        role: "ADMIN",
      });
      const u1 = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "User 1",
        email: "u1@test.com",
        role: "OPERATOR",
      });
      const u2 = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "User 2",
        email: "u2@test.com",
        role: "OPERATOR",
      });

      await expect(
        updateTenantUser(
          userRepo,
          tenantA,
          "ADMIN",
          admin.id,
          u2.id,
          {
            email: u1.email,
          },
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CONFLICT",
          statusCode: 409,
        }),
      );
    });

    it("rechaza email inválido con 400 VALIDATION_ERROR", async () => {
      await expect(
        createTenantUser(userRepo, tenantA, "ADMIN", {
          name: "Nombre",
          email: "no-es-un-email",
          role: "OPERATOR",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 400,
        }),
      );
    });

    it("rechaza email duplicado en el mismo tenant con 409 CONFLICT", async () => {
      await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Primero",
        email: "duplicado@test.com",
        role: "OPERATOR",
      });

      await expect(
        createTenantUser(userRepo, tenantA, "ADMIN", {
          name: "Segundo",
          email: "DUPLICADO@test.com",
          role: "SUPERVISOR",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CONFLICT",
          statusCode: 409,
        }),
      );
    });

    it("rechaza clerkId ya asignado globalmente con 409 CONFLICT", async () => {
      await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "User 1",
        email: "user1@test.com",
        role: "OPERATOR",
        clerkId: "clerk_compartido",
      });

      await expect(
        createTenantUser(userRepo, tenantB, "ADMIN", {
          name: "User 2",
          email: "user2@test.com",
          role: "OPERATOR",
          clerkId: "clerk_compartido",
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "CONFLICT",
          statusCode: 409,
        }),
      );
    });

    it("impide que un administrador se desactive a sí mismo (regla de seguridad 409)", async () => {
      const admin = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Self Admin",
        email: "self@test.com",
        role: "ADMIN",
      });

      await expect(
        updateTenantUser(
          userRepo,
          tenantA,
          "ADMIN",
          admin.id,
          admin.id,
          {
            isActive: false,
          },
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 409,
        }),
      );
    });

    it("impide que un administrador revoque su propio rol de ADMIN (regla de seguridad 409)", async () => {
      const admin = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Self Admin",
        email: "self2@test.com",
        role: "ADMIN",
      });

      await expect(
        updateTenantUser(
          userRepo,
          tenantA,
          "ADMIN",
          admin.id,
          admin.id,
          {
            role: "OPERATOR",
          },
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "VALIDATION_ERROR",
          statusCode: 409,
        }),
      );
    });

    it("rechaza actualización de usuario inexistente con 404 USER_NOT_FOUND", async () => {
      await expect(
        updateTenantUser(
          userRepo,
          tenantA,
          "ADMIN",
          "actor_id",
          "target_fantasma",
          {
            name: "Nuevo",
          },
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "USER_NOT_FOUND",
          statusCode: 404,
        }),
      );
    });
  });

  describe("4. Aislamiento Multi-Tenant", () => {
    it("permite el mismo email en diferentes inquilinos de forma aislada", async () => {
      const userA = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "User en A",
        email: "comun@empresa.com",
        role: "OPERATOR",
        clerkId: "clerk_tenant_a",
      });
      const userB = await createTenantUser(userRepo, tenantB, "ADMIN", {
        name: "User en B",
        email: "comun@empresa.com",
        role: "SUPERVISOR",
        clerkId: "clerk_tenant_b",
      });

      expect(userA.id).not.toBe(userB.id);

      const listA = await listTenantUsers(userRepo, tenantA, "ADMIN");
      const listB = await listTenantUsers(userRepo, tenantB, "ADMIN");

      expect(listA).toHaveLength(1);
      expect(listA[0]?.role).toBe("OPERATOR");

      expect(listB).toHaveLength(1);
      expect(listB[0]?.role).toBe("SUPERVISOR");
    });

    it("no permite a Tenant B consultar ni modificar usuarios de Tenant A", async () => {
      const userA = await createTenantUser(userRepo, tenantA, "ADMIN", {
        name: "Privado A",
        email: "privado@tenant-a.com",
        role: "OPERATOR",
      });

      await expect(
        updateTenantUser(
          userRepo,
          tenantB,
          "ADMIN",
          "admin_b",
          userA.id,
          {
            name: "Modificado",
          },
        ),
      ).rejects.toThrow(
        expect.objectContaining({
          code: "USER_NOT_FOUND",
          statusCode: 404,
        }),
      );
    });
  });
});
