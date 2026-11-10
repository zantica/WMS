"use client";

// apps/web/src/app/catalog/page.tsx
// Vista de Catálogo de Productos y Mapa de Ubicaciones por Zona (RECEIVING -> STORAGE -> PACKING -> DISPATCH).

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
  ProductDTO,
} from "@wms/shared-types";
import { useSupervisorSession } from "../../context/supervisor-session";
import { groupLocationsByZone } from "../../lib/dashboard-metrics";

export default function CatalogAndLocationsPage(): JSX.Element {
  const { client, session } = useSupervisorSession();
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [locations, setLocations] = useState<LocationDTO[]>([]);
  const [balances, setBalances] = useState<InventoryBalanceDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulario nuevo producto
  const [sku, setSku] = useState("");
  const [productName, setProductName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [weightGrams, setWeightGrams] = useState("");

  // Formulario nueva ubicación
  const [locCode, setLocCode] = useState("");
  const [locType, setLocType] = useState<LocationType>("STORAGE");
  const [locDescription, setLocDescription] = useState("");

  const loadCatalogData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [prodRes, locRes, balRes] = await Promise.all([
        client.listProducts(),
        client.listLocations({ warehouseId: session.warehouseId }),
        client.listBalances(),
      ]);
      setProducts(prodRes);
      setLocations(locRes);
      setBalances(balRes);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al cargar catálogo y ubicaciones";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [client, session.warehouseId]);

  useEffect(() => {
    void loadCatalogData();
  }, [loadCatalogData]);

  async function handleCreateProduct(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const parsedWeight = Number(weightGrams);
      const created = await client.createProduct({
        sku: sku.trim(),
        name: productName.trim(),
        ...(barcode.trim().length > 0 ? { barcode: barcode.trim() } : {}),
        ...(Number.isFinite(parsedWeight) && parsedWeight > 0
          ? { weightGrams: parsedWeight }
          : {}),
      });
      setProducts((prev) => [...prev, created]);
      setSku("");
      setProductName("");
      setBarcode("");
      setWeightGrams("");
      setSuccessMsg(`✓ Producto ${created.sku} registrado en el catálogo.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo crear el producto",
      );
    }
  }

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
      setSuccessMsg(
        `✓ Ubicación ${created.code} (${created.type}) registrada en ${session.warehouseId}.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo crear la ubicación",
      );
    }
  }

  const zoneGroups = groupLocationsByZone(locations, balances);

  return (
    <>
      <div className="wms-page-header">
        <div>
          <div className="wms-eyebrow">
            <span>◆ TOPOLOGÍA FÍSICA</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
          </div>
          <h1 className="wms-page-title">
            Catálogo de productos y mapa de ubicaciones
          </h1>
          <p className="wms-page-subtitle">
            Distribución espacial del almacén ordenada por flujo físico:
            RECEIVING → STORAGE → PACKING → DISPATCH.
          </p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadCatalogData();
          }}
          disabled={loading}
        >
          {loading ? "Sincronizando topología…" : "Sincronizar topología"}
        </button>
      </div>

      {errorMsg ? (
        <div className="wms-alert-banner" role="alert" aria-live="assertive">
          <span>
            <strong>⚠ Error en catálogo:</strong> {errorMsg}
          </span>
        </div>
      ) : null}

      {successMsg ? (
        <div className="wms-success-banner" role="status" aria-live="polite">
          <span>{successMsg}</span>
        </div>
      ) : null}

      <section className="wms-card">
        <div className="wms-card-title">
          <span>Mapa de ubicaciones por zona operativa</span>
          <span className="wms-tag wms-tag-blue">
            {locations.length} ubicaciones registradas
          </span>
        </div>

        <div className="wms-stack">
          {zoneGroups.map((group) => (
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
                    Utiliza el formulario de alta de ubicación física para
                    habilitar posiciones en esta zona operativa.
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

      <section className="wms-grid-2">
        <form className="wms-card" onSubmit={(e) => void handleCreateProduct(e)}>
          <h2 className="wms-card-title">Alta de producto en catálogo</h2>
          <div className="wms-grid-2">
            <label className="wms-field">
              <span>Código SKU *</span>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="PROD-010"
              />
            </label>
            <label className="wms-field">
              <span>Nombre descriptivo *</span>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Auriculares Bluetooth Pro"
              />
            </label>
            <label className="wms-field">
              <span>Código de barras (EAN / QR)</span>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="8410376000999"
              />
            </label>
            <label className="wms-field">
              <span>Peso unitario (gramos)</span>
              <input
                type="number"
                min={1}
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                placeholder="350"
              />
            </label>
          </div>
          <div className="wms-form-footer">
            <button type="submit" className="wms-btn wms-btn-emerald">
              Registrar producto
            </button>
          </div>
        </form>

        <form
          className="wms-card"
          onSubmit={(e) => void handleCreateLocation(e)}
        >
          <h2 className="wms-card-title">Alta de ubicación física</h2>
          <div className="wms-grid-2">
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
            <label className="wms-field wms-field-full">
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
            <button type="submit" className="wms-btn wms-btn-secondary">
              Registrar ubicación
            </button>
          </div>
        </form>
      </section>

      <section className="wms-card">
        <div className="wms-card-title">
          <span>Catálogo maestro de productos</span>
          <span className="wms-tag wms-tag-slate">
            {products.length} referencias
          </span>
        </div>
        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre del producto</th>
                <th>Código de barras</th>
                <th className="wms-num">Peso (g)</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <span
                      className="wms-skeleton"
                      aria-label="Cargando catálogo de productos"
                    />
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="wms-empty-state">
                      <div className="wms-empty-title">
                        Catálogo vacío en este tenant
                      </div>
                      <div className="wms-empty-hint">
                        Registra tu primer SKU mediante el formulario de alta de
                        producto para habilitar recepciones y pedidos.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((prod) => (
                  <tr key={prod.id}>
                    <td className="wms-mono">
                      <strong>{prod.sku}</strong>
                    </td>
                    <td>{prod.name}</td>
                    <td className="wms-mono wms-muted">
                      {prod.barcode ?? "—"}
                    </td>
                    <td className="wms-num">
                      {prod.weightGrams ? `${prod.weightGrams} g` : "—"}
                    </td>
                    <td>
                      <span
                        className={`wms-tag ${
                          prod.isActive ? "wms-tag-emerald" : "wms-tag-slate"
                        }`}
                      >
                        {prod.isActive ? "● ACTIVO" : "○ INACTIVO"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
