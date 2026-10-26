"use client";

// apps/web/src/app/operations/page.tsx
// Panel de Monitoreo de Pedidos (SalesOrderDTO) y Cola de Tareas Activas (WarehouseTaskDTO).
// Permite crear pedidos, lanzar reserva ATP (allocate), cancelar pedidos liberando reservas (cancel F3.1) y despachar (dispatch).

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import type {
  OrderStatus,
  ProductDTO,
  SalesOrderDTO,
  WarehouseTaskDTO,
} from "@wms/shared-types";
import { useSupervisorSession } from "../../context/supervisor-session";
import {
  ORDER_STATUS_LIST,
  summarizeOrdersByStatus,
  summarizeTasksMonitor,
} from "../../lib/dashboard-metrics";

export default function OperationsMonitorPage(): JSX.Element {
  const { client, session } = useSupervisorSession();
  const [orders, setOrders] = useState<SalesOrderDTO[]>([]);
  const [tasks, setTasks] = useState<WarehouseTaskDTO[]>([]);
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "ALL">("ALL");
  const [loading, setLoading] = useState<boolean>(true);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Formulario de creación rápida de pedido
  const [externalRef, setExternalRef] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("");
  const [priority, setPriority] = useState<string>("10");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [requestedQty, setRequestedQty] = useState<string>("2");

  const loadOperations = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [ordRes, taskRes, prodRes] = await Promise.all([
        client.listOrders(
          statusFilter !== "ALL" ? { status: statusFilter } : undefined,
        ),
        client.listTasks(),
        client.listProducts(),
      ]);
      setOrders(ordRes);
      setTasks(taskRes);
      setProducts(prodRes);
      if (!selectedProductId && prodRes[0]) {
        setSelectedProductId(prodRes[0].id);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "No se pudo cargar el monitor de pedidos y tareas",
      );
    } finally {
      setLoading(false);
    }
  }, [client, statusFilter, selectedProductId]);

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

  async function handleCreateOrder(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const qty = Number(requestedQty);
    const prio = Number(priority);
    if (!selectedProductId || !Number.isFinite(qty) || qty <= 0) {
      setErrorMsg("Selecciona un producto válido y una cantidad positiva.");
      return;
    }

    try {
      const created = await client.createOrder({
        warehouseId: session.warehouseId,
        ...(externalRef.trim().length > 0
          ? { externalRef: externalRef.trim() }
          : {}),
        ...(customerName.trim().length > 0
          ? { customerName: customerName.trim() }
          : {}),
        priority: Number.isFinite(prio) ? prio : 0,
        lines: [{ productId: selectedProductId, requestedQty: qty }],
      });
      setExternalRef("");
      setCustomerName("");
      setSuccessMsg(
        `Pedido ${created.externalRef ?? created.id} creado en estado ${created.status}.`,
      );
      await loadOperations();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error al crear el pedido",
      );
    }
  }

  async function handleAllocateOrder(orderId: string): Promise<void> {
    setActionBusyId(orderId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await client.allocateOrder(orderId);
      setSuccessMsg(
        `Pedido ${orderId} reservado. Tarea de Picking generada: ${res.taskId}.`,
      );
      await loadOperations();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "No se pudo reservar stock para el pedido",
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleCancelOrder(orderId: string): Promise<void> {
    setActionBusyId(orderId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await client.cancelOrder(
        orderId,
        "Cancelado por supervisor desde WMS Control Tower",
      );
      setSuccessMsg(
        `Pedido ${res.orderId} cancelado (previo: ${res.previousStatus}). Unidades liberadas (ALLOCATION_CANCEL): ${res.totalReleasedQty}.`,
      );
      await loadOperations();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo cancelar el pedido",
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDispatchOrder(orderId: string): Promise<void> {
    setActionBusyId(orderId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await client.dispatchOrder(orderId);
      setSuccessMsg(`Pedido ${res.orderId} despachado (${res.status}).`);
      await loadOperations();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo despachar el pedido",
      );
    } finally {
      setActionBusyId(null);
    }
  }

  const ordersSummary = summarizeOrdersByStatus(orders);
  const tasksMonitor = summarizeTasksMonitor(tasks);

  return (
    <>
      <div className="wms-page-header">
        <div>
          <h1 className="wms-page-title">
            Monitor de Pedidos & Ejecución de Tareas de Piso
          </h1>
          <p className="wms-page-subtitle">
            Control de alocación FEFO/FIFO, liberación atómica de reservas por
            cancelación (`F3.1`) y seguimiento de pasos de operarios en tiempo
            real.
          </p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadOperations();
          }}
          disabled={loading}
        >
          {loading ? "Sincronizando…" : "Refrescar Operaciones"}
        </button>
      </div>

      {errorMsg ? <div className="wms-alert-banner">{errorMsg}</div> : null}
      {successMsg ? (
        <div className="wms-success-banner">{successMsg}</div>
      ) : null}

      <section className="wms-grid-4">
        <div className="wms-card">
          <div className="wms-kpi-label">Pedidos Activos</div>
          <div className="wms-kpi-value">{ordersSummary.activeOrdersCount}</div>
          <div className="wms-kpi-foot">
            De {ordersSummary.totalOrders} pedidos listados
          </div>
        </div>
        <div className="wms-card">
          <div className="wms-kpi-label">Pedidos en ON_HOLD</div>
          <div className="wms-kpi-value" style={{ color: "#fb7185" }}>
            {ordersSummary.onHoldOrders.length}
          </div>
          <div className="wms-kpi-foot">
            Pendientes de reabastecimiento o re-alocación
          </div>
        </div>
        <div className="wms-card">
          <div className="wms-kpi-label">Listos para Despacho (PACKED)</div>
          <div className="wms-kpi-value" style={{ color: "#34d399" }}>
            {ordersSummary.readyToDispatchOrders.length}
          </div>
          <div className="wms-kpi-foot">En mesa de empaquetado / muelle</div>
        </div>
        <div className="wms-card">
          <div className="wms-kpi-label">Tareas Operativas en Piso</div>
          <div className="wms-kpi-value" style={{ color: "#38bdf8" }}>
            {tasksMonitor.totalTasks}
          </div>
          <div className="wms-kpi-foot">
            {tasksMonitor.inProgressCount} en curso ·{" "}
            {tasksMonitor.tasksWithExceptions.length} con excepción
          </div>
        </div>
      </section>

      <section className="wms-grid-2">
        <form className="wms-card" onSubmit={(e) => void handleCreateOrder(e)}>
          <h2 className="wms-card-title">Crear Pedido de Venta Manual</h2>
          <div className="wms-grid-2">
            <label className="wms-field">
              <span>Referencia Externa</span>
              <input
                type="text"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder="#PED-2050"
              />
            </label>
            <label className="wms-field">
              <span>Cliente</span>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Distribuciones Norte SL"
              />
            </label>
            <label className="wms-field">
              <span>Producto Solicitado *</span>
              <select
                required
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                <option value="">Seleccionar SKU…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="wms-grid-2">
              <label className="wms-field">
                <span>Cantidad *</span>
                <input
                  type="number"
                  min={1}
                  required
                  value={requestedQty}
                  onChange={(e) => setRequestedQty(e.target.value)}
                />
              </label>
              <label className="wms-field">
                <span>Prioridad (0-100)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                />
              </label>
            </div>
          </div>
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="wms-btn wms-btn-emerald">
              Registrar Pedido (PENDING)
            </button>
          </div>
        </form>

        <div className="wms-card">
          <div className="wms-card-title">
            <span>Cola de Tareas Activas (`WarehouseTask`)</span>
            <span className="wms-tag wms-tag-blue">
              {tasksMonitor.totalTasks} tareas
            </span>
          </div>

          {tasksMonitor.rows.length === 0 ? (
            <p className="wms-muted">
              No hay tareas operativas pendientes ni en progreso.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              {tasksMonitor.rows.map((row) => (
                <div
                  key={row.task.id}
                  className="wms-location-cell"
                  style={{
                    borderColor: row.hasException
                      ? "rgba(244, 63, 94, 0.65)"
                      : undefined,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.4rem",
                    }}
                  >
                    <div>
                      <strong className="wms-mono">{row.task.type}</strong> ·{" "}
                      <span className="wms-mono wms-muted">{row.task.id}</span>
                    </div>
                    <span
                      className={`wms-tag ${
                        row.hasException
                          ? "wms-tag-rose"
                          : row.task.status === "IN_PROGRESS"
                            ? "wms-tag-amber"
                            : "wms-tag-blue"
                      }`}
                    >
                      {row.task.status}
                    </span>
                  </div>

                  <div className="wms-progress-track">
                    <div
                      className="wms-progress-fill"
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.78rem",
                      marginTop: "0.45rem",
                    }}
                    className="wms-muted"
                  >
                    <span>
                      Pasos: {row.completedSteps}/{row.totalSteps} ({row.percent}
                      %)
                    </span>
                    <span>
                      Unidades escaneadas: {row.scannedUnits}/{row.expectedUnits}
                    </span>
                    {row.exceptionSteps > 0 ? (
                      <strong style={{ color: "#fb7185" }}>
                        {row.exceptionSteps} excepción(es)
                      </strong>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="wms-card">
        <div className="wms-card-title">
          <span>Cartera de Pedidos de Venta ({orders.length})</span>
          <label
            className="wms-field"
            style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}
          >
            <span>Estado:</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as OrderStatus | "ALL")
              }
            >
              <option value="ALL">TODOS</option>
              {ORDER_STATUS_LIST.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>Pedido / Ref</th>
                <th>Cliente</th>
                <th>Prioridad</th>
                <th>Estado</th>
                <th>Líneas (Solicitado / Picked)</th>
                <th>Acciones de Supervisor</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="wms-muted">
                    No hay pedidos registrados para el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const isBusy = actionBusyId === order.id;
                  const canAllocate =
                    order.status === "PENDING" || order.status === "ON_HOLD";
                  const canDispatch = order.status === "PACKED";
                  const canCancel =
                    order.status === "PENDING" ||
                    order.status === "ON_HOLD" ||
                    order.status === "ALLOCATED" ||
                    order.status === "PICKING";

                  return (
                    <tr key={order.id}>
                      <td>
                        <strong className="wms-mono">
                          {order.externalRef ?? order.id}
                        </strong>
                        <div
                          className="wms-muted wms-mono"
                          style={{ fontSize: "0.74rem" }}
                        >
                          {order.id}
                        </div>
                      </td>
                      <td>{order.customerName ?? "Cliente Estándar"}</td>
                      <td>
                        <span
                          className={`wms-tag ${
                            order.priority >= 10
                              ? "wms-tag-amber"
                              : "wms-tag-slate"
                          }`}
                        >
                          P{order.priority}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`wms-tag ${
                            order.status === "ON_HOLD" ||
                            order.status === "CANCELLED"
                              ? "wms-tag-rose"
                              : order.status === "PACKED" ||
                                  order.status === "SHIPPED"
                                ? "wms-tag-emerald"
                                : "wms-tag-blue"
                          }`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td>
                        {order.lines.map((line) => (
                          <div key={line.id} className="wms-mono">
                            {line.productSku}: {line.pickedQty}/
                            {line.requestedQty} uds
                          </div>
                        ))}
                      </td>
                      <td>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.45rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {canAllocate ? (
                            <button
                              type="button"
                              className="wms-btn wms-btn-primary"
                              disabled={isBusy}
                              onClick={() => {
                                void handleAllocateOrder(order.id);
                              }}
                            >
                              Alocar Stock
                            </button>
                          ) : null}

                          {canDispatch ? (
                            <button
                              type="button"
                              className="wms-btn wms-btn-emerald"
                              disabled={isBusy}
                              onClick={() => {
                                void handleDispatchOrder(order.id);
                              }}
                            >
                              Despachar
                            </button>
                          ) : null}

                          {canCancel ? (
                            <button
                              type="button"
                              className="wms-btn wms-btn-danger"
                              disabled={isBusy}
                              onClick={() => {
                                void handleCancelOrder(order.id);
                              }}
                            >
                              Cancelar Pedido
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
