// apps/api/src/shared/__tests__/topology.test.ts
// Tests unitarios puros para Topología Física (Invariante 1, Invariante 2, Invariante 3, ATP y Visual Resolvers).

import { describe, it, expect } from "vitest";
import {
  calculateAtp,
  formatStructuredLocationCode,
  normalizeLocationCode,
  padSegment,
  validateStorageTypeMetadata,
  resolveStorageTypeVisual,
  resolveLocationStatusVisual,
  resolveLocationCellVisual,
  AISLE_CELL_COLLAPSE_THRESHOLD,
  SPECIAL_FLOOR_AISLE,
} from "@wms/shared-types";

describe("Topología Física — Invariante 1: Padding de Ceros y normalizeLocationCode", () => {
  it("normaliza códigos con segmentos numéricos de 1 dígito aplicando zero-padding de al menos 2 dígitos", () => {
    expect(normalizeLocationCode("A-1-1")).toBe("A-01-01");
    expect(normalizeLocationCode("A-01-1")).toBe("A-01-01");
    expect(normalizeLocationCode("REC-1")).toBe("REC-01");
    expect(normalizeLocationCode("A-1-01")).toBe("A-01-01");
    expect(normalizeLocationCode("a-01-01-1")).toBe("A-01-01-01");
    expect(normalizeLocationCode("FLOOR-1-1")).toBe("FLOOR-01-01");
  });

  it("mantiene códigos que ya tienen zero-padding o números de 2 o más dígitos", () => {
    expect(normalizeLocationCode("A-01-01-12")).toBe("A-01-01-12");
    expect(normalizeLocationCode("PAS01-EST02-NIV01")).toBe("PAS01-EST02-NIV01");
    expect(normalizeLocationCode("B-100-01")).toBe("B-100-01");
  });

  it("rechaza códigos vacíos o con caracteres no permitidos", () => {
    expect(() => normalizeLocationCode("")).toThrow("El código de ubicación no puede estar vacío");
    expect(() => normalizeLocationCode("   ")).toThrow("El código de ubicación no puede estar vacío");
    expect(() => normalizeLocationCode("A@01#")).toThrow("contiene caracteres inválidos");
    expect(() => normalizeLocationCode("A 01 02")).toThrow("contiene caracteres inválidos");
  });

  it("garantiza que el orden lexicográfico puro sea estrictamente equivalente al orden físico real (>= 12 posiciones)", () => {
    // Generar 15 posiciones en el nivel 01 del rack 01 del pasillo A
    const rawPositions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const normalizedCodes = rawPositions.map((pos) =>
      normalizeLocationCode(`A-1-1-${pos}`),
    );

    // Esperado con zero-padding: A-01-01-01 hasta A-01-01-15
    expect(normalizedCodes[0]).toBe("A-01-01-01");
    expect(normalizedCodes[8]).toBe("A-01-01-09");
    expect(normalizedCodes[9]).toBe("A-01-01-10");
    expect(normalizedCodes[10]).toBe("A-01-01-11");
    expect(normalizedCodes[11]).toBe("A-01-01-12");

    // Verificar orden lexicográfico estricto (< y .localeCompare)
    for (let i = 0; i < normalizedCodes.length - 1; i++) {
      const current = normalizedCodes[i]!;
      const next = normalizedCodes[i + 1]!;

      // En JS string comparison '<'
      expect(current < next).toBe(true);
      // En localeCompare
      expect(current.localeCompare(next)).toBeLessThan(0);
    }

    // Aserción directa explícita requerida por la especificación:
    // A-01-01-01 < A-01-01-09 < A-01-01-10 < A-01-01-11 < A-01-01-12
    expect("A-01-01-01" < "A-01-01-09").toBe(true);
    expect("A-01-01-09" < "A-01-01-10").toBe(true);
    expect("A-01-01-10" < "A-01-01-11").toBe(true);
    expect("A-01-01-11" < "A-01-01-12").toBe(true);
  });

  it("formatStructuredLocationCode genera códigos canónicos y normalizados", () => {
    // RACK con pasillo numérico
    const rackCode = formatStructuredLocationCode({
      storageType: "RACK",
      zone: "MAIN",
      aisle: "1",
      rack: 2,
      level: 3,
      position: 4,
    });
    expect(rackCode).toBe("01-02-03-04");

    // SHELVING con pasillo alfabético y zona específica
    const shelvingCode = formatStructuredLocationCode({
      storageType: "SHELVING",
      zone: "MEZZANINE",
      aisle: "B",
      rack: "1",
      level: "2",
      position: "12",
    });
    expect(shelvingCode).toBe("MEZZANINE-B-01-02-12");

    // FLOOR sin pasillo
    const floorCode = formatStructuredLocationCode({
      storageType: "FLOOR",
      zone: "MAIN",
      rack: "5",
      level: "1",
      position: "2",
    });
    expect(floorCode).toBe("FL-05-01-02");
  });
});

