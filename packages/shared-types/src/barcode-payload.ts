// packages/shared-types/src/barcode-payload.ts
// Esquema de payload de etiquetas con prefijo de entidad tipado (LOC:A-01-01, SKU:..., EAN:...)
// y helpers de construcción, parseo, extracción y validación de escaneo para apps/mobile, apps/api y apps/web.

export const BARCODE_PREFIXES = [
  "LOC",
  "SKU",
  "EAN",
  "LPN",
  "ORDER",
  "TASK",
  "USER",
] as const;

export type BarcodePrefix = (typeof BARCODE_PREFIXES)[number];

export type BarcodeSymbology = "QR" | "CODE128";

export interface LabelDimensionsMm {
  widthMm: number;
  heightMm: number;
}

export interface ParsedBarcodePayload<T extends BarcodePrefix = BarcodePrefix> {
  raw: string;
  hasPrefix: boolean;
  prefix: T | null;
  value: string;
  entityType: BarcodePrefix | "UNKNOWN";
}

export interface ValidateBarcodeOptions {
  /**
   * Si es true, permite códigos escaneados sin prefijo (ej. códigos de barras comerciales estándar
   * o lectores láser legacy configurados sin prefijos virtuales).
   * Default: false
   */
  allowRawFallback?: boolean;
}

export interface ValidationBarcodeResult<
  T extends BarcodePrefix = BarcodePrefix,
> {
  valid: boolean;
  value: string;
  prefix: T | null;
  hasPrefix: boolean;
  errorMessage?: string | undefined;
}

/**
 * DTO de una etiqueta individual renderizada lista para visualización e impresión.
 */
export interface RenderedLabelDTO {
  id: string;
  entityType: "LOCATION" | "PRODUCT";
  entityId: string;
  code: string;
  barcodePayload: string;
  humanReadableText: string;
  title: string;
  subtitle?: string | null;
  symbology: BarcodeSymbology;
  widthMm: number;
  heightMm: number;
  svg: string;
  dataUri: string;
}

/**
 * Solicitud de generación de etiquetas de ubicaciones físicas.
 */
export interface GenerateLocationLabelsRequest {
  locationIds?: string[] | undefined;
  locationCodes?: string[] | undefined;
  warehouseId?: string | undefined;
  symbology?: BarcodeSymbology | undefined;
  widthMm?: number | undefined;
  heightMm?: number | undefined;
  includeHumanReadable?: boolean | undefined;
}

/**
 * Solicitud de generación de etiquetas de productos (catálogo/SKU/barcode).
 */
export interface GenerateProductLabelsRequest {
  productIds?: string[] | undefined;
  skus?: string[] | undefined;
  symbology?: BarcodeSymbology | undefined;
  widthMm?: number | undefined;
  heightMm?: number | undefined;
  includeHumanReadable?: boolean | undefined;
  useBarcodeAsPayload?: boolean | undefined;
}

/**
 * Lote de etiquetas devueltas por la API listas para imprimir en cuadrícula.
 */
export interface LabelBatchResponseDTO {
  symbology: BarcodeSymbology;
  dimensions: LabelDimensionsMm;
  count: number;
  labels: RenderedLabelDTO[];
}

/**
 * Construye un payload tipado asegurando el prefijo requerido sin duplicación accidental.
 * Ej: buildBarcodePayload("LOC", "A-01-01") -> "LOC:A-01-01"
 * Ej: buildBarcodePayload("LOC", "LOC:A-01-01") -> "LOC:A-01-01"
 */
export function buildBarcodePayload(
  prefix: BarcodePrefix,
  value: string,
): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`El valor para la etiqueta con prefijo '${prefix}' no puede estar vacío.`);
  }

  const prefixPattern = new RegExp(`^${prefix}:`, "i");
  if (prefixPattern.test(trimmed)) {
    const rawVal = trimmed.substring(prefix.length + 1).trim();
    if (rawVal.length === 0) {
      throw new Error(`El valor de '${prefix}' no puede estar vacío tras el prefijo.`);
    }
    return `${prefix}:${rawVal}`;
  }

  return `${prefix}:${trimmed}`;
}

