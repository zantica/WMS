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
import { useTranslation } from "../../context/locale-context";
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
  const { t, formatNumber } = useTranslation();
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
      setSuccessMsg(`✓ ${res.message}`);
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
  const hasActiveFilters =
    reasonFilter !== "ALL" || searchQuery.trim().length > 0;

  return (
    <>
      <div className="wms-page-header">
        <div>
          <div className="wms-eyebrow">
            <span>{t("web.inventory.eyebrow")}</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
          </div>
          <h1 className="wms-page-title">{t("web.inventory.pageTitle")}</h1>
          <p className="wms-page-subtitle">{t("web.inventory.pageSubtitle")}</p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadInventoryData();
          }}
          disabled={loading}
        >
          {loading
            ? t("web.inventory.syncingBtn")
            : t("web.inventory.syncBtn")}
        </button>
      </div>

      {errorMsg ? (
        <div className="wms-alert-banner" role="alert" aria-live="assertive">
          <span>
            <strong>⚠ Error de inventario:</strong> {errorMsg}
          </span>
        </div>
      ) : null}

      {successMsg ? (
        <div className="wms-success-banner" role="status" aria-live="polite">
          <span>{successMsg}</span>
        </div>
      ) : null}

      <section className="wms-grid-4" aria-label="Métricas de saldos contables">
        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.inventory.kpiOnHand")}</span>
            <span className="wms-tag wms-tag-slate">{t("web.overview.tagPhysical")}</span>
          </div>
          <div className="wms-kpi-value">
            {formatNumber(kpis.totalOnHand)}
            <span className="wms-kpi-unit">{t("web.overview.units")}</span>
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">
              {kpis.uniqueProductsWithStock} SKUs
            </span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-amber">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.inventory.kpiAllocated")}</span>
            <span className="wms-tag wms-tag-amber">{t("web.overview.tagReserved")}</span>
          </div>
          <div className="wms-kpi-value wms-text-warning">
            {formatNumber(kpis.totalAllocated)}
            <span className="wms-kpi-unit">{t("web.overview.units")}</span>
          </div>
          <div className="wms-kpi-foot">
            <span>ALLOCATED / PICKING</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.inventory.kpiAtp")}</span>
            <span className="wms-tag wms-tag-emerald">✓ ATP</span>
          </div>
          <div className="wms-kpi-value wms-text-success">
            {formatNumber(kpis.totalAtp)}
            <span className="wms-kpi-unit">{t("web.overview.units")}</span>
          </div>
          <div className="wms-kpi-foot">
            <span>{t("domain.available")}</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.inventory.kpiRatio")}</span>
            <span className="wms-tag wms-tag-blue">RATIO</span>
          </div>
          <div className="wms-kpi-value wms-text-accent">
            {kpis.utilizationRate}%
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">
              En {kpis.uniqueLocationsWithStock} ubicaciones ocupadas
            </span>
          </div>
        </div>
      </section>

      <section className="wms-grid-2">
        <div className="wms-card">
          <div className="wms-card-title">
            <span>{t("web.inventory.liveBalancesTitle")}</span>
            <span className="wms-tag wms-tag-emerald">
              {t("web.inventory.recordsCount", { count: balances.length })}
            </span>
          </div>
          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>{t("web.inventory.locationCol")}</th>
                  <th>{t("web.inventory.skuCol")}</th>
                  <th>{t("web.inventory.productCol")}</th>
                  <th className="wms-num">{t("web.inventory.onHandCol")}</th>
                  <th className="wms-num">{t("web.inventory.allocatedCol")}</th>
                  <th className="wms-num">{t("web.inventory.atpCol")}</th>
                </tr>
              </thead>
              <tbody>
                {loading && balances.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <span
                        className="wms-skeleton"
                        aria-label="Cargando saldos de inventario"
                      />
                    </td>
                  </tr>
                ) : balances.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="wms-empty-state">
                        <div className="wms-empty-title">
                          Sin saldos positivos en inventario
                        </div>
                        <div className="wms-empty-hint">
                          Ejecuta un ajuste positivo o registra una entrada de
                          mercancía para generar saldos en este almacén.
                        </div>
                      </div>
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
                      <td className="wms-num">{b.onHandQty}</td>
                      <td className="wms-num wms-text-warning">
                        {b.allocatedQty}
                      </td>
                      <td className="wms-num">
                        <strong className="wms-text-success">{b.atpQty}</strong>
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
            <span>{t("web.inventory.adjFormTitle")}</span>
            <span className="wms-tag wms-tag-amber">Serializable + Lock</span>
          </div>
          <p className="wms-page-subtitle">
            <code>inventory_transactions</code> · <code>onHandQty</code>
          </p>
          <div className="wms-grid-2">
            <label className="wms-field">
              <span>{t("web.inventory.destLocationLabel")}</span>
              <select
                required
                value={adjLocationId}
                onChange={(e) => setAdjLocationId(e.target.value)}
              >
                <option value="">{t("web.inventory.selectLocation")}</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.code} ({loc.type})
                  </option>
                ))}
              </select>
            </label>

            <label className="wms-field">
              <span>{t("web.inventory.affectedProductLabel")}</span>
              <select
                required
                value={adjProductId}
                onChange={(e) => setAdjProductId(e.target.value)}
              >
                <option value="">{t("web.inventory.selectProduct")}</option>
                {products.map((prod) => (
                  <option key={prod.id} value={prod.id}>
                    {prod.sku} — {prod.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="wms-field">
              <span>{t("web.inventory.qtyDeltaLabel")}</span>
              <input
                type="number"
                required
                value={adjDelta}
                onChange={(e) => setAdjDelta(e.target.value)}
                placeholder="Ej: 5 o -2"
              />
            </label>

            <label className="wms-field">
              <span>{t("web.inventory.auditNotesLabel")}</span>
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
          <div className="wms-form-footer">
            <button type="submit" className="wms-btn wms-btn-emerald">
              {t("web.inventory.submitAdjBtn")}
            </button>
          </div>
        </form>
      </section>

      <section className="wms-card">
        <div className="wms-card-title">
          <span>{t("web.inventory.kardexTitle")}</span>
          <span className="wms-tag wms-tag-blue">
            {pagination.page} / {pagination.pages} ({pagination.total})
          </span>
        </div>

        <div className="wms-filter-bar">
          <label className="wms-field">
            <span>{t("web.inventory.filterReasonLabel")}</span>
            <select
              value={reasonFilter}
              onChange={(e) => {
                setReasonFilter(e.target.value as TxReason | "ALL");
                setPage(1);
              }}
            >
              {TX_REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r === "ALL" ? t("web.inventory.allReasons") : r}
                </option>
              ))}
            </select>
          </label>

          <label className="wms-field">
            <span>{t("web.inventory.searchLabel")}</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="PROD-001, A-01-01…"
            />
          </label>

          <div className="wms-actions-row">
            <button
              type="button"
              className="wms-btn wms-btn-outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("web.inventory.prevBtn")}
            </button>
            <button
              type="button"
              className="wms-btn wms-btn-outline"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("web.inventory.nextBtn")}
            </button>
          </div>
        </div>

        {hasActiveFilters ? (
          <div className="wms-active-filters" aria-live="polite">
            <span>{t("web.inventory.activeFilters")}</span>
            {reasonFilter !== "ALL" ? (
              <span className="wms-filter-chip">Motivo: {reasonFilter}</span>
            ) : null}
            {searchQuery.trim().length > 0 ? (
              <span className="wms-filter-chip">
                Texto: &ldquo;{searchQuery.trim()}&rdquo;
              </span>
            ) : null}
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              onClick={() => {
                setReasonFilter("ALL");
                setSearchQuery("");
                setPage(1);
              }}
            >
              Limpiar filtros
            </button>
          </div>
        ) : null}

        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>Fecha (UTC)</th>
                <th>Motivo (TxReason)</th>
                <th>SKU / Producto</th>
                <th>Origen → Destino</th>
                <th className="wms-num">Cantidad (uds)</th>
                <th>Referencia y notas</th>
              </tr>
            </thead>
            <tbody>
              {loading && visibleTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <span
                      className="wms-skeleton"
                      aria-label="Cargando movimientos del Kardex"
                    />
                  </td>
                </tr>
              ) : visibleTransactions.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="wms-empty-state">
                      <div className="wms-empty-title">
                        Sin movimientos coincidentes en el Kardex
                      </div>
                      <div className="wms-empty-hint">
                        {hasActiveFilters
                          ? "Prueba a limpiar los filtros de motivo o búsqueda para inspeccionar todo el historial."
                          : "Aún no existen transacciones contables registradas para este almacén."}
                      </div>
                    </div>
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
                    <td className="wms-num">
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
