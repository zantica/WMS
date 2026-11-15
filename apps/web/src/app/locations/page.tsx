"use client";

// apps/web/src/app/locations/page.tsx
// Topología Física del Almacén, Distribución por Zonas y Mapa de Ubicaciones con Divulgación Progresiva.
//
// ## Design tokens — Warehouse Topology & Physical Locations
// - Estilo: S5 dark-data-dense
// - Paleta (P2): --bg #0B1120 | --surface #111A2E | --surface-card #162238 | --border #23334D | --text #E8EEF6 | --muted #8CA0BA | --accent #38BDF8 | --success #34D399 | --danger #F43F5E
// - Tipografía (T3): DM Sans (cuerpo) + JetBrains Mono (posiciones, métricas y contadores), base 14/20
// - Memorable: KPI strip compacto con telemetría de ocupación en tiempo real y filtrado dinámico por zona física

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import type {
  InventoryBalanceDTO,
  LocationDTO,
  LocationType,
} from "@wms/shared-types";
import { useSupervisorSession } from "../../context/supervisor-session";
import {
  computeTopologySummary,
  groupLocationsByZone,
} from "../../lib/dashboard-metrics";

type ZoneFilter = "ALL" | LocationType;

const ZONE_OPTIONS: readonly { id: ZoneFilter; label: string }[] = [
  { id: "ALL", label: "Todas las zonas" },
  { id: "RECEIVING", label: "Recepción (Muelle)" },
  { id: "STORAGE", label: "Almacenaje (Picking)" },
  { id: "PACKING", label: "Empaque (Packing)" },
  { id: "DISPATCH", label: "Despacho (Salida)" },
] as const;

