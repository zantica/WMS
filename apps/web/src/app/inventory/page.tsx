"use client";

// apps/web/src/app/inventory/page.tsx
// Vista de Balances de Inventario (OnHand vs Allocated vs ATP), Ajustes Manuales y Libro Mayor Inmutable (Kardex).

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
  ProductDTO,
  TxReason,
} from "@wms/shared-types";
import { useSupervisorSession } from "../../context/supervisor-session";
import type {
  KardexPagination,
  KardexTransactionItem,
} from "../../lib/api-client";
import {
  computeInventoryKpis,
  filterKardexTransactions,
} from "../../lib/dashboard-metrics";

const TX_REASON_OPTIONS: readonly (TxReason | "ALL")[] = [
  "ALL",
  "INBOUND_RECEIPT",
  "PUTAWAY",
  "ALLOCATION",
  "ALLOCATION_CANCEL",
  "PICK",
  "OUTBOUND_SHIPMENT",
  "ADJUSTMENT",
  "RETURN_INBOUND",
] as const;

export default function InventoryAndKardexPage(): JSX.Element {
  const { client, session } = useSupervisorSession();
  const [balances, setBalances] = useState<InventoryBalanceDTO[]>([]);
  const [transactions, setTransactions] = useState<KardexTransactionItem[]>([]);
  const [pagination, setPagination] = useState<KardexPagination>({
    page: 1,
    limit: 50,
    total: 0,
    pages: 1,
  });
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [locations, setLocations] = useState<LocationDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtros del Kardex
  const [reasonFilter, setReasonFilter] = useState<TxReason | "ALL">("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  // Formulario de Ajuste Manual (ADJUSTMENT)
  const [adjLocationId, setAdjLocationId] = useState<string>("");
  const [adjProductId, setAdjProductId] = useState<string>("");
  const [adjDelta, setAdjDelta] = useState<string>("1");
  const [adjNotes, setAdjNotes] = useState<string>("");

  const loadInventoryData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [balRes, txRes, prodRes, locRes] = await Promise.all([
        client.listBalances(),
        client.listTransactions({
          page,
          limit: 50,
          ...(reasonFilter !== "ALL" ? { reason: reasonFilter } : {}),
        }),
        client.listProducts(),
        client.listLocations({ warehouseId: session.warehouseId }),
      ]);
      setBalances(balRes);
      setTransactions(txRes.data);
      setPagination(txRes.pagination);
      setProducts(prodRes);
      setLocations(locRes);

      if (!adjLocationId && locRes[0]) {
        setAdjLocationId(locRes[0].id);
      }
      if (!adjProductId && prodRes[0]) {
        setAdjProductId(prodRes[0].id);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "No se pudo consultar el inventario y el Ledger",
      );
    } finally {
      setLoading(false);
    }
  }, [
    client,
    page,
    reasonFilter,
    session.warehouseId,
    adjLocationId,
    adjProductId,
  ]);

  useEffect(() => {
    void loadInventoryData();
  }, [loadInventoryData]);

  async function handleCreateAdjustment(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const deltaNum = Number(adjDelta);
    if (!Number.isFinite(deltaNum) || deltaNum === 0) {
      setErrorMsg("El delta de ajuste debe ser un número distinto de cero.");
      return;
    }

    try {
      const res = await client.createAdjustment({
        locationId: adjLocationId,
        productId: adjProductId,
        quantityDelta: deltaNum,
        notes: adjNotes.trim(),
      });
      setSuccessMsg(res.message);
      setAdjNotes("");
      await loadInventoryData();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Error al registrar el ajuste en el Ledger",
      );
    }
  }

  const kpis = computeInventoryKpis(balances);
  const visibleTransactions = filterKardexTransactions(transactions, {
    reason: reasonFilter,
    search: searchQuery,
  });

  return (
    <>
      <div className="wms-page-header">
        <div>
          <h1 className="wms-page-title">
            Saldos de Inventario & Libro Mayor Inmutable (Kardex)
          </h1>
          <p className="wms-page-subtitle">
            Auditoría contable append-only (`InventoryTransaction`) y snapshots
            en vivo (`InventoryBalance`: OnHand − Allocated = ATP).
          </p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadInventoryData();
          }}
          disabled={loading}
        >
          {loading ? "Sincronizando…" : "Actualizar Saldos & Kardex"}
        </button>
      </div>

      {errorMsg ? <div className="wms-alert-banner">{errorMsg}</div> : null}
      {successMsg ? (
        <div className="wms-success-banner">{successMsg}</div>
      ) : null}

      <section className="wms-grid-4">
        <div className="wms-card">
          <div className="wms-kpi-label">Total OnHand (Físico)</div>
          <div className="wms-kpi-value">{kpis.totalOnHand}</div>
          <div className="wms-kpi-foot">
            {kpis.uniqueProductsWithStock} productos con stock
          </div>
        </div>
        <div className="wms-card">
          <div className="wms-kpi-label">Total Allocated (Reservado)</div>
          <div className="wms-kpi-value" style={{ color: "#fbbf24" }}>
            {kpis.totalAllocated}
          </div>
          <div className="wms-kpi-foot">
            Comprometido en pedidos ALLOCATED / PICKING
          </div>
        </div>
        <div className="wms-card">
          <div className="wms-kpi-label">Available To Promise (ATP)</div>
          <div className="wms-kpi-value" style={{ color: "#34d399" }}>
            {kpis.totalAtp}
          </div>
          <div className="wms-kpi-foot">Disponible para nuevas reservas</div>
        </div>
        <div className="wms-card">
          <div className="wms-kpi-label">Tasa de Compromiso</div>
          <div className="wms-kpi-value" style={{ color: "#38bdf8" }}>
            {kpis.utilizationRate}%
          </div>
          <div className="wms-kpi-foot">
            En {kpis.uniqueLocationsWithStock} ubicaciones ocupadas
          </div>
        </div>
      </section>

      <section className="wms-grid-2">
        <div className="wms-card">
          <div className="wms-card-title">
            <span>Saldos en Vivo (`InventoryBalance`)</span>
            <span className="wms-tag wms-tag-emerald">
              {balances.length} registros
            </span>
          </div>
          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>Ubicación</th>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>OnHand</th>
                  <th>Allocated</th>
                  <th>ATP</th>
                </tr>
              </thead>
              <tbody>
                {balances.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="wms-muted">
                      No hay saldos positivos registrados.
                    </td>
                  </tr>
                ) : (
                  balances.map((b) => (
                    <tr key={`${b.locationId}-${b.productId}`}>
                      <td className="wms-mono">
                        <strong>{b.locationCode}</strong>
                      </td>
                      <td className="wms-mono">{b.productSku}</td>
                      <td>{b.productName}</td>
                      <td>{b.onHandQty}</td>
                      <td style={{ color: "#fbbf24" }}>{b.allocatedQty}</td>
                      <td>
                        <strong style={{ color: "#34d399" }}>{b.atpQty}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form
          className="wms-card"
          onSubmit={(e) => void handleCreateAdjustment(e)}
        >
          <div className="wms-card-title">
            <span>Registrar Ajuste Contable (`ADJUSTMENT`)</span>
            <span className="wms-tag wms-tag-amber">Serializable + Lock</span>
          </div>
          <p className="wms-muted" style={{ fontSize: "0.83rem", marginTop: 0 }}>
            Genera una transacción inmutable en <code>inventory_transactions</code>{" "}
            y actualiza atómicamente <code>onHandQty</code>.
          </p>
          <div className="wms-grid-2">
            <label className="wms-field">
              <span>Ubicación *</span>
              <select
                required
                value={adjLocationId}
                onChange={(e) => setAdjLocationId(e.target.value)}
              >
                <option value="">Seleccionar ubicación…</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} ({loc.type})
                  </option>
                ))}
              </select>
            </label>

            <label className="wms-field">
              <span>Producto *</span>
              <select
                required
                value={adjProductId}
                onChange={(e) => setAdjProductId(e.target.value)}
              >
                <option value="">Seleccionar producto…</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.sku} — {prod.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="wms-field">
              <span>Delta de Cantidad (+ añade, − descuenta) *</span>
              <input
                type="number"
                required
                value={adjDelta}
                onChange={(e) => setAdjDelta(e.target.value)}
                placeholder="Ej: 5 o -2"
              />
            </label>

            <label className="wms-field">
              <span>Motivo / Auditoría (mín. 5 caracteres) *</span>
              <input
                type="text"
                required
                minLength={5}
                value={adjNotes}
                onChange={(e) => setAdjNotes(e.target.value)}
                placeholder="Recuento cíclico pasillo A"
              />
            </label>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="wms-btn wms-btn-emerald">
              Ejecutar Ajuste en Ledger
            </button>
          </div>
        </form>
      </section>

      <section className="wms-card">
        <div className="wms-card-title">
          <span>Libro Mayor Inmutable (Kardex de Transacciones)</span>
          <span className="wms-tag wms-tag-blue">
            Página {pagination.page} de {pagination.pages} ({pagination.total}{" "}
            movimientos)
          </span>
        </div>

        <div
          className="wms-grid-4"
          style={{ marginBottom: "1rem", alignItems: "end" }}
        >
          <label className="wms-field">
            <span>Filtrar por Motivo (`TxReason`)</span>
            <select
              value={reasonFilter}
              onChange={(e) => {
                setReasonFilter(e.target.value as TxReason | "ALL");
                setPage(1);
              }}
            >
              {TX_REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r === "ALL" ? "TODOS LOS MOTIVOS" : r}
                </option>
              ))}
            </select>
          </label>

          <label className="wms-field" style={{ gridColumn: "span 2" }}>
            <span>Búsqueda Rápida (SKU, ubicación, referencia, notas)</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ej: PROD-001, A-01-01, ALLOCATION_CANCEL…"
            />
          </label>

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="wms-btn wms-btn-outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Anterior
            </button>
            <button
              type="button"
              className="wms-btn wms-btn-outline"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente →
            </button>
          </div>
        </div>

        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>Fecha (ISO)</th>
                <th>Motivo (`TxReason`)</th>
                <th>SKU / Producto</th>
                <th>Origen → Destino</th>
                <th>Cantidad</th>
                <th>Ref / Notas</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="wms-muted">
                    No se encontraron movimientos en el Kardex con los filtros
                    actuales.
                  </td>
                </tr>
              ) : (
                visibleTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="wms-mono wms-muted">
                      {tx.createdAt.slice(0, 19).replace("T", " ")}
                    </td>
                    <td>
                      <span className="wms-tag wms-tag-blue wms-mono">
                        {tx.reason}
                      </span>
                    </td>
                    <td>
                      <strong className="wms-mono">{tx.productSku}</strong> ·{" "}
                      <span className="wms-muted">{tx.productName}</span>
                    </td>
                    <td className="wms-mono">
                      {tx.fromLocation ?? "EXT"} → {tx.toLocation ?? "EXT"}
                    </td>
                    <td>
                      <strong>{tx.quantity}</strong>
                    </td>
                    <td className="wms-muted">
                      {tx.referenceId ? (
                        <span className="wms-mono">[{tx.referenceId}] </span>
                      ) : null}
                      {tx.notes ?? "—"}
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
