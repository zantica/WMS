// apps/api/src/adapters/prisma-location-repository.ts
// Adaptador Prisma para LocationRepositoryPort con aislamiento multi-tenant.

import { prisma, type Prisma } from "@wms/db";
import type { LocationDTO } from "@wms/shared-types";
import type {
  FindLocationsCriteria,
  LocationRepositoryPort,
} from "../ports/location-repository.js";

export class PrismaLocationRepository implements LocationRepositoryPort {
  public async findLocations(
    tenantId: string,
    criteria: FindLocationsCriteria,
  ): Promise<LocationDTO[]> {
    const orConditions: Prisma.LocationWhereInput[] = [];

    if (criteria.ids && criteria.ids.length > 0) {
      orConditions.push({ id: { in: criteria.ids } });
    }

    if (criteria.codes && criteria.codes.length > 0) {
      orConditions.push({
        code: {
          in: criteria.codes.map((c) => c.trim().toUpperCase()),
        },
      });
    }

    const where: Prisma.LocationWhereInput = {
      tenantId,
      ...(criteria.includeInactive ? {} : { isActive: true }),
      ...(criteria.warehouseId ? { warehouseId: criteria.warehouseId } : {}),
      ...(orConditions.length > 0 ? { OR: orConditions } : {}),
    };

    const locations = await prisma.location.findMany({
      where,
      orderBy: { code: "asc" },
    });

    return locations.map((l) => ({
      id: l.id,
      warehouseId: l.warehouseId,
      code: l.code,
      type: l.type,
      description: l.description,
    }));
  }

  public async findLocationById(
    tenantId: string,
    id: string,
  ): Promise<LocationDTO | null> {
    const loc = await prisma.location.findFirst({
      where: { id, tenantId, isActive: true },
    });
    if (!loc) return null;
    return {
      id: loc.id,
      warehouseId: loc.warehouseId,
      code: loc.code,
      type: loc.type,
      description: loc.description,
    };
  }

  public async findLocationByCode(
    tenantId: string,
    code: string,
  ): Promise<LocationDTO | null> {
    const normalized = code.trim().toUpperCase();
    const loc = await prisma.location.findFirst({
      where: { code: normalized, tenantId, isActive: true },
    });
    if (!loc) return null;
    return {
      id: loc.id,
      warehouseId: loc.warehouseId,
      code: loc.code,
      type: loc.type,
      description: loc.description,
    };
  }
}
