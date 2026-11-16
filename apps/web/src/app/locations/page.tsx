"use client";

// apps/web/src/app/locations/page.tsx
// Topología Física del Almacén, Distribución por Zonas y Vista Gráfica del Layout (F9.2).
//
// ## Design tokens — Warehouse Topology & Physical Layout (F9.2)
// - Estilo: S5 dark-data-dense (Industrial Data Tower)
// - Paleta P2 Refinada: WMS_COLORS (0 hex crudos en JSX)
// - Tipografía T3: DM Sans (cuerpo) + JetBrains Mono (coordenadas, celdas y métricas)
// - Invariantes Arquitectónicos:
//   1. Normalización y padding de ceros en códigos (A-01-01 < A-01-09 < A-01-10 < A-01-12)
//   2. Matriz por StorageType (RACK/SHELVING con pasillo y nivel; FLOOR con nivel '01')
//   3. Ocupación % = (ocupadas / activas) * 100 y estado BLOCKED
//   4. Dos vistas de Layout: Macro (Zonas -> Pasillos) y Detalle de Pasillo (Alzado Frontal invertido / Planta)
//   5. Generador estructurado en bloque con dryRun, colisiones, batchId y rollback
//   6. Umbral de colapso de pasillo (AISLE_CELL_COLLAPSE_THRESHOLD = 200)

