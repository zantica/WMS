// apps/api/src/use-cases/auth/__tests__/auth-use-cases.test.ts
// Suite TDD completa (Happy Path, Edge Cases, Errores de Dominio, Fallos/Aislamiento) para F10.1.

import { describe, it, expect, beforeEach } from "vitest";
import {
  BcryptPasswordHasher,
  DEFAULT_BCRYPT_SALT_ROUNDS,
  resolveBcryptSaltRounds,
} from "../../../adapters/bcrypt-password-hasher.js";
import { InMemoryUserRepository } from "../../../adapters/in-memory-user-repository.js";
import type { PasswordHasherPort } from "../../../ports/password-hasher.js";
import {
  bootstrapSuperuser,
  DEFAULT_SUPERUSER_EMAIL,
  getBootstrapStatus,
} from "../bootstrap-superuser.js";
import { getCurrentSessionUser, loginWithPassword } from "../login.js";

/**
 * Hasher determinista rápido para tests unitarios de casos de uso (evita coste CPU de bcrypt 12 en cada caso).
 */
class FakePasswordHasher implements PasswordHasherPort {
  public readonly hashedInputs: string[] = [];

  async hash(plainText: string): Promise<string> {
    this.hashedInputs.push(plainText);
    return `fake_hash:${plainText}`;
  }

  async verify(plainText: string, passwordHash: string): Promise<boolean> {
    return passwordHash === `fake_hash:${plainText}`;
  }
}

