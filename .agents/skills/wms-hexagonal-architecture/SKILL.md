---
name: wms-hexagonal-architecture
description: >-
  Architectural rules, hexagonal ports & adapters patterns, testing strategy (TDD + real PostgreSQL integration),
  and Definition of Done for all new code in WMS SaaS (Milestones 5-7+).
---

# WMS Hexagonal Architecture & Definition of Done Skill

Esta skill establece las bases de arquitectura obligatorias y los criterios de hecho (*Definition of Done*) para cualquier pieza de software nueva en el proyecto WMS SaaS, tanto si la escribe una persona como un subagente (`implementer` o `reviewer`).

---

## 1. Bases de Arquitectura (Obligatorias para todo código nuevo)

Toda pieza nueva debe ser **desacoplada, mantenible y escalable**:

### 1.1 Desacoplada (Arquitectura Hexagonal: Puertos y Adaptadores)
- **Dominio y casos de uso sin dependencias de infraestructura**: Nada de `Prisma`, `Fastify`, `Expo`, `React` ni librerías concretas de formato/almacenamiento dentro del dominio o de los casos de uso puros. Las dependencias apuntan siempre hacia dentro.
- **Todo lo que sale del proceso va detrás de un Puerto**: Base de datos, reloj, generador de IDs, almacenamiento de diagnóstico (`DiagnosticsStore`), idempotencia (`IdempotencyStore`), contexto de tenant (`TenantContextPort`), analizador/mapeador de columnas (`ColumnMapper`), generador de etiquetas (`LabelRenderer`) y almacenamiento local móvil (`OfflineQueueStorage`). El adaptador concreto se inyecta en el borde.
- **Un caso de uso por intención**: Independiente del transporte. Debe poder invocarse desde un endpoint REST, un worker/job o un test sin cambios.
- **Contratos explícitos en `@wms/shared-types`**: Formatos de payload (ej. prefijos de etiquetas `LOC:A-01-01`), errores de dominio y respuestas de la API se definen una sola vez en `packages/shared-types` y se comparten entre `api`, `web` y `mobile`.
- **Sin imports cruzados entre módulos de dominio**: Los módulos se comunican por interfaces o eventos de dominio.

### 1.2 Mantenible
- **TDD (Test-Driven Development)**: Escribir el test primero para dominio y casos de uso. Los tests describen comportamiento de negocio, no detalles internos de implementación.
- **Código limpio y pequeño**: Funciones con una única responsabilidad, nombres del lenguaje ubicuo del dominio (DDD), sin lógica de negocio en controladores Fastify ni en componentes React/Expo.
- **Decisiones registradas (ADR)**: Cada decisión no obvia (ej. política de resolución de conflictos offline, diseño de RLS con autenticación previa) se documenta en un ADR conciso de una página dentro de `docs/adr/`.
- **Progreso trazable**: `feature_list.json` y `progress/current.md` se actualizan tras cada feature.

### 1.3 Escalable
- **API sin estado (Stateless)**: Nada que deba compartirse entre instancias puede acoplarse a memoria del proceso. Si en una primera versión se usa memoria (ej. `InMemoryDiagnosticsStore`), se encapsula detrás de un puerto (`DiagnosticsStore`) con un adaptador sustituible.
- **Operaciones idempotentes**: Todo flujo reintentable (importaciones masivas, sincronización móvil `sync-batch`, webhooks) garantiza idempotencia por `(tenantId, idempotencyKey)`.
- **Procesos pesados desacoplados de la petición**: La importación masiva se escribe como caso de uso independiente del transporte HTTP para poder ejecutarse en proceso hoy y detrás de una cola mañana sin reescribirla.
- **Consciente del tenant desde el diseño**: Toda consulta lleva contexto de tenant, los índices comienzan por `tenantId` y el aislamiento se refuerza en el motor PostgreSQL mediante Row Level Security (`FORCE ROW LEVEL SECURITY`).
- **Estrategias intercambiables**: Donde se prevea evolución, usar el patrón Strategy detrás de un puerto:
  - Mapeo de columnas en importación (`ColumnMapper`: diccionario heurístico hoy, LLM mañana).
  - Renderizado de etiquetas (`LabelRenderer`: QR/Code128 en SVG hoy, ZPL térmico mañana).

---

## 2. Estrategia de Pruebas

1. **Tests Unitarios**: Para dominio y casos de uso, inyectando puertos simulados (*fakes/mocks* limpios de los puertos).
2. **Tests de Integración contra PostgreSQL**: Para validar bloqueos (`SELECT FOR UPDATE`), aislamiento `Serializable`, idempotencia transaccional, políticas RLS y migraciones.
3. **Tests de Contrato**: Sobre los tipos y validadores compartidos en `@wms/shared-types` entre API, Web y Móvil.
4. **Pruebas de Fallo**: Cortes de red a mitad de lote, reintentos duplicados, colisiones de código de barras y accesos con tenant equivocado o vacío.

---

## 3. Criterios de Hecho (Definition of Done por Feature)

Una feature solo puede darse por terminada (`APPROVED` por el `reviewer` y `"done"` en `feature_list.json`) cuando cumple todos estos puntos:

- [ ] Casos de uso cubiertos con tests escritos primero (TDD) y cobertura ≥ 80%.
- [ ] **Cobertura exhaustiva de escenarios en tests**:
  - **Happy Path**: Flujo principal completo de principio a fin.
  - **Casos Borde (Edge Cases)**: Entradas vacías, valores límite, lotes en el umbral máximo, formatos atípicos.
  - **Errores de Dominio y Validación**: Verificación de cada `WmsError` esperado, estados inválidos y rechazos por reglas de negocio.
  - **Fallos, Reintentos y Aislamiento**: Idempotencia ante duplicados, fallos parciales a mitad de lote y bloqueo de acceso cruzado entre tenants (`tenantId` distinto o ausente).
- [ ] Verificación de integración para escrituras críticas, bloqueos, idempotencia o políticas RLS.
- [ ] Sin dependencias de infraestructura en dominio ni casos de uso nuevos.
- [ ] Contratos nuevos definidos en `@wms/shared-types`.
- [ ] Puertos documentados (`ports/`) y adaptador concreto inyectado en el borde (`adapters/`).
- [ ] Decisiones no obvias registradas en un ADR dentro de `docs/adr/`.
- [ ] `feature_list.json` y `progress/current.md` actualizados.