describe("Topología Física — Invariante 2: Matriz de Validación por StorageType", () => {
  it("valida exitosamente RACK cuando todos los campos requeridos están presentes", () => {
    const res = validateStorageTypeMetadata({
      storageType: "RACK",
      zone: "MAIN",
      aisle: "A",
      rack: "01",
      level: "02",
      position: "01",
    });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it("rechaza RACK si falta aisle o si level es inválido", () => {
    const noAisle = validateStorageTypeMetadata({
      storageType: "RACK",
      zone: "MAIN",
      rack: "01",
      level: "02",
      position: "01",
    });
    expect(noAisle.valid).toBe(false);
    expect(noAisle.error).toContain("requieren indicar el pasillo ('aisle')");

    const noLevel = validateStorageTypeMetadata({
      storageType: "RACK",
      zone: "MAIN",
      aisle: "A",
      rack: "01",
      level: "",
      position: "01",
    });
    expect(noLevel.valid).toBe(false);
    expect(noLevel.error).toContain("requieren indicar el nivel ('level')");

    const badLevel = validateStorageTypeMetadata({
      storageType: "RACK",
      zone: "MAIN",
      aisle: "A",
      rack: "01",
      level: "0",
      position: "01",
    });
    expect(badLevel.valid).toBe(false);
    expect(badLevel.error).toContain("debe ser un número entero mayor o igual a 1");
  });

  it("valida exitosamente SHELVING cuando todos los campos están presentes", () => {
    const res = validateStorageTypeMetadata({
      storageType: "SHELVING",
      zone: "ZONE_B",
      aisle: "03",
      rack: "02",
      level: "04",
      position: "01",
    });
    expect(res.valid).toBe(true);
  });

  it("valida exitosamente FLOOR con level '01' con o sin pasillo", () => {
    const withAisle = validateStorageTypeMetadata({
      storageType: "FLOOR",
      zone: "MAIN",
      aisle: "PULMON",
      rack: "01",
      level: "01",
      position: "01",
    });
    expect(withAisle.valid).toBe(true);

    const withoutAisle = validateStorageTypeMetadata({
      storageType: "FLOOR",
      zone: "MAIN",
      rack: "BAHIA_02",
      level: "1",
      position: "01",
    });
    expect(withoutAisle.valid).toBe(true);
  });

  it("rechaza FLOOR si se envía level > 1 (Invariante 2 estricto)", () => {
    const floorL2 = validateStorageTypeMetadata({
      storageType: "FLOOR",
      zone: "MAIN",
      rack: "01",
      level: "02",
      position: "01",
    });
    expect(floorL2.valid).toBe(false);
    expect(floorL2.error).toContain("solo admiten nivel '01'");

    const floorL3 = validateStorageTypeMetadata({
      storageType: "FLOOR",
      zone: "MAIN",
      rack: "01",
      level: "3",
      position: "01",
    });
    expect(floorL3.valid).toBe(false);
    expect(floorL3.error).toContain("solo admiten nivel '01'");
  });
});

describe("Topología Física — Invariante 3 & Visual Resolvers", () => {
  it("calculateAtp calcula disponibilidad respetando el piso cero", () => {
    expect(calculateAtp(10, 3)).toBe(7);
    expect(calculateAtp(5, 5)).toBe(0);
    expect(calculateAtp(5, 8)).toBe(0); // nunca negativo
    expect(calculateAtp(0, 0)).toBe(0);
    expect(calculateAtp(-5, 0)).toBe(0);
  });

  it("resolveStorageTypeVisual resuelve los 3 tipos de almacenamiento", () => {
    expect(resolveStorageTypeVisual("RACK").code).toBe("RACK");
    expect(resolveStorageTypeVisual("SHELVING").code).toBe("SHELVING");
    expect(resolveStorageTypeVisual("FLOOR").code).toBe("FLOOR");
  });

  it("resolveLocationStatusVisual resuelve ACTIVE y BLOCKED", () => {
    const active = resolveLocationStatusVisual("ACTIVE");
    expect(active.tone).toBe("emerald");
    expect(active.code).toBe("ACTIVE");

    const blocked = resolveLocationStatusVisual("BLOCKED");
    expect(blocked.tone).toBe("rose");
    expect(blocked.code).toBe("BLOCKED");
  });

  it("resolveLocationCellVisual resuelve los 4 estados térmicos de celda", () => {
    // 1. BLOCKED
    const blocked = resolveLocationCellVisual({ status: "BLOCKED", onHandQty: 10, atpQty: 5 });
    expect(blocked.state).toBe("BLOCKED");
    expect(blocked.tone).toBe("rose");

    // 2. EMPTY
    const empty = resolveLocationCellVisual({ status: "ACTIVE", onHandQty: 0, atpQty: 0 });
    expect(empty.state).toBe("EMPTY");
    expect(empty.tone).toBe("slate");

    // 3. RESERVED 100% (onHand > 0 pero atp === 0)
    const reserved = resolveLocationCellVisual({ status: "ACTIVE", onHandQty: 10, atpQty: 0 });
    expect(reserved.state).toBe("RESERVED");
    expect(reserved.tone).toBe("amber");

    // 4. OCCUPIED (atp > 0)
    const occupied = resolveLocationCellVisual({ status: "ACTIVE", onHandQty: 10, atpQty: 5 });
    expect(occupied.state).toBe("OCCUPIED");
    expect(occupied.tone).toBe("emerald");
  });

  it("constantes de umbral y pasillo de suelo están definidas", () => {
    expect(AISLE_CELL_COLLAPSE_THRESHOLD).toBe(200);
    expect(SPECIAL_FLOOR_AISLE).toBe("__FLOOR__");
  });
});