/**
 * Helper tipado para etiquetas de ubicación (LOC:A-01-01).
 * Convierte el código a mayúsculas para coherencia logística.
 */
export function buildLocationBarcode(locationCode: string): string {
  return buildBarcodePayload("LOC", locationCode.toUpperCase());
}

/**
 * Helper tipado para etiquetas de SKU de producto (SKU:TSHIRT-BLK-L).
 */
export function buildProductSkuBarcode(sku: string): string {
  return buildBarcodePayload("SKU", sku);
}

/**
 * Helper tipado para etiquetas con código de barras comercial (EAN:7501031311309).
 */
export function buildProductEanBarcode(eanOrUpc: string): string {
  return buildBarcodePayload("EAN", eanOrUpc);
}

/**
 * Parsea cualquier código escaneado o generado en su prefijo y valor limpios.
 */
export function parseBarcodePayload(raw: string): ParsedBarcodePayload {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return {
      raw: "",
      hasPrefix: false,
      prefix: null,
      value: "",
      entityType: "UNKNOWN",
    };
  }

  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    const candidatePrefix = trimmed.substring(0, colonIdx).toUpperCase();
    if (BARCODE_PREFIXES.includes(candidatePrefix as BarcodePrefix)) {
      const cleanPrefix = candidatePrefix as BarcodePrefix;
      const cleanValue = trimmed.substring(colonIdx + 1).trim();
      return {
        raw: trimmed,
        hasPrefix: true,
        prefix: cleanPrefix,
        value: cleanValue,
        entityType: cleanPrefix,
      };
    }
  }

  return {
    raw: trimmed,
    hasPrefix: false,
    prefix: null,
    value: trimmed,
    entityType: "UNKNOWN",
  };
}

/**
 * Valida un código escaneado contra el tipo de entidad esperado por el flujo operativo móvil.
 */
export function validateBarcodePayload<
  T extends BarcodePrefix = BarcodePrefix,
>(
  raw: string,
  expectedPrefix: T,
  options: ValidateBarcodeOptions = {},
): ValidationBarcodeResult<T> {
  const parsed = parseBarcodePayload(raw);

  if (parsed.value.length === 0) {
    return {
      valid: false,
      value: "",
      prefix: null,
      hasPrefix: false,
      errorMessage: "El código escaneado está vacío.",
    };
  }

  if (parsed.hasPrefix) {
    if (parsed.prefix === expectedPrefix) {
      return {
        valid: true,
        value: parsed.value,
        prefix: parsed.prefix as T,
        hasPrefix: true,
      };
    }

    return {
      valid: false,
      value: parsed.value,
      prefix: parsed.prefix as T,
      hasPrefix: true,
      errorMessage: `Tipo de etiqueta no coincide. Se esperaba '${expectedPrefix}' pero se escaneó '${parsed.prefix}'.`,
    };
  }

  // Si no tiene prefijo:
  if (options.allowRawFallback) {
    return {
      valid: true,
      value: parsed.value,
      prefix: null,
      hasPrefix: false,
    };
  }

  return {
    valid: false,
    value: parsed.value,
    prefix: null,
    hasPrefix: false,
    errorMessage: `El código escaneado no contiene el prefijo obligatorio '${expectedPrefix}:'.`,
  };
}

/**
 * Determina si el código escaneado corresponde a una ubicación física (LOC).
 */
export function isLocationBarcode(raw: string): boolean {
  return parseBarcodePayload(raw).prefix === "LOC";
}

/**
 * Determina si el código escaneado corresponde a un producto (SKU o EAN).
 */
export function isProductBarcode(raw: string): boolean {
  const p = parseBarcodePayload(raw).prefix;
  return p === "SKU" || p === "EAN";
}

/**
 * Extrae de forma segura el código de ubicación desde un código escaneado (con o sin prefijo LOC).
 */
export function extractLocationCode(raw: string): string {
  const parsed = parseBarcodePayload(raw);
  return parsed.value.toUpperCase();
}

/**
 * Extrae de forma segura el código o SKU del producto desde un escaneo.
 */
export function extractProductCode(raw: string): string {
  const parsed = parseBarcodePayload(raw);
  return parsed.value;
}