import React, {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import type {
  AisleLayoutDetailDTO,
  AisleLayoutSummaryDTO,
  CreateLocationInput,
  GenerateLocationBlockInput,
  GenerateLocationBlockResultDTO,
  InventoryBalanceDTO,
  LocationDTO,
  LocationStatus,
  LocationType,
  StorageType,
  WarehouseLayoutSummaryDTO,
} from "@wms/shared-types";
import {
  AISLE_CELL_COLLAPSE_THRESHOLD,
  SPECIAL_FLOOR_AISLE,
  WMS_COLORS,
  computeTopologySummary,
  resolveLocationCellVisual,
  resolveStorageTypeVisual,
} from "../../lib/dashboard-metrics";
import { useSupervisorSession } from "../../context/supervisor-session";
import { LabelPrintModal } from "../../components/labels/label-print-modal";

type ViewMode = "MACRO" | "AISLE_DETAIL";
type CellDensity = "NORMAL" | "COMPACT";
type CellFilter = "ALL" | "OCCUPIED" | "EMPTY" | "BLOCKED";

export default function WarehouseLocationsPage(): JSX.Element {
  const { client, session } = useSupervisorSession();

  // ── Estados de Datos de Topología ───────────────────────────
  const [layoutSummary, setLayoutSummary] = useState<WarehouseLayoutSummaryDTO | null>(null);
  const [activeAisleDetail, setActiveAisleDetail] = useState<AisleLayoutDetailDTO | null>(null);
  const [allLocations, setAllLocations] = useState<LocationDTO[]>([]);
  const [allBalances, setAllBalances] = useState<InventoryBalanceDTO[]>([]);

  // ── Modos de Vista y Navegación ─────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("MACRO");
  const [selectedZone, setSelectedZone] = useState<string>("ALL");
  const [selectedAisle, setSelectedAisle] = useState<string | null>(null);
  const [cellDensity, setCellDensity] = useState<CellDensity>("NORMAL");
  const [cellFilter, setCellFilter] = useState<CellFilter>("ALL");
  const [expandedRacks, setExpandedRacks] = useState<Set<string>>(new Set());

  // ── Estados de Carga y Mensajes ─────────────────────────────
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Modales y Paneles ───────────────────────────────────────
  const [isGeneratorOpen, setIsGeneratorOpen] = useState<boolean>(false);
  const [isCreateSingleOpen, setIsCreateSingleOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [selectedLocationCodes, setSelectedLocationCodes] = useState<Set<string>>(new Set());

  // ── Estado del Generador en Bloque ──────────────────────────
  const [genStorageType, setGenStorageType] = useState<StorageType>("RACK");
  const [genLocationType, setGenLocationType] = useState<LocationType>("STORAGE");
  const [genZone, setGenZone] = useState<string>("MAIN");
  const [genAisle, setGenAisle] = useState<string>("01");
  const [genRackStart, setGenRackStart] = useState<number>(1);
  const [genRackEnd, setGenRackEnd] = useState<number>(2);
  const [genLevelStart, setGenLevelStart] = useState<number>(1);
  const [genLevelEnd, setGenLevelEnd] = useState<number>(3);
  const [genPositionsPerLevel, setGenPositionsPerLevel] = useState<number>(4);
  const [genLoading, setGenLoading] = useState<boolean>(false);
  const [genPreview, setGenPreview] = useState<GenerateLocationBlockResultDTO | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  // ── Estado de Alta Individual ───────────────────────────────
  const [singleCode, setSingleCode] = useState<string>("");
  const [singleType, setSingleType] = useState<LocationType>("STORAGE");
  const [singleStorageType, setSingleStorageType] = useState<StorageType>("RACK");
  const [singleZone, setSingleZone] = useState<string>("MAIN");
  const [singleAisle, setSingleAisle] = useState<string>("01");
  const [singleRack, setSingleRack] = useState<string>("01");
  const [singleLevel, setSingleLevel] = useState<string>("01");
  const [singlePosition, setSinglePosition] = useState<string>("01");
  const [singleDescription, setSingleDescription] = useState<string>("");

  // ── Carga de Datos Macro ────────────────────────────────────
  const loadMacroData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [summary, locList, balList] = await Promise.all([
        client.getWarehouseLayoutSummary(session.warehouseId),
        client.listLocations({ warehouseId: session.warehouseId }),
        client.listBalances(),
      ]);
      setLayoutSummary(summary);
      setAllLocations(locList);
      setAllBalances(balList);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al cargar la topología del almacén";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [client, session.warehouseId]);

  useEffect(() => {
    void loadMacroData();
  }, [loadMacroData]);

  // ── Carga de Detalle de Pasillo (Drill-Down) ────────────────
  const openAisleDetail = useCallback(
    async (aisle: string, zone?: string) => {
      setLoading(true);
      setErrorMsg(null);
      setSelectedAisle(aisle);
      try {
        const detail = await client.getAisleLayoutDetail(
          session.warehouseId,
          aisle,
          zone === "ALL" ? undefined : zone,
        );
        setActiveAisleDetail(detail);
        setViewMode("AISLE_DETAIL");

        // Si el pasillo tiene más de 200 celdas, mantener racks colapsados por defecto
        if (detail.totalLocations > AISLE_CELL_COLLAPSE_THRESHOLD) {
          setExpandedRacks(new Set());
        } else {
          // Si tiene <= 200, expandir todos los racks por defecto
          setExpandedRacks(new Set(detail.racks.map((r) => r.rack)));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error al cargar detalle del pasillo";
        setErrorMsg(msg);
      } finally {
        setLoading(false);
      }
    },
    [client, session.warehouseId],
  );

  const backToMacro = () => {
    setViewMode("MACRO");
    setActiveAisleDetail(null);
    setSelectedAisle(null);
  };

  // ── Toggle Bloqueo de Ubicación ─────────────────────────────
  const handleToggleBlockLocation = async (locId: string, currentStatus: LocationStatus) => {
    const nextStatus: LocationStatus = currentStatus === "ACTIVE" ? "BLOCKED" : "ACTIVE";
    try {
      await client.updateLocation(locId, { status: nextStatus });
      setSuccessMsg(`Ubicación actualizada a ${nextStatus}`);

      // Recargar pasillo o macro según la vista actual
      if (viewMode === "AISLE_DETAIL" && selectedAisle) {
        await openAisleDetail(selectedAisle);
      }
      await loadMacroData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al actualizar ubicación";
      setErrorMsg(msg);
    }
  };

  // ── Manejo de Simulación (dryRun) del Generador ─────────────
  const handleSimulateBlock = async () => {
    setGenLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload: GenerateLocationBlockInput = {
        warehouseId: session.warehouseId,
        type: genLocationType,
        storageType: genStorageType,
        zone: genZone,
        aisle: genStorageType === "FLOOR" ? (genAisle || null) : genAisle,
        rackStart: genRackStart,
        rackEnd: genRackEnd,
        levelStart: genStorageType === "FLOOR" ? 1 : genLevelStart,
        levelEnd: genStorageType === "FLOOR" ? 1 : genLevelEnd,
        positionsPerLevel: genPositionsPerLevel,
        dryRun: true,
      };

      const res = await client.generateLocationBlock(payload);
      setGenPreview(res);
      setSuccessMsg(`Simulación lista: ${res.creatableCount} nuevas ubicaciones, ${res.collisions.length} colisiones`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error durante la simulación de ubicaciones";
      setErrorMsg(msg);
    } finally {
      setGenLoading(false);
    }
  };

  // ── Confirmar Creación en Bloque ────────────────────────────
  const handleConfirmCreateBlock = async () => {
    setGenLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload: GenerateLocationBlockInput = {
        warehouseId: session.warehouseId,
        type: genLocationType,
        storageType: genStorageType,
        zone: genZone,
        aisle: genStorageType === "FLOOR" ? (genAisle || null) : genAisle,
        rackStart: genRackStart,
        rackEnd: genRackEnd,
        levelStart: genStorageType === "FLOOR" ? 1 : genLevelStart,
        levelEnd: genStorageType === "FLOOR" ? 1 : genLevelEnd,
        positionsPerLevel: genPositionsPerLevel,
        dryRun: false,
      };

      const res = await client.generateLocationBlock(payload);
      setLastBatchId(res.batchId ?? null);
      setGenPreview(res);
      setSuccessMsg(`¡Lote creado exitosamente! (${res.createdCount} ubicaciones creadas, Batch ID: ${res.batchId})`);

      // Seleccionar automáticamente para impresión
      const createdCodes = new Set(res.locations.map((l) => l.code));
      setSelectedLocationCodes(createdCodes);

      await loadMacroData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear el bloque de ubicaciones";
      setErrorMsg(msg);
    } finally {
      setGenLoading(false);
    }
  };

  // ── Rollback del Último Lote ─────────────────────────────────
  const handleRollbackBatch = async (batchId: string) => {
    if (!confirm(`¿Estás seguro de deshacer y eliminar las ubicaciones del lote ${batchId}?`)) {
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const delRes = await client.deleteLocationBatch(batchId);
      setSuccessMsg(`Lote ${batchId} eliminado correctamente (${delRes.deletedCount} ubicaciones suprimidas)`);
      if (lastBatchId === batchId) setLastBatchId(null);
      setGenPreview(null);
      await loadMacroData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al deshacer lote";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Alta Individual de Ubicación ─────────────────────────────
  const handleCreateSingleLocation = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload: CreateLocationInput = {
        warehouseId: session.warehouseId,
        code: singleCode.trim() ? singleCode.trim() : undefined,
        type: singleType,
        storageType: singleStorageType,
        zone: singleZone.trim() || "MAIN",
        aisle: singleStorageType === "FLOOR" ? (singleAisle.trim() || null) : singleAisle.trim(),
        rack: singleRack.trim() || "01",
        level: singleStorageType === "FLOOR" ? "01" : singleLevel.trim() || "01",
        position: singlePosition.trim() || "01",
        description: singleDescription.trim() || undefined,
      };

      const created = await client.createLocation(payload);
      setSuccessMsg(`Ubicación '${created.code}' creada con éxito.`);
      setIsCreateSingleOpen(false);
      setSingleCode("");
      setSingleDescription("");
      await loadMacroData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al crear ubicación individual";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Selección para Etiquetas ────────────────────────────────
  const toggleLocationSelect = (code: string) => {
    setSelectedLocationCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const toggleSelectAllAisle = (detail: AisleLayoutDetailDTO) => {
    const allAisleCodes = detail.racks.flatMap((r) =>
      r.levels.flatMap((l) => l.positions.map((p) => p.code)),
    );
    const allSelected = allAisleCodes.every((c) => selectedLocationCodes.has(c));

    setSelectedLocationCodes((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const c of allAisleCodes) next.delete(c);
      } else {
        for (const c of allAisleCodes) next.add(c);
      }
      return next;
    });
  };

  // Cálculo de KPIs de resumen
  const topologyKpis = computeTopologySummary(allLocations, allBalances);

  return (
    <>
      <main
        className="min-h-screen px-4 py-6 md:px-8 space-y-6"
        style={{
          backgroundColor: WMS_COLORS.bg,
          color: WMS_COLORS.text,
        }}
      >
        {/* ── Cabecera y Barra de Herramientas ─────────────────── */}
        <header
          className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between p-4 rounded-lg border"
          style={{
            backgroundColor: WMS_COLORS.surface,
            borderColor: WMS_COLORS.border,
          }}
        >
          <div>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center justify-center w-8 h-8 rounded text-sm font-bold"
                style={{
                  backgroundColor: WMS_COLORS.brand,
                  color: WMS_COLORS.text,
                }}
              >
                ▤
              </span>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                Topología Física y Layout del Almacén
              </h1>
            </div>
            <p className="text-xs md:text-sm mt-1" style={{ color: WMS_COLORS.muted }}>
              Alzado frontal, distribución en planta y gestión de capacidad del almacén (S5 / F9.2)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsGeneratorOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded transition-colors"
              style={{
                backgroundColor: WMS_COLORS.accent,
                color: WMS_COLORS.accentContrast,
              }}
            >
              <span>⚡</span>
              <span>Generador en Bloque</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCreateSingleOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border transition-colors"
              style={{
                backgroundColor: WMS_COLORS.surfaceCard,
                borderColor: WMS_COLORS.borderStrong,
                color: WMS_COLORS.text,
              }}
            >
              <span>+</span>
              <span>Alta Individual</span>
            </button>

            <button
              type="button"
              disabled={selectedLocationCodes.size === 0 && allLocations.length === 0}
              onClick={() => setIsPrintModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded border transition-colors disabled:opacity-50"
              style={{
                backgroundColor: WMS_COLORS.surfaceCard,
                borderColor: WMS_COLORS.borderStrong,
                color: WMS_COLORS.text,
              }}
            >
              <span>🏷️</span>
              <span>
                Imprimir Etiquetas
                {selectedLocationCodes.size > 0 && ` (${selectedLocationCodes.size})`}
              </span>
            </button>

            <button
              type="button"
              onClick={() => void loadMacroData()}
              className="p-2 text-xs rounded border transition-colors"
              style={{
                backgroundColor: WMS_COLORS.surfaceCard,
                borderColor: WMS_COLORS.border,
                color: WMS_COLORS.muted,
              }}
              title="Refrescar datos"
            >
              ↻
            </button>
          </div>
        </header>

        {/* ── Mensajes de Alerta ──────────────────────────────── */}
        {errorMsg && (
          <div
            className="p-3 text-xs md:text-sm rounded border flex items-center justify-between"
            style={{
              backgroundColor: WMS_COLORS.dangerTint,
              borderColor: WMS_COLORS.dangerBorder,
              color: WMS_COLORS.danger,
            }}
          >
            <span>⚠ {errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="font-bold ml-2 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {successMsg && (
          <div
            className="p-3 text-xs md:text-sm rounded border flex items-center justify-between"
            style={{
              backgroundColor: WMS_COLORS.successTint,
              borderColor: WMS_COLORS.successBorder,
              color: WMS_COLORS.success,
            }}
          >
            <span>✓ {successMsg}</span>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="font-bold ml-2 text-xs"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── KPI Strip Resumen Macro ─────────────────────────── */}
        <section
          className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3"
        >
          <div
            className="p-3 rounded border"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.border,
            }}
          >
            <span className="text-[11px] block" style={{ color: WMS_COLORS.muted }}>
              Ubicaciones
            </span>
            <span className="text-xl font-bold font-mono">
              {layoutSummary ? layoutSummary.totalLocations : topologyKpis.totalLocations}
            </span>
          </div>

          <div
            className="p-3 rounded border"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.border,
            }}
          >
            <span className="text-[11px] block" style={{ color: WMS_COLORS.muted }}>
              Activas
            </span>
            <span className="text-xl font-bold font-mono" style={{ color: WMS_COLORS.success }}>
              {layoutSummary ? layoutSummary.activeLocations : topologyKpis.activeLocations}
            </span>
          </div>

          <div
            className="p-3 rounded border"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.border,
            }}
          >
            <span className="text-[11px] block" style={{ color: WMS_COLORS.muted }}>
              Bloqueadas
            </span>
            <span className="text-xl font-bold font-mono" style={{ color: WMS_COLORS.danger }}>
              {layoutSummary ? layoutSummary.blockedLocations : topologyKpis.blockedLocations}
            </span>
          </div>

          <div
            className="p-3 rounded border"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.border,
            }}
          >
            <span className="text-[11px] block" style={{ color: WMS_COLORS.muted }}>
              Ocupadas
            </span>
            <span className="text-xl font-bold font-mono" style={{ color: WMS_COLORS.accent }}>
              {layoutSummary ? layoutSummary.occupiedLocations : topologyKpis.occupiedLocations}
            </span>
          </div>

          <div
            className="p-3 rounded border"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.border,
            }}
          >
            <span className="text-[11px] block" style={{ color: WMS_COLORS.muted }}>
              Ocupación %
            </span>
            <span className="text-xl font-bold font-mono">
              {layoutSummary ? layoutSummary.occupancyRate : topologyKpis.occupancyRate}%
            </span>
          </div>

          <div
            className="p-3 rounded border"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.border,
            }}
          >
            <span className="text-[11px] block" style={{ color: WMS_COLORS.muted }}>
              Stock Físico (OnHand)
            </span>
            <span className="text-xl font-bold font-mono">
              {layoutSummary ? layoutSummary.totalOnHand : topologyKpis.totalOnHand}
            </span>
          </div>

          <div
            className="p-3 rounded border"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.border,
            }}
          >
            <span className="text-[11px] block" style={{ color: WMS_COLORS.muted }}>
              Reservado
            </span>
            <span className="text-xl font-bold font-mono" style={{ color: WMS_COLORS.warning }}>
              {layoutSummary ? layoutSummary.totalAllocated : topologyKpis.totalAllocated}
            </span>
          </div>

          <div
            className="p-3 rounded border"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.border,
            }}
          >
            <span className="text-[11px] block" style={{ color: WMS_COLORS.muted }}>
              Disponible (ATP)
            </span>
            <span className="text-xl font-bold font-mono" style={{ color: WMS_COLORS.success }}>
              {layoutSummary ? layoutSummary.totalAtp : topologyKpis.totalAtp}
            </span>
          </div>
        </section>

        {/* ── ÚLTIMO LOTE GENERADO (Banner con acción de Rollback / Etiquetas) ── */}
        {lastBatchId && (
          <div
            className="p-3 rounded border flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-xs"
            style={{
              backgroundColor: WMS_COLORS.surfaceCard,
              borderColor: WMS_COLORS.accentBorder,
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: WMS_COLORS.accent }}>⚡</span>
              <span>
                Último lote generado: <strong className="font-mono">{lastBatchId}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPrintModalOpen(true)}
                className="px-2.5 py-1 rounded font-semibold transition-colors"
                style={{
                  backgroundColor: WMS_COLORS.accent,
                  color: WMS_COLORS.accentContrast,
                }}
              >
                🏷️ Imprimir etiquetas del lote generado
              </button>
              <button
                type="button"
                onClick={() => void handleRollbackBatch(lastBatchId)}
                className="px-2.5 py-1 rounded border font-semibold transition-colors"
                style={{
                  backgroundColor: WMS_COLORS.dangerTint,
                  borderColor: WMS_COLORS.dangerBorder,
                  color: WMS_COLORS.danger,
                }}
              >
                ↩ Deshacer lote
              </button>
            </div>
          </div>
        )}

        {/* ── VISTA 1: MAPA MACRO DE NAVE (Zonas -> Pasillos) ──── */}
        {viewMode === "MACRO" && (
          <section className="space-y-6">
            {/* Filtro por Zona */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold mr-1" style={{ color: WMS_COLORS.muted }}>
                Filtrar Zona:
              </span>
              <button
                type="button"
                onClick={() => setSelectedZone("ALL")}
                className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                  selectedZone === "ALL" ? "font-bold" : ""
                }`}
                style={{
                  backgroundColor:
                    selectedZone === "ALL" ? WMS_COLORS.brand : WMS_COLORS.surface,
                  borderColor:
                    selectedZone === "ALL" ? WMS_COLORS.accent : WMS_COLORS.border,
                  color: WMS_COLORS.text,
                }}
              >
                Todas las zonas
              </button>
              {layoutSummary?.zones.map((z) => (
                <button
                  key={z.zone}
                  type="button"
                  onClick={() => setSelectedZone(z.zone)}
                  className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                    selectedZone === z.zone ? "font-bold" : ""
                  }`}
                  style={{
                    backgroundColor:
                      selectedZone === z.zone ? WMS_COLORS.brand : WMS_COLORS.surface,
                    borderColor:
                      selectedZone === z.zone ? WMS_COLORS.accent : WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                >
                  {z.zone} ({z.totalLocations})
                </button>
              ))}
            </div>

            {/* Árbol de Zonas y Pasillos */}
            {layoutSummary?.zones
              .filter((z) => selectedZone === "ALL" || z.zone === selectedZone)
              .map((zoneNode) => (
                <div
                  key={zoneNode.zone}
                  className="rounded-lg border overflow-hidden"
                  style={{
                    backgroundColor: WMS_COLORS.surface,
                    borderColor: WMS_COLORS.border,
                  }}
                >
                  <div
                    className="p-4 border-b flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold font-mono tracking-tight">
                        Zona: {zoneNode.zone}
                      </span>
                      <span
                        className="text-xs px-2 py-0.5 rounded border font-mono"
                        style={{
                          backgroundColor: WMS_COLORS.neutralTint,
                          borderColor: WMS_COLORS.border,
                          color: WMS_COLORS.muted,
                        }}
                      >
                        {zoneNode.totalLocations} ubicaciones
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span>
                        Ocupación: <strong>{zoneNode.occupancyRate}%</strong>
                      </span>
                      <span>
                        OnHand: <strong>{zoneNode.totalOnHand}</strong>
                      </span>
                      <span style={{ color: WMS_COLORS.success }}>
                        ATP: <strong>{zoneNode.totalAtp}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Lista / Grid de Pasillos de la Zona */}
                  <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {zoneNode.aisles.map((aisleSummary: AisleLayoutSummaryDTO) => {
                      const typeVisual = resolveStorageTypeVisual(aisleSummary.storageType);
                      const isSpecialFloor = aisleSummary.aisle === SPECIAL_FLOOR_AISLE;
                      const displayName = isSpecialFloor ? "Planta Suelo (Bahías)" : `Pasillo ${aisleSummary.aisle}`;

                      return (
                        <div
                          key={aisleSummary.aisle}
                          className="p-4 rounded border flex flex-col justify-between gap-3 hover:border-accent transition-colors"
                          style={{
                            backgroundColor: WMS_COLORS.surfaceCard,
                            borderColor: WMS_COLORS.border,
                          }}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-sm tracking-tight font-mono">
                                {displayName}
                              </span>
                              <span
                                className="text-[11px] px-2 py-0.5 rounded font-mono border"
                                style={{
                                  backgroundColor: typeVisual.colors.bg,
                                  borderColor: typeVisual.colors.border,
                                  color: typeVisual.colors.text,
                                }}
                              >
                                {typeVisual.symbol} {typeVisual.code}
                              </span>
                            </div>

                            {/* Barra Térmica de Ocupación */}
                            <div className="mt-3">
                              <div className="flex justify-between text-[11px] mb-1 font-mono">
                                <span style={{ color: WMS_COLORS.muted }}>Ocupación</span>
                                <strong>{aisleSummary.occupancyRate}%</strong>
                              </div>
                              <div
                                className="w-full h-2 rounded overflow-hidden"
                                style={{ backgroundColor: WMS_COLORS.surfaceHover }}
                              >
                                <div
                                  className="h-full transition-all"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, aisleSummary.occupancyRate))}%`,
                                    backgroundColor:
                                      aisleSummary.occupancyRate > 90
                                        ? WMS_COLORS.danger
                                        : aisleSummary.occupancyRate > 60
                                        ? WMS_COLORS.warning
                                        : WMS_COLORS.success,
                                  }}
                                />
                              </div>
                            </div>

                            {/* Telemetría del Pasillo */}
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
                              <div>
                                <span className="text-[10px] block" style={{ color: WMS_COLORS.muted }}>
                                  Activas / Bloqueadas
                                </span>
                                <span>
                                  {aisleSummary.activeLocations} /{" "}
                                  <span style={{ color: WMS_COLORS.danger }}>
                                    {aisleSummary.blockedLocations}
                                  </span>
                                </span>
                              </div>
                              <div>
                                <span className="text-[10px] block" style={{ color: WMS_COLORS.muted }}>
                                  OnHand / ATP
                                </span>
                                <span>
                                  {aisleSummary.totalOnHand} /{" "}
                                  <strong style={{ color: WMS_COLORS.success }}>
                                    {aisleSummary.totalAtp}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => void openAisleDetail(aisleSummary.aisle, zoneNode.zone)}
                            className="w-full py-1.5 text-xs font-semibold rounded border transition-colors mt-2 text-center"
                            style={{
                              backgroundColor: WMS_COLORS.surfaceHover,
                              borderColor: WMS_COLORS.borderStrong,
                              color: WMS_COLORS.text,
                            }}
                          >
                            Ver alzado de pasillo →
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </section>
        )}

        {/* ── VISTA 2: DRILL-DOWN A PASILLO (Alzado Frontal / Planta) ── */}
        {viewMode === "AISLE_DETAIL" && activeAisleDetail && (
          <section className="space-y-6">
            {/* Barra de Navegación del Pasillo */}
            <div
              className="p-4 rounded-lg border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
              style={{
                backgroundColor: WMS_COLORS.surface,
                borderColor: WMS_COLORS.border,
              }}
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={backToMacro}
                  className="px-3 py-1.5 text-xs font-semibold rounded border transition-colors"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                >
                  ← Volver al mapa macro
                </button>
                <div>
                  <h2 className="text-lg font-bold font-mono tracking-tight">
                    {activeAisleDetail.aisle === SPECIAL_FLOOR_AISLE
                      ? `Planta de Suelo — Zona ${activeAisleDetail.zone}`
                      : `Alzado de Pasillo ${activeAisleDetail.aisle} — Zona ${activeAisleDetail.zone}`}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: WMS_COLORS.muted }}>
                    {activeAisleDetail.totalLocations} celdas en total ·{" "}
                    {activeAisleDetail.activeLocations} activas ·{" "}
                    {activeAisleDetail.blockedLocations} bloqueadas · Ocupación:{" "}
                    {activeAisleDetail.occupancyRate}%
                  </p>
                </div>
              </div>

              {/* Controles de Vista del Pasillo */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* Selector de Densidad */}
                <div
                  className="inline-flex rounded border overflow-hidden"
                  style={{ borderColor: WMS_COLORS.border }}
                >
                  <button
                    type="button"
                    onClick={() => setCellDensity("NORMAL")}
                    className={`px-2.5 py-1 ${cellDensity === "NORMAL" ? "font-bold" : ""}`}
                    style={{
                      backgroundColor:
                        cellDensity === "NORMAL" ? WMS_COLORS.brand : WMS_COLORS.surfaceCard,
                      color: WMS_COLORS.text,
                    }}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setCellDensity("COMPACT")}
                    className={`px-2.5 py-1 ${cellDensity === "COMPACT" ? "font-bold" : ""}`}
                    style={{
                      backgroundColor:
                        cellDensity === "COMPACT" ? WMS_COLORS.brand : WMS_COLORS.surfaceCard,
                      color: WMS_COLORS.text,
                    }}
                  >
                    Compacto
                  </button>
                </div>

                {/* Filtro por Estado */}
                <select
                  value={cellFilter}
                  onChange={(e) => setCellFilter(e.target.value as CellFilter)}
                  className="px-2.5 py-1 rounded border text-xs"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                >
                  <option value="ALL">Todas las celdas</option>
                  <option value="OCCUPIED">Solo ocupadas</option>
                  <option value="EMPTY">Solo vacías</option>
                  <option value="BLOCKED">Solo bloqueadas</option>
                </select>

                <button
                  type="button"
                  onClick={() => toggleSelectAllAisle(activeAisleDetail)}
                  className="px-2.5 py-1 rounded border font-semibold"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.borderStrong,
                    color: WMS_COLORS.text,
                  }}
                >
                  🏷️ Seleccionar todas
                </button>
              </div>
            </div>

            {/* Leyenda Visual de los 4 Estados Térmicos */}
            <div
              className="p-3 rounded border flex flex-wrap items-center justify-between gap-3 text-xs"
              style={{
                backgroundColor: WMS_COLORS.surfaceCard,
                borderColor: WMS_COLORS.border,
              }}
            >
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-semibold" style={{ color: WMS_COLORS.muted }}>
                  Leyenda de Celdas:
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-3.5 rounded border inline-block"
                    style={{
                      backgroundColor: WMS_COLORS.neutralTint,
                      borderColor: WMS_COLORS.border,
                    }}
                  />
                  <span>Vacía (onHand = 0)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-3.5 rounded border inline-block"
                    style={{
                      backgroundColor: WMS_COLORS.successTint,
                      borderColor: WMS_COLORS.successBorder,
                    }}
                  />
                  <span>Ocupada con ATP &gt; 0</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-3.5 rounded border inline-block"
                    style={{
                      backgroundColor: WMS_COLORS.warningTint,
                      borderColor: WMS_COLORS.warningBorder,
                    }}
                  />
                  <span>Reservada 100% (ATP = 0)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-3.5 rounded border inline-block"
                    style={{
                      backgroundColor: WMS_COLORS.dangerTint,
                      borderColor: WMS_COLORS.dangerBorder,
                    }}
                  />
                  <span>Bloqueada (BLOCKED)</span>
                </span>
              </div>

              {activeAisleDetail.totalLocations > AISLE_CELL_COLLAPSE_THRESHOLD && (
                <span
                  className="px-2 py-0.5 rounded text-[11px] font-mono border"
                  style={{
                    backgroundColor: WMS_COLORS.warningTint,
                    borderColor: WMS_COLORS.warningBorder,
                    color: WMS_COLORS.warning,
                  }}
                >
                  ⚡ Pasillo grande (&gt;200 celdas): Racks colapsados por defecto
                </span>
              )}
            </div>

            {/* Matriz de Racks */}
            <div className="space-y-6">
              {activeAisleDetail.racks.map((rackGroup) => {
                const isExpanded =
                  expandedRacks.has(rackGroup.rack) ||
                  activeAisleDetail.totalLocations <= AISLE_CELL_COLLAPSE_THRESHOLD;

                const toggleRack = () => {
                  setExpandedRacks((prev) => {
                    const next = new Set(prev);
                    if (next.has(rackGroup.rack)) next.delete(rackGroup.rack);
                    else next.add(rackGroup.rack);
                    return next;
                  });
                };

                return (
                  <div
                    key={rackGroup.rack}
                    className="rounded-lg border overflow-hidden"
                    style={{
                      backgroundColor: WMS_COLORS.surface,
                      borderColor: WMS_COLORS.border,
                    }}
                  >
                    {/* Cabecera del Rack */}
                    <div
                      className="p-3 border-b flex items-center justify-between"
                      style={{
                        backgroundColor: WMS_COLORS.surfaceCard,
                        borderColor: WMS_COLORS.border,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={toggleRack}
                          className="font-mono text-sm font-bold flex items-center gap-1.5"
                        >
                          <span>{isExpanded ? "▼" : "▶"}</span>
                          <span>
                            {rackGroup.storageType === "FLOOR"
                              ? `Bahía ${rackGroup.rack}`
                              : `Rack ${rackGroup.rack}`}
                          </span>
                        </button>
                        <span
                          className="text-[11px] px-2 py-0.5 rounded font-mono border"
                          style={{
                            backgroundColor: WMS_COLORS.neutralTint,
                            borderColor: WMS_COLORS.border,
                            color: WMS_COLORS.muted,
                          }}
                        >
                          {rackGroup.totalLocations} celdas · Ocupación: {rackGroup.occupancyRate}%
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span>OnHand: {rackGroup.totalOnHand}</span>
                        <span style={{ color: WMS_COLORS.success }}>
                          ATP: {rackGroup.totalAtp}
                        </span>
                        <button
                          type="button"
                          onClick={toggleRack}
                          className="text-xs px-2 py-1 rounded border ml-2"
                          style={{
                            backgroundColor: WMS_COLORS.surfaceHover,
                            borderColor: WMS_COLORS.border,
                          }}
                        >
                          {isExpanded ? "Colapsar celdas" : "Expandir celdas"}
                        </button>
                      </div>
                    </div>

                    {/* Alzado Frontal / Celdas del Rack */}
                    {isExpanded && (
                      <div className="p-4 space-y-3 overflow-x-auto">
                        {rackGroup.levels.map((lvl) => {
                          const filteredPositions = lvl.positions.filter((pos) => {
                            if (cellFilter === "OCCUPIED") return pos.onHandQty > 0;
                            if (cellFilter === "EMPTY") return pos.onHandQty === 0 && pos.status === "ACTIVE";
                            if (cellFilter === "BLOCKED") return pos.status === "BLOCKED";
                            return true;
                          });

                          if (filteredPositions.length === 0 && cellFilter !== "ALL") {
                            return null;
                          }

                          return (
                            <div key={lvl.level} className="flex items-center gap-2">
                              {/* Etiqueta de Nivel */}
                              <div
                                className="w-16 flex-shrink-0 text-right pr-2 font-mono text-xs font-semibold"
                                style={{ color: WMS_COLORS.muted }}
                              >
                                {rackGroup.storageType === "FLOOR" ? "Suelo" : `Nivel ${lvl.level}`}
                              </div>

                              {/* Celdas del Nivel */}
                              <div className="flex flex-wrap items-center gap-2 flex-grow">
                                {filteredPositions.map((cell) => {
                                  const cellVisual = resolveLocationCellVisual({
                                    status: cell.status,
                                    onHandQty: cell.onHandQty,
                                    atpQty: cell.atpQty,
                                  });
                                  const isSelected = selectedLocationCodes.has(cell.code);

                                  return (
                                    <div
                                      key={cell.id}
                                      className={`rounded border flex flex-col justify-between transition-all relative ${
                                        cellDensity === "COMPACT"
                                          ? "w-24 p-1.5 text-[10px]"
                                          : "w-32 p-2 text-xs"
                                      }`}
                                      style={{
                                        backgroundColor: cellVisual.colors.bg,
                                        borderColor: isSelected
                                          ? WMS_COLORS.accent
                                          : cellVisual.colors.border,
                                      }}
                                    >
                                      {/* Cabecera de celda: checkbox y código */}
                                      <div className="flex items-center justify-between gap-1">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleLocationSelect(cell.code)}
                                          className="cursor-pointer"
                                          title="Seleccionar para imprimir etiqueta"
                                        />
                                        <span className="font-mono font-bold truncate">
                                          {cell.code}
                                        </span>
                                      </div>

                                      {/* Saldos */}
                                      <div className="mt-1 font-mono text-[11px] flex justify-between">
                                        <span style={{ color: WMS_COLORS.muted }}>
                                          OH: {cell.onHandQty}
                                        </span>
                                        <span
                                          style={{
                                            color:
                                              cell.atpQty > 0
                                                ? WMS_COLORS.success
                                                : WMS_COLORS.warning,
                                          }}
                                        >
                                          ATP: {cell.atpQty}
                                        </span>
                                      </div>

                                      {/* Acción para alternar bloqueo */}
                                      <div className="mt-1 flex items-center justify-between pt-1 border-t border-opacity-20 border-current text-[10px]">
                                        <span style={{ color: cellVisual.colors.text }}>
                                          {cellVisual.label}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleToggleBlockLocation(cell.id, cell.status)
                                          }
                                          className="underline hover:opacity-80"
                                          title={
                                            cell.status === "ACTIVE"
                                              ? "Bloquear celda"
                                              : "Desbloquear celda"
                                          }
                                        >
                                          {cell.status === "ACTIVE" ? "Bloquear" : "Activar"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* ── MODAL: GENERADOR ESTRUCTURADO EN BLOQUE ────────────── */}
      {isGeneratorOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div
            className="w-full max-w-2xl rounded-lg border p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.borderStrong,
              color: WMS_COLORS.text,
            }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: WMS_COLORS.border }}>
              <div>
                <h3 className="text-lg font-bold">⚡ Generador Estructurado de Ubicaciones</h3>
                <p className="text-xs" style={{ color: WMS_COLORS.muted }}>
                  Alta masiva determinista con zero-padding (Invariante 1) y detección de colisiones (dryRun)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGeneratorOpen(false)}
                className="text-sm font-bold p-1"
                style={{ color: WMS_COLORS.muted }}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block mb-1 font-semibold">Tipo de Almacenamiento (StorageType)</label>
                <select
                  value={genStorageType}
                  onChange={(e) => {
                    const st = e.target.value as StorageType;
                    setGenStorageType(st);
                    if (st === "FLOOR") {
                      setGenLevelStart(1);
                      setGenLevelEnd(1);
                    }
                  }}
                  className="w-full p-2 rounded border"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                >
                  <option value="RACK">RACK (Palets - Niveles altos)</option>
                  <option value="SHELVING">SHELVING (Estanterías de Picking)</option>
                  <option value="FLOOR">FLOOR (Planta / Suelo - Solo Nivel 01)</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 font-semibold">Uso Operativo (LocationType)</label>
                <select
                  value={genLocationType}
                  onChange={(e) => setGenLocationType(e.target.value as LocationType)}
                  className="w-full p-2 rounded border"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                >
                  <option value="STORAGE">STORAGE (Almacenaje regular)</option>
                  <option value="RECEIVING">RECEIVING (Muelle de entrada)</option>
                  <option value="PACKING">PACKING (Mesa de preparación)</option>
                  <option value="DISPATCH">DISPATCH (Muelle de salida)</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 font-semibold">Zona (ej. MAIN, MEZZANINE, PULMON)</label>
                <input
                  type="text"
                  value={genZone}
                  onChange={(e) => setGenZone(e.target.value.toUpperCase())}
                  className="w-full p-2 rounded border font-mono"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                />
              </div>

              <div>
                <label className="block mb-1 font-semibold">
                  Pasillo / Módulo {genStorageType === "FLOOR" ? "(Opcional)" : "(Requerido)"}
                </label>
                <input
                  type="text"
                  value={genAisle}
                  onChange={(e) => setGenAisle(e.target.value.toUpperCase())}
                  placeholder={genStorageType === "FLOOR" ? "Opcional en suelo" : "ej. 01, A, B"}
                  className="w-full p-2 rounded border font-mono"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 font-semibold">Rack Inicio</label>
                  <input
                    type="number"
                    min={1}
                    value={genRackStart}
                    onChange={(e) => setGenRackStart(Number(e.target.value))}
                    className="w-full p-2 rounded border font-mono"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                      color: WMS_COLORS.text,
                    }}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold">Rack Fin</label>
                  <input
                    type="number"
                    min={genRackStart}
                    value={genRackEnd}
                    onChange={(e) => setGenRackEnd(Number(e.target.value))}
                    className="w-full p-2 rounded border font-mono"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                      color: WMS_COLORS.text,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 font-semibold">Nivel Inicio</label>
                  <input
                    type="number"
                    min={1}
                    disabled={genStorageType === "FLOOR"}
                    value={genStorageType === "FLOOR" ? 1 : genLevelStart}
                    onChange={(e) => setGenLevelStart(Number(e.target.value))}
                    className="w-full p-2 rounded border font-mono disabled:opacity-50"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                      color: WMS_COLORS.text,
                    }}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold">Nivel Fin</label>
                  <input
                    type="number"
                    min={genLevelStart}
                    disabled={genStorageType === "FLOOR"}
                    value={genStorageType === "FLOOR" ? 1 : genLevelEnd}
                    onChange={(e) => setGenLevelEnd(Number(e.target.value))}
                    className="w-full p-2 rounded border font-mono disabled:opacity-50"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                      color: WMS_COLORS.text,
                    }}
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block mb-1 font-semibold">Posiciones por Nivel</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={genPositionsPerLevel}
                  onChange={(e) => setGenPositionsPerLevel(Number(e.target.value))}
                  className="w-full p-2 rounded border font-mono"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                />
              </div>
            </div>

            {/* Resultado de Simulación / Preview */}
            {genPreview && (
              <div
                className="p-3 rounded border text-xs space-y-2 font-mono"
                style={{
                  backgroundColor: WMS_COLORS.surfaceCard,
                  borderColor: genPreview.collisions.length > 0 ? WMS_COLORS.warningBorder : WMS_COLORS.successBorder,
                }}
              >
                <div className="flex justify-between">
                  <span>Total generadas: <strong>{genPreview.totalGenerated}</strong></span>
                  <span style={{ color: WMS_COLORS.success }}>
                    Nuevas a crear: <strong>{genPreview.creatableCount}</strong>
                  </span>
                  <span style={{ color: WMS_COLORS.warning }}>
                    Colisiones preexistentes: <strong>{genPreview.collisions.length}</strong>
                  </span>
                </div>

                {genPreview.collisions.length > 0 && (
                  <div className="text-[11px] mt-1" style={{ color: WMS_COLORS.warning }}>
                    ⚠ Códigos que ya existen y se omitirán: {genPreview.collisions.join(", ")}
                  </div>
                )}

                {genPreview.batchId && (
                  <div className="text-[11px] mt-1" style={{ color: WMS_COLORS.accent }}>
                    ✓ Lote confirmado en BD con ID: <strong>{genPreview.batchId}</strong>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t" style={{ borderColor: WMS_COLORS.border }}>
              <button
                type="button"
                onClick={() => setIsGeneratorOpen(false)}
                className="px-3 py-2 text-xs rounded border"
                style={{
                  backgroundColor: WMS_COLORS.surfaceCard,
                  borderColor: WMS_COLORS.border,
                  color: WMS_COLORS.muted,
                }}
              >
                Cerrar
              </button>

              <button
                type="button"
                disabled={genLoading}
                onClick={() => void handleSimulateBlock()}
                className="px-3 py-2 text-xs rounded border font-semibold"
                style={{
                  backgroundColor: WMS_COLORS.surfaceCard,
                  borderColor: WMS_COLORS.accentBorder,
                  color: WMS_COLORS.accent,
                }}
              >
                {genLoading ? "Simulando..." : "Simular (dryRun)"}
              </button>

              <button
                type="button"
                disabled={genLoading || (genPreview?.creatableCount === 0)}
                onClick={() => void handleConfirmCreateBlock()}
                className="px-4 py-2 text-xs rounded font-bold transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: WMS_COLORS.brand,
                  color: WMS_COLORS.text,
                }}
              >
                {genLoading ? "Creando..." : "Confirmar Creación en BD"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ALTA INDIVIDUAL ─────────────────────────────── */}
      {isCreateSingleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <form
            onSubmit={(e) => void handleCreateSingleLocation(e)}
            className="w-full max-w-md rounded-lg border p-6 space-y-4"
            style={{
              backgroundColor: WMS_COLORS.surface,
              borderColor: WMS_COLORS.borderStrong,
              color: WMS_COLORS.text,
            }}
          >
            <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: WMS_COLORS.border }}>
              <h3 className="text-base font-bold">+ Nueva Ubicación Física</h3>
              <button
                type="button"
                onClick={() => setIsCreateSingleOpen(false)}
                className="text-sm font-bold p-1"
                style={{ color: WMS_COLORS.muted }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-semibold">Tipo de Almacenamiento</label>
                <select
                  value={singleStorageType}
                  onChange={(e) => {
                    const st = e.target.value as StorageType;
                    setSingleStorageType(st);
                    if (st === "FLOOR") setSingleLevel("01");
                  }}
                  className="w-full p-2 rounded border"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                >
                  <option value="RACK">RACK</option>
                  <option value="SHELVING">SHELVING</option>
                  <option value="FLOOR">FLOOR</option>
                </select>
              </div>

              <div>
                <label className="block mb-1 font-semibold">Tipo Operativo</label>
                <select
                  value={singleType}
                  onChange={(e) => setSingleType(e.target.value as LocationType)}
                  className="w-full p-2 rounded border"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                >
                  <option value="STORAGE">STORAGE</option>
                  <option value="RECEIVING">RECEIVING</option>
                  <option value="PACKING">PACKING</option>
                  <option value="DISPATCH">DISPATCH</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 font-semibold">Zona</label>
                  <input
                    type="text"
                    value={singleZone}
                    onChange={(e) => setSingleZone(e.target.value.toUpperCase())}
                    className="w-full p-2 rounded border font-mono"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                      color: WMS_COLORS.text,
                    }}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold">Pasillo</label>
                  <input
                    type="text"
                    value={singleAisle}
                    onChange={(e) => setSingleAisle(e.target.value.toUpperCase())}
                    className="w-full p-2 rounded border font-mono"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                      color: WMS_COLORS.text,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block mb-1 font-semibold">Rack</label>
                  <input
                    type="text"
                    value={singleRack}
                    onChange={(e) => setSingleRack(e.target.value)}
                    className="w-full p-2 rounded border font-mono"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                      color: WMS_COLORS.text,
                    }}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold">Nivel</label>
                  <input
                    type="text"
                    disabled={singleStorageType === "FLOOR"}
                    value={singleStorageType === "FLOOR" ? "01" : singleLevel}
                    onChange={(e) => setSingleLevel(e.target.value)}
                    className="w-full p-2 rounded border font-mono disabled:opacity-50"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                      color: WMS_COLORS.text,
                    }}
                  />
                </div>
                <div>
                  <label className="block mb-1 font-semibold">Posición</label>
                  <input
                    type="text"
                    value={singlePosition}
                    onChange={(e) => setSinglePosition(e.target.value)}
                    className="w-full p-2 rounded border font-mono"
                    style={{
                      backgroundColor: WMS_COLORS.surfaceCard,
                      borderColor: WMS_COLORS.border,
                      color: WMS_COLORS.text,
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 font-semibold">Código explícito (opcional, se autogenera si está vacío)</label>
                <input
                  type="text"
                  placeholder="ej. A-01-02-03"
                  value={singleCode}
                  onChange={(e) => setSingleCode(e.target.value.toUpperCase())}
                  className="w-full p-2 rounded border font-mono"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                />
              </div>

              <div>
                <label className="block mb-1 font-semibold">Descripción (opcional)</label>
                <input
                  type="text"
                  value={singleDescription}
                  onChange={(e) => setSingleDescription(e.target.value)}
                  className="w-full p-2 rounded border"
                  style={{
                    backgroundColor: WMS_COLORS.surfaceCard,
                    borderColor: WMS_COLORS.border,
                    color: WMS_COLORS.text,
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: WMS_COLORS.border }}>
              <button
                type="button"
                onClick={() => setIsCreateSingleOpen(false)}
                className="px-3 py-1.5 text-xs rounded border"
                style={{
                  backgroundColor: WMS_COLORS.surfaceCard,
                  borderColor: WMS_COLORS.border,
                  color: WMS_COLORS.muted,
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 text-xs rounded font-bold transition-colors"
                style={{
                  backgroundColor: WMS_COLORS.brand,
                  color: WMS_COLORS.text,
                }}
              >
                {loading ? "Creando..." : "Crear Ubicación"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── MODAL: IMPRESIÓN DE ETIQUETAS LOGÍSTICAS (F5.2) ──── */}
      <LabelPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        entityType="LOCATION"
        items={(selectedLocationCodes.size > 0
          ? allLocations.filter((l) => selectedLocationCodes.has(l.code))
          : allLocations
        ).map((l) => ({
          id: l.id,
          code: l.code,
          title: `Ubicación ${l.code}`,
          subtitle: `Zona: ${l.zone} · Tipo: ${l.storageType}`,
        }))}
      />
    </>
  );
}
