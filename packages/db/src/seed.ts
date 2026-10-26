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

  // ── Escenarios Operativos Listos para Probar en el Móvil ──────────────────
  const prod1 = await prisma.product.findUniqueOrThrow({
    where: { tenantId_sku: { tenantId: tenant.id, sku: "PROD-001" } },
  });
  const prod2 = await prisma.product.findUniqueOrThrow({
    where: { tenantId_sku: { tenantId: tenant.id, sku: "PROD-002" } },
  });
  const prod3 = await prisma.product.findUniqueOrThrow({
    where: { tenantId_sku: { tenantId: tenant.id, sku: "PROD-003" } },
  });

  const locReceiving = await prisma.location.findUniqueOrThrow({
    where: { warehouseId_code: { warehouseId: warehouse.id, code: "RECEPCION-01" } },
  });
  const locA01 = await prisma.location.findUniqueOrThrow({
    where: { warehouseId_code: { warehouseId: warehouse.id, code: "A-01-01" } },
  });
  const locA02 = await prisma.location.findUniqueOrThrow({
    where: { warehouseId_code: { warehouseId: warehouse.id, code: "A-02-01" } },
  });
  const locA03 = await prisma.location.findUniqueOrThrow({
    where: { warehouseId_code: { warehouseId: warehouse.id, code: "A-03-01" } },
  });

  // 1. Stock inicial en estanterías STORAGE para poder probar Picking y Re-asignación
  // - PROD-001 en A-01-01 (10 uds, 4 reservadas para el pedido demo) y A-02-01 (10 uds libres para probar excepción/re-alocación F3.2)
  // - PROD-002 en A-03-01 (5 uds, 2 reservadas para el pedido demo — sin stock en otra ubicación para probar paso a ON_HOLD)
  await prisma.inventoryBalance.upsert({
    where: { locationId_productId: { locationId: locA01.id, productId: prod1.id } },
    update: { onHandQty: 10, allocatedQty: 4 },
    create: {
      tenantId: tenant.id,
      locationId: locA01.id,
      productId: prod1.id,
      onHandQty: 10,
      allocatedQty: 4,
    },
  });
  await prisma.inventoryBalance.upsert({
    where: { locationId_productId: { locationId: locA02.id, productId: prod1.id } },
    update: { onHandQty: 10, allocatedQty: 0 },
    create: {
      tenantId: tenant.id,
      locationId: locA02.id,
      productId: prod1.id,
      onHandQty: 10,
      allocatedQty: 0,
    },
  });
  await prisma.inventoryBalance.upsert({
    where: { locationId_productId: { locationId: locA03.id, productId: prod2.id } },
    update: { onHandQty: 5, allocatedQty: 2 },
    create: {
      tenantId: tenant.id,
      locationId: locA03.id,
      productId: prod2.id,
      onHandQty: 5,
      allocatedQty: 2,
    },
  });

  // 2. Tarea Demo RECEIVING (Inbound en muelle RECEPCION-01) -> Genera PUTAWAY al completarse
  const existingReceiving = await prisma.warehouseTask.findFirst({
    where: { id: "task-demo-receiving" },
  });
  if (!existingReceiving) {
    await prisma.warehouseTask.create({
      data: {
        id: "task-demo-receiving",
        tenantId: tenant.id,
        receiptRef: "ASN-DEMO-001",
        type: "RECEIVING",
        status: "PENDING",
        steps: {
          create: [
            {
              sequence: 1,
              locationId: locReceiving.id,
              productId: prod3.id,
              expectedQty: 5,
              scannedQty: 0,
              status: "PENDING",
            },
          ],
        },
      },
    });
  }

  // 3. Pedido Demo ALLOCATED + Tarea Demo PICKING con 2 paradas (A-01-01 y A-03-01)
  const demoOrder = await prisma.salesOrder.upsert({
    where: { id: "order-demo-picking" },
    update: { status: "ALLOCATED" },
    create: {
      id: "order-demo-picking",
      tenantId: tenant.id,
      warehouseId: warehouse.id,
      externalRef: "#PED-1001",
      customerName: "Cliente Demo Mobile",
      priority: 10,
      status: "ALLOCATED",
      lines: {
        create: [
          { productId: prod1.id, requestedQty: 4, pickedQty: 0 },
          { productId: prod2.id, requestedQty: 2, pickedQty: 0 },
        ],
      },
    },
  });

  const existingPicking = await prisma.warehouseTask.findFirst({
    where: { id: "task-demo-picking" },
  });
  if (!existingPicking) {
    await prisma.warehouseTask.create({
      data: {
        id: "task-demo-picking",
        tenantId: tenant.id,
        orderId: demoOrder.id,
        type: "PICKING",
        status: "PENDING",
        steps: {
          create: [
            {
              sequence: 1,
              locationId: locA01.id,
              productId: prod1.id,
              expectedQty: 4,
              scannedQty: 0,
              status: "PENDING",
            },
            {
              sequence: 2,
              locationId: locA03.id,
              productId: prod2.id,
              expectedQty: 2,
              scannedQty: 0,
              status: "PENDING",
            },
          ],
        },
      },
    });
  }
  console.log("✅ Demo tasks created: task-demo-receiving (RECEIVING) & task-demo-picking (PICKING)");

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
