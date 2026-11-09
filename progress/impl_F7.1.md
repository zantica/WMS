# Reporte de Implementación: F7.1 — Observabilidad Estructurada, `correlationId` y Puerto `DiagnosticsStore`

- **Estado**: DONE
- **Fecha**: 2026-10-31

## Archivos Creados / Modificados

- `packages/shared-types/src/index.ts`: Se añadió `CORRELATION_ID_HEADER = "x-correlation-id"`, los contratos `DiagnosticErrorRecord` y `ListDiagnosticErrorsFilters`, el código de error `FORBIDDEN` en `WmsErrorCode` y la propiedad opcional retrocompatible `correlationId?: string` en `ApiError.error`.
- `apps/api/src/ports/diagnostics-store.ts`: Definición del puerto hexagonal `DiagnosticsStore` (`recordError`, `listErrorsByTenant`) desacoplado de Fastify y Prisma.
- `apps/api/src/adapters/in-memory-diagnostics-store.ts`: Adaptador `InMemoryDiagnosticsStore` con capacidad acotada tipo *ring buffer* (FIFO por `tenantId`) y sanitización de detalles/mensajes antes de almacenar.
- `apps/api/src/use-cases/diagnostics/redact-sensitive.ts`: Utilidades puras `redactSensitiveData`, `isSensitiveKey` y `resolveSafeCorrelationId` para redactar credenciales (`authorization`, `x-api-key`, `password`, `token`, `secret`, `webhookSecret`, `x-webhook-signature`) y prevenir inyección en cabeceras/logs.
- `apps/api/src/use-cases/diagnostics/record-diagnostic-error.ts`: Caso de uso puro para registrar errores asociados a un `tenantId` válido a través del puerto `DiagnosticsStore`.
- `apps/api/src/use-cases/diagnostics/list-diagnostic-errors.ts`: Caso de uso puro para consultar errores recientes aislados por `tenantId`, validando rol (`ADMIN` o `SUPERVISOR`; `OPERATOR` recibe `WmsError` `FORBIDDEN` 403) y rangos de filtros.
- `apps/api/src/plugins/observability.ts`: Plugin Fastify que extrae o genera `x-correlation-id`, expone `request.correlationId`, devuelve el header `x-correlation-id`, mide `durationMs` y emite logs estructurados con secretos redactados.
- `apps/api/src/plugins/error-handler.ts`: Incluye `correlationId` dentro de `ApiError.error` (`WmsError`, `ZodError`, rate-limit y errores 500) y registra los errores en `app.diagnosticsStore` cuando `request.tenantId` está resuelto.
- `apps/api/src/routes/v1/diagnostics.ts`: Endpoint `GET /api/v1/diagnostics/errors` con validación Zod de `limit`, `errorCode` y `correlationId`.
- `apps/api/src/server.ts`: Registro de `observabilityPlugin` y montaje de `diagnosticsRoutes` bajo `/api/v1/diagnostics`.
- `apps/web/src/lib/api-client.ts` y `apps/mobile/src/api/client.ts`: Propagación automática del header `x-correlation-id` en cada petición, exposición de `correlationId` en `WmsWebApiError` / `WmsApiClientError` y método `listDiagnosticErrors` en `@wms/web`.
- `docs/adr/001-observability-and-diagnostics-port.md`: ADR documentando el puerto `DiagnosticsStore`, la política de redacción de secretos y la propagación extremo a extremo de `correlationId`.
- `apps/api/src/use-cases/diagnostics/__tests__/diagnostics.test.ts`, `apps/api/src/routes/v1/__tests__/diagnostics.test.ts`, `apps/web/src/lib/__tests__/api-client.test.ts`, `apps/mobile/src/api/__tests__/client.test.ts`: Suite completa de tests unitarios y de integración (TDD).

## Decisiones de Diseño e Invariantes

- **Arquitectura Hexagonal**: Los casos de uso `recordDiagnosticError` y `listDiagnosticErrors` dependen únicamente del puerto `DiagnosticsStore`, permitiendo sustituir `InMemoryDiagnosticsStore` por Redis/PostgreSQL/Sentry sin tocar la lógica de negocio.
- **Aislamiento Multi-Tenant Estricto y RBAC**: Ningún error sin `tenantId` verificado entra al cubo de un tenant, las consultas en `DiagnosticsStore` filtran estrictamente por `tenantId`, y el rol `OPERATOR` es rechazado con `WmsError("FORBIDDEN", ..., 403)`.
- **Inmutabilidad del Ledger**: Esta feature no altera `InventoryBalance` ni `InventoryTransaction`.

## Resultados de Verificación

- `pnpm build`: OK (5/5 paquetes compilados sin errores: `@wms/shared-types`, `@wms/db`, `@wms/api`, `@wms/web`, `@wms/mobile`).
- `pnpm test`: OK (16 suites pasadas, 155 tests en total: 121 en `@wms/api`, 11 en `@wms/web`, 23 en `@wms/mobile`).
- `pnpm --filter @wms/api test:coverage`: 121 tests passed, coverage `99.65%` statements/lines, `91.56%` branches, `100%` functions (superando el umbral del 80%).
