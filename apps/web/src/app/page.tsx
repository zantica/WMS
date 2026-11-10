"use client";

// apps/web/src/app/page.tsx
// Vista principal del Dashboard de Supervisores: HUD contable (OnHand − Allocated = ATP), pipeline de pedidos y últimos movimientos del Ledger.

import Link from "next/link";
import { useCallback, useEffect, useState, type JSX } from "react";
import type {
  InventoryBalanceDTO,
  SalesOrderDTO,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import { useSupervisorSession } from "../context/supervisor-session";
import type { KardexTransactionItem } from "../lib/api-client";
import {
  computeInventoryKpis,
  resolveOrderStatusVisual,
  summarizeOrdersByStatus,
  summarizeTasksMonitor,
} from "../lib/dashboard-metrics";

export default function SupervisorOverviewPage(): JSX.Element {
  const { client, session } = useSupervisorSession();
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
          <h1 className="wms-page-title">Torre de control operativa</h1>
          <p className="wms-page-subtitle">
            Visibilidad en tiempo real sobre saldos contables del ledger
            inmutable, pipeline de pedidos y ejecución de piso.
          </p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadOverview();
          }}
          disabled={loading}
        >
          {loading ? "Sincronizando telemetría…" : "Sincronizar panel"}
        </button>
      </div>

      {errorMsg ? (
        <div className="wms-alert-banner" role="alert" aria-live="assertive">
          <div>
            <strong>⚠ Fallo de sincronización con la API:</strong> {errorMsg}.
            Verifica que <code>@wms/api</code> esté ejecutándose en{" "}
            <code>{session.apiBaseUrl}</code> y que el header{" "}
            <code>x-api-key</code> sea válido.
          </div>
          <button
            type="button"
            className="wms-btn wms-btn-outline wms-btn-sm"
            onClick={() => {
              void loadOverview();
            }}
          >
            Reintentar ahora
          </button>
        </div>
      ) : null}

      {/* Elemento memorable: HUD de Métricas Contables con iluminación perimetral */}
      <section className="wms-grid-4" aria-label="Indicadores clave del almacén">
        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Stock físico (OnHand)</span>
            <span className="wms-tag wms-tag-slate">FÍSICO</span>
          </div>
          <div className="wms-kpi-value">
            {loading && balances.length === 0 ? (
              <span className="wms-skeleton" aria-label="Cargando OnHand" />
            ) : (
              <>
                {inventoryKpis.totalOnHand}
                <span className="wms-kpi-unit">uds</span>
              </>
            )}
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">
              {inventoryKpis.uniqueProductsWithStock} SKUs
            </span>
            <span>·</span>
            <span className="wms-mono">
              {inventoryKpis.uniqueLocationsWithStock} ubicaciones activas
            </span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-amber">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Stock reservado (Allocated)</span>
            <span className="wms-tag wms-tag-amber">▲ RESERVA</span>
          </div>
          <div className="wms-kpi-value wms-text-warning">
            {loading && balances.length === 0 ? (
              <span className="wms-skeleton" aria-label="Cargando Allocated" />
            ) : (
              <>
                {inventoryKpis.totalAllocated}
                <span className="wms-kpi-unit">uds</span>
              </>
            )}
          </div>
          <div className="wms-kpi-foot">
            <span>Tasa de compromiso:</span>
            <strong className="wms-mono wms-text-primary">
              {inventoryKpis.utilizationRate}%
            </strong>
            <span>del OnHand</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Disponible prometible (ATP)</span>
            <span className="wms-tag wms-tag-emerald">✓ PROMETIBLE</span>
          </div>
          <div className="wms-kpi-value wms-text-success">
            {loading && balances.length === 0 ? (
              <span className="wms-skeleton" aria-label="Cargando ATP" />
            ) : (
              <>
                {inventoryKpis.totalAtp}
                <span className="wms-kpi-unit">uds</span>
              </>
            )}
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">Invariante: OnHand − Allocated</span>
          </div>
        </div>

        <div
          className={`wms-card wms-kpi-card ${
            hasOperationalAlerts ? "wms-kpi-card-rose" : "wms-kpi-card-cyan"
          }`}
        >
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Pedidos y tareas en piso</span>
            <span
              className={`wms-tag ${
                hasOperationalAlerts ? "wms-tag-rose" : "wms-tag-blue"
              }`}
            >
              {hasOperationalAlerts ? "⚠ ATENCIÓN" : "● FLUJO OK"}
            </span>
          </div>
          <div className="wms-kpi-value wms-text-accent">
            {loading && orders.length === 0 && tasks.length === 0 ? (
              <span className="wms-skeleton" aria-label="Cargando pedidos" />
            ) : (
              <>
                {ordersSummary.activeOrdersCount}
                <span className="wms-kpi-unit">pedidos</span>
                {" / "}
                {tasksSummary.totalTasks}
                <span className="wms-kpi-unit">tareas</span>
              </>
            )}
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">
              {ordersSummary.onHoldOrders.length} ON_HOLD
            </span>
            <span>·</span>
            <span className="wms-mono">
              {tasksSummary.tasksWithExceptions.length} con excepción
            </span>
          </div>
        </div>
      </section>

      {/* Barra de verificación en vivo del invariante contable */}
      <section
        className="wms-invariant-bar"
        aria-label="Ecuación de integridad del Ledger"
      >
        <div className="wms-invariant-formula">
          <span className="wms-muted">ECUACIÓN DEL LEDGER:</span>
          <strong>OnHand ({inventoryKpis.totalOnHand} uds)</strong>
          <span>−</span>
          <strong className="wms-text-warning">
            Allocated ({inventoryKpis.totalAllocated} uds)
          </strong>
          <span>=</span>
          <strong className="wms-text-success">
            ATP ({inventoryKpis.totalAtp} uds)
          </strong>
        </div>
        <span className="wms-tag wms-tag-emerald">
          ✓ Invariante contable verificado
        </span>
      </section>

      {hasOperationalAlerts ? (
        <section className="wms-alert-banner" role="status" aria-live="polite">
          <div>
            <strong>⚠ Atención del supervisor requerida:</strong> Se detectaron{" "}
            <strong className="wms-mono">
              {ordersSummary.onHoldOrders.length}
            </strong>{" "}
            pedido(s) retenidos en <code>ON_HOLD</code> por rotura de stock y{" "}
            <strong className="wms-mono">
              {tasksSummary.tasksWithExceptions.length}
            </strong>{" "}
            tarea(s) operativas con pasos en excepción.
          </div>
          <Link href="/operations" className="wms-banner-link">
            Resolver en monitor de operaciones →
          </Link>
        </section>
      ) : null}

      <section className="wms-grid-2">
        <div className="wms-card">
          <div className="wms-card-title">
            <span>Estado del pipeline de pedidos</span>
            <Link
              href="/operations"
              className="wms-btn wms-btn-outline wms-btn-sm"
            >
              Gestionar cartera →
            </Link>
          </div>
          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>Estado operativo</th>
                  <th className="wms-num">Pedidos</th>
                  <th>Siguiente acción recomendada</th>
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
                  const visual = resolveOrderStatusVisual(status);
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
            <span>Últimos movimientos del ledger (Kardex)</span>
            <Link
              href="/inventory"
              className="wms-btn wms-btn-outline wms-btn-sm"
            >
              Auditar kardex completo →
            </Link>
          </div>
          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>SKU</th>
                  <th>Flujo de ubicación</th>
                  <th className="wms-num">Cant. (uds)</th>
                </tr>
              </thead>
              <tbody>
                {loading && recentTx.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <span
                        className="wms-skeleton"
                        aria-label="Cargando movimientos recientes"
                      />
                    </td>
                  </tr>
                ) : recentTx.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="wms-empty-state">
                        <div className="wms-empty-title">
                          Sin transacciones registradas en el ledger
                        </div>
                        <div className="wms-empty-hint">
                          Registra una recepción de mercancía o ejecuta un
                          ajuste contable en el módulo de inventario para
                          inaugurar la trazabilidad.
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
