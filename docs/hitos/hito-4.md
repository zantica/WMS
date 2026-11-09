# Hito 4 — Panel Web + Integraciones (ARCHIVADO)

> Guía archivada desde `KNOWLEDGE.md` al cerrar el hito. **Contenido histórico**: puede contener decisiones
> ya superadas. La memoria vigente está en [`KNOWLEDGE.md`](../../KNOWLEDGE.md); las decisiones formales, en [`docs/adr/`](../adr/README.md).

### Qué construir

Dashboard Next.js 14 (App Router) + generador de PDF de QRs + endpoint público para Shopify/WooCommerce.

### Decisiones de diseño

1. **Generador de QR PDF**: Usar `@react-pdf/renderer` + `qrcode` (npm). Cada página del PDF contiene una cuadrícula de QRs, uno por ubicación, con el código impreso debajo. El operario recorta y pega en la estantería. Tamaño recomendado: 5x5 cm.

2. **Autenticación del panel web**: Clerk con `<ClerkProvider>` en el layout raíz de Next.js. El panel web y la API comparten el mismo `CLERK_PUBLISHABLE_KEY`.

3. **Inbound Adapter para Shopify**:
   El endpoint `POST /api/v1/orders` ya existe y acepta `externalId` y `externalRef`. Para conectar Shopify:
   - Configurar un Webhook en Shopify `orders/create` → `POST /api/v1/webhooks/shopify`
   - Verificar la firma HMAC de Shopify antes de procesar
   - Mapear el formato de Shopify al `CreateOrderInput` y llamar internamente al use case
   - Crear `apps/api/src/routes/webhooks/shopify.ts` para esto (no mezclar con `orders.ts`)

4. **Vista de Auditoría (Kardex)**:
   Ya existe `GET /api/v1/inventory/transactions`. El panel solo necesita mostrarlas en una tabla con filtros por producto, fecha y razón. No hay trabajo de backend adicional.

5. **Stack del panel web**:
   ```
   apps/web/
   ├── app/
   │   ├── layout.tsx       ← ClerkProvider + nav
   │   ├── page.tsx         ← Dashboard KPIs
   │   ├── products/        ← CRUD catálogo
   │   ├── inventory/       ← Stock en vivo
   │   ├── orders/          ← Monitor de pedidos (Kanban)
   │   ├── locations/       ← CRUD + Imprimir QR
   │   └── ledger/          ← Auditoría
   └── components/
       ├── QrPdfButton.tsx  ← Genera PDF en el cliente
       └── KanbanBoard.tsx  ← Pedidos por estado
   ```
