"use client";

// apps/web/src/app/page.tsx
// Vista principal del Dashboard de Supervisores: KPIs ejecutivos de inventario, estado de pedidos, alertas y últimos movimientos del Ledger.

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

  return (
    <>
      <div className="wms-page-header">
        <div>
          <h1 className="wms-page-title">
            Torre de Control Operativa ({session.warehouseId})
          </h1>
          <p className="wms-page-subtitle">
            Visibilidad en tiempo real sobre saldos contables (OnHand vs
            Allocated vs ATP), cartera de pedidos y ejecución de piso.
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
          {loading ? "Sincronizando…" : "Actualizar Panel"}
        </button>
      </div>

      {errorMsg ? (
        <div className="wms-alert-banner">
          <strong>Aviso de Conexión:</strong> {errorMsg}. Verifica que{" "}
          <code>@wms/api</code> esté corriendo en{" "}
          <code>{session.apiBaseUrl}</code>.
        </div>
      ) : null}

      <section className="wms-grid-4">
        <div className="wms-card">
          <div className="wms-kpi-label">Stock Físico Total (OnHand)</div>
          <div className="wms-kpi-value">{inventoryKpis.totalOnHand}</div>
          <div className="wms-kpi-foot">
            {inventoryKpis.uniqueProductsWithStock} SKUs en{" "}
            {inventoryKpis.uniqueLocationsWithStock} ubicaciones activas
          </div>
        </div>

        <div className="wms-card">
          <div className="wms-kpi-label">Stock Reservado (Allocated)</div>
          <div className="wms-kpi-value" style={{ color: "#fbbf24" }}>
            {inventoryKpis.totalAllocated}
          </div>
          <div className="wms-kpi-foot">
            Tasa de reserva: {inventoryKpis.utilizationRate}% del OnHand
          </div>
        </div>

        <div className="wms-card">
          <div className="wms-kpi-label">Disponible Prometible (ATP)</div>
          <div className="wms-kpi-value" style={{ color: "#34d399" }}>
            {inventoryKpis.totalAtp}
          </div>
          <div className="wms-kpi-foot">
            Invariante: ATP = OnHand − Allocated
          </div>
        </div>

        <div className="wms-card">
          <div className="wms-kpi-label">Pedidos Activos & Tareas</div>
          <div className="wms-kpi-value" style={{ color: "#38bdf8" }}>
            {ordersSummary.activeOrdersCount} / {tasksSummary.totalTasks}
          </div>
          <div className="wms-kpi-foot">
            {ordersSummary.onHoldOrders.length} pedidos ON_HOLD ·{" "}
            {tasksSummary.tasksWithExceptions.length} tareas con excepción
          </div>
        </div>
      </section>

      {ordersSummary.onHoldOrders.length > 0 ||
      tasksSummary.tasksWithExceptions.length > 0 ? (
        <section className="wms-alert-banner">
          <strong>Atención del Supervisor Requerida:</strong> Hay{" "}
          <strong>{ordersSummary.onHoldOrders.length}</strong> pedido(s) en
          estado <code>ON_HOLD</code> por rotura de stock en estantería y{" "}
          <strong>{tasksSummary.tasksWithExceptions.length}</strong> tarea(s)
          operativas con pasos en excepción.{" "}
          <Link href="/operations" style={{ color: "#ffffff" }}>
            Ir al Panel de Operaciones →
          </Link>
        </section>
      ) : null}

      <section className="wms-grid-2">
        <div className="wms-card">
          <div className="wms-card-title">
            <span>Estado del Pipeline de Pedidos</span>
            <Link href="/operations" className="wms-btn wms-btn-outline">
              Gestionar Pedidos
            </Link>
          </div>
          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>Estado</th>
                  <th>Cantidad</th>
                  <th>Acción Recomendada</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="wms-tag wms-tag-slate">PENDING</span>
                  </td>
                  <td>{ordersSummary.countsByStatus.PENDING}</td>
                  <td className="wms-muted">Lanzar reserva ATP (Allocate)</td>
                </tr>
                <tr>
                  <td>
                    <span className="wms-tag wms-tag-blue">ALLOCATED</span>
                  </td>
                  <td>{ordersSummary.countsByStatus.ALLOCATED}</td>
                  <td className="wms-muted">En cola de Picking móvil</td>
                </tr>
                <tr>
                  <td>
                    <span className="wms-tag wms-tag-amber">PICKING</span>
                  </td>
                  <td>{ordersSummary.countsByStatus.PICKING}</td>
                  <td className="wms-muted">Operario recolectando en pasillo</td>
                </tr>
                <tr>
                  <td>
                    <span className="wms-tag wms-tag-emerald">PACKED</span>
                  </td>
                  <td>{ordersSummary.countsByStatus.PACKED}</td>
                  <td className="wms-muted">Listos para despacho final</td>
                </tr>
                <tr>
                  <td>
                    <span className="wms-tag wms-tag-rose">ON_HOLD</span>
                  </td>
                  <td>{ordersSummary.countsByStatus.ON_HOLD}</td>
                  <td className="wms-muted">
                    Requiere ajuste o reabastecimiento
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="wms-card">
          <div className="wms-card-title">
            <span>Últimos Movimientos del Ledger (Kardex)</span>
            <Link href="/inventory" className="wms-btn wms-btn-outline">
              Ver Kardex Completo
            </Link>
          </div>
          <div className="wms-table-wrap">
            <table className="wms-table">
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>SKU</th>
                  <th>Flujo</th>
                  <th>Cant.</th>
                </tr>
              </thead>
              <tbody>
                {recentTx.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="wms-muted">
                      Sin transacciones recientes cargadas.
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
                      <td className="wms-mono">{tx.productSku}</td>
                      <td className="wms-mono wms-muted">
                        {tx.fromLocation ?? "EXT"} → {tx.toLocation ?? "EXT"}
                      </td>
                      <td>
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