describe("F10.1 — Casos de Uso de Auth, Bcrypt Salt Rounds y Bootstrap Superuser", () => {
  let userRepo: InMemoryUserRepository;
  let fakeHasher: FakePasswordHasher;

  const issueTestToken = (payload: {
    sub: string;
    userId: string;
    tenantId: string;
    role: string;
  }) => `jwt:${payload.sub}:${payload.userId}:${payload.tenantId}:${payload.role}`;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    fakeHasher = new FakePasswordHasher();
  });

  describe("BcryptPasswordHasher & resolveBcryptSaltRounds", () => {
    it("usa 12 salt rounds por defecto y valida rango 10..14", () => {
      expect(resolveBcryptSaltRounds()).toBe(DEFAULT_BCRYPT_SALT_ROUNDS);
      expect(resolveBcryptSaltRounds("")).toBe(12);
      expect(resolveBcryptSaltRounds("10")).toBe(10);
      expect(resolveBcryptSaltRounds("14")).toBe(14);
      expect(resolveBcryptSaltRounds(11)).toBe(11);
    });

    it("rechaza salt rounds fuera de rango 10..14 o no enteros con CONFIGURATION_ERROR (500)", () => {
      for (const bad of ["9", "15", "abc", "12.5", 8, 16]) {
        expect(() => resolveBcryptSaltRounds(bad)).toThrowError(
          expect.objectContaining({
            code: "CONFIGURATION_ERROR",
            statusCode: 500,
          }),
        );
      }
      expect(() => new BcryptPasswordHasher(9)).toThrowError(
        expect.objectContaining({ code: "CONFIGURATION_ERROR" }),
      );
    });

    it("hashea y verifica contraseñas reales con BcryptPasswordHasher (10 rounds)", async () => {
      const hasher = new BcryptPasswordHasher(10);
      const hash = await hasher.hash("Secreta!2026");

      expect(hash.startsWith("$2")).toBe(true);
      await expect(hasher.verify("Secreta!2026", hash)).resolves.toBe(true);
      await expect(hasher.verify("Incorrecta", hash)).resolves.toBe(false);
      await expect(hasher.verify("", hash)).resolves.toBe(false);
      await expect(hasher.verify("Secreta!2026", "")).resolves.toBe(false);
    });

    it("rechaza hashear contraseña vacía con VALIDATION_ERROR (400)", async () => {
      const hasher = new BcryptPasswordHasher(10);
      await expect(hasher.hash("")).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
        statusCode: 400,
      });
    });
  });

  describe("1. Happy Path — Bootstrap Superuser y Login", () => {
    it("inicializa admin@navelo.dev como SUPERUSER cuando no existe ningún superuser y emite JWT", async () => {
      const statusBefore = await getBootstrapStatus(userRepo);
      expect(statusBefore).toEqual({
        hasSuperuser: false,
        requiresSetupSecret: false,
        defaultSuperuserEmail: DEFAULT_SUPERUSER_EMAIL,
      });

      const res = await bootstrapSuperuser(
        {
          userRepo,
          passwordHasher: fakeHasher,
          issueToken: issueTestToken,
          expiresInSeconds: 28_800,
        },
        {
          name: "  Navelo Root  ",
          password: "SuperPassword!123",
        },
      );

      expect(res.expiresInSeconds).toBe(28_800);
      expect(res.user.email).toBe("admin@navelo.dev");
      expect(res.user.name).toBe("Navelo Root");
      expect(res.user.role).toBe("SUPERUSER");
      expect(res.user.tenantId).toBe("demo-tenant");
      expect(res.token).toContain(":SUPERUSER");
      expect(fakeHasher.hashedInputs).toEqual(["SuperPassword!123"]);

      const statusAfter = await getBootstrapStatus(userRepo);
      expect(statusAfter.hasSuperuser).toBe(true);

      // Login posterior con email normalizado y contraseña
      const loginRes = await loginWithPassword(
        {
          userRepo,
          passwordHasher: fakeHasher,
          issueToken: issueTestToken,
          expiresInSeconds: 28_800,
        },
        {
          email: "  ADMIN@NAVELO.DEV ",
          password: "SuperPassword!123",
        },
      );

      expect(loginRes.user.id).toBe(res.user.id);
      expect(loginRes.user.role).toBe("SUPERUSER");
      expect(loginRes.token).toBe(res.token);
    });

    it("permite crear segundo SUPERUSER cuando se aporta el setupSecret válido", async () => {
      await bootstrapSuperuser(
        {
          userRepo,
          passwordHasher: fakeHasher,
          issueToken: issueTestToken,
          expiresInSeconds: 3600,
          setupSecret: "top-setup-secret",
        },
        {
          name: "Root 1",
          password: "Password!1234",
          setupSecret: "top-setup-secret",
        },
      );

      const second = await bootstrapSuperuser(
        {
          userRepo,
          passwordHasher: fakeHasher,
          issueToken: issueTestToken,
          expiresInSeconds: 3600,
          setupSecret: "top-setup-secret",
        },
        {
          name: "Root 2",
          email: "root2@navelo.dev",
          password: "Password!5678",
          setupSecret: "top-setup-secret",
        },
      );

      expect(second.user.email).toBe("root2@navelo.dev");
      expect(second.user.role).toBe("SUPERUSER");
    });

    it("resuelve getCurrentSessionUser para usuario DB, SUPERUSER global, JWT externo y API Key", async () => {
      const created = await userRepo.createUser("demo-tenant", {
        name: "Ana Supervisor",
        email: "ana@demo.com",
        role: "SUPERVISOR",
        passwordHash: "fake_hash:12345678",
      });

      const dbSession = await getCurrentSessionUser(userRepo, {
        tenantId: "demo-tenant",
        userId: created.id,
        userRole: "SUPERVISOR",
      });
      expect(dbSession.email).toBe("ana@demo.com");
      expect(dbSession.role).toBe("SUPERVISOR");

      const superuser = await userRepo.createUser("demo-tenant", {
        name: "Root",
        email: "admin@navelo.dev",
        role: "SUPERUSER",
      });
      const superAcrossTenant = await getCurrentSessionUser(userRepo, {
        tenantId: "other-tenant",
        userId: superuser.id,
        userRole: "SUPERUSER",
      });
      expect(superAcrossTenant.tenantId).toBe("other-tenant");
      expect(superAcrossTenant.role).toBe("SUPERUSER");

      const external = await getCurrentSessionUser(userRepo, {
        tenantId: "demo-tenant",
        userId: "ext_clerk_99",
        userRole: "OPERATOR",
      });
      expect(external.id).toBe("ext_clerk_99");
      expect(external.role).toBe("OPERATOR");

      const apiKeySession = await getCurrentSessionUser(userRepo, {
        tenantId: "demo-tenant",
        userRole: "ADMIN",
      });
      expect(apiKeySession.id).toBe("api-key");
      expect(apiKeySession.role).toBe("ADMIN");
    });
  });

  describe("2. Casos Borde (Edge Cases)", () => {
    it("desambigua login por tenantId cuando el mismo email existe en dos tenants", async () => {
      userRepo.seedTenant("tenant-1");
      userRepo.seedTenant("tenant-2");

      await userRepo.createUser("tenant-1", {
        name: "User T1",
        email: "shared@corp.com",
        role: "OPERATOR",
        passwordHash: "fake_hash:PassT1!23",
      });
      await userRepo.createUser("tenant-2", {
        name: "User T2",
        email: "shared@corp.com",
        role: "ADMIN",
        passwordHash: "fake_hash:PassT2!23",
      });

      // Sin tenantId -> conflicto por ambigüedad
      await expect(
        loginWithPassword(
          {
            userRepo,
            passwordHasher: fakeHasher,
            issueToken: issueTestToken,
            expiresInSeconds: 3600,
          },
          { email: "shared@corp.com", password: "PassT2!23" },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });

      // Con tenantId -> autentica en el tenant correcto
      const ok = await loginWithPassword(
        {
          userRepo,
          passwordHasher: fakeHasher,
          issueToken: issueTestToken,
          expiresInSeconds: 3600,
        },
        { email: "shared@corp.com", password: "PassT2!23", tenantId: "tenant-2" },
      );
      expect(ok.user.tenantId).toBe("tenant-2");
      expect(ok.user.role).toBe("ADMIN");
    });
  });

  describe("3. Errores de Dominio, Validación y Seguridad", () => {
    it("rechaza credenciales inválidas, usuarios sin contraseña o cuentas inactivas con 401", async () => {
      await userRepo.createUser("demo-tenant", {
        name: "Clerk Only",
        email: "clerkonly@demo.com",
        role: "OPERATOR",
        passwordHash: null,
      });

      const inactive = await userRepo.createUser("demo-tenant", {
        name: "Inactive User",
        email: "inactive@demo.com",
        role: "ADMIN",
        passwordHash: "fake_hash:ValidPass!1",
      });
      await userRepo.updateUser("demo-tenant", inactive.id, { isActive: false });

      const active = await userRepo.createUser("demo-tenant", {
        name: "Active User",
        email: "active@demo.com",
        role: "ADMIN",
        passwordHash: "fake_hash:RightPass!1",
      });
      expect(active.isActive).toBe(true);

      const deps = {
        userRepo,
        passwordHasher: fakeHasher,
        issueToken: issueTestToken,
        expiresInSeconds: 3600,
      };

      await expect(
        loginWithPassword(deps, { email: "bad-email", password: "abc" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });

      await expect(
        loginWithPassword(deps, { email: "active@demo.com", password: "" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });

      await expect(
        loginWithPassword(deps, {
          email: "unknown@demo.com",
          password: "RightPass!1",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });

      await expect(
        loginWithPassword(deps, {
          email: "clerkonly@demo.com",
          password: "RightPass!1",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });

      await expect(
        loginWithPassword(deps, {
          email: "active@demo.com",
          password: "WrongPassword!",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });

      await expect(
        loginWithPassword(deps, {
          email: "inactive@demo.com",
          password: "ValidPass!1",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });
    });

    it("rechaza segundo bootstrap sin setupSecret (409) y setupSecret inválido (403)", async () => {
      await bootstrapSuperuser(
        {
          userRepo,
          passwordHasher: fakeHasher,
          issueToken: issueTestToken,
          expiresInSeconds: 3600,
        },
        { name: "Root", password: "Password!123" },
      );

      await expect(
        bootstrapSuperuser(
          {
            userRepo,
            passwordHasher: fakeHasher,
            issueToken: issueTestToken,
            expiresInSeconds: 3600,
          },
          {
            name: "Attacker",
            email: "attacker@evil.com",
            password: "Password!123",
          },
        ),
      ).rejects.toMatchObject({ code: "CONFLICT", statusCode: 409 });

      await expect(
        bootstrapSuperuser(
          {
            userRepo,
            passwordHasher: fakeHasher,
            issueToken: issueTestToken,
            expiresInSeconds: 3600,
            setupSecret: "real-secret",
          },
          {
            name: "Attacker",
            email: "attacker@evil.com",
            password: "Password!123",
            setupSecret: "wrong",
          },
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    });

    it("valida entradas de bootstrapSuperuser y error si no hay tenant disponible", async () => {
      const deps = {
        userRepo,
        passwordHasher: fakeHasher,
        issueToken: issueTestToken,
        expiresInSeconds: 3600,
      };

      await expect(
        bootstrapSuperuser(deps, { name: "  ", password: "Password!123" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });

      await expect(
        bootstrapSuperuser(deps, {
          name: "Root",
          email: "not-an-email",
          password: "Password!123",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });

      await expect(
        bootstrapSuperuser(deps, { name: "Root", password: "short" }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });

      await expect(
        bootstrapSuperuser(deps, {
          name: "Root",
          password: "Password!123",
          tenantId: "missing-tenant",
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 404 });

      userRepo.setDefaultTenantId(null);
      await expect(
        bootstrapSuperuser(deps, { name: "Root", password: "Password!123" }),
      ).rejects.toMatchObject({ code: "CONFIGURATION_ERROR", statusCode: 500 });
    });

    it("rechaza getCurrentSessionUser sin tenantId o con cuenta desactivada", async () => {
      await expect(
        getCurrentSessionUser(userRepo, { tenantId: "" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });

      const user = await userRepo.createUser("demo-tenant", {
        name: "Disabled",
        email: "dis@demo.com",
        role: "OPERATOR",
      });
      await userRepo.updateUser("demo-tenant", user.id, { isActive: false });

      await expect(
        getCurrentSessionUser(userRepo, {
          tenantId: "demo-tenant",
          userId: user.id,
          userRole: "OPERATOR",
        }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });
    });
  });
});
