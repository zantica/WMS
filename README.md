# WMS SaaS — Fase 1: Core MVP

Warehouse Management System multi-tenant construido con Turborepo, Fastify, PostgreSQL y Expo.

## Estructura

```
wms/
├── apps/
│   ├── api/        # Backend Fastify (Node.js + TypeScript)
│   ├── web/        # Dashboard Next.js (Hito 4)
│   └── mobile/     # App Expo (Hito 2)
└── packages/
    ├── db/         # Prisma schema + cliente compartido
    └── shared-types/ # DTOs TypeScript compartidos
```

## Requisitos

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm`)
- PostgreSQL 15+ corriendo en local (o Docker)

## Setup inicial

```bash
# 1. Instalar dependencias
pnpm install

# 2. Configurar variables de entorno de la API
cp apps/api/.env.example apps/api/.env
# Editar apps/api/.env con tu DATABASE_URL

# 3. Crear la base de datos (si usas Docker)
docker run --name wms-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=wms_dev -p 5432:5432 -d postgres:15

# 4. Generar el cliente Prisma
pnpm db:generate

# 5. Ejecutar las migraciones
pnpm db:migrate

# 6. Cargar datos de prueba
pnpm --filter @wms/db seed
```

## Desarrollo

```bash
# Arrancar la API en modo watch
pnpm --filter @wms/api dev

# O arrancar todo con Turborepo
pnpm dev
```

La API estará disponible en:
- **API**: http://localhost:3001
- **Docs (Swagger)**: http://localhost:3001/docs
- **Health**: http://localhost:3001/health

## Tests

```bash
# Ejecutar todos los tests
pnpm test

# Solo los tests de la API
pnpm --filter @wms/api test

# Con cobertura
pnpm --filter @wms/api test:coverage
```

## Probar la API manualmente

Después del seed, puedes probar con curl:

```bash
# Header de autenticación para desarrollo
HEADERS='-H "x-api-key: demo-api-key-12345"'

# Listar productos
curl http://localhost:3001/api/v1/products -H "x-api-key: demo-api-key-12345"

# Ver stock en vivo
curl http://localhost:3001/api/v1/inventory/balances -H "x-api-key: demo-api-key-12345"

# Crear un pedido
curl -X POST http://localhost:3001/api/v1/orders \
  -H "x-api-key: demo-api-key-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "warehouseId": "warehouse-demo",
    "externalRef": "#0001",
    "customerName": "Cliente Test",
    "lines": [{"productId": "<ID_PROD>", "requestedQty": 2}]
  }'
```

## Explorar la base de datos

```bash
pnpm db:studio
# Abre Prisma Studio en http://localhost:5555
```

## Hitos

- [x] **Hito 1** — Esqueleto + Ledger (este PR)
- [x] **Hito 2** — App Expo + Inbound + Putaway
- [ ] **Hito 3** — Motor de Pedidos + Picking
- [ ] **Hito 4** — Panel Web + Integración External
