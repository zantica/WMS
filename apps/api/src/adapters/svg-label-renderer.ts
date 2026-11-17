// apps/api/src/adapters/svg-label-renderer.ts
// Adaptador compuesto de LabelRendererPort que produce etiquetas vectoriales SVG listas para imprimir.
// Aplica dimensiones físicas en milímetros (mm), layout responsivo para QR y Code128, y tipografía logística.

import type { BarcodeSymbology } from "@wms/shared-types";
import type {
  LabelRendererPort,
  RenderBarcodeSvgOptions,
  RenderLabelOptions,
} from "../ports/label-renderer.js";
import { generateCode128Svg } from "./pure-code128-renderer.js";
import { generateQrSvg } from "./pure-qr-renderer.js";

export class SvgLabelRendererAdapter implements LabelRendererPort {
  public async renderBarcodeSvg(
    payload: string,
    symbology: BarcodeSymbology,
    options: RenderBarcodeSvgOptions = {},
  ): Promise<string> {
    if (symbology === "CODE128") {
      return generateCode128Svg(payload, {
        heightMm: options.heightMm,
        includeText: options.includeText ?? true,
      });
    }

    return generateQrSvg(payload, {
      margin: 1,
    });
  }

  public async renderLabel(options: RenderLabelOptions): Promise<string> {
    const {
      payload,
      symbology,
      widthMm,
      heightMm,
      title,
      subtitle,
      humanReadableText,
    } = options;

    if (widthMm <= 0 || heightMm <= 0) {
      throw new Error(`Las dimensiones físicas de la etiqueta deben ser mayores a cero (recibido ${widthMm}x${heightMm}mm).`);
    }

    // Coordenadas en milímetros dentro del viewBox
    const marginMm = 3;
    const contentWidthMm = widthMm - marginMm * 2;
    const contentHeightMm = heightMm - marginMm * 2;
    const rawDisplayText = humanReadableText ? humanReadableText : payload;

    if (symbology === "QR") {
      // Layout para QR:
      // Si la etiqueta es apaisada/ancha (ej. 70x35mm o 100x50mm):
      // Columna izquierda con QR cuadrado centrado verticalmente, columna derecha con metadatos con wrapping.
      // Si la etiqueta es más cuadrada o vertical: apilado arriba título, centro QR, abajo texto.
      const isLandscape = widthMm >= heightMm * 1.4;

      if (isLandscape) {
        const qrSizeMm = Math.min(contentHeightMm - 2, contentWidthMm * 0.36);
        const qrSvg = generateQrSvg(payload, { margin: 0 });
        const cleanQrInner = extractSvgContent(qrSvg);

        const textX = marginMm + qrSizeMm + 4;
        const textMaxW = Math.max(10, widthMm - textX - marginMm);

        const titleFontSize = 3.4;
        const titleLineHeight = 3.9;
        const subtitleFontSize = 2.4;
        const subtitleLineHeight = 2.9;

        const titleLines = wrapSvgText(title, textMaxW, titleFontSize, 2);
        const subtitleLines = subtitle
          ? wrapSvgText(subtitle, textMaxW, subtitleFontSize, 3)
          : [];

        const titleStartY = marginMm + 5;
        const subtitleStartY =
          titleStartY + Math.max(1, titleLines.length) * titleLineHeight + 0.8;

        const titleTspans = buildTspans(titleLines, textX, titleLineHeight);
        const subtitleTspans = buildTspans(subtitleLines, textX, subtitleLineHeight);
        const fittedCode = fitSvgSingleLine(rawDisplayText, textMaxW, 3.6, 1.8, 0.62);

        return [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
          `  <rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.3"/>`,
          `  <!-- QR Code -->`,
          `  <g transform="translate(${formatMm(marginMm + 1)}, ${formatMm((heightMm - qrSizeMm) / 2)})">`,
          `    <svg width="${formatMm(qrSizeMm)}" height="${formatMm(qrSizeMm)}" ${cleanQrInner.attributes}>`,
          `      ${cleanQrInner.inner}`,
          `    </svg>`,
          `  </g>`,
          `  <!-- Encabezado y Metadatos -->`,
          `  <text x="${formatMm(textX)}" y="${formatMm(titleStartY)}" font-family="system-ui, -apple-system, sans-serif" font-size="${titleFontSize}" font-weight="700" fill="#0f172a">${titleTspans}</text>`,
          subtitleLines.length > 0
            ? `  <text x="${formatMm(textX)}" y="${formatMm(subtitleStartY)}" font-family="system-ui, -apple-system, sans-serif" font-size="${subtitleFontSize}" font-weight="500" fill="#64748b">${subtitleTspans}</text>`
            : "",
          `  <!-- Código legible -->`,
          `  <text x="${formatMm(textX)}" y="${formatMm(heightMm - marginMm - 2)}" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="${fittedCode.fontSizeMm}" font-weight="600" fill="#1e293b">${escapeXml(fittedCode.text)}</text>`,
          `</svg>`,
        ]
          .filter(Boolean)
          .join("\n");
      }

      // Vertical o cuadrado:
      const qrSizeMm = Math.min(contentWidthMm - 4, contentHeightMm - 14);
      const qrSvg = generateQrSvg(payload, { margin: 0 });
      const cleanQrInner = extractSvgContent(qrSvg);
      const fittedVerticalTitle = fitSvgSingleLine(title, contentWidthMm, 3.8, 2.4, 0.55);
      const fittedVerticalCode = fitSvgSingleLine(rawDisplayText, contentWidthMm, 3.4, 1.8, 0.62);

      return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
        `  <rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.3"/>`,
        `  <text x="${widthMm / 2}" y="${marginMm + 4}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${fittedVerticalTitle.fontSizeMm}" font-weight="700" fill="#0f172a">${escapeXml(fittedVerticalTitle.text)}</text>`,
        `  <g transform="translate(${formatMm((widthMm - qrSizeMm) / 2)}, ${marginMm + 6})">`,
        `    <svg width="${formatMm(qrSizeMm)}" height="${formatMm(qrSizeMm)}" ${cleanQrInner.attributes}>`,
        `      ${cleanQrInner.inner}`,
        `    </svg>`,
        `  </g>`,
        `  <text x="${widthMm / 2}" y="${heightMm - marginMm - 1}" text-anchor="middle" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="${fittedVerticalCode.fontSizeMm}" font-weight="600" fill="#1e293b">${escapeXml(fittedVerticalCode.text)}</text>`,
        `</svg>`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    // CODE 128 Layout:
    // Título arriba, barras 1D horizontales al centro, texto legible abajo
    const code128Svg = generateCode128Svg(payload, {
      heightMm: contentHeightMm - 12,
      includeText: false,
    });
    const cleanCode128 = extractSvgContent(code128Svg);
    const barcodeWidthMm = contentWidthMm;
    const barcodeHeightMm = Math.max(10, contentHeightMm - 14);
    const fittedTitle = fitSvgSingleLine(title, contentWidthMm, 3.8, 2.5, 0.55);
    const fittedSubtitle = subtitle
      ? fitSvgSingleLine(subtitle, contentWidthMm, 2.6, 1.9, 0.54)
      : null;
    const fittedCode = fitSvgSingleLine(rawDisplayText, contentWidthMm, 3.5, 1.8, 0.62);

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
      `  <rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.3"/>`,
      `  <text x="${widthMm / 2}" y="${marginMm + 4}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${fittedTitle.fontSizeMm}" font-weight="700" fill="#0f172a">${escapeXml(fittedTitle.text)}</text>`,
      fittedSubtitle
        ? `  <text x="${widthMm / 2}" y="${marginMm + 8}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="${fittedSubtitle.fontSizeMm}" font-weight="500" fill="#64748b">${escapeXml(fittedSubtitle.text)}</text>`
        : "",
      `  <g transform="translate(${marginMm}, ${marginMm + (fittedSubtitle ? 10 : 6)})">`,
      `    <svg width="${barcodeWidthMm}" height="${barcodeHeightMm}" ${cleanCode128.attributes} preserveAspectRatio="none">`,
      `      ${cleanCode128.inner}`,
      `    </svg>`,
      `  </g>`,
      `  <text x="${widthMm / 2}" y="${heightMm - marginMm - 1}" text-anchor="middle" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="${fittedCode.fontSizeMm}" font-weight="600" fill="#1e293b">${escapeXml(fittedCode.text)}</text>`,
      `</svg>`,
    ]
      .filter(Boolean)
      .join("\n");
  }
}

