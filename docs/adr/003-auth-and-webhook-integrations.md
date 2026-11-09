# ADR 003: Estrategia de Autenticación Híbrida (RS256/HS256), Aislamiento de Privilegios e Idempotencia de Webhooks

- **Estado**: Aceptado
- **Fecha**: 2026-11-09
- **Feature**: `F4.2` — Autenticación JWT y Webhooks de Integración Externa

---

## 1. Contexto

La integración con plataformas externas de comercio (Shopify, WooCommerce, ERPs) y el acceso de clientes a través de proveedores de identidad modernos como Clerk introducen desafíos críticos de seguridad y robustez:
1. **Confusión de Algoritmos (Algorithm Confusion)**: Clerk emite tokens RS256 firmados con clave privada asimétrica y publica su clave pública (PEM/JWKS). Si el backend utiliza erróneamente dicha clave pública como secreto HMAC en verificaciones HS256, cualquier atacante con acceso a la clave pública podría firmar tokens válidos arbitrarios.
2. **Escalada de Privilegios y Suplantación Multi-Tenant**: Si el sistema confía en claims de rol (`role: "ADMIN"`) o tenant (`tenantId`) contenidos en el token sin verificar la base de datos o cuando el usuario no existe en la tabla `users`, un usuario externo podría auto-asignarse permisos de administrador sobre cualquier inquilino.
3. **Fugas de Seguridad en Desarrollo**: Cabeceras de bypass como `x-dev-tenant-id` diseñadas para agilizar pruebas locales no deben activarse de forma implícita cuando variables de entorno como `NODE_ENV` no están definidas en entornos mal configurados.
4. **Idempotencia bajo Concurrencia (TOCTOU)**: Los sistemas de e-commerce reintentan peticiones de webhook en paralelo. La búsqueda previa (`findFirst`) antes de insertar (`create`) sin una restricción de unicidad estricta en base de datos genera pedidos duplicados ante peticiones simultáneas.
5. **Fallos Parciales en Ingesta**: Si un pedido se crea en base de datos pero la reserva automática de stock (`allocateOrder`) falla (p.ej. stock insuficiente), fallar con 500/409 deja el sistema en un estado incoherente y los reintentos pierden trazabilidad.
6. **Bloqueo por Endpoints Externos Lentos**: Notificaciones salientes (`order.shipped`) sin límite de tiempo pueden bloquear hilos de ejecución de la API si el endpoint externo está caído o congestionado.

### Alternativas Descartadas:
- *Rechazar RS256 y forzar solo HS256 en Clerk*: Descartado porque Clerk emite nativamente RS256 y obligaría a sincronizar secretos simétricos complejos por tenant.
- *Rechazar completamente tokens de usuarios no sincronizados en BD*: Descartado para permitir handshakes iniciales de onboarding o servicios externos, siempre y cuando se verifique la existencia del tenant y el rol quede forzado al mínimo (`OPERATOR`).
- *Transacción completa rollback ante fallo de `allocateOrder`*: Descartado porque un pedido de e-commerce debe ser registrado en el WMS incluso si requiere intervención manual por falta de stock.

---

## 2. Decisión

1. **Soporte Criptográfico Dual Separado (RS256 vs HS256)**:
   - Se implementa verificación asimétrica con `createVerify("RSA-SHA256")` para tokens Clerk cuando `alg === "RS256"`, utilizando exclusivamente `CLERK_JWT_KEY` (clave pública PEM).
   - Se implementa verificación simétrica con `createHmac("sha256")` cuando `alg === "HS256"` utilizando `JWT_SECRET`.
   - Se prohíbe taxativamente reutilizar la clave pública de Clerk como secreto HMAC. Algoritmos distintos (o `none`) son rechazados con HTTP 401.
   - En `NODE_ENV=production`, `JWT_SECRET` es obligatorio en el arranque (500 `CONFIGURATION_ERROR` si falta).
2. **Tokens con Expiración Obligatoria y Aislamiento de Roles**:
   - `verifyJwtToken` exige un claim `exp` numérico finito y mayor a la hora actual. Se valida opcionalmente `nbf`.
   - Si el usuario existe en BD (`lookupUserByClerkIdForAuth`), se aplican estrictamente el `tenantId` y `role` de la base de datos (ignorando roles del token) y se rechaza si la cuenta está inactiva.
   - Si el usuario no existe en BD: se valida que el `tenantId` exista en la tabla `tenants` (401 si no existe) y el rol se fija obligatoriamente en `OPERATOR` (nunca se concede `ADMIN` ni `SUPERVISOR`).
3. **Bypass de Desarrollo Estricto**:
   - La cabecera `x-dev-tenant-id` solo es leída si existe opt-in explícito (`NODE_ENV === "development"` o `ALLOW_DEV_TENANT_HEADER === "true"`). En producción o si `NODE_ENV` está ausente, se ignora.
4. **Idempotencia Estricta en Base de Datos**:
   - Se define la restricción única `@@unique([tenantId, externalId])` en el modelo `SalesOrder` (`sales_orders`).
   - El caso de uso `ingestExternalOrder` captura errores `P2002` de Prisma y re-consulta el pedido existente devolviendo `idempotentReplay: true`.
5. **Semántica de Fallo en Reserva Automática**:
   - Si `autoAllocate: true` y `allocateOrder` lanza un error (p.ej. falta de existencias), el pedido se conserva en estado `PENDING`, no se lanza excepción HTTP 500, y el resultado incluye `allocationError: string` para alertar al cliente.
6. **Transición Atómica de Despacho y Timeouts Salientes**:
   - En `POST /orders/:id/dispatch` se utiliza `updateMany({ where: { id, tenantId, status: "PACKED" }, data: { status: "SHIPPED" } })` para garantizar que exactamente una llamada ejecute la transición y envíe el webhook.
   - Las llamadas salientes en `notifyOrderShipped` usan `AbortSignal.timeout(5000)` para evitar cuelgues ante lentitud externa.
   - Los webhooks entrantes preservan el `rawBody` mediante `addContentTypeParser` de Fastify para verificar la firma HMAC sobre los bytes exactos recibidos.

---

## 3. Consecuencias

### Positivas:
- **Inmunidad ante ataques de Algorithm Confusion**: Verificación aislada por clave pública vs clave simétrica.
- **Defensa en Profundidad**: Imposibilidad de que tokens manipulados obtengan privilegios administrativos o creen inquilinos falsos.
- **Idempotencia Resistente a Concurrencia Real**: Shopify o ERPs pueden reenviar peticiones con total seguridad sin riesgo de pedidos duplicados.
- **Resiliencia Operativa**: Los pedidos con stock insuficiente quedan registrados para supervisión en lugar de provocar errores 500/409 intermitentes.

### Negativas / Costes Aceptados:
- Se requiere migración en base de datos para la clave única `(tenantId, externalId)`.
- Usuarios no registrados en el WMS quedan restringidos a rol de solo lectura/operador mínimo hasta ser aprovisionados por un administrador.

### Verificación:
- Tests unitarios de firma, expiración y algoritmo confusion en `apps/api/src/plugins/__tests__/auth.test.ts` (25 tests).
- Tests de idempotencia por colisión `P2002` y fallo de asignación en `apps/api/src/use-cases/integrations/__tests__/webhooks.test.ts` (25 tests).
- Tests de transición atómica de despacho en `apps/api/src/routes/__tests__/orders-dispatch.test.ts` (3 tests).
