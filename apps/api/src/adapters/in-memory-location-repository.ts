// apps/api/src/adapters/in-memory-location-repository.ts
// Adaptador InMemory de LocationRepositoryPort para tests desacoplados de persistencia.

import type { LocationDTO } from "@wms/shared-types";
import type {
  FindLocationsCriteria,
  LocationRepositoryPort,
} from "../ports/location-repository.js";

interface StoredLocation extends LocationDTO {
  tenantId: string;
  isActive: boolean;
}

export class InMemoryLocationRepository implements LocationRepositoryPort {
  private locations: StoredLocation[] = [];

  public seed(locations: (LocationDTO & { tenantId: string; isActive?: boolean })[]): void {
    this.locations = locations.map((l) => ({
      ...l,
      isActive: l.isActive ?? true,
    }));
  }

  public async findLocations(
    tenantId: string,
    criteria: FindLocationsCriteria,
  ): Promise<LocationDTO[]> {
    const idSet = new Set(criteria.ids ?? []);
    const codeSet = new Set((criteria.codes ?? []).map((c) => c.trim().toUpperCase()));

    const filtered = this.locations.filter((l) => {
      if (l.tenantId !== tenantId) return false;
      if (!criteria.includeInactive && !l.isActive) return false;
      if (criteria.warehouseId && l.warehouseId !== criteria.warehouseId) return false;

      const matchesId = idSet.size > 0 && idSet.has(l.id);
      const matchesCode = codeSet.size > 0 && codeSet.has(l.code.toUpperCase());

      if (idSet.size > 0 || codeSet.size > 0) {
        return matchesId || matchesCode;
      }

      return true;
    });

    return filtered.map((l) => ({
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
    const found = this.locations.find(
      (l) => l.tenantId === tenantId && l.id === id && l.isActive,
    );
    if (!found) return null;
    return {
      id: found.id,
      warehouseId: found.warehouseId,
      code: found.code,
      type: found.type,
      description: found.description,
    };
  }

  public async findLocationByCode(
    tenantId: string,
    code: string,
  ): Promise<LocationDTO | null> {
    const normalized = code.trim().toUpperCase();
    const found = this.locations.find(
      (l) => l.tenantId === tenantId && l.code.toUpperCase() === normalized && l.isActive,
    );
    if (!found) return null;
    return {
      id: found.id,
      warehouseId: found.warehouseId,
      code: found.code,
      type: found.type,
      description: found.description,
    };
  }
}