export default function WarehouseLocationsPage(): JSX.Element {
  const { client, session } = useSupervisorSession();

  // Datos
  const [locations, setLocations] = useState<LocationDTO[]>([]);
  const [balances, setBalances] = useState<InventoryBalanceDTO[]>([]);

  // Estados de carga y mensajes
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtro por zona y divulgación progresiva de alta
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>("ALL");
  const [showCreateLocation, setShowCreateLocation] = useState<boolean>(false);

  // Formulario nueva ubicación
  const [locCode, setLocCode] = useState("");
  const [locType, setLocType] = useState<LocationType>("STORAGE");
  const [locDescription, setLocDescription] = useState("");

  // ── Carga de datos de topología ──────────────────────────────
  const loadTopologyData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [locRes, balRes] = await Promise.all([
        client.listLocations({ warehouseId: session.warehouseId }),
        client.listBalances(),
      ]);
      setLocations(locRes);
      setBalances(balRes);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al cargar la topología física y saldos de ubicación";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [client, session.warehouseId]);

  useEffect(() => {
    void loadTopologyData();
  }, [loadTopologyData]);

  // ── Alta de Ubicación ────────────────────────────────────────
  async function handleCreateLocation(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const created = await client.createLocation({
        warehouseId: session.warehouseId,
        code: locCode.trim().toUpperCase(),
        type: locType,
        ...(locDescription.trim().length > 0
          ? { description: locDescription.trim() }
          : {}),
      });

      setLocations((prev) => [...prev, created]);
      setLocCode("");
      setLocDescription("");
      setShowCreateLocation(false);
      setSuccessMsg(
        `✓ Posición ${created.code} (${created.type}) registrada en ${session.warehouseId}.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo crear la ubicación",
      );
    }
  }

  // Agrupación y métricas
  const summary = computeTopologySummary(locations, balances);
  const allZoneGroups = groupLocationsByZone(locations, balances);
  const visibleGroups =
    zoneFilter === "ALL"
      ? allZoneGroups
      : allZoneGroups.filter((g) => g.zone === zoneFilter);

  return (
    <>
      <div className="wms-page-header">
        <div>
          <div className="wms-eyebrow">
            <span>◆ TOPOLOGÍA FÍSICA Y ZONAS</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
          </div>
          <h1 className="wms-page-title">Mapa de Ubicaciones y Layout Físico</h1>
          <p className="wms-page-subtitle">
            Estructura espacial de posiciones por zona operativa, control de
            ocupación volumétrica y saldos de inventario en vivo (OnHand,
            Reservado y ATP).
          </p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadTopologyData();
          }}
          disabled={loading}
        >
          {loading ? "Sincronizando…" : "Sincronizar ubicaciones"}
        </button>
      </div>

      {errorMsg ? (
        <div className="wms-alert-banner" role="alert" aria-live="assertive">
          <span>
            <strong>⚠ Error:</strong> {errorMsg}
          </span>
        </div>
      ) : null}

      {successMsg ? (
        <div className="wms-success-banner" role="status" aria-live="polite">
          <span>{successMsg}</span>
        </div>
      ) : null}

      {/* ── KPI Strip Compacto de Topología ────────────────────────── */}
      <section className="wms-grid-4" style={{ marginBottom: "1.25rem" }}>
        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Total Ubicaciones</span>
            <span className="wms-tag wms-tag-blue">LAYOUT</span>
          </div>
          <div className="wms-kpi-value">{summary.totalLocations}</div>
          <div className="wms-kpi-foot">
            <span>En almacén {session.warehouseId}</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Ocupadas vs Vacías</span>
            <span className="wms-tag wms-tag-emerald">
              {summary.occupancyRate}%
            </span>
          </div>
          <div className="wms-kpi-value">
            {summary.occupiedLocations}
            <span className="wms-kpi-unit">/ {summary.emptyLocations} vacías</span>
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-text-success">
              {summary.occupiedLocations} con stock
            </span>
            <span>·</span>
            <span className="wms-muted">{summary.emptyLocations} disponibles</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-amber">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Stock OnHand / Res</span>
            <span className="wms-tag wms-tag-amber">BALANCES</span>
          </div>
          <div className="wms-kpi-value">
            {summary.totalOnHand}
            <span className="wms-kpi-unit">uds</span>
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-text-warning">
              {summary.totalAllocated} uds reservadas
            </span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Disponible ATP</span>
            <span className="wms-tag wms-tag-emerald">NETO</span>
          </div>
          <div className="wms-kpi-value wms-text-success">
            {summary.totalAtp}
            <span className="wms-kpi-unit">uds</span>
          </div>
          <div className="wms-kpi-foot">
            <span>OnHand - Reservado contable</span>
          </div>
        </div>
      </section>

      {/* ── Barra de Filtro de Zona y Botón de Alta Colapsable ──────── */}
      <div className="wms-row-between" style={{ marginBottom: "1.25rem" }}>
        <nav
          className="wms-tabs"
          role="tablist"
          aria-label="Filtro de zonas operativas"
        >
          {ZONE_OPTIONS.map((opt) => {
            const count =
              opt.id === "ALL"
                ? locations.length
                : locations.filter((l) => l.type === opt.id).length;
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={zoneFilter === opt.id}
                className={`wms-tab ${
                  zoneFilter === opt.id ? "wms-tab-active" : ""
                }`}
                onClick={() => setZoneFilter(opt.id)}
              >
                <span>{opt.label}</span>
                <span className="wms-tab-badge">{count}</span>
              </button>
            );
          })}
        </nav>

        <div>
          <button
            type="button"
            className={`wms-btn ${
              showCreateLocation ? "wms-btn-secondary" : "wms-btn-emerald"
            }`}
            onClick={() => setShowCreateLocation((prev) => !prev)}
          >
            {showCreateLocation
              ? "✕ Ocultar formulario"
              : "+ Nueva ubicación física"}
          </button>
        </div>
      </div>

      {/* ── Formulario de Alta de Ubicación (Divulgación Progresiva) ── */}
      {showCreateLocation ? (
        <div className="wms-disclosure-box">
          <div className="wms-disclosure-header">
            <h2 className="wms-disclosure-title">
              <span>◆ Alta de nueva posición física en {session.warehouseId}</span>
            </h2>
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              onClick={() => setShowCreateLocation(false)}
            >
              ✕ Cerrar
            </button>
          </div>
          <form onSubmit={(e) => void handleCreateLocation(e)}>
            <div className="wms-grid-3">
              <label className="wms-field">
                <span>Código de posición *</span>
                <input
                  type="text"
                  required
                  value={locCode}
                  onChange={(e) => setLocCode(e.target.value)}
                  placeholder="A-11-01"
                />
              </label>
              <label className="wms-field">
                <span>Zona operativa (LocationType) *</span>
                <select
                  value={locType}
                  onChange={(e) => setLocType(e.target.value as LocationType)}
                >
                  <option value="RECEIVING">RECEIVING (Muelle entrada)</option>
                  <option value="STORAGE">STORAGE (Estantería picking)</option>
                  <option value="PACKING">PACKING (Mesa empaquetado)</option>
                  <option value="DISPATCH">DISPATCH (Muelle salida)</option>
                </select>
              </label>
              <label className="wms-field">
                <span>Descripción de pasillo / nivel</span>
                <input
                  type="text"
                  value={locDescription}
                  onChange={(e) => setLocDescription(e.target.value)}
                  placeholder="Pasillo A · Nivel 1 · Frontal"
                />
              </label>
            </div>
            <div className="wms-form-footer">
              <button
                type="button"
                className="wms-btn wms-btn-outline"
                onClick={() => setShowCreateLocation(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="wms-btn wms-btn-secondary">
                Registrar ubicación
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── Grid de Ubicaciones Agrupadas por Zona ───────────────────── */}
      <section className="wms-card">
        <div className="wms-row-between" style={{ marginBottom: "1rem" }}>
          <div className="wms-card-title" style={{ margin: 0 }}>
            <span>Distribución de posiciones por zona física</span>
            <span className="wms-tag wms-tag-blue">
              {visibleGroups.reduce((acc, g) => acc + g.totalLocations, 0)}{" "}
              posiciones visibles
            </span>
          </div>
        </div>

        <div className="wms-stack">
          {visibleGroups.map((group) => (
            <div key={group.zone} className="wms-zone-block">
              <div className="wms-zone-header">
                <div className="wms-actions-row">
                  <strong>{group.label}</strong>
                  <span className="wms-tag wms-tag-slate wms-mono">
                    {group.zone}
                  </span>
                </div>
                <div className="wms-zone-metrics">
                  <span>
                    Ocupadas: {group.occupiedLocations}/{group.totalLocations}
                  </span>
                  <span>·</span>
                  <span>OnHand: {group.totalOnHand} uds</span>
                  <span>·</span>
                  <span className="wms-text-warning">
                    Reservado: {group.totalAllocated} uds
                  </span>
                  <span>·</span>
                  <strong className="wms-text-success">
                    ATP: {group.totalAtp} uds
                  </strong>
                </div>
              </div>

              {loading && locations.length === 0 ? (
                <span
                  className="wms-skeleton"
                  aria-label={`Cargando zona ${group.zone}`}
                />
              ) : group.locations.length === 0 ? (
                <div className="wms-empty-state">
                  <div className="wms-empty-title">
                    Zona {group.zone} sin ubicaciones configuradas
                  </div>
                  <div className="wms-empty-hint">
                    Pulsa en "+ Nueva ubicación física" para habilitar posiciones
                    en esta zona operativa.
                  </div>
                </div>
              ) : (
                <div className="wms-location-grid">
                  {group.locations.map((node) => (
                    <div
                      key={node.location.id}
                      className={`wms-location-cell ${
                        node.isOccupied ? "wms-location-occupied" : ""
                      }`}
                    >
                      <div className="wms-row-between">
                        <strong className="wms-mono">
                          {node.location.code}
                        </strong>
                        <span
                          className={`wms-tag ${
                            node.isOccupied
                              ? "wms-tag-emerald"
                              : "wms-tag-slate"
                          }`}
                        >
                          {node.isOccupied
                            ? `● ${node.skuCount} SKU(s)`
                            : "○ VACÍA"}
                        </span>
                      </div>
                      <div
                        className="wms-cell-meta"
                        title={node.location.description ?? "Sin descripción"}
                      >
                        {node.location.description ?? "Sin descripción"}
                      </div>
                      <div className="wms-cell-stats">
                        <span>OH: {node.onHandQty}</span>
                        <span className="wms-text-warning">
                          AL: {node.allocatedQty}
                        </span>
                        <strong className="wms-text-success">
                          ATP: {node.atpQty}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
