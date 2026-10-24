# Guía de Arranque — WMS API

> Lee esto si el proyecto no arranca. Cubre los errores más comunes.

---

## Requisitos previos

| Herramienta | Versión mínima | Comprobar |
|---|---|---|
| Node.js | 20+ | `node --version` |
| pnpm | 9+ | `pnpm --version` |
| PostgreSQL | 14+ | `psql --version` |

> [!IMPORTANT]
> Este proyecto usa **pnpm**, no npm ni yarn. Si ejecutas `npm install` los workspace links (`@wms/db`, `@wms/shared-types`) no se resuelven y la app no arranca.

### Instalar pnpm si no lo tienes

```bash
npm install -g pnpm
```

---

## Setup desde cero (primera vez)

### Paso 1 — Instalar dependencias

```bash
# Desde la raíz del proyecto (wms/)
pnpm install
```

Verás que instala las dependencias de los 3 paquetes a la vez (monorepo).

---

### Paso 2 — Configurar la base de datos

Necesitas PostgreSQL corriendo. Dos opciones:

**Opción A — Docker (recomendado, no requiere instalar Postgres)**
```bash
docker run --name wms-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=wms_dev \
  -p 5432:5432 \
  -d postgres:15
```

**Opción B — PostgreSQL local ya instalado**  
Crea la base de datos manualmente:
```sql
CREATE DATABASE wms_dev;
```

---

### Paso 3 — Crear el archivo `.env`

```bash
# Copia la plantilla
copy apps\api\.env.example apps\api\.env
```

Edita `apps/api/.env` y deja estas variables (si usaste Docker con los valores de arriba, ya están bien):

```env
PORT=3001
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/wms_dev"
JWT_SECRET="cualquier-string-largo-de-al-menos-32-caracteres"
NODE_ENV=development
```

---

### Paso 4 — Generar el cliente Prisma

```bash
pnpm db:generate
```

Esto lee el `schema.prisma` y genera el cliente TypeScript en `node_modules/@prisma/client`.  
**Si te saltaste este paso, la API arranca pero falla en el primer query con un error de "PrismaClient not found".**

---

### Paso 5 — Crear las tablas en la base de datos

```bash
pnpm db:migrate
```

Prisma leerá las migraciones y creará todas las tablas. Te pedirá un nombre para la migración (puedes poner `init`).

---

### Paso 6 — Cargar datos de prueba

```bash
pnpm --filter @wms/db seed
```

Esto crea:
- 1 tenant de demo con `apiKey: "demo-api-key-12345"`
- 1 warehouse con ID `warehouse-demo`  
- 12 ubicaciones (RECEIVING, 10 STORAGE, PACKING, DISPATCH)
- 5 productos de prueba

---

### Paso 7 — Arrancar la API

```bash
pnpm --filter @wms/api dev
```

O si quieres arrancar todo el monorepo a la vez:

```bash
pnpm dev
```

Deberías ver en la consola:
```
🚀 WMS API running on http://localhost:3001
📚 Docs available at http://localhost:3001/docs
```

---

## Verificar que funciona

Abre en el navegador: **http://localhost:3001/health**

Deberías ver:
```json
{ "status": "ok", "timestamp": "...", "service": "wms-api" }
```

La documentación Swagger interactiva está en: **http://localhost:3001/docs**

---

## Probar los endpoints

Todos los endpoints (excepto `/health` y `/docs`) requieren autenticación.  
Usa la API Key del seed:

```bash
# Listar productos
curl http://localhost:3001/api/v1/products \
  -H "x-api-key: demo-api-key-12345"

# Ver stock en vivo (vacío al principio)
curl http://localhost:3001/api/v1/inventory/balances \
  -H "x-api-key: demo-api-key-12345"

# Ver el Ledger (historial de movimientos)
curl http://localhost:3001/api/v1/inventory/transactions \
  -H "x-api-key: demo-api-key-12345"
```

Para obtener los IDs de los productos del seed (los necesitas para crear pedidos):
```bash
curl http://localhost:3001/api/v1/products \
  -H "x-api-key: demo-api-key-12345" | python -m json.tool
```

---

## Explorar la base de datos visualmente

```bash
pnpm db:studio
```

Abre **http://localhost:5555** — Prisma Studio, un explorador visual de la base de datos.

---

## Errores comunes y soluciones

| Error | Causa | Solución |
|---|---|---|
| `Cannot find module '@wms/db'` | Usaste `npm install` en vez de `pnpm install` | Borra `node_modules/` de toda la raíz y vuelve a hacer `pnpm install` |
| `PrismaClient is unable to run in this browser environment` | Olvidaste `pnpm db:generate` | Ejecuta `pnpm db:generate` |
| `Can't reach database server at localhost:5432` | PostgreSQL no está corriendo | Arranca Docker o PostgreSQL local |
| `Environment variable not found: DATABASE_URL` | Falta el archivo `.env` | Crea `apps/api/.env` desde `.env.example` |
| `P1001: Can't reach database server` | URL de la base de datos incorrecta | Verifica `DATABASE_URL` en `.env` |
| Puerto 3001 ya en uso | Otro proceso usa ese puerto | Cambia `PORT=3002` en `.env` o mata el proceso |
| `Module type mismatch` / ESM errors | Versión antigua de Node | Usa Node 20+ (`node --version`) |

---

## Flujo de prueba completo (de 0 a stock)

Una vez que la API está corriendo, puedes hacer este flujo manual para ver el sistema en acción:

```bash
API="http://localhost:3001/api/v1"
KEY="x-api-key: demo-api-key-12345"

# 1. Ver las ubicaciones disponibles
curl "$API/locations" -H "$KEY"

# 2. Ver los productos (copia un productId del resultado)
curl "$API/products" -H "$KEY"

# 3. Simular entrada de mercancía (reemplaza PRODUCT_ID y LOCATION_ID con valores reales)
curl -X POST "$API/receipts" \
  -H "$KEY" -H "Content-Type: application/json" \
  -d '{
    "warehouseId": "warehouse-demo",
    "lines": [{"productId": "PRODUCT_ID", "expectedQty": 10}]
  }'

# 4. Ver el stock → debería aparecer en RECEPCION-01
curl "$API/inventory/balances" -H "$KEY"

# 5. Crear un pedido
curl -X POST "$API/orders" \
  -H "$KEY" -H "Content-Type: application/json" \
  -d '{
    "warehouseId": "warehouse-demo",
    "externalRef": "#0001",
    "customerName": "Cliente Test",
    "lines": [{"productId": "PRODUCT_ID", "requestedQty": 2}]
  }'
```
