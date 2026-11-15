// apps/api/src/ports/location-repository.ts
// Puerto hexagonal para consulta y acceso desacoplado a ubicaciones físicas del almacén.

import type { LocationDTO } from "@wms/shared-types";

export interface FindLocationsCriteria {
  ids?: string[] | undefined;
  codes?: string[] | undefined;
  warehouseId?: string | undefined;
  includeInactive?: boolean | undefined;
}

export interface LocationRepositoryPort {
  findLocations(
    tenantId: string,
    criteria: FindLocationsCriteria,
  ): Promise<LocationDTO[]>;

  findLocationById(tenantId: string, id: string): Promise<LocationDTO | null>;

  findLocationByCode(
    tenantId: string,
    code: string,
  ): Promise<LocationDTO | null>;
}
