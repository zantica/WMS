// apps/web/src/pages/overview-page.tsx
// Vista principal del Dashboard de Supervisores: HUD contable (OnHand − Allocated = ATP), pipeline de pedidos y últimos movimientos del Ledger.

import { Link } from "react-router-dom";
import { useCallback, useEffect, useState, type JSX } from "react";
import type {
  InventoryBalanceDTO,
  SalesOrderDTO,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import { useSupervisorSession } from "../context/supervisor-session";
import { useTranslation } from "../context/locale-context";
import type { KardexTransactionItem } from "../lib/api-client";
import {
  computeInventoryKpis,
  resolveOrderStatusVisual,
  summarizeOrdersByStatus,
  summarizeTasksMonitor,
} from "../lib/dashboard-metrics";

export default function SupervisorOverviewPage(): JSX.Element {
  const { client, session } = useSupervisorSession();
  const { locale, t, formatNumber } = useTranslation();
  const [balances, setBalances] = useState<InventoryBalanceDTO[]>([]);
  const [orders, setOrders] = useState<SalesOrderDTO[]>([]);
  const [tasks, setTasks] = useState<WarehouseTaskDTO[]>([]);
  const [recentTx, setRecentTx] = useState<KardexTransactionItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [balRes, ordRes, taskRes, txRes] = await Promise.all([
        client.listBalances(),
        client.listOrders(),
        client.listTasks(),
        client.listTransactions({ page: 1, limit: 8 }),
      ]);
      setBalances(balRes);
      setOrders(ordRes);
      setTasks(taskRes);
      setRecentTx(txRes.data);
      setLastSyncedAt(new Date().toISOString().slice(11, 19));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No se pudo sincronizar el resumen del almacén";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const inventoryKpis = computeInventoryKpis(balances);
  const ordersSummary = summarizeOrdersByStatus(orders);
  const tasksSummary = summarizeTasksMonitor(tasks);
  const hasOperationalAlerts =
    ordersSummary.onHoldOrders.length > 0 ||
    tasksSummary.tasksWithExceptions.length > 0;

  return (
    <>
      <div className="wms-page-header">
        <div>
          <div className="wms-eyebrow">
            <span>● TELEMETRÍA EN VIVO</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
            {lastSyncedAt ? (
              <>
                <span>·</span>
                <span>SYNC {lastSyncedAt} UTC</span>
              </>
            ) : null}
          </div>
          <h1 className="wms-page-title">{t("web.overview.pageTitle")}</h1>
          <p className="wms-page-subtitle">{t("web.overview.pageSubtitle")}</p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadOverview();
          }}
          disabled={loading}
        >
          {loading ? t("web.overview.syncingBtn") : t("web.overview.syncBtn")}
        </button>
      </div>

      {errorMsg ? (
        <div className="wms-alert-banner" role="alert" aria-live="assertive">
          <div>
            <strong>⚠ {t("web.overview.apiSyncError")}</strong> {errorMsg}.
          </div>
          <button
            type="button"
            className="wms-btn wms-btn-outline wms-btn-sm"
            onClick={() => {
              void loadOverview();
            }}
          >
            {t("web.overview.retryNow")}
          </button>
        </div>
      ) : null}

      {/* Elemento memorable: HUD de Métricas Contables con iluminación perimetral */}
      <section className="wms-grid-4" aria-label={t("web.overview.pageTitle")}>
        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.overview.kpiOnHand")}</span>
            <span className="wms-tag wms-tag-slate">{t("web.overview.tagPhysical")}</span>
          </div>
          <div className="wms-kpi-value">
            {loading && balances.length === 0 ? (
              <span className="wms-skeleton" aria-label={t("common.loading")} />
            ) : (
              <>
                {formatNumber(inventoryKpis.totalOnHand)}
                <span className="wms-kpi-unit">{t("web.overview.units")}</span>
              </>
            )}
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">
              {inventoryKpis.uniqueProductsWithStock} SKUs
            </span>
            <span>·</span>
            <span className="wms-mono">
              {inventoryKpis.uniqueLocationsWithStock} {t("web.overview.activeLocations")}
            </span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-amber">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.overview.kpiAllocated")}</span>
            <span className="wms-tag wms-tag-amber">{t("web.overview.tagReserved")}</span>
          </div>
          <div className="wms-kpi-value wms-text-warning">
            {loading && balances.length === 0 ? (
              <span className="wms-skeleton" aria-label={t("common.loading")} />
            ) : (
              <>
                {formatNumber(inventoryKpis.totalAllocated)}
                <span className="wms-kpi-unit">{t("web.overview.units")}</span>
              </>
            )}
          </div>
          <div className="wms-kpi-foot">
            <span>{t("web.overview.commitmentRate")}</span>
            <strong className="wms-mono wms-text-primary">
              {inventoryKpis.utilizationRate}%
            </strong>
            <span>{t("web.overview.ofOnHand")}</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.overview.kpiAtp")}</span>
            <span className="wms-tag wms-tag-emerald">{t("web.overview.tagPromisable")}</span>
          </div>
          <div className="wms-kpi-value wms-text-success">
            {loading && balances.length === 0 ? (
              <span className="wms-skeleton" aria-label={t("common.loading")} />
            ) : (
              <>
                {formatNumber(inventoryKpis.totalAtp)}
                <span className="wms-kpi-unit">{t("web.overview.units")}</span>
              </>
            )}
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">{t("web.overview.invariantFormula")}</span>
          </div>
        </div>

        <div
          className={`wms-card wms-kpi-card ${
            hasOperationalAlerts ? "wms-kpi-card-rose" : "wms-kpi-card-cyan"
          }`}
        >
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.overview.kpiOrdersTasks")}</span>
            <span
              className={`wms-tag ${
                hasOperationalAlerts ? "wms-tag-rose" : "wms-tag-blue"
              }`}
            >
              {hasOperationalAlerts ? t("web.overview.tagAttention") : t("web.overview.tagFlowOk")}
            </span>
          </div>
          <div className="wms-kpi-value wms-text-accent">
            {loading && orders.length === 0 && tasks.length === 0 ? (
              <span className="wms-skeleton" aria-label={t("common.loading")} />
            ) : (
              <>
                {ordersSummary.activeOrdersCount}
                <span className="wms-kpi-unit">{t("web.overview.ordersUnit")}</span>
                {" / "}
                {tasksSummary.totalTasks}
                <span className="wms-kpi-unit">{t("web.overview.tasksUnit")}</span>
              </>
            )}
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">
              {ordersSummary.onHoldOrders.length} ON_HOLD
            </span>
            <span>·</span>
            <span className="wms-mono">
              {tasksSummary.tasksWithExceptions.length} {t("web.overview.withException")}
            </span>
          </div>
        </div>
      </section>

      {/* Barra de verificación en vivo del invariante contable */}
      <section
        className="wms-invariant-bar"
        aria-label={t("web.overview.ledgerEquation")}
      >
        <div className="wms-invariant-formula">
          <span className="wms-muted">{t("web.overview.ledgerEquation")}</span>
          <strong>
            OnHand ({formatNumber(inventoryKpis.totalOnHand)} {t("web.overview.units")})
          </strong>
          <span>−</span>
          <strong className="wms-text-warning">
            Allocated ({formatNumber(inventoryKpis.totalAllocated)} {t("web.overview.units")})
          </strong>
          <span>=</span>
          <strong className="wms-text-success">
            ATP ({formatNumber(inventoryKpis.totalAtp)} {t("web.overview.units")})
          </strong>
        </div>
        <span className="wms-tag wms-tag-emerald">
          {t("web.overview.invariantVerified")}
        </span>
      </section>

      {hasOperationalAlerts ? (
        <section className="wms-alert-banner" role="status" aria-live="polite">
          <div>
            <strong>{t("web.overview.alertSupervisor")}</strong>{" "}
            <strong className="wms-mono">
              {ordersSummary.onHoldOrders.length}
            </strong>{" "}
            <code>ON_HOLD</code> ·{" "}
            <strong className="wms-mono">
              {tasksSummary.tasksWithExceptions.length}
            </strong>{" "}
            {t("web.overview.withException")}
          </div>
          <Link to="/operations" className="wms-banner-link">
            {t("web.overview.resolveInOps")}
          </Link>
        </section>
      ) : null}

      <section className="wms-grid-2">
        <div className="wms-card">
          <div className="wms-card-title">
            <span>{t("web.overview.pipelineTitle")}</span>
            <Link
              to="/operations"
              className="wms-btn wms-btn-outline wms-btn-sm"
            >
              {t("web.overview.manageOrdersBtn")}
            </Link>
          </div>
          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>{t("web.overview.statusCol")}</th>
                  <th className="wms-num">{t("web.overview.ordersCol")}</th>
                  <th>{t("web.overview.nextActionCol")}</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    "PENDING",
                    "ALLOCATED",
                    "PICKING",
                    "PACKED",
                    "ON_HOLD",
                  ] as const
                ).map((status) => {
                  const visual = resolveOrderStatusVisual(status, locale);
                  return (
                    <tr key={status}>
                      <td>
                        <span
                          className={`wms-tag ${visual.colors.webTagClass}`}
                        >
                          {visual.symbol} {visual.label}
                        </span>
                      </td>
                      <td className="wms-num">
                        {ordersSummary.countsByStatus[status]}
                      </td>
                      <td className="wms-muted">{visual.recommendedAction}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="wms-card">
          <div className="wms-card-title">
            <span>{t("web.overview.recentTxTitle")}</span>
            <Link
              to="/inventory"
              className="wms-btn wms-btn-outline wms-btn-sm"
            >
              {t("web.overview.auditKardexBtn")}
            </Link>
          </div>
          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>{t("web.overview.reasonCol")}</th>
                  <th>{t("web.overview.skuCol")}</th>
                  <th>{t("web.overview.locationFlowCol")}</th>
                  <th className="wms-num">{t("web.overview.qtyCol")}</th>
                </tr>
              </thead>
              <tbody>
                {loading && recentTx.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <span
                        className="wms-skeleton"
                        aria-label={t("common.loading")}
                      />
                    </td>
                  </tr>
                ) : recentTx.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="wms-empty-state">
                        <div className="wms-empty-title">
                          {t("web.overview.emptyTxTitle")}
                        </div>
                        <div className="wms-empty-hint">
                          {t("web.overview.emptyTxHint")}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentTx.map((tx) => (
                    <tr key={tx.id}>
                      <td>
                        <span className="wms-tag wms-tag-blue wms-mono">
                          {tx.reason}
                        </span>
                      </td>
                      <td className="wms-mono">
                        <strong>{tx.productSku}</strong>
                      </td>
                      <td className="wms-mono wms-muted">
                        {tx.fromLocation ?? "EXT"} → {tx.toLocation ?? "EXT"}
                      </td>
                      <td className="wms-num">
                        <strong>{tx.quantity}</strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
