# ADR NNN: <Título corto en imperativo o sustantivo>

<!--
PLANTILLA OFICIAL DE ADR (WMS SaaS)
1. Copia este archivo como `docs/adr/NNN-slug-en-kebab-case.md` (NNN = siguiente número libre, 3 dígitos).
2. Rellena las tres secciones obligatorias: Contexto, Decisión, Consecuencias. Sé breve (1–2 páginas).
3. Añade una fila al índice en `docs/adr/README.md`.
4. Un ADR aceptado no se reescribe: si la decisión cambia, crea uno nuevo y marca este como
   "Sustituido por ADR XXX".
-->

- **Estado**: Propuesto | Aceptado | Sustituido por ADR XXX | Obsoleto
- **Fecha**: YYYY-MM-DD
- **Feature**: `FX.Y` — <título de la feature en feature_list.json>

---

## 1. Contexto

¿Qué problema o fuerza obliga a decidir? Restricciones de dominio (Ledger, multi-tenancy, offline),
técnicas y de negocio. Alternativas consideradas (2–3 viñetas con el motivo de descarte).

## 2. Decisión

Qué se decide, en términos concretos y verificables: puertos/adaptadores, contratos en
`@wms/shared-types`, tablas/políticas, flujos. Referencia a archivos clave (`apps/api/src/ports/...`).

## 3. Consecuencias

- **Positivas**: qué garantías ganamos.
- **Negativas / Riesgos**: deuda aceptada, costes, límites conocidos.
- **Verificación**: qué tests (unitarios / integración PostgreSQL) prueban que la decisión se cumple.
