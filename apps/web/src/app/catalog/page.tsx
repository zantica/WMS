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
      setSuccessMsg(`Producto ${created.sku} creado correctamente.`);
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
        `Ubicación ${created.code} (${created.type}) registrada en ${session.warehouseId}.`,
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
          <h1 className="wms-page-title">
            Catálogo de Productos & Mapa de Ubicaciones
          </h1>
          <p className="wms-page-subtitle">
            Topología física del almacén ({session.warehouseId}) ordenada por
            flujo operativo: RECEIVING → STORAGE → PACKING → DISPATCH.
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
          {loading ? "Cargando…" : "Refrescar Topología"}
        </button>
      </div>

      {errorMsg ? <div className="wms-alert-banner">{errorMsg}</div> : null}
      {successMsg ? (
        <div className="wms-success-banner">{successMsg}</div>
      ) : null}

      <section className="wms-card">
        <div className="wms-card-title">
          <span>Mapa de Ubicaciones en Vivo por Zona Operativa</span>
          <span className="wms-tag wms-tag-blue">
            {locations.length} ubicaciones registradas
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {zoneGroups.map((group) => (
            <div key={group.zone}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.6rem",
                }}
              >
                <div>
                  <strong>{group.label}</strong>{" "}
                  <span className="wms-tag wms-tag-slate wms-mono">
                    {group.zone}
                  </span>
                </div>
                <span className="wms-muted" style={{ fontSize: "0.82rem" }}>
                  Ocupadas: {group.occupiedLocations}/{group.totalLocations} ·
                  OnHand: {group.totalOnHand} · Reservado:{" "}
                  {group.totalAllocated} · ATP: {group.totalAtp}
                </span>
              </div>

              {group.locations.length === 0 ? (
                <div className="wms-muted" style={{ fontSize: "0.84rem" }}>
                  Sin ubicaciones configuradas en la zona {group.zone}.
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
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
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
                            ? `${node.skuCount} SKU(s)`
                            : "VACÍA"}
                        </span>
                      </div>
                      <div
                        className="wms-muted"
                        style={{ fontSize: "0.76rem", marginTop: "0.25rem" }}
                      >
                        {node.location.description ?? "Sin descripción"}
                      </div>
                      <div
                        style={{
                          marginTop: "0.55rem",
                          fontSize: "0.78rem",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>OnHand: {node.onHandQty}</span>
                        <span>Alloc: {node.allocatedQty}</span>
                        <strong style={{ color: "#34d399" }}>
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
          <h2 className="wms-card-title">Alta de Producto en Catálogo</h2>
          <div className="wms-grid-2">
            <label className="wms-field">
              <span>SKU *</span>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="PROD-010"
              />
            </label>
            <label className="wms-field">
              <span>Nombre del Producto *</span>
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Auriculares Bluetooth Pro"
              />
            </label>
            <label className="wms-field">
              <span>Código de Barras (EAN / QR)</span>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="8410376000999"
              />
            </label>
            <label className="wms-field">
              <span>Peso (gramos)</span>
              <input
                type="number"
                min={1}
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                placeholder="350"
              />
            </label>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="wms-btn wms-btn-emerald">
              Crear Producto
            </button>
          </div>
        </form>

        <form
          className="wms-card"
          onSubmit={(e) => void handleCreateLocation(e)}
        >
          <h2 className="wms-card-title">Alta de Ubicación Física</h2>
          <div className="wms-grid-2">
            <label className="wms-field">
              <span>Código de Ubicación *</span>
              <input
                type="text"
                required
                value={locCode}
                onChange={(e) => setLocCode(e.target.value)}
                placeholder="A-11-01"
              />
            </label>
            <label className="wms-field">
              <span>Zona (`LocationType`) *</span>
              <select
                value={locType}
                onChange={(e) => setLocType(e.target.value as LocationType)}
              >
                <option value="RECEIVING">RECEIVING (Muelle Entrada)</option>
                <option value="STORAGE">STORAGE (Estantería Picking)</option>
                <option value="PACKING">PACKING (Mesa Empaquetado)</option>
                <option value="DISPATCH">DISPATCH (Muelle Salida)</option>
              </select>
            </label>
            <label className="wms-field" style={{ gridColumn: "1 / -1" }}>
              <span>Descripción</span>
              <input
                type="text"
                value={locDescription}
                onChange={(e) => setLocDescription(e.target.value)}
                placeholder="Pasillo A nivel 1"
              />
            </label>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="wms-btn wms-btn-primary">
              Crear Ubicación
            </button>
          </div>
        </form>
      </section>

      <section className="wms-card">
        <div className="wms-card-title">
          <span>Catálogo Maestro de Productos ({products.length})</span>
        </div>
        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Barcode</th>
                <th>Peso (g)</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="wms-muted">
                    No hay productos registrados en este tenant.
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
                    <td>{prod.weightGrams ?? "—"}</td>
                    <td>
                      <span
                        className={`wms-tag ${
                          prod.isActive ? "wms-tag-emerald" : "wms-tag-slate"
                        }`}
                      >
                        {prod.isActive ? "ACTIVO" : "INACTIVO"}
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
