# ADR 001: Observabilidad Estructurada, Propagación de `correlationId` y Puerto `DiagnosticsStore`

- **Estado**: Aceptado
- **Fecha**: 2026-10-31
- **Feature**: `F7.1` — Observabilidad Estructurada, `correlationId` y Puerto `DiagnosticsStore`

---

## 1. Contexto

En un sistema WMS multi-tenant donde conviven operarios de almacén con dispositivos móviles (`@wms/mobile`), supervisores en el panel web (`@wms/web`) e integraciones externas por webhook, diagnosticar fallos operativos (ej. `INVALID_SCAN`, `INSUFFICIENT_STOCK`, errores de validación) requiere:

1. Un identificador único extremo a extremo (`correlationId`) que viaje desde el cliente hasta los logs del servidor y regrese en las respuestas de error (`ApiError`).
2. Un registro consultable por los supervisores de cada almacén (`GET /api/v1/diagnostics/errors`) sin exponer jamás datos ni errores de otros tenants.
3. Redacción estricta de credenciales (`x-api-key`, `authorization`, `password`, `token`, `secret`, `webhookSecret`) antes de emitir logs o almacenar detalles de diagnóstico.
4. Desacoplamiento arquitectónico para que la API permanezca *stateless* y los casos de uso no dependan de Fastify, Pino ni de un motor de almacenamiento concreto.

---

## 2. Decisión

### 2.1 Contrato Compartido en `@wms/shared-types`
- Se define `CORRELATION_ID_HEADER = "x-correlation-id"` como constante canónica compartida entre `@wms/api`, `@wms/web` y `@wms/mobile`.
- Se extiende `ApiError.error` con `correlationId?: string` de forma retrocompatible.
- Se añade el código de dominio `FORBIDDEN` a `WmsErrorCode` para distinguir rechazos de autorización por rol (HTTP `403`) de fallos de autenticación (`UNAUTHORIZED`, HTTP `401`).
- Se definen los contratos `DiagnosticErrorRecord` y `ListDiagnosticErrorsFilters`.

### 2.2 Puerto Hexagonal `DiagnosticsStore` y Adaptador `InMemoryDiagnosticsStore`
- Los casos de uso en `apps/api/src/use-cases/diagnostics/` (`recordDiagnosticError` y `listDiagnosticErrors`) dependen exclusivamente de la interfaz `DiagnosticsStore` (`apps/api/src/ports/diagnostics-store.ts`).
- El adaptador inicial `InMemoryDiagnosticsStore` (`apps/api/src/adapters/in-memory-diagnostics-store.ts`) implementa un *ring buffer* (FIFO acotado por `maxEntriesPerTenant`, por defecto 200 entradas por tenant) indexado por `tenantId`.
- Esta frontera permite reemplazar `InMemoryDiagnosticsStore` en el futuro por un adaptador en Redis, PostgreSQL o OpenTelemetry/Sentry inyectándolo en `buildServer({ diagnosticsStore })` sin modificar ningún caso de uso ni controlador.

### 2.3 Política de Sanitización y Redacción de Secretos
- La utilidad pura `redactSensitiveData` inspecciona recursivamente objetos, arrays y cadenas buscando claves sensibles (`authorization`, `x-api-key`, `password`, `token`, `secret`, `webhookSecret`, `x-webhook-signature`, `cookie`) o valores con formato `Bearer ...` / JWT y los reemplaza por `"[REDACTED]"`.
- `resolveSafeCorrelationId` valida que todo `x-correlation-id` entrante cumpla `^[a-zA-Z0-9._:-]{1,128}$`; si está ausente o contiene caracteres de control (ej. CRLF), genera un `randomUUID()` seguro para prevenir *log/header injection*.

### 2.4 Aislamiento Multi-Tenant y Control de Acceso (RBAC)
- El manejador de errores (`errorHandler`) solo invoca `recordDiagnosticError` cuando `request.tenantId` ha sido resuelto y verificado por `authPlugin`. Los fallos previos a la identificación de un tenant válido se registran en el log estructurado del servidor pero nunca contaminan los cubos de tenants en `DiagnosticsStore`.
- El caso de uso `listDiagnosticErrors` exige explícitamente rol `ADMIN` o `SUPERVISOR`; cualquier intento de un `OPERATOR` lanza `WmsError("FORBIDDEN", ..., 403)`.

---

## 3. Consecuencias

- **Positivas**:
  - Trazabilidad completa desde `@wms/web` y `@wms/mobile` hasta `@wms/api` mediante `x-correlation-id` y `error.correlationId`.
  - Cero fugas de secretos en logs o en el almacén de diagnóstico.
  - Aislamiento multi-tenant garantizado por diseño tanto en el caso de uso como en la estructura particionada por `tenantId` del adaptador.
- **Trade-offs**:
  - `InMemoryDiagnosticsStore` es efímero por proceso (adecuado para diagnóstico inmediato en caliente con memoria acotada); la persistencia duradera multi-instancia se delega a futuros adaptadores del puerto `DiagnosticsStore`.
