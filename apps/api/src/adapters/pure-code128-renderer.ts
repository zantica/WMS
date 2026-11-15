// apps/api/src/adapters/pure-code128-renderer.ts
// Motor puro en TypeScript para generación de códigos de barras Code 128 (Set B) conforme a ISO/IEC 15417.
// Cero dependencias externas. Genera vectores SVG escalables a cualquier DPI y dimensiones en mm.

/**
 * Tabla canónica de patrones de barras Code 128 (índices 0 a 106).
 * Cada número representa el ancho de las barras y espacios consecutivos (3 barras y 3 espacios = 6 dígitos, sum = 11).
 * El símbolo de Stop (106) tiene 4 barras y 3 espacios = 7 dígitos, sum = 13 ("2331112").
 */
const CODE128_PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112", // 100-106 (104=StartB, 106=Stop)
] as const;

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Convierte una secuencia de anchos (ej. "212222") en una cadena binaria de módulos (ej. "11011001100").
 */
function patternToModules(pattern: string): string {
  let modules = "";
  let isBar = true;
  for (let i = 0; i < pattern.length; i++) {
    const width = Number(pattern[i]);
    modules += (isBar ? "1" : "0").repeat(width);
    isBar = !isBar;
  }
  return modules;
}

export interface Code128RenderOptions {
  heightMm?: number | undefined;
  moduleWidthMm?: number | undefined;
  includeText?: boolean | undefined;
}

/**
 * Genera el código de barras Code 128 (Set B) para una cadena de texto en SVG puro.
 */
export function generateCode128Svg(
  text: string,
  options: Code128RenderOptions = {},
): string {
  const cleanText = text.trim();
  if (cleanText.length === 0) {
    throw new Error("El texto a codificar en Code 128 no puede estar vacío.");
  }

  // Filtrar caracteres fuera del rango ASCII imprimible (32 a 126)
  const codeValues: number[] = [];
  for (let i = 0; i < cleanText.length; i++) {
    const charCode = cleanText.charCodeAt(i);
    if (charCode < 32 || charCode > 126) {
      throw new Error(`Carácter no soportado en Code 128 Set B: '${cleanText[i]}' (código ${charCode}).`);
    }
    codeValues.push(charCode - 32);
  }

  // Calcular checksum: (StartCode + SUM(pos * val)) % 103
  let checksum = START_CODE_B;
  for (let i = 0; i < codeValues.length; i++) {
    checksum += (i + 1) * codeValues[i]!;
  }
  checksum %= 103;

  // Secuencia completa de códigos a renderizar: [START_B, ...codeValues, checksum, STOP]
  const fullSequence = [START_CODE_B, ...codeValues, checksum, STOP_CODE];

  // Construir string binario de módulos con quiet zones (10 módulos a cada lado)
  const quietZoneModules = "0000000000";
  let barcodeBinary = quietZoneModules;
  for (const code of fullSequence) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) {
      throw new Error(`Patrón no encontrado para el código ${code}.`);
    }
    barcodeBinary += patternToModules(pattern);
  }
  barcodeBinary += quietZoneModules;

  const totalModules = barcodeBinary.length;
  const barHeight = options.heightMm ?? 20;
  const includeText = options.includeText ?? true;
  const textHeight = includeText ? 6 : 0;
  const totalHeight = barHeight + textHeight;

  // Construir elementos <rect> agrupando barras contiguas
  const rects: string[] = [];
  let currentStart: number | null = null;

  for (let x = 0; x < totalModules; x++) {
    const isBar = barcodeBinary[x] === "1";
    if (isBar && currentStart === null) {
      currentStart = x;
    } else if (!isBar && currentStart !== null) {
      const width = x - currentStart;
      rects.push(`<rect x="${currentStart}" y="0" width="${width}" height="${barHeight}" fill="#000000"/>`);
      currentStart = null;
    }
  }
  if (currentStart !== null) {
    const width = totalModules - currentStart;
    rects.push(`<rect x="${currentStart}" y="0" width="${width}" height="${barHeight}" fill="#000000"/>`);
  }

  const textElement = includeText
    ? `<text x="${totalModules / 2}" y="${barHeight + 4.8}" text-anchor="middle" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="4.2" font-weight="600" fill="#0f172a">${escapeXml(cleanText)}</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalHeight}" width="100%" height="100%" shape-rendering="crispEdges">`,
    `  <rect width="${totalModules}" height="${totalHeight}" fill="#ffffff"/>`,
    ...rects.map((r) => `  ${r}`),
    textElement ? `  ${textElement}` : "",
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
