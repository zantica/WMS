# Hito 3 — Motor de Pedidos + Picking (ARCHIVADO)

> Guía archivada desde `KNOWLEDGE.md` al cerrar el hito. **Contenido histórico**: puede contener decisiones
> ya superadas. La memoria vigente está en [`KNOWLEDGE.md`](../../KNOWLEDGE.md); las decisiones formales, en [`docs/adr/`](../adr/README.md).

### Qué construir

La pantalla de Picking guiado en Expo + el endpoint de despacho final + lógica de Webhook outbound.

### Decisiones de diseño para este hito

1. **El picking tiene DOS sub-pasos por step** (no uno):
   - Sub-paso A: Operario llega a la ubicación → **escanea el QR de la estantería** (valida que está en el lugar correcto)
   - Sub-paso B: Operario toma el producto → **escanea el barcode del producto** tantas veces como la `expectedQty`
   
   La app gestiona este estado localmente (sin llamar a la API en el sub-paso A). Solo llama a la API en el sub-paso B.

2. **Webhook de despacho**: Cuando se ejecuta `POST /orders/:id/dispatch`, el sistema debe emitir un webhook `order.shipped` al e-commerce configurado del tenant. Guardar la URL de webhook y el secret en la tabla `Tenant` o en una tabla `TenantWebhook` separada. El cuerpo del webhook debe incluir `orderId`, `externalId`, `shippedAt` y un HMAC-SHA256 para que el receptor pueda verificar la autenticidad.

3. **El botón "No encuentro el producto"** en la app debe:
   - Llamar a `POST /tasks/:id/steps/:stepId/confirm` con `exceptionNote: "Producto no encontrado en ubicación"`
   - El step queda en estado `EXCEPTION` y el operario puede continuar con el siguiente step
   - El supervisor ve en el dashboard que hay excepciones pendientes de resolver

4. **Finalización del picking → estado PACKED**: Cuando todos los steps de una tarea PICKING están en COMPLETED o EXCEPTION, el sistema automáticamente mueve el pedido a `PACKED`. Esto ya está implementado en `tasks.ts` — no duplicar la lógica.

### Endpoint crítico a implementar en este hito

```
POST /api/v1/orders/:id/dispatch
```

Este endpoint ya existe en `orders.ts` pero falta el Webhook outbound. Completarlo en Hito 3.
