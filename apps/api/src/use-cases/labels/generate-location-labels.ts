// apps/api/src/use-cases/labels/generate-location-labels.ts
// Caso de uso: Generación por lote de etiquetas de ubicaciones físicas (QR o Code128) con dimensiones en mm.

import { randomUUID } from "node:crypto";
import type {
  BarcodeSymbology,
  GenerateLocationLabelsRequest,
  LabelBatchResponseDTO,
  RenderedLabelDTO,
} from "@wms/shared-types";
import { WmsError } from "../../plugins/error-handler.js";
import type { LabelRendererPort } from "../../ports/label-renderer.js";
import type { LocationRepositoryPort } from "../../ports/location-repository.js";

export async function generateLocationLabels(
  locationRepo: LocationRepositoryPort,
  labelRenderer: LabelRendererPort,
  tenantId: string,
  input: GenerateLocationLabelsRequest,
): Promise<LabelBatchResponseDTO> {
  const cleanTenant = tenantId?.trim();
  if (!cleanTenant) {
    throw new WmsError(
      "TENANT_MISMATCH",
      "tenantId es obligatorio para la generación de etiquetas",
      400,
    );
  }

  const requestedIds = (input.locationIds ?? []).map((id) => id.trim()).filter(Boolean);
  const requestedCodes = (input.locationCodes ?? []).map((c) => c.trim()).filter(Boolean);

  if (requestedIds.length === 0 && requestedCodes.length === 0) {
    throw new WmsError(
      "VALIDATION_ERROR",
      "Debe especificar al menos un locationId o locationCode para generar etiquetas.",
      400,
    );
  }

  const locations = await locationRepo.findLocations(cleanTenant, {
    ids: requestedIds.length > 0 ? requestedIds : undefined,
    codes: requestedCodes.length > 0 ? requestedCodes : undefined,
    warehouseId: input.warehouseId?.trim() || undefined,
  });

  if (locations.length === 0) {
    throw new WmsError(
      "LOCATION_NOT_FOUND",
      "No se encontraron ubicaciones para los identificadores proporcionados en este almacén.",
      404,
    );
  }

  const symbology: BarcodeSymbology = input.symbology ?? "QR";
  const widthMm = input.widthMm ?? 70;
  const heightMm = input.heightMm ?? 35;
  const includeHumanReadable = input.includeHumanReadable !== false;

  const labels: RenderedLabelDTO[] = [];

  for (const loc of locations) {
    const payload = loc.code.trim().toUpperCase();
    const title = `Ubicación ${loc.code}`;
    const subtitle = `Zona: ${loc.type}${loc.description ? ` • ${loc.description}` : ""}`;
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
      id: `lbl_loc_${loc.id}_${Date.now()}_${randomUUID().substring(0, 8)}`,
      entityType: "LOCATION",
      entityId: loc.id,
      code: loc.code,
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
