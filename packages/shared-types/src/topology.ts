// packages/shared-types/src/topology.ts
// Lógica pura y contratos del dominio de Topología Física y Layout del Almacén.
// Sin dependencias de ORM, Fastify ni React.

import type { LocationStatus, LocationType, StorageType } from "./index.js";

export const AISLE_CELL_COLLAPSE_THRESHOLD = 200;
export const SPECIAL_FLOOR_AISLE = "__FLOOR__";

/**
 * Calcula el Available-To-Promise (ATP) respetando el invariante del Ledger:
 * El stock disponible para nuevas órdenes nunca puede ser negativo.
 */
export function calculateAtp(onHandQty: number, allocatedQty: number): number {
  const onHand = Number.isFinite(onHandQty) ? Math.max(0, onHandQty) : 0;
  const allocated = Number.isFinite(allocatedQty) ? Math.max(0, allocatedQty) : 0;
  return Math.max(0, onHand - allocated);
}

/**
 * Normaliza un segmento numérico para asegurar zero-padding fijo de al menos 2 dígitos (01..99).
 */
export function padSegment(segment: string | number, minDigits = 2): string {
  const str = String(segment).trim();
  if (/^\d+$/.test(str)) {
    return str.padStart(minDigits, "0");
  }
  return str.toUpperCase();
}

/**
 * Normaliza cualquier código de ubicación garantizando que todos los segmentos
 * numéricos tengan al menos 2 dígitos de zero-padding.
 *
 * Ejemplo:
 * - "A-1-1" -> "A-01-01"
 * - "REC-1" -> "REC-01"
 * - "A-01-01-1" -> "A-01-01-01"
 * - "01-01-01-12" -> "01-01-01-12"
 *
 * Garantiza que `ORDER BY code ASC` en SQL o `.sort()` en JS coincida
 * exactamente con el orden físico real (A-01-01 < A-01-09 < A-01-10 < A-01-12).
 */
export function normalizeLocationCode(rawCode: string): string {
  if (!rawCode || typeof rawCode !== "string") {
    throw new Error("El código de ubicación no puede estar vacío");
  }

  const trimmed = rawCode.trim().toUpperCase();
  if (trimmed.length === 0) {
    throw new Error("El código de ubicación no puede estar vacío");
  }

  // Descomponer en segmentos delimitados por guión '-' o guión bajo '_'
  const parts = trimmed.split(/([-_.])/);
  const normalizedParts = parts.map((part) => {
    if (part === "-" || part === "_" || part === ".") {
      return part;
    }
    if (/^\d+$/.test(part)) {
      return part.padStart(2, "0");
    }
    return part;
  });

  const normalized = normalizedParts.join("");

  if (!/^[A-Z0-9\-_]+$/.test(normalized)) {
    throw new Error(
      `El código de ubicación '${rawCode}' contiene caracteres inválidos. Solo se permiten letras, números, guiones y guiones bajos`,
    );
  }

  return normalized;
}

export interface FormatStructuredLocationCodeParams {
  storageType: StorageType;
  zone?: string | null | undefined;
  aisle?: string | null | undefined;
  rack: string | number;
  level: string | number;
  position: string | number;
}

/**
 * Genera un código de ubicación estructurado y determinista a partir de sus coordenadas físicas.
 */
export function formatStructuredLocationCode(
  params: FormatStructuredLocationCodeParams,
): string {
  const rackStr = padSegment(params.rack, 2);
  const levelStr = padSegment(params.level, 2);
  const posStr = padSegment(params.position, 2);
  const zoneStr = params.zone && params.zone.trim().length > 0 ? params.zone.trim().toUpperCase() : "MAIN";
  const aisleStr = params.aisle && params.aisle.trim().length > 0 ? padSegment(params.aisle.trim(), 2) : null;

  if (params.storageType === "FLOOR") {
    // Para ubicaciones en suelo (nivel '01' siempre)
    if (aisleStr) {
      return normalizeLocationCode(`${aisleStr}-${rackStr}-${levelStr}-${posStr}`);
    }
    return normalizeLocationCode(`FL-${rackStr}-${levelStr}-${posStr}`);
  }

  // Para RACK y SHELVING: pasillo es obligatorio
  const aislePart = aisleStr ?? "01";
  if (zoneStr !== "MAIN") {
    return normalizeLocationCode(`${zoneStr}-${aislePart}-${rackStr}-${levelStr}-${posStr}`);
  }
  return normalizeLocationCode(`${aislePart}-${rackStr}-${levelStr}-${posStr}`);
}

export interface ValidateStorageTypeParams {
  storageType: StorageType;
  zone?: string | null | undefined;
  aisle?: string | null | undefined;
  rack?: string | null | undefined;
  level?: string | null | undefined;
  position?: string | null | undefined;
}

/**
 * Matriz de validación arquitectónica según el tipo de almacenamiento físico (StorageType).
 * - RACK: zone req, aisle req (no vacío), rack req, level req (01..NN, entero >= 1), position req.
 * - SHELVING: zone req, aisle req (no vacío), rack req, level req (01..NN, entero >= 1), position req.
 * - FLOOR: zone req, aisle opcional, rack req (= bahía/zona de suelo), level SIEMPRE debe ser '01', position req.
 */
export function validateStorageTypeMetadata(
  params: ValidateStorageTypeParams,
): { valid: boolean; error?: string } {
  const { storageType, zone, aisle, rack, level, position } = params;

  if (!storageType || (storageType !== "RACK" && storageType !== "SHELVING" && storageType !== "FLOOR")) {
    return { valid: false, error: `Tipo de almacenamiento inválido: '${storageType}'` };
  }

  if (!zone || zone.trim().length === 0) {
    return { valid: false, error: "La zona ('zone') es obligatoria para cualquier ubicación física" };
  }

  if (!rack || rack.trim().length === 0) {
    return { valid: false, error: "El identificador de rack o bahía ('rack') es obligatorio" };
  }

  if (!position || position.trim().length === 0) {
    return { valid: false, error: "La posición ('position') es obligatoria" };
  }

  if (storageType === "FLOOR") {
    // Nivel en suelo DEBE ser 01
    if (level !== undefined && level !== null && level.trim().length > 0) {
      const normalizedLevel = padSegment(level, 2);
      if (normalizedLevel !== "01") {
        return {
          valid: false,
          error: `Las ubicaciones de tipo FLOOR solo admiten nivel '01' (se recibió '${level}')`,
        };
      }
    }
    return { valid: true };
  }

  // RACK y SHELVING requieren pasillo y nivel >= 1
  if (!aisle || aisle.trim().length === 0) {
    return {
      valid: false,
      error: `Las ubicaciones de tipo ${storageType} requieren indicar el pasillo ('aisle')`,
    };
  }

  if (!level || level.trim().length === 0) {
    return {
      valid: false,
      error: `Las ubicaciones de tipo ${storageType} requieren indicar el nivel ('level')`,
    };
  }

  const levelNum = parseInt(level, 10);
  if (isNaN(levelNum) || levelNum < 1) {
    return {
      valid: false,
      error: `El nivel ('level') debe ser un número entero mayor o igual a 1 (se recibió '${level}')`,
    };
  }

  return { valid: true };
}
