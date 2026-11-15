// apps/api/src/ports/label-renderer.ts
// Puerto hexagonal para renderizado de etiquetas y códigos de barras (QR y Code128).
// Desacoplado de librerías concretas o mecanismos de renderizado de infraestructura.

import type { BarcodeSymbology } from "@wms/shared-types";

export interface RenderLabelOptions {
  payload: string;
  symbology: BarcodeSymbology;
  widthMm: number;
  heightMm: number;
  title: string;
  subtitle?: string | null | undefined;
  humanReadableText?: string | null | undefined;
}

export interface RenderBarcodeSvgOptions {
  widthMm?: number | undefined;
  heightMm?: number | undefined;
  includeText?: boolean | undefined;
}

export interface LabelRendererPort {
  /**
   * Renderiza una etiqueta completa en formato SVG con dimensiones físicas (mm),
   * títulos, márgenes, bordes de corte y código centrado con texto legible.
   */
  renderLabel(options: RenderLabelOptions): Promise<string>;

  /**
   * Renderiza únicamente el elemento de código (QR o Code128) en formato SVG.
   */
  renderBarcodeSvg(
    payload: string,
    symbology: BarcodeSymbology,
    options?: RenderBarcodeSvgOptions,
  ): Promise<string>;
}
