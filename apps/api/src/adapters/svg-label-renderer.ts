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

    const safeTitle = escapeXml(title);
    const safeSubtitle = subtitle ? escapeXml(subtitle) : "";
    const safePayload = escapeXml(payload);
    const textToDisplay = humanReadableText ? escapeXml(humanReadableText) : safePayload;

    if (symbology === "QR") {
      // Layout para QR:
      // Si la etiqueta es apaisada/ancha (ej. 70x35mm o 100x50mm):
      // Columna izquierda con QR cuadrado centrado verticalmente, columna derecha con metadatos.
      // Si la etiqueta es más cuadrada o vertical: apilado arriba título, centro QR, abajo texto.
      const isLandscape = widthMm >= heightMm * 1.4;

      if (isLandscape) {
        const qrSizeMm = Math.min(contentHeightMm - 2, contentWidthMm * 0.45);
        const qrSvg = generateQrSvg(payload, { margin: 0 });
        const cleanQrInner = extractSvgContent(qrSvg);

        const textX = marginMm + qrSizeMm + 4;
        const textMaxW = widthMm - textX - marginMm;

        return [
          `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
          `  <rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.3"/>`,
          `  <!-- QR Code -->`,
          `  <g transform="translate(${marginMm + 1}, ${(heightMm - qrSizeMm) / 2})">`,
          `    <svg width="${qrSizeMm}" height="${qrSizeMm}" ${cleanQrInner.attributes}>`,
          `      ${cleanQrInner.inner}`,
          `    </svg>`,
          `  </g>`,
          `  <!-- Encabezado y Metadatos -->`,
          `  <text x="${textX}" y="${marginMm + 6}" font-family="system-ui, -apple-system, sans-serif" font-size="4.2" font-weight="700" fill="#0f172a">${safeTitle}</text>`,
          safeSubtitle
            ? `  <text x="${textX}" y="${marginMm + 11}" font-family="system-ui, -apple-system, sans-serif" font-size="2.8" font-weight="500" fill="#64748b">${safeSubtitle}</text>`
            : "",
          `  <!-- Código legible -->`,
          `  <text x="${textX}" y="${heightMm - marginMm - 2}" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.6" font-weight="600" fill="#1e293b">${textToDisplay}</text>`,
          `</svg>`,
        ]
          .filter(Boolean)
          .join("\n");
      }

      // Vertical o cuadrado:
      const qrSizeMm = Math.min(contentWidthMm - 4, contentHeightMm - 14);
      const qrSvg = generateQrSvg(payload, { margin: 0 });
      const cleanQrInner = extractSvgContent(qrSvg);

      return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
        `  <rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.3"/>`,
        `  <text x="${widthMm / 2}" y="${marginMm + 4}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="3.8" font-weight="700" fill="#0f172a">${safeTitle}</text>`,
        `  <g transform="translate(${(widthMm - qrSizeMm) / 2}, ${marginMm + 6})">`,
        `    <svg width="${qrSizeMm}" height="${qrSizeMm}" ${cleanQrInner.attributes}>`,
        `      ${cleanQrInner.inner}`,
        `    </svg>`,
        `  </g>`,
        `  <text x="${widthMm / 2}" y="${heightMm - marginMm - 1}" text-anchor="middle" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.4" font-weight="600" fill="#1e293b">${textToDisplay}</text>`,
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

    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${widthMm} ${heightMm}">`,
      `  <rect x="0" y="0" width="${widthMm}" height="${heightMm}" fill="#ffffff" stroke="#cbd5e1" stroke-width="0.3"/>`,
      `  <text x="${widthMm / 2}" y="${marginMm + 4}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="3.8" font-weight="700" fill="#0f172a">${safeTitle}</text>`,
      safeSubtitle
        ? `  <text x="${widthMm / 2}" y="${marginMm + 8}" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="2.6" font-weight="500" fill="#64748b">${safeSubtitle}</text>`
        : "",
      `  <g transform="translate(${marginMm}, ${marginMm + (safeSubtitle ? 10 : 6)})">`,
      `    <svg width="${barcodeWidthMm}" height="${barcodeHeightMm}" ${cleanCode128.attributes} preserveAspectRatio="none">`,
      `      ${cleanCode128.inner}`,
      `    </svg>`,
      `  </g>`,
      `  <text x="${widthMm / 2}" y="${heightMm - marginMm - 1}" text-anchor="middle" font-family="'JetBrains Mono', 'Courier New', monospace" font-size="3.5" font-weight="600" fill="#1e293b">${textToDisplay}</text>`,
      `</svg>`,
    ]
      .filter(Boolean)
      .join("\n");
  }
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
