// apps/api/src/adapters/in-memory-label-renderer.ts
// Adaptador InMemory para pruebas unitarias de casos de uso y simulación desacoplada.

import type { BarcodeSymbology } from "@wms/shared-types";
import type {
  LabelRendererPort,
  RenderBarcodeSvgOptions,
  RenderLabelOptions,
} from "../ports/label-renderer.js";

export class InMemoryLabelRendererAdapter implements LabelRendererPort {
  public renderedLabels: RenderLabelOptions[] = [];
  public renderedBarcodes: { payload: string; symbology: BarcodeSymbology }[] = [];

  public async renderBarcodeSvg(
    payload: string,
    symbology: BarcodeSymbology,
    _options?: RenderBarcodeSvgOptions,
  ): Promise<string> {
    this.renderedBarcodes.push({ payload, symbology });
    return `<svg data-symbology="${symbology}" data-payload="${payload}"><rect width="100" height="40"/></svg>`;
  }

  public async renderLabel(options: RenderLabelOptions): Promise<string> {
    this.renderedLabels.push(options);
    return `<svg width="${options.widthMm}mm" height="${options.heightMm}mm" data-symbology="${options.symbology}"><text>${options.title}</text><text>${options.payload}</text></svg>`;
  }

  public clear(): void {
    this.renderedLabels = [];
    this.renderedBarcodes = [];
  }
}