/**
 * Divide un texto en múltiples líneas ajustadas a un ancho físico en milímetros,
 * evitando expresiones regulares con backtracking super-lineal.
 */
export function wrapSvgText(
  text: string,
  maxWidthMm: number,
  fontSizeMm: number,
  maxLines: number,
): string[] {
  if (maxLines <= 0 || maxWidthMm <= 0 || fontSizeMm <= 0) {
    return [];
  }

  const words = text
    .trim()
    .split(/\s/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return [];
  }

  const maxChars = Math.max(1, Math.floor(maxWidthMm / (fontSizeMm * 0.54)));
  const lines: string[] = [];
  let currentLine = "";

  for (const rawWord of words) {
    let word = rawWord;

    while (word.length > maxChars) {
      if (currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = "";
        if (lines.length >= maxLines) {
          break;
        }
      }
      if (lines.length === maxLines - 1) {
        lines.push(truncateWithEllipsis(word, maxChars));
        return lines;
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }

    if (lines.length >= maxLines) {
      const lastIndex = lines.length - 1;
      lines[lastIndex] = appendEllipsisWithinLimit(lines[lastIndex]!, maxChars);
      return lines;
    }

    const candidate = currentLine.length > 0 ? `${currentLine} ${word}` : word;
    if (candidate.length <= maxChars) {
      currentLine = candidate;
    } else {
      if (lines.length === maxLines - 1) {
        lines.push(appendEllipsisWithinLimit(currentLine, maxChars));
        return lines;
      }
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine.length > 0 && lines.length < maxLines) {
    lines.push(currentLine);
  }

  return lines;
}

function fitSvgSingleLine(
  text: string,
  maxWidthMm: number,
  baseFontSizeMm: number,
  minFontSizeMm: number,
  charWidthRatio: number,
): { text: string; fontSizeMm: number } {
  if (text.length === 0 || maxWidthMm <= 0) {
    return { text, fontSizeMm: baseFontSizeMm };
  }

  const neededWidth = text.length * baseFontSizeMm * charWidthRatio;
  if (neededWidth <= maxWidthMm) {
    return { text, fontSizeMm: baseFontSizeMm };
  }

  const rawScaled = maxWidthMm / (text.length * charWidthRatio);
  const flooredScaled = Math.floor(rawScaled * 100) / 100;
  const clampedFontSize = Math.max(
    minFontSizeMm,
    Math.min(baseFontSizeMm, flooredScaled),
  );
  if (rawScaled >= minFontSizeMm) {
    return { text, fontSizeMm: clampedFontSize };
  }

  const maxCharsAtMin = Math.max(
    1,
    Math.floor(maxWidthMm / (minFontSizeMm * charWidthRatio)),
  );
  const fittedText =
    text.length > maxCharsAtMin
      ? truncateWithEllipsis(text, maxCharsAtMin)
      : text;

  return { text: fittedText, fontSizeMm: minFontSizeMm };
}

function truncateWithEllipsis(text: string, maxChars: number): string {
  if (maxChars <= 1) {
    return text.slice(0, Math.max(0, maxChars));
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1)}…`;
}

function appendEllipsisWithinLimit(text: string, maxChars: number): string {
  if (text.endsWith("…")) {
    return truncateWithEllipsis(text, maxChars);
  }
  if (text.length + 1 <= maxChars) {
    return `${text}…`;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function buildTspans(
  lines: readonly string[],
  x: number,
  lineHeightMm: number,
): string {
  const xFormatted = formatMm(x);
  const dyFormatted = formatMm(lineHeightMm);
  return lines
    .map(
      (line, index) =>
        `<tspan x="${xFormatted}" dy="${index === 0 ? 0 : dyFormatted}">${escapeXml(line)}</tspan>`,
    )
    .join("");
}

function formatMm(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function extractSvgContent(svgStr: string): { attributes: string; inner: string } {
  const match = /<svg([^>]*)>([\s\S]*?)<\/svg>/i.exec(svgStr);
  if (!match) {
    return { attributes: "", inner: svgStr };
  }
  const attributes = match[1]!
    .replace(/width="[^"]*"/g, "")
    .replace(/height="[^"]*"/g, "")
    .replace(/xmlns="[^"]*"/g, "")
    .trim();
  const inner = match[2]!.trim();
  return { attributes, inner };
}
