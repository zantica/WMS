// apps/api/src/use-cases/labels/generate-product-labels.ts
// Caso de uso: Generación por lote de etiquetas de productos (Code128 o QR) con prefijo tipado y dimensiones en mm.

import { randomUUID } from "node:crypto";
import {
  buildBarcodePayload,
  buildProductSkuBarcode,
  type BarcodeSymbology,
  type GenerateProductLabelsRequest,
  type LabelBatchResponseDTO,
  type RenderedLabelDTO,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type { CatalogRepositoryPort } from "../../ports/catalog-repository.js";
import type { LabelRendererPort } from "../../ports/label-renderer.js";

export async function generateProductLabels(
  catalogRepo: CatalogRepositoryPort,
  labelRenderer: LabelRendererPort,
  tenantId: string,
  input: GenerateProductLabelsRequest,
): Promise<LabelBatchResponseDTO> {
  const cleanTenant = tenantId?.trim();
  if (!cleanTenant) {
    throw new WmsError(
      "TENANT_MISMATCH",
      "tenantId es obligatorio para la generación de etiquetas",
      400,
    );
  }

  const requestedIds = (input.productIds ?? []).map((id) => id.trim()).filter(Boolean);
  const requestedSkus = (input.skus ?? []).map((s) => s.trim()).filter(Boolean);

  if (requestedIds.length === 0 && requestedSkus.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "Debe especificar al menos un productId o sku para generar etiquetas.",
      400,
    );
  }

  const products = await catalogRepo.findProductsByIdsOrSkus(cleanTenant, {
    ids: requestedIds.length > 0 ? requestedIds : undefined,
    skus: requestedSkus.length > 0 ? requestedSkus : undefined,
  });

  if (products.length === 0) {
    throw new WmsError(
      "PRODUCT_NOT_FOUND",
      "No se encontraron productos para los identificadores o SKUs proporcionados.",
      404,
    );
  }

  const symbology: BarcodeSymbology = input.symbology ?? "CODE128";
  const widthMm = input.widthMm ?? 70;
  const heightMm = input.heightMm ?? 35;
  const includeHumanReadable = input.includeHumanReadable !== false;
  const useBarcodeAsPayload = input.useBarcodeAsPayload === true;

  const labels: RenderedLabelDTO[] = [];

  for (const prod of products) {
    let payload: string;
    if (useBarcodeAsPayload && prod.barcode && prod.barcode.trim().length > 0) {
      payload = buildBarcodePayload("EAN", prod.barcode.trim());
    } else {
      payload = buildProductSkuBarcode(prod.sku);
    }

    const title = prod.name;
    const categoryInfo = prod.categoryName ? `Cat: ${prod.categoryName}` : null;
    const barcodeInfo = prod.barcode ? `EAN: ${prod.barcode}` : null;
    const subtitle = [categoryInfo, barcodeInfo].filter(Boolean).join(" • ") || undefined;
    const humanReadableText = includeHumanReadable ? payload : undefined;

    const svg = await labelRenderer.renderLabel({
      payload,
      symbology,
      widthMm,
      heightMm,
      title,
      subtitle,
      humanReadableText,
    });

    labels.push({
      id: `lbl_prod_${prod.id}_${Date.now()}_${randomUUID().substring(0, 8)}`,
      entityType: "PRODUCT",
      entityId: prod.id,
      code: prod.sku,
      barcodePayload: payload,
      humanReadableText: payload,
      title,
      subtitle,
      symbology,
      widthMm,
      heightMm,
      svg,
      dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    });
  }

  return {
    symbology,
    dimensions: { widthMm, heightMm },
    count: labels.length,
    labels,
  };
}
