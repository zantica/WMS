// apps/api/src/adapters/pure-qr-renderer.ts
// Generador autónomo y determinista de códigos QR (ISO/IEC 18004) en TypeScript puro.
// Soporta modo Byte (UTF-8) para versiones 1 a 6 con corrección de error Reed-Solomon en GF(256).
// Cero dependencias externas. Genera vectores SVG limpios.

/**
 * Tablas de Galois Field GF(2^8) con polinomio irreducible 0x11D (285).
 */
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_EXP[i + 255] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
})();

function gfMultiply(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF_EXP[GF_LOG[x]! + GF_LOG[y]!]!;
}

/**
 * Genera el polinomio generador Reed-Solomon para n codewords de corrección de error.
 */
function getGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const factor = new Uint8Array([1, GF_EXP[i]!]);
    const next = new Uint8Array(poly.length + factor.length - 1);
    for (let j = 0; j < poly.length; j++) {
      for (let k = 0; k < factor.length; k++) {
        const idx = j + k;
        next[idx] = (next[idx] ?? 0) ^ gfMultiply(poly[j]!, factor[k]!);
      }
    }
    poly = next;
  }
  return poly;
}

/**
 * Calcula los codewords de corrección de error usando división polinomial en GF(256).
 */
function calculateErrorCorrection(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = getGeneratorPoly(ecCount);
  const result = new Uint8Array(data.length + ecCount);
  result.set(data);

  for (let i = 0; i < data.length; i++) {
    const coef = result[i]!;
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        const idx = i + j;
        result[idx] = (result[idx] ?? 0) ^ gfMultiply(gen[j]!, coef);
      }
    }
  }

  return result.slice(data.length);
}

interface VersionSpec {
  version: number;
  totalDataCodewords: number;
  ecCodewordsPerBlock: number;
  blocks: number;
  alignmentPositions: number[];
}

// Especificaciones para nivel M (Medium - 15% recuperación) versiones 1 a 6
const QR_SPECS_M: readonly VersionSpec[] = [
  { version: 1, totalDataCodewords: 16, ecCodewordsPerBlock: 10, blocks: 1, alignmentPositions: [] },
  { version: 2, totalDataCodewords: 28, ecCodewordsPerBlock: 16, blocks: 1, alignmentPositions: [6, 18] },
  { version: 3, totalDataCodewords: 44, ecCodewordsPerBlock: 26, blocks: 1, alignmentPositions: [6, 22] },
  { version: 4, totalDataCodewords: 64, ecCodewordsPerBlock: 18, blocks: 2, alignmentPositions: [6, 26] },
  { version: 5, totalDataCodewords: 86, ecCodewordsPerBlock: 24, blocks: 2, alignmentPositions: [6, 30] },
  { version: 6, totalDataCodewords: 108, ecCodewordsPerBlock: 16, blocks: 4, alignmentPositions: [6, 34] },
];

/**
 * Formateo de Information Bits (Nivel M = 00, Máscara 0 = 000 -> 00000 -> tras BCH y XOR -> 0x5412)
 */
const FORMAT_INFO_M_MASK0 = 0x5412; // Nivel M (00) y mask 0 (000): 00000 ^ 101010000010010 = 101010000010010

export interface QrRenderOptions {
  margin?: number;
  pixelColor?: string;
  backgroundColor?: string;
}

/**
 * Genera el SVG vectorial de un código QR para el texto dado.
 */
