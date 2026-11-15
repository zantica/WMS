// apps/api/src/routes/v1/labels.ts
// Rutas de Fastify para generación de etiquetas logísticas con prefijos tipados (QR y Code128).
// Expone POST /api/v1/labels/locations y POST /api/v1/labels/products con contrato ApiResponse<T> y validación Zod.

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type {
  ApiResponse,
  LabelBatchResponseDTO,
} from "@wms/shared-types";
import { generateLocationLabels } from "../../use-cases/labels/generate-location-labels.js";
import { generateProductLabels } from "../../use-cases/labels/generate-product-labels.js";

const GenerateLocationLabelsSchema = z
  .object({
    locationIds: z.array(z.string().min(1)).optional(),
    locationCodes: z.array(z.string().min(1)).optional(),
    warehouseId: z.string().optional(),
    symbology: z.enum(["QR", "CODE128"]).default("QR"),
    widthMm: z.number().positive().max(300).default(70),
    heightMm: z.number().positive().max(300).default(35),
    includeHumanReadable: z.boolean().default(true),
  })
  .refine(
    (data) =>
      (data.locationIds && data.locationIds.length > 0) ||
      (data.locationCodes && data.locationCodes.length > 0),
    {
      message: "Debe proveer al menos un locationId o locationCode en la solicitud.",
    },
  );

const GenerateProductLabelsSchema = z
  .object({
    productIds: z.array(z.string().min(1)).optional(),
    skus: z.array(z.string().min(1)).optional(),
    symbology: z.enum(["QR", "CODE128"]).default("CODE128"),
    widthMm: z.number().positive().max(300).default(70),
    heightMm: z.number().positive().max(300).default(35),
    includeHumanReadable: z.boolean().default(true),
    useBarcodeAsPayload: z.boolean().default(false),
  })
  .refine(
    (data) =>
      (data.productIds && data.productIds.length > 0) ||
      (data.skus && data.skus.length > 0),
    {
      message: "Debe proveer al menos un productId o sku en la solicitud.",
    },
  );

export const labelRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/v1/labels/locations
  app.post(
    "/locations",
    {
      schema: {
        tags: ["Labels"],
        summary: "Generar lote de etiquetas de ubicaciones físicas (QR / Code128)",
      },
    },
    async (request): Promise<ApiResponse<LabelBatchResponseDTO>> => {
      const body = GenerateLocationLabelsSchema.parse(request.body);
      const result = await generateLocationLabels(
        app.locationRepository,
        app.labelRenderer,
        request.tenantId,
        body,
      );

      return {
        success: true,
        data: result,
      };
    },
  );

  // POST /api/v1/labels/products
  app.post(
    "/products",
    {
      schema: {
        tags: ["Labels"],
        summary: "Generar lote de etiquetas de productos y SKUs (Code128 / QR)",
      },
    },
    async (request): Promise<ApiResponse<LabelBatchResponseDTO>> => {
      const body = GenerateProductLabelsSchema.parse(request.body);
      const result = await generateProductLabels(
        app.catalogRepository,
        app.labelRenderer,
        request.tenantId,
        body,
      );

      return {
        success: true,
        data: result,
      };
    },
  );
};
