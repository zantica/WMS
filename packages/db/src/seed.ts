// packages/db/src/seed.ts
// Script de seed para desarrollo — crea un tenant de ejemplo con warehouse,
// ubicaciones (RECEIVING, STORAGE x10, PACKING) y productos de prueba.
// Ejecutar: pnpm db:seed (desde la raíz del monorepo)

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ── Tenant de demo ────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-tenant" },
    update: {},
    create: {
      name: "Demo Almacén SL",
      slug: "demo-tenant",
      apiKey: "demo-api-key-12345",
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (apiKey: ${tenant.apiKey})`);

  // ── Warehouse ─────────────────────────────────────────────────────────────
  const warehouse = await prisma.warehouse.upsert({
    where: { id: "warehouse-demo" },
    update: {},
    create: {
      id: "warehouse-demo",
      tenantId: tenant.id,
      name: "Almacén Principal",
      address: "Calle Ejemplo 123, Madrid",
    },
  });
  console.log(`✅ Warehouse: ${warehouse.name}`);

  // ── Ubicaciones ───────────────────────────────────────────────────────────
  const locationDefs = [
    // Zona de recepción
    { code: "RECEPCION-01", type: "RECEIVING" as const, description: "Zona de descarga principal" },
    // Estanterías de almacenaje
    ...Array.from({ length: 10 }, (_, i) => ({
      code: `A-${String(i + 1).padStart(2, "0")}-01`,
      type: "STORAGE" as const,
      description: `Estantería A pasillo ${i + 1}`,
    })),
    // Mesa de packing
    { code: "PACKING-01", type: "PACKING" as const, description: "Mesa de armado de pedidos" },
    { code: "DISPATCH-01", type: "DISPATCH" as const, description: "Zona de salida y courier" },
  ];

  for (const loc of locationDefs) {
    await prisma.location.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code: loc.code } },
      update: {},
      create: { ...loc, warehouseId: warehouse.id, tenantId: tenant.id },
    });
  }
  console.log(`✅ ${locationDefs.length} locations created`);

  // ── Productos de prueba ───────────────────────────────────────────────────
  const products = [
    { sku: "PROD-001", name: "Camiseta Básica Blanca", barcode: "8410376000019", weightGrams: 200 },
    { sku: "PROD-002", name: "Pantalón Vaquero Slim", barcode: "8410376000026", weightGrams: 600 },
    { sku: "PROD-003", name: "Zapatillas Running X200", barcode: "8410376000033", weightGrams: 800 },
    { sku: "PROD-004", name: "Mochila Urbana 20L", barcode: "8410376000040", weightGrams: 450 },
    { sku: "PROD-005", name: "Botella Termo 500ml", barcode: "8410376000057", weightGrams: 350 },
  ];

  for (const prod of products) {
    await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: prod.sku } },
      update: {},
      create: { ...prod, tenantId: tenant.id },
    });
  }
  console.log(`✅ ${products.length} products created`);

  console.log("\n🚀 Seed complete! Use these credentials to test:");
  console.log(`   API Key: ${tenant.apiKey}`);
  console.log(`   Warehouse ID: ${warehouse.id}`);
  console.log(`   Header: x-api-key: ${tenant.apiKey}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