export function generateQrSvg(text: string, options: QrRenderOptions = {}): string {
  const cleanText = text.trim();
  if (cleanText.length === 0) {
    throw new Error("El texto a codificar en QR no puede estar vacío.");
  }

  const textBytes = new TextEncoder().encode(cleanText);

  // Elegir la versión mínima que admita el contenido en modo Byte (modo = 4 bits, count = 8 bits)
  const spec = QR_SPECS_M.find((s) => textBytes.length <= s.totalDataCodewords - 2);
  if (!spec) {
    throw new Error(`El texto excede la capacidad máxima del generador QR integrado (${cleanText.length} bytes).`);
  }

  // 1. Construir flujo de bits: [Mode (0100) 4-bit, Length 8-bit, ...data]
  const bitArray: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitArray.push((val >> i) & 1);
    }
  }

  pushBits(0b0100, 4); // Byte mode
  pushBits(textBytes.length, 8); // Character count
  for (const b of textBytes) {
    pushBits(b, 8);
  }

  // Terminator (hasta 4 ceros)
  const maxBits = spec.totalDataCodewords * 8;
  const termLength = Math.min(4, maxBits - bitArray.length);
  for (let i = 0; i < termLength; i++) {
    bitArray.push(0);
  }

  // Padding a múltiplo de 8
  while (bitArray.length % 8 !== 0) {
    bitArray.push(0);
  }

  // Convertir bits a codewords
  const dataCodewords: number[] = [];
  for (let i = 0; i < bitArray.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bitArray[i + j]!;
    }
    dataCodewords.push(byte);
  }

  // Rellenar con pad bytes alternados (0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (dataCodewords.length < spec.totalDataCodewords) {
    dataCodewords.push(padBytes[padIdx % 2]!);
    padIdx++;
  }

  // 2. Dividir en bloques y calcular corrección de errores
  const blockSize = Math.floor(spec.totalDataCodewords / spec.blocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];

  for (let b = 0; b < spec.blocks; b++) {
    const start = b * blockSize;
    const blockData = new Uint8Array(dataCodewords.slice(start, start + blockSize));
    dataBlocks.push(blockData);
    ecBlocks.push(calculateErrorCorrection(blockData, spec.ecCodewordsPerBlock));
  }

  // Entrelazar codewords de datos
  const finalCodewords: number[] = [];
  for (let i = 0; i < blockSize; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      finalCodewords.push(dataBlocks[b]![i]!);
    }
  }

  // Entrelazar codewords de corrección de error
  for (let i = 0; i < spec.ecCodewordsPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      finalCodewords.push(ecBlocks[b]![i]!);
    }
  }

  // 3. Crear matriz del QR
  const size = 17 + spec.version * 4;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => null),
  );
  const isFunction: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false),
  );

  function setModule(r: number, c: number, val: boolean) {
    matrix[r]![c] = val;
    isFunction[r]![c] = true;
  }

  // Finder pattern 7x7 + separador
  function placeFinder(top: number, left: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(top + r, left + c, isBorder || isCenter);
      }
    }
    // Separador (blanco)
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          if (!isFunction[row]![col]) {
            setModule(row, col, false);
          }
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6]![i]) {
      setModule(6, i, i % 2 === 0);
    }
    if (!isFunction[i]![6]) {
      setModule(i, 6, i % 2 === 0);
    }
  }

  // Dark module
  setModule(4 * spec.version + 9, 8, true);

  // Alignment patterns
  if (spec.alignmentPositions.length >= 2) {
    const positions = spec.alignmentPositions;
    for (const r of positions) {
      for (const c of positions) {
        if (isFunction[r]![c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, isBorder || isCenter);
          }
        }
      }
    }
  }

  // Reservar format info
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8]![i]) setModule(8, i, false);
    if (!isFunction[i]![8]) setModule(i, 8, false);
  }
  for (let i = size - 8; i < size; i++) {
    if (!isFunction[8]![i]) setModule(8, i, false);
    if (!isFunction[i]![8]) setModule(i, 8, false);
  }

  // 4. Colocar datos en zig-zag con máscara 0: (row + col) % 2 === 0
  let bitIdx = 0;
  const totalBits = finalCodewords.length * 8;
  const finalBits: boolean[] = [];
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) {
      finalBits.push(((cw >> i) & 1) === 1);
    }
  }

  let upward = true;
  for (let rightCol = size - 1; rightCol > 0; rightCol -= 2) {
    if (rightCol === 6) rightCol--; // Saltar timing pattern vertical
    const leftCol = rightCol - 1;

    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (const c of [rightCol, leftCol]) {
        if (!isFunction[r]![c]) {
          const bit = bitIdx < totalBits ? finalBits[bitIdx]! : false;
          bitIdx++;
          // Máscara 0: invertir si (r + c) % 2 === 0
          const maskInvert = (r + c) % 2 === 0;
          matrix[r]![c] = maskInvert ? !bit : bit;
        }
      }
    }
    upward = !upward;
  }

  // 5. Escribir Format Information con nivel M y máscara 0
  const formatInfo = FORMAT_INFO_M_MASK0;
  const formatBits: boolean[] = [];
  for (let i = 14; i >= 0; i--) {
    formatBits.push(((formatInfo >> i) & 1) === 1);
  }

  // Top-left
  matrix[8]![0] = formatBits[0]!;
  matrix[8]![1] = formatBits[1]!;
  matrix[8]![2] = formatBits[2]!;
  matrix[8]![3] = formatBits[3]!;
  matrix[8]![4] = formatBits[4]!;
  matrix[8]![5] = formatBits[5]!;
  matrix[8]![7] = formatBits[6]!;
  matrix[8]![8] = formatBits[7]!;
  matrix[7]![8] = formatBits[8]!;
  matrix[5]![8] = formatBits[9]!;
  matrix[4]![8] = formatBits[10]!;
  matrix[3]![8] = formatBits[11]!;
  matrix[2]![8] = formatBits[12]!;
  matrix[1]![8] = formatBits[13]!;
  matrix[0]![8] = formatBits[14]!;

  // Split parts en esquinas
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i]![8] = formatBits[i]!;
  }
  for (let i = 0; i < 8; i++) {
    matrix[8]![size - 8 + i] = formatBits[7 + i]!;
  }

  // 6. Renderizar SVG con módulos
  const margin = options.margin ?? 2;
  const fullSize = size + margin * 2;
  const pixelColor = options.pixelColor ?? "#000000";
  const bgColor = options.backgroundColor ?? "#ffffff";

  let pathData = "";
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r]![c] === true) {
        pathData += `M${c + margin},${r + margin}h1v1h-1z `;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fullSize} ${fullSize}" width="100%" height="100%" shape-rendering="crispEdges">`,
    `  <rect width="${fullSize}" height="${fullSize}" fill="${bgColor}"/>`,
    `  <path d="${pathData.trim()}" fill="${pixelColor}"/>`,
    `</svg>`,
  ].join("\n");
}
