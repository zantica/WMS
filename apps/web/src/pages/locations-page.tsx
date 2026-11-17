// apps/web/src/pages/locations-page.tsx
// Topología Física del Almacén, Distribución por Zonas y Vista Gráfica del Layout (F9.2).
//
// ## Design tokens — Warehouse Topology & Physical Layout (F9.2)
// - Estilo: S5 dark-data-dense (Industrial Data Tower)
// - Clases Semánticas: .wms-* de globals.css (0 clases de Tailwind y 0 colores hex crudos en JSX)
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
  computeTopologySummary,
  resolveStorageTypeVisual,
} from "../lib/dashboard-metrics";
import { useSupervisorSession } from "../context/supervisor-session";
import { LabelPrintModal } from "../components/labels/label-print-modal";
import { useTranslation } from "../context/locale-context";

type ViewMode = "MACRO" | "AISLE_DETAIL";
type CellDensity = "NORMAL" | "COMPACT";
type CellFilter = "ALL" | "OCCUPIED" | "EMPTY" | "BLOCKED";

export default function WarehouseLocationsPage(): JSX.Element {
  const { client, session } = useSupervisorSession();
  const { t, formatNumber } = useTranslation();

  // ── Estados de Datos de Topología ───────────────────────────
  const [layoutSummary, setLayoutSummary] =
    useState<WarehouseLayoutSummaryDTO | null>(null);
  const [activeAisleDetail, setActiveAisleDetail] =
    useState<AisleLayoutDetailDTO | null>(null);
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

  // ── Modales y Paneles de Divulgación Progresiva ─────────────
  const [isGeneratorOpen, setIsGeneratorOpen] = useState<boolean>(false);
  const [isCreateSingleOpen, setIsCreateSingleOpen] = useState<boolean>(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
  const [selectedLocationCodes, setSelectedLocationCodes] = useState<
    Set<string>
  >(new Set());

  // ── Estado del Generador en Bloque ──────────────────────────
  const [genStorageType, setGenStorageType] = useState<StorageType>("RACK");
  const [genLocationType, setGenLocationType] =
    useState<LocationType>("STORAGE");
  const [genZone, setGenZone] = useState<string>("MAIN");
  const [genAisle, setGenAisle] = useState<string>("01");
  const [genRackStart, setGenRackStart] = useState<number>(1);
  const [genRackEnd, setGenRackEnd] = useState<number>(2);
  const [genLevelStart, setGenLevelStart] = useState<number>(1);
  const [genLevelEnd, setGenLevelEnd] = useState<number>(3);
  const [genPositionsPerLevel, setGenPositionsPerLevel] = useState<number>(4);
  const [genLoading, setGenLoading] = useState<boolean>(false);
  const [genPreview, setGenPreview] =
    useState<GenerateLocationBlockResultDTO | null>(null);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);

  // ── Estado de Alta Individual ───────────────────────────────
  const [singleCode, setSingleCode] = useState<string>("");
  const [singleType, setSingleType] = useState<LocationType>("STORAGE");
  const [singleStorageType, setSingleStorageType] =
    useState<StorageType>("RACK");
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
      const msg =
        err instanceof Error
          ? err.message
          : "Error al cargar la topología del almacén";
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
        const msg =
          err instanceof Error
            ? err.message
            : "Error al cargar detalle del pasillo";
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
  const handleToggleBlockLocation = async (
    locId: string,
    currentStatus: LocationStatus,
  ) => {
    const nextStatus: LocationStatus =
      currentStatus === "ACTIVE" ? "BLOCKED" : "ACTIVE";
    try {
      await client.updateLocation(locId, { status: nextStatus });
      setSuccessMsg(
        `✓ Ubicación actualizada a estado ${nextStatus === "ACTIVE" ? "ACTIVO" : "BLOQUEADO"}.`,
      );

      // Recargar pasillo o macro según la vista actual
      if (viewMode === "AISLE_DETAIL" && selectedAisle) {
        await openAisleDetail(selectedAisle);
      }
      await loadMacroData();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Error al actualizar ubicación";
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
        aisle: genStorageType === "FLOOR" ? genAisle || null : genAisle,
        rackStart: genRackStart,
        rackEnd: genRackEnd,
        levelStart: genStorageType === "FLOOR" ? 1 : genLevelStart,
        levelEnd: genStorageType === "FLOOR" ? 1 : genLevelEnd,
        positionsPerLevel: genPositionsPerLevel,
        dryRun: true,
      };

      const res = await client.generateLocationBlock(payload);
      setGenPreview(res);
      setSuccessMsg(
        `✓ Simulación lista: ${res.creatableCount} nuevas ubicaciones, ${res.collisions.length} colisiones detectadas.`,
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error durante la simulación de ubicaciones";
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
        aisle: genStorageType === "FLOOR" ? genAisle || null : genAisle,
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
      setSuccessMsg(
        `✓ ¡Lote creado exitosamente! (${res.createdCount} ubicaciones creadas, Batch ID: ${res.batchId}).`,
      );

      // Seleccionar automáticamente para impresión
      const createdCodes = new Set(res.locations.map((l) => l.code));
      setSelectedLocationCodes(createdCodes);

      await loadMacroData();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al crear el bloque de ubicaciones";
      setErrorMsg(msg);
    } finally {
      setGenLoading(false);
    }
  };

  // ── Rollback por Lote (batchId) ─────────────────────────────
  const handleRollbackBatch = async (batchId: string) => {
    if (
      !confirm(
        `¿Seguro que deseas deshacer/eliminar las ubicaciones del lote ${batchId}?`,
      )
    ) {
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await client.deleteLocationBatch(batchId);
      setSuccessMsg(
        `✓ Lote ${batchId} eliminado correctamente (${res.deletedCount} ubicaciones removidas).`,
      );
      setLastBatchId(null);
      setGenPreview(null);
      await loadMacroData();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al deshacer lote de ubicaciones";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Alta Individual de Ubicación ────────────────────────────
  const handleCreateSingleLocation = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const payload: CreateLocationInput = {
        warehouseId: session.warehouseId,
        type: singleType,
        storageType: singleStorageType,
        status: "ACTIVE",
        zone: singleZone.trim().toUpperCase(),
        aisle:
          singleStorageType === "FLOOR"
            ? singleAisle.trim().toUpperCase() || null
            : singleAisle.trim().toUpperCase(),
        rack: singleRack.trim(),
        level: singleStorageType === "FLOOR" ? "01" : singleLevel.trim(),
        position: singlePosition.trim(),
        code: singleCode.trim().toUpperCase() || undefined,
        description: singleDescription.trim() || undefined,
      };

      const created = await client.createLocation(payload);
      setSuccessMsg(
        `✓ Ubicación ${created.code} creada correctamente con tipo ${created.storageType}.`,
      );
      setIsCreateSingleOpen(false);
      setSingleCode("");
      setSingleDescription("");
      await loadMacroData();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al crear ubicación individual";
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
    const allSelected = allAisleCodes.every((c) =>
      selectedLocationCodes.has(c),
    );

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
      {/* ── Cabecera y Barra de Herramientas ─────────────────── */}
      <div className="wms-page-header">
        <div>
          <div className="wms-eyebrow">
            <span>◆ TOPOLOGÍA FÍSICA Y LAYOUT</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
          </div>
          <h1 className="wms-page-title">
            {t("web.locations.pageTitle")}
          </h1>
          <p className="wms-page-subtitle">
            {t("web.locations.pageSubtitle")} (S5 / F9.2)
          </p>
        </div>

        <div className="wms-actions-row">
          <button
            type="button"
            className={`wms-btn ${
              isGeneratorOpen ? "wms-btn-secondary" : "wms-btn-primary"
            }`}
            onClick={() => {
              setIsGeneratorOpen((prev) => !prev);
              if (!isGeneratorOpen) setIsCreateSingleOpen(false);
            }}
          >
            {isGeneratorOpen
              ? `✕ ${t("common.close")}`
              : `⚡ ${t("web.locations.bulkGenBtn")}`}
          </button>

          <button
            type="button"
            className={`wms-btn ${
              isCreateSingleOpen ? "wms-btn-secondary" : "wms-btn-emerald"
            }`}
            onClick={() => {
              setIsCreateSingleOpen((prev) => !prev);
              if (!isCreateSingleOpen) setIsGeneratorOpen(false);
            }}
          >
            {isCreateSingleOpen
              ? `✕ ${t("common.close")}`
              : `+ ${t("web.locations.individualBtn")}`}
          </button>

          <button
            type="button"
            className="wms-btn wms-btn-outline"
            disabled={
              selectedLocationCodes.size === 0 && allLocations.length === 0
            }
            onClick={() => setIsPrintModalOpen(true)}
            title={t("web.locations.printLabelsBtn")}
          >
            🏷️ {t("web.locations.printLabelsBtn")}
            {selectedLocationCodes.size > 0
              ? ` (${selectedLocationCodes.size})`
              : ""}
          </button>

          <button
            type="button"
            className="wms-btn wms-btn-secondary"
            onClick={() => void loadMacroData()}
            disabled={loading}
            title={t("common.refresh")}
          >
            ↻ {t("common.refresh")}
          </button>
        </div>
      </div>

      {/* ── Mensajes de Alerta y Estado ─────────────────────── */}
      {errorMsg ? (
        <div className="wms-alert-banner" role="alert" aria-live="assertive">
          <span>
            <strong>⚠ Error:</strong> {errorMsg}
          </span>
          <button
            type="button"
            className="wms-btn wms-btn-outline wms-btn-sm"
            onClick={() => setErrorMsg(null)}
          >
            ✕
          </button>
        </div>
      ) : null}

      {successMsg ? (
        <div className="wms-success-banner" role="status" aria-live="polite">
          <span>{successMsg}</span>
          <button
            type="button"
            className="wms-btn wms-btn-outline wms-btn-sm"
            onClick={() => setSuccessMsg(null)}
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* ── KPI Strip Resumen Macro (Fila 1: Capacidad) ──────── */}
      <div className="wms-grid-4" style={{ marginBottom: "1rem" }}>
        <div className="wms-kpi-card">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.locations.kpiTotal")}</span>
          </div>
          <div className="wms-kpi-value">
            {formatNumber(
              layoutSummary
                ? layoutSummary.totalLocations
                : topologyKpis.totalLocations,
            )}
          </div>
          <div className="wms-kpi-foot">{t("domain.capacity")}</div>
        </div>

        <div className="wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.locations.kpiActive")}</span>
          </div>
          <div className="wms-kpi-value" style={{ color: "var(--success)" }}>
            {formatNumber(
              layoutSummary
                ? layoutSummary.activeLocations
                : topologyKpis.activeLocations,
            )}
          </div>
          <div className="wms-kpi-foot">{t("statuses.active")}</div>
        </div>

        <div className="wms-kpi-card wms-kpi-card-rose">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.locations.kpiBlocked")}</span>
          </div>
          <div className="wms-kpi-value" style={{ color: "var(--danger)" }}>
            {formatNumber(
              layoutSummary
                ? layoutSummary.blockedLocations
                : topologyKpis.blockedLocations,
            )}
          </div>
          <div className="wms-kpi-foot">{t("statuses.blocked")}</div>
        </div>

        <div className="wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.locations.kpiOccupancyPct")}</span>
            <span className="wms-kpi-unit">%</span>
          </div>
          <div className="wms-kpi-value">
            {layoutSummary
              ? layoutSummary.occupancyRate
              : topologyKpis.occupancyRate}
            %
          </div>
          <div className="wms-kpi-foot">
            {layoutSummary
              ? layoutSummary.occupiedLocations
              : topologyKpis.occupiedLocations}{" "}
            {t("locations.occupied")}
          </div>
        </div>
      </div>

      {/* ── KPI Strip Resumen Macro (Fila 2: Saldos de Inventario) */}
      <div className="wms-grid-4" style={{ marginBottom: "1.25rem" }}>
        <div className="wms-kpi-card">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.locations.kpiOccupied")}</span>
          </div>
          <div className="wms-kpi-value">
            {formatNumber(
              layoutSummary
                ? layoutSummary.occupiedLocations
                : topologyKpis.occupiedLocations,
            )}
          </div>
          <div className="wms-kpi-foot">OnHand &gt; 0</div>
        </div>

        <div className="wms-kpi-card">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.locations.kpiOnHand")}</span>
          </div>
          <div className="wms-kpi-value">
            {formatNumber(
              layoutSummary
                ? layoutSummary.totalOnHand
                : topologyKpis.totalOnHand,
            )}
          </div>
          <div className="wms-kpi-foot">{t("domain.onHand")}</div>
        </div>

        <div className="wms-kpi-card wms-kpi-card-amber">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.locations.kpiReserved")}</span>
          </div>
          <div className="wms-kpi-value" style={{ color: "var(--warning)" }}>
            {formatNumber(
              layoutSummary
                ? layoutSummary.totalAllocated
                : topologyKpis.totalAllocated,
            )}
          </div>
          <div className="wms-kpi-foot">{t("domain.allocated")}</div>
        </div>

        <div className="wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.locations.kpiAtp")}</span>
          </div>
          <div className="wms-kpi-value" style={{ color: "var(--success)" }}>
            {formatNumber(
              layoutSummary ? layoutSummary.totalAtp : topologyKpis.totalAtp,
            )}
          </div>
          <div className="wms-kpi-foot">{t("domain.available")}</div>
        </div>
      </div>

      {/* ── Banner: Último Lote Generado ────────────────────── */}
      {lastBatchId ? (
        <div
          className="wms-card"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
            marginBottom: "1.25rem",
            borderColor: "var(--accent)",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <span style={{ color: "var(--accent)" }}>⚡</span>
            <span>
              Último lote generado:{" "}
              <strong className="wms-mono">{lastBatchId}</strong>
            </span>
          </div>
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
          >
            <button
              type="button"
              className="wms-btn wms-btn-primary wms-btn-sm"
              onClick={() => setIsPrintModalOpen(true)}
            >
              🏷️ Imprimir etiquetas del lote generado
            </button>
            <button
              type="button"
              className="wms-btn wms-btn-danger wms-btn-sm"
              onClick={() => void handleRollbackBatch(lastBatchId)}
            >
              ↩ Deshacer lote
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Formulario de Divulgación: Generador en Bloque ───── */}
      {isGeneratorOpen ? (
        <div className="wms-disclosure-box" style={{ marginBottom: "1.5rem" }}>
          <div className="wms-disclosure-header">
            <h2 className="wms-disclosure-title">
              <span>⚡ Generador estructurado de ubicaciones en bloque</span>
            </h2>
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              onClick={() => setIsGeneratorOpen(false)}
            >
              ✕ Cerrar
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSimulateBlock();
            }}
          >
            <div className="wms-grid-2">
              <label className="wms-field">
                <span>Tipo de Almacenamiento (StorageType) *</span>
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
                >
                  <option value="RACK">RACK (Palets - Niveles altos)</option>
                  <option value="SHELVING">
                    SHELVING (Estanterías de Picking)
                  </option>
                  <option value="FLOOR">
                    FLOOR (Planta / Suelo - Solo Nivel 01)
                  </option>
                </select>
              </label>

              <label className="wms-field">
                <span>Uso Operativo (LocationType) *</span>
                <select
                  value={genLocationType}
                  onChange={(e) =>
                    setGenLocationType(e.target.value as LocationType)
                  }
                >
                  <option value="STORAGE">STORAGE (Almacenaje regular)</option>
                  <option value="RECEIVING">
                    RECEIVING (Muelle de entrada)
                  </option>
                  <option value="PACKING">
                    PACKING (Mesa de preparación)
                  </option>
                  <option value="DISPATCH">DISPATCH (Muelle de salida)</option>
                </select>
              </label>

              <label className="wms-field">
                <span>Zona (ej. MAIN, MEZZANINE, PULMON) *</span>
                <input
                  type="text"
                  required
                  value={genZone}
                  onChange={(e) => setGenZone(e.target.value.toUpperCase())}
                  placeholder="MAIN"
                />
              </label>

              <label className="wms-field">
                <span>
                  Pasillo / Módulo{" "}
                  {genStorageType === "FLOOR" ? "(Opcional)" : "(Requerido) *"}
                </span>
                <input
                  type="text"
                  required={genStorageType !== "FLOOR"}
                  value={genAisle}
                  onChange={(e) => setGenAisle(e.target.value.toUpperCase())}
                  placeholder={
                    genStorageType === "FLOOR"
                      ? "Opcional en suelo"
                      : "ej. 01, A, B"
                  }
                />
              </label>
            </div>

            <div className="wms-grid-4" style={{ marginTop: "1rem" }}>
              <label className="wms-field">
                <span>Rack Inicio *</span>
                <input
                  type="number"
                  min={1}
                  required
                  value={genRackStart}
                  onChange={(e) => setGenRackStart(Number(e.target.value))}
                />
              </label>
              <label className="wms-field">
                <span>Rack Fin *</span>
                <input
                  type="number"
                  min={genRackStart}
                  required
                  value={genRackEnd}
                  onChange={(e) => setGenRackEnd(Number(e.target.value))}
                />
              </label>
              <label className="wms-field">
                <span>Nivel Inicio *</span>
                <input
                  type="number"
                  min={1}
                  disabled={genStorageType === "FLOOR"}
                  value={genStorageType === "FLOOR" ? 1 : genLevelStart}
                  onChange={(e) => setGenLevelStart(Number(e.target.value))}
                />
              </label>
              <label className="wms-field">
                <span>Nivel Fin *</span>
                <input
                  type="number"
                  min={genLevelStart}
                  disabled={genStorageType === "FLOOR"}
                  value={genStorageType === "FLOOR" ? 1 : genLevelEnd}
                  onChange={(e) => setGenLevelEnd(Number(e.target.value))}
                />
              </label>
            </div>

            <div className="wms-field" style={{ marginTop: "1rem" }}>
              <span>Posiciones por Nivel (1..100) *</span>
              <input
                type="number"
                min={1}
                max={100}
                required
                value={genPositionsPerLevel}
                onChange={(e) =>
                  setGenPositionsPerLevel(Number(e.target.value))
                }
              />
            </div>

            {/* Resultado de Simulación / Preview */}
            {genPreview ? (
              <div
                className="wms-card"
                style={{
                  marginTop: "1rem",
                  backgroundColor: "var(--surface)",
                  borderColor:
                    genPreview.collisions.length > 0
                      ? "var(--warning)"
                      : "var(--success)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8125rem",
                  }}
                >
                  <span>
                    Total generadas: <strong>{genPreview.totalGenerated}</strong>
                  </span>
                  <span style={{ color: "var(--success)" }}>
                    Nuevas a crear:{" "}
                    <strong>{genPreview.creatableCount}</strong>
                  </span>
                  <span style={{ color: "var(--warning)" }}>
                    Colisiones existentes:{" "}
                    <strong>{genPreview.collisions.length}</strong>
                  </span>
                </div>
                {genPreview.collisions.length > 0 ? (
                  <p
                    style={{
                      margin: "0.5rem 0 0",
                      fontSize: "0.75rem",
                      color: "var(--warning)",
                    }}
                  >
                    ⚠ Códigos que ya existen y se omitirán:{" "}
                    {genPreview.collisions.join(", ")}
                  </p>
                ) : null}
                {genPreview.batchId ? (
                  <p
                    style={{
                      margin: "0.5rem 0 0",
                      fontSize: "0.75rem",
                      color: "var(--accent)",
                    }}
                  >
                    ✓ Lote confirmado en BD con ID:{" "}
                    <strong className="wms-mono">{genPreview.batchId}</strong>
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="wms-form-footer" style={{ marginTop: "1.25rem" }}>
              <button
                type="button"
                className="wms-btn wms-btn-outline"
                onClick={() => setIsGeneratorOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="wms-btn wms-btn-secondary"
                disabled={genLoading}
                onClick={() => void handleSimulateBlock()}
              >
                {genLoading ? "Simulando…" : "Simular (dryRun)"}
              </button>
              <button
                type="button"
                className="wms-btn wms-btn-primary"
                disabled={genLoading || genPreview?.creatableCount === 0}
                onClick={() => void handleConfirmCreateBlock()}
              >
                {genLoading ? "Creando…" : "Confirmar Creación en BD"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── Formulario de Divulgación: Alta Individual ───────── */}
      {isCreateSingleOpen ? (
        <div className="wms-disclosure-box" style={{ marginBottom: "1.5rem" }}>
          <div className="wms-disclosure-header">
            <h2 className="wms-disclosure-title">
              <span>+ Alta individual de ubicación física</span>
            </h2>
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              onClick={() => setIsCreateSingleOpen(false)}
            >
              ✕ Cerrar
            </button>
          </div>
          <form onSubmit={(e) => void handleCreateSingleLocation(e)}>
            <div className="wms-grid-2">
              <label className="wms-field">
                <span>Tipo de Almacenamiento (StorageType) *</span>
                <select
                  value={singleStorageType}
                  onChange={(e) => {
                    const st = e.target.value as StorageType;
                    setSingleStorageType(st);
                    if (st === "FLOOR") setSingleLevel("01");
                  }}
                >
                  <option value="RACK">RACK</option>
                  <option value="SHELVING">SHELVING</option>
                  <option value="FLOOR">FLOOR</option>
                </select>
              </label>

              <label className="wms-field">
                <span>Tipo Operativo (LocationType) *</span>
                <select
                  value={singleType}
                  onChange={(e) =>
                    setSingleType(e.target.value as LocationType)
                  }
                >
                  <option value="STORAGE">STORAGE</option>
                  <option value="RECEIVING">RECEIVING</option>
                  <option value="PACKING">PACKING</option>
                  <option value="DISPATCH">DISPATCH</option>
                </select>
              </label>

              <label className="wms-field">
                <span>Zona *</span>
                <input
                  type="text"
                  required
                  value={singleZone}
                  onChange={(e) => setSingleZone(e.target.value.toUpperCase())}
                  placeholder="MAIN"
                />
              </label>

              <label className="wms-field">
                <span>
                  Pasillo{" "}
                  {singleStorageType === "FLOOR" ? "(Opcional)" : "*"}
                </span>
                <input
                  type="text"
                  required={singleStorageType !== "FLOOR"}
                  value={singleAisle}
                  onChange={(e) => setSingleAisle(e.target.value.toUpperCase())}
                  placeholder={
                    singleStorageType === "FLOOR" ? "Opcional" : "01"
                  }
                />
              </label>
            </div>

            <div className="wms-grid-3" style={{ marginTop: "1rem" }}>
              <label className="wms-field">
                <span>Rack *</span>
                <input
                  type="text"
                  required
                  value={singleRack}
                  onChange={(e) => setSingleRack(e.target.value)}
                  placeholder="01"
                />
              </label>
              <label className="wms-field">
                <span>Nivel *</span>
                <input
                  type="text"
                  required
                  disabled={singleStorageType === "FLOOR"}
                  value={singleStorageType === "FLOOR" ? "01" : singleLevel}
                  onChange={(e) => setSingleLevel(e.target.value)}
                  placeholder="01"
                />
              </label>
              <label className="wms-field">
                <span>Posición *</span>
                <input
                  type="text"
                  required
                  value={singlePosition}
                  onChange={(e) => setSinglePosition(e.target.value)}
                  placeholder="01"
                />
              </label>
            </div>

            <div className="wms-grid-2" style={{ marginTop: "1rem" }}>
              <label className="wms-field">
                <span>
                  Código explícito (opcional, se autogenera si está vacío)
                </span>
                <input
                  type="text"
                  value={singleCode}
                  onChange={(e) => setSingleCode(e.target.value.toUpperCase())}
                  placeholder="ej. A-01-02-03"
                />
              </label>

              <label className="wms-field">
                <span>Descripción (opcional)</span>
                <input
                  type="text"
                  value={singleDescription}
                  onChange={(e) => setSingleDescription(e.target.value)}
                  placeholder="Ubicación alta capacidad"
                />
              </label>
            </div>

            <div className="wms-form-footer" style={{ marginTop: "1.25rem" }}>
              <button
                type="button"
                className="wms-btn wms-btn-outline"
                onClick={() => setIsCreateSingleOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="wms-btn wms-btn-emerald"
                disabled={loading}
              >
                {loading ? "Creando…" : "Crear Ubicación"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── VISTA 1: MAPA MACRO DE NAVE (Zonas -> Pasillos) ──── */}
      {viewMode === "MACRO" && (
        <section className="wms-layout-container">
          {/* Filtro por Zona */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "1rem",
            }}
          >
            <nav
              className="wms-tabs"
              role="tablist"
              aria-label="Filtro de visualización por zona"
            >
              <button
                type="button"
                role="tab"
                aria-selected={selectedZone === "ALL"}
                className={`wms-tab ${
                  selectedZone === "ALL" ? "wms-tab-active" : ""
                }`}
                onClick={() => setSelectedZone("ALL")}
              >
                <span>Todas las zonas</span>
                <span className="wms-tab-badge">
                  {layoutSummary?.zones.reduce(
                    (acc, z) => acc + z.totalLocations,
                    0,
                  ) ?? 0}
                </span>
              </button>
              {layoutSummary?.zones.map((z) => (
                <button
                  key={z.zone}
                  type="button"
                  role="tab"
                  aria-selected={selectedZone === z.zone}
                  className={`wms-tab ${
                    selectedZone === z.zone ? "wms-tab-active" : ""
                  }`}
                  onClick={() => setSelectedZone(z.zone)}
                >
                  <span>{z.zone}</span>
                  <span className="wms-tab-badge">{z.totalLocations}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Árbol de Zonas y Pasillos */}
          <div className="wms-stack">
            {layoutSummary?.zones
              .filter(
                (z) => selectedZone === "ALL" || z.zone === selectedZone,
              )
              .map((zoneNode) => (
                <div key={zoneNode.zone} className="wms-zone-block">
                  <div className="wms-zone-header">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        Zona: {zoneNode.zone}
                      </span>
                      <span className="wms-tag wms-tag-slate">
                        {zoneNode.totalLocations} ubicaciones
                      </span>
                    </div>

                    <div className="wms-zone-metrics">
                      <span>
                        Ocupación: <strong>{zoneNode.occupancyRate}%</strong>
                      </span>
                      <span>
                        OnHand: <strong>{zoneNode.totalOnHand}</strong>
                      </span>
                      <span style={{ color: "var(--success)" }}>
                        ATP: <strong>{zoneNode.totalAtp}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Cuadrícula de Pasillos de la Zona */}
                  <div className="wms-aisle-grid">
                    {zoneNode.aisles.map(
                      (aisleSummary: AisleLayoutSummaryDTO) => {
                        const typeVisual = resolveStorageTypeVisual(
                          aisleSummary.storageType,
                        );
                        const isSpecialFloor =
                          aisleSummary.aisle === SPECIAL_FLOOR_AISLE;
                        const displayName = isSpecialFloor
                          ? "Planta Suelo (Bahías)"
                          : `Pasillo ${aisleSummary.aisle}`;

                        return (
                          <div
                            key={aisleSummary.aisle}
                            className="wms-aisle-card"
                            onClick={() =>
                              void openAisleDetail(
                                aisleSummary.aisle,
                                zoneNode.zone,
                              )
                            }
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                void openAisleDetail(
                                  aisleSummary.aisle,
                                  zoneNode.zone,
                                );
                              }
                            }}
                          >
                            <div className="wms-aisle-card-header">
                              <h3 className="wms-aisle-card-title wms-mono">
                                {displayName}
                              </h3>
                              <span
                                className="wms-tag"
                                style={{
                                  backgroundColor: typeVisual.colors.bg,
                                  borderColor: typeVisual.colors.border,
                                  color: typeVisual.colors.text,
                                }}
                              >
                                {typeVisual.symbol} {typeVisual.code}
                              </span>
                            </div>

                            <div>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: "0.75rem",
                                  marginBottom: "0.25rem",
                                  fontFamily: "var(--font-mono)",
                                }}
                              >
                                <span style={{ color: "var(--muted)" }}>
                                  Ocupación
                                </span>
                                <strong>{aisleSummary.occupancyRate}%</strong>
                              </div>
                              <div className="wms-progress-track">
                                <div
                                  className={`wms-progress-fill ${
                                    aisleSummary.occupancyRate > 90
                                      ? "wms-progress-fill-rose"
                                      : ""
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(
                                        0,
                                        aisleSummary.occupancyRate,
                                      ),
                                    )}%`,
                                  }}
                                />
                              </div>
                            </div>

                            <div className="wms-aisle-card-metrics">
                              <div className="wms-aisle-metric-item">
                                <span className="wms-aisle-metric-label">
                                  Activas / Bloq
                                </span>
                                <span className="wms-aisle-metric-value">
                                  {aisleSummary.activeLocations} /{" "}
                                  <span style={{ color: "var(--danger)" }}>
                                    {aisleSummary.blockedLocations}
                                  </span>
                                </span>
                              </div>
                              <div className="wms-aisle-metric-item">
                                <span className="wms-aisle-metric-label">
                                  OnHand / ATP
                                </span>
                                <span className="wms-aisle-metric-value">
                                  {aisleSummary.totalOnHand} /{" "}
                                  <span style={{ color: "var(--success)" }}>
                                    {aisleSummary.totalAtp}
                                  </span>
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              className="wms-btn wms-btn-outline wms-btn-sm"
                              style={{ width: "100%", marginTop: "0.25rem" }}
                              onClick={(e) => {
                                e.stopPropagation();
                                void openAisleDetail(
                                  aisleSummary.aisle,
                                  zoneNode.zone,
                                );
                              }}
                            >
                              Ver alzado de pasillo →
                            </button>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* ── VISTA 2: DRILL-DOWN A PASILLO (Alzado Frontal / Planta) ── */}
      {viewMode === "AISLE_DETAIL" && activeAisleDetail && (
        <section className="wms-layout-container">
          {/* Barra de Navegación del Pasillo */}
          <div
            className="wms-card"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              <button
                type="button"
                className="wms-btn wms-btn-outline wms-btn-sm"
                onClick={backToMacro}
              >
                ← Volver al mapa macro
              </button>
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: "1.125rem",
                    fontWeight: 700,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {activeAisleDetail.aisle === SPECIAL_FLOOR_AISLE
                    ? `Planta de Suelo — Zona ${activeAisleDetail.zone}`
                    : `Alzado de Pasillo ${activeAisleDetail.aisle} — Zona ${activeAisleDetail.zone}`}
                </h2>
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "0.75rem",
                    color: "var(--muted)",
                  }}
                >
                  {activeAisleDetail.totalLocations} celdas en total ·{" "}
                  {activeAisleDetail.activeLocations} activas ·{" "}
                  {activeAisleDetail.blockedLocations} bloqueadas · Ocupación:{" "}
                  {activeAisleDetail.occupancyRate}%
                </p>
              </div>
            </div>

            {/* Controles de Vista del Pasillo */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              {/* Selector de Densidad */}
              <nav
                className="wms-tabs"
                role="tablist"
                aria-label="Densidad de celdas"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={cellDensity === "NORMAL"}
                  className={`wms-tab ${
                    cellDensity === "NORMAL" ? "wms-tab-active" : ""
                  }`}
                  onClick={() => setCellDensity("NORMAL")}
                >
                  Normal
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={cellDensity === "COMPACT"}
                  className={`wms-tab ${
                    cellDensity === "COMPACT" ? "wms-tab-active" : ""
                  }`}
                  onClick={() => setCellDensity("COMPACT")}
                >
                  Compacto
                </button>
              </nav>

              {/* Filtro por Estado */}
              <div className="wms-field-inline" style={{ margin: 0 }}>
                <select
                  value={cellFilter}
                  onChange={(e) =>
                    setCellFilter(e.target.value as CellFilter)
                  }
                  style={{ padding: "0.4rem 0.6rem", fontSize: "0.75rem" }}
                >
                  <option value="ALL">Todas las celdas</option>
                  <option value="OCCUPIED">Solo ocupadas</option>
                  <option value="EMPTY">Solo vacías</option>
                  <option value="BLOCKED">Solo bloqueadas</option>
                </select>
              </div>

              <button
                type="button"
                className="wms-btn wms-btn-outline wms-btn-sm"
                onClick={() => toggleSelectAllAisle(activeAisleDetail)}
              >
                🏷️ Seleccionar todas
              </button>
            </div>
          </div>

          {/* Leyenda Visual de los 4 Estados Térmicos */}
          <div className="wms-legend-bar" style={{ marginBottom: "1.25rem" }}>
            <span style={{ fontWeight: 600, color: "var(--muted)" }}>
              Leyenda de Celdas:
            </span>
            <span className="wms-legend-item">
              <span className="wms-legend-swatch wms-cell-empty" />
              <span>Vacía (onHand = 0)</span>
            </span>
            <span className="wms-legend-item">
              <span className="wms-legend-swatch wms-cell-occupied" />
              <span>Ocupada (ATP &gt; 0)</span>
            </span>
            <span className="wms-legend-item">
              <span className="wms-legend-swatch wms-cell-reserved" />
              <span>Reservada 100% (ATP = 0)</span>
            </span>
            <span className="wms-legend-item">
              <span className="wms-legend-swatch wms-cell-blocked" />
              <span>Bloqueada (BLOCKED)</span>
            </span>

            {activeAisleDetail.totalLocations >
            AISLE_CELL_COLLAPSE_THRESHOLD ? (
              <span
                className="wms-tag wms-tag-amber"
                style={{ marginLeft: "auto" }}
              >
                ⚡ Pasillo grande (&gt;200 celdas): Racks colapsados por defecto
              </span>
            ) : null}
          </div>

          {/* Matriz de Racks */}
          <div className="wms-racks-grid">
            {activeAisleDetail.racks.map((rackGroup) => {
              const isExpanded =
                expandedRacks.has(rackGroup.rack) ||
                activeAisleDetail.totalLocations <=
                  AISLE_CELL_COLLAPSE_THRESHOLD;

              const toggleRack = () => {
                setExpandedRacks((prev) => {
                  const next = new Set(prev);
                  if (next.has(rackGroup.rack)) next.delete(rackGroup.rack);
                  else next.add(rackGroup.rack);
                  return next;
                });
              };

              return (
                <div key={rackGroup.rack} className="wms-rack-card">
                  {/* Cabecera del Rack */}
                  <div className="wms-rack-header">
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <button
                        type="button"
                        onClick={toggleRack}
                        className="wms-btn wms-btn-outline wms-btn-sm"
                        style={{
                          padding: "0.2rem 0.5rem",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                      <h3 className="wms-rack-title wms-mono">
                        {rackGroup.storageType === "FLOOR"
                          ? `Bahía ${rackGroup.rack}`
                          : `Rack ${rackGroup.rack}`}
                      </h3>
                      <span className="wms-tag wms-tag-slate">
                        {rackGroup.totalLocations} celdas ·{" "}
                        {rackGroup.occupancyRate}%
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        fontSize: "0.75rem",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      <span>
                        OH: <strong>{rackGroup.totalOnHand}</strong>
                      </span>
                      <span style={{ color: "var(--success)" }}>
                        ATP: <strong>{rackGroup.totalAtp}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={toggleRack}
                        className="wms-btn wms-btn-outline wms-btn-sm"
                      >
                        {isExpanded ? "Colapsar" : "Expandir"}
                      </button>
                    </div>
                  </div>

                  {/* Alzado Frontal / Celdas del Rack */}
                  {isExpanded ? (
                    rackGroup.storageType === "FLOOR" ? (
                      <div className="wms-floor-grid">
                        {rackGroup.levels[0]?.positions
                          .filter((pos) => {
                            if (cellFilter === "OCCUPIED")
                              return pos.onHandQty > 0;
                            if (cellFilter === "EMPTY")
                              return (
                                pos.onHandQty === 0 && pos.status === "ACTIVE"
                              );
                            if (cellFilter === "BLOCKED")
                              return pos.status === "BLOCKED";
                            return true;
                          })
                          .map((cell) => {
                            const isSelected = selectedLocationCodes.has(
                              cell.code,
                            );
                            const cellVisualClass =
                              cell.status === "BLOCKED"
                                ? "wms-cell-blocked"
                                : cell.onHandQty === 0
                                  ? "wms-cell-empty"
                                  : cell.atpQty > 0
                                    ? "wms-cell-occupied"
                                    : "wms-cell-reserved";

                            return (
                              <div
                                key={cell.id}
                                className={`wms-floor-bay-cell ${cellVisualClass} ${
                                  isSelected
                                    ? "wms-floor-bay-cell-selected"
                                    : ""
                                }`}
                                onClick={() => toggleLocationSelect(cell.code)}
                              >
                                <span className="wms-rack-cell-code">
                                  {cell.code}
                                </span>
                                <span className="wms-rack-cell-sub">
                                  OH: {cell.onHandQty} | ATP: {cell.atpQty}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleToggleBlockLocation(
                                      cell.id,
                                      cell.status,
                                    );
                                  }}
                                  className="wms-btn wms-btn-outline wms-btn-sm"
                                  style={{
                                    padding: "0.15rem 0.35rem",
                                    fontSize: "0.625rem",
                                  }}
                                >
                                  {cell.status === "ACTIVE"
                                    ? "Bloquear"
                                    : "Activar"}
                                </button>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="wms-rack-elevation">
                        {rackGroup.levels.map((lvl) => {
                          const filteredPositions = lvl.positions.filter(
                            (pos) => {
                              if (cellFilter === "OCCUPIED")
                                return pos.onHandQty > 0;
                              if (cellFilter === "EMPTY")
                                return (
                                  pos.onHandQty === 0 &&
                                  pos.status === "ACTIVE"
                                );
                              if (cellFilter === "BLOCKED")
                                return pos.status === "BLOCKED";
                              return true;
                            },
                          );

                          if (
                            filteredPositions.length === 0 &&
                            cellFilter !== "ALL"
                          ) {
                            return null;
                          }

                          return (
                            <div
                              key={lvl.level}
                              className="wms-rack-level-row"
                            >
                              <div className="wms-rack-level-label">
                                NIVEL {lvl.level}
                              </div>
                              <div className="wms-rack-positions-row">
                                {filteredPositions.map((cell) => {
                                  const isSelected =
                                    selectedLocationCodes.has(cell.code);
                                  const cellVisualClass =
                                    cell.status === "BLOCKED"
                                      ? "wms-cell-blocked"
                                      : cell.onHandQty === 0
                                        ? "wms-cell-empty"
                                        : cell.atpQty > 0
                                          ? "wms-cell-occupied"
                                          : "wms-cell-reserved";

                                  return (
                                    <div
                                      key={cell.id}
                                      className={`wms-rack-cell ${
                                        cellDensity === "COMPACT"
                                          ? "wms-rack-cell-compact"
                                          : ""
                                      } ${cellVisualClass} ${
                                        isSelected
                                          ? "wms-rack-cell-selected"
                                          : ""
                                      }`}
                                      onClick={() =>
                                        toggleLocationSelect(cell.code)
                                      }
                                      title={`${cell.code} — OH: ${cell.onHandQty}, ATP: ${cell.atpQty}, Estado: ${cell.status}`}
                                    >
                                      <span className="wms-rack-cell-code">
                                        {cell.code}
                                      </span>
                                      <span className="wms-rack-cell-sub">
                                        OH:{cell.onHandQty} ATP:{cell.atpQty}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void handleToggleBlockLocation(
                                            cell.id,
                                            cell.status,
                                          );
                                        }}
                                        className="wms-btn wms-btn-outline wms-btn-sm"
                                        style={{
                                          padding: "0.1rem 0.3rem",
                                          fontSize: "0.5625rem",
                                          marginTop: "0.15rem",
                                        }}
                                      >
                                        {cell.status === "ACTIVE"
                                          ? "Bloq"
                                          : "Act"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : (
                    <div className="wms-rack-summary-collapsed">
                      <span
                        style={{
                          fontSize: "0.8125rem",
                          color: "var(--muted)",
                        }}
                      >
                        Alzado colapsado ({rackGroup.levels.length} niveles,{" "}
                        {rackGroup.totalLocations} celdas)
                      </span>
                      <button
                        type="button"
                        className="wms-btn wms-btn-primary wms-btn-sm"
                        onClick={toggleRack}
                      >
                        Ver alzado frontal
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
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
