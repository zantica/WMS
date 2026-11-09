// apps/api/src/use-cases/security/__tests__/tenant-rls.integration.test.ts
// Suite de integración real contra PostgreSQL 16 validando FORCE ROW LEVEL SECURITY (RLS)
// con un rol NO-superusuario (`app_test` en CI).
//
// Se ejecuta automáticamente en CI cuando `DATABASE_URL` está definido (Job `integration-postgres`)
// o en local cuando se define `RUN_PG_INTEGRATION=true`.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, withTenantContext } from "@wms/db";

const shouldRunPgIntegration =
  process.env["RUN_PG_INTEGRATION"] === "true" ||
  (process.env["CI"] === "true" && Boolean(process.env["DATABASE_URL"]));

describe.runIf(shouldRunPgIntegration)(
  "Integración PostgreSQL 16 — FORCE ROW LEVEL SECURITY y Rol No-Superusuario",
  () => {
    let db: PrismaClient;
    const suffix = Date.now().toString(36);
    const tenantAId = `tenant-rls-a-${suffix}`;
    const tenantBId = `tenant-rls-b-${suffix}`;

    beforeAll(async () => {
      db = new PrismaClient();
      await db.$connect();

      // La tabla `tenants` es accesible para crear los tenants semilla de la prueba
      await db.tenant.createMany({
        data: [
          {
            id: tenantAId,
            name: "Tenant Alpha RLS",
            slug: `tenant-alpha-${suffix}`,
            apiKey: `key-alpha-${suffix}`,
          },
          {
            id: tenantBId,
            name: "Tenant Beta RLS",
            slug: `tenant-beta-${suffix}`,
            apiKey: `key-beta-${suffix}`,
          },
        ],
      });
    });

    afterAll(async () => {
      if (db) {
        try {
          await db.tenant.deleteMany({
            where: { id: { in: [tenantAId, tenantBId] } },
          });
        } finally {
          await db.$disconnect();
        }
      }
    });

    it("conecta con un rol NO-superusuario y sin BYPASSRLS (evita validar RLS 'de mentira')", async () => {
      const rows = await db.$queryRaw<
        Array<{
          current_user: string;
          is_superuser: string;
          rolbypassrls: boolean;
        }>
      >`
        SELECT
          current_user::text AS current_user,
          current_setting('is_superuser') AS is_superuser,
          r.rolbypassrls AS rolbypassrls
        FROM pg_roles r
        WHERE r.rolname = current_user
      `;

      expect(rows).toHaveLength(1);
      expect(rows[0]?.is_superuser).toBe("off");
      expect(rows[0]?.rolbypassrls).toBe(false);
    });

    it("deniega lecturas y escrituras cuando no hay contexto app.current_tenant_id (FORCE RLS)", async () => {
      // Sembrar un producto en Tenant A dentro de su contexto legítimo
      await withTenantContext(db, tenantAId, async (tx) => {
        await tx.product.create({
          data: {
            tenantId: tenantAId,
            sku: `SKU-A-${suffix}`,
            name: "Producto A Protegido",
          },
        });
      });

      // Sin withTenantContext (GUC vacío/NULL), PostgreSQL filtra todas las filas
      const leakedProducts = await db.product.findMany({
        where: { tenantId: tenantAId },
      });
      expect(leakedProducts).toHaveLength(0);

      // Sin withTenantContext, un INSERT directo viola la política WITH CHECK de PostgreSQL
      await expect(
        db.product.create({
          data: {
            tenantId: tenantAId,
            sku: `SKU-NO-CTX-${suffix}`,
            name: "Intento sin contexto",
          },
        }),
      ).rejects.toThrow(/row-level security policy/i);
    });

    it("aísla estrictamente Tenant A de Tenant B en lecturas, escrituras cruzadas y locks FOR UPDATE", async () => {
      // Sembrar datos en Tenant B
      const productB = await withTenantContext(db, tenantBId, async (tx) => {
        return await tx.product.create({
          data: {
            tenantId: tenantBId,
            sku: `SKU-B-${suffix}`,
            name: "Producto B Secreto",
          },
        });
      });

      await withTenantContext(
        db,
        tenantAId,
        async (tx) => {
          // 1. Tenant A solo ve sus propios productos
          const visibleProducts = await tx.product.findMany();
          expect(visibleProducts.length).toBeGreaterThanOrEqual(1);
          expect(visibleProducts.every((p) => p.tenantId === tenantAId)).toBe(
            true,
          );

          // 2. Tenant A no puede leer el producto de Tenant B por ID
          const crossRead = await tx.product.findUnique({
            where: { id: productB.id },
          });
          expect(crossRead).toBeNull();

          // 3. Tenant A no puede insertar una fila falsificando tenantId = tenantBId (WITH CHECK)
          await expect(
            tx.product.create({
              data: {
                tenantId: tenantBId,
                sku: `SKU-SPOOF-${suffix}`,
                name: "Intento de spoofing",
              },
            }),
          ).rejects.toThrow(/row-level security policy/i);

          // 4. Crear almacén, ubicación y balance en Tenant A y verificar SELECT ... FOR UPDATE
          const warehouseA = await tx.warehouse.create({
            data: {
              tenantId: tenantAId,
              name: "Almacén Central A",
            },
          });

          const locationA = await tx.location.create({
            data: {
              tenantId: tenantAId,
              warehouseId: warehouseA.id,
              code: `LOC-A-${suffix}`,
              type: "STORAGE",
            },
          });

          const productA = visibleProducts[0]!;
          const balanceA = await tx.inventoryBalance.create({
            data: {
              tenantId: tenantAId,
              locationId: locationA.id,
              productId: productA.id,
              onHandQty: 25,
              allocatedQty: 0,
            },
          });

          const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT "id"
            FROM "inventory_balances"
            WHERE "id" = ${balanceA.id}
            FOR UPDATE
          `;
          expect(lockedRows).toHaveLength(1);
          expect(lockedRows[0]?.id).toBe(balanceA.id);
        },
        { isolationLevel: "Serializable" },
      );

      // Verificar que desde Tenant B el SELECT ... FOR UPDATE sobre inventory_balances no ve filas de Tenant A
      await withTenantContext(db, tenantBId, async (tx) => {
        const balancesVisibleToB = await tx.inventoryBalance.findMany();
        expect(
          balancesVisibleToB.every((b) => b.tenantId === tenantBId),
        ).toBe(true);
      });
    });
  },
);
