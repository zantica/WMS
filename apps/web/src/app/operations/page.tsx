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
  resolveOrderStatusVisual,
  resolveTaskStatusVisual,
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
        `✓ Pedido ${created.externalRef ?? created.id} registrado en estado ${created.status}.`,
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
        `✓ Pedido ${orderId} reservado. Tarea de picking generada: ${res.taskId}.`,
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
        `✓ Pedido ${res.orderId} cancelado (previo: ${res.previousStatus}). Unidades liberadas (ALLOCATION_CANCEL): ${res.totalReleasedQty} uds.`,
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
      setSuccessMsg(`✓ Pedido ${res.orderId} despachado (${res.status}).`);
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
          <div className="wms-eyebrow">
            <span>▲ EJECUCIÓN DE PISO</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
          </div>
          <h1 className="wms-page-title">
            Monitor de pedidos y ejecución de tareas
          </h1>
          <p className="wms-page-subtitle">
            Control de reserva FEFO/FIFO, liberación atómica de reservas por
            cancelación (<code>F3.1</code>) y seguimiento de pasos de operarios
            en tiempo real.
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
          {loading ? "Sincronizando operaciones…" : "Sincronizar operaciones"}
        </button>
      </div>

      {errorMsg ? (
        <div className="wms-alert-banner" role="alert" aria-live="assertive">
          <span>
            <strong>⚠ Error operativo:</strong> {errorMsg}
          </span>
        </div>
      ) : null}

      {successMsg ? (
        <div className="wms-success-banner" role="status" aria-live="polite">
          <span>{successMsg}</span>
        </div>
      ) : null}

      <section className="wms-grid-4" aria-label="Indicadores de operaciones">
        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Pedidos activos</span>
            <span className="wms-tag wms-tag-blue">CARTERA</span>
          </div>
          <div className="wms-kpi-value">
            {ordersSummary.activeOrdersCount}
            <span className="wms-kpi-unit">pedidos</span>
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">
              De {ordersSummary.totalOrders} pedidos listados
            </span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-rose">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Retenidos en ON_HOLD</span>
            <span className="wms-tag wms-tag-rose">⚠ ROTURA</span>
          </div>
          <div className="wms-kpi-value wms-text-danger">
            {ordersSummary.onHoldOrders.length}
            <span className="wms-kpi-unit">pedidos</span>
          </div>
          <div className="wms-kpi-foot">
            <span>Pendientes de reabastecimiento o re-alocación</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Listos para despacho (PACKED)</span>
            <span className="wms-tag wms-tag-emerald">✓ MUELLE</span>
          </div>
          <div className="wms-kpi-value wms-text-success">
            {ordersSummary.readyToDispatchOrders.length}
            <span className="wms-kpi-unit">pedidos</span>
          </div>
          <div className="wms-kpi-foot">
            <span>En mesa de empaquetado / muelle de salida</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Tareas operativas en piso</span>
            <span className="wms-tag wms-tag-amber">▲ EJECUCIÓN</span>
          </div>
          <div className="wms-kpi-value wms-text-accent">
            {tasksMonitor.totalTasks}
            <span className="wms-kpi-unit">tareas</span>
          </div>
          <div className="wms-kpi-foot">
            <span className="wms-mono">
              {tasksMonitor.inProgressCount} en curso
            </span>
            <span>·</span>
            <span className="wms-mono">
              {tasksMonitor.tasksWithExceptions.length} con excepción
            </span>
          </div>
        </div>
      </section>

      <section className="wms-grid-2">
        <form className="wms-card" onSubmit={(e) => void handleCreateOrder(e)}>
          <h2 className="wms-card-title">Crear pedido de venta manual</h2>
          <div className="wms-grid-2">
            <label className="wms-field">
              <span>Referencia externa</span>
              <input
                type="text"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder="#PED-2050"
              />
            </label>
            <label className="wms-field">
              <span>Cliente destinatario</span>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Distribuciones Norte SL"
              />
            </label>
            <label className="wms-field">
              <span>Producto solicitado *</span>
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
                <span>Cantidad (uds) *</span>
                <input
                  type="number"
                  min={1}
                  required
                  value={requestedQty}
                  onChange={(e) => setRequestedQty(e.target.value)}
                />
              </label>
              <label className="wms-field">
                <span>Prioridad (0–100)</span>
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
          <div className="wms-form-footer">
            <button type="submit" className="wms-btn wms-btn-emerald">
              Registrar pedido (PENDING)
            </button>
          </div>
        </form>

        <div className="wms-card">
          <div className="wms-card-title">
            <span>Cola de tareas activas (WarehouseTask)</span>
            <span className="wms-tag wms-tag-blue">
              {tasksMonitor.totalTasks} tareas
            </span>
          </div>

          {loading && tasksMonitor.rows.length === 0 ? (
            <span
              className="wms-skeleton"
              aria-label="Cargando tareas operativas"
            />
          ) : tasksMonitor.rows.length === 0 ? (
            <div className="wms-empty-state">
              <div className="wms-empty-title">
                Sin tareas operativas en ejecución
              </div>
              <div className="wms-empty-hint">
                Lanza la reserva ATP de un pedido en estado PENDING para generar
                automáticamente tareas de picking guiado.
              </div>
            </div>
          ) : (
            <div className="wms-stack">
              {tasksMonitor.rows.map((row) => (
                <div
                  key={row.task.id}
                  className={`wms-location-cell ${
                    row.hasException ? "wms-location-exception" : ""
                  }`}
                >
                  <div className="wms-row-between">
                    <div>
                      <strong className="wms-mono">{row.task.type}</strong> ·{" "}
                      <span className="wms-mono wms-muted">{row.task.id}</span>
                    </div>
                    {(() => {
                      const taskVisual = resolveTaskStatusVisual(
                        row.hasException ? "EXCEPTION" : row.task.status,
                      );
                      return (
                        <span
                          className={`wms-tag ${taskVisual.colors.webTagClass}`}
                        >
                          {taskVisual.symbol} {row.task.status}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="wms-progress-track">
                    <div
                      className={`wms-progress-fill ${
                        row.hasException ? "wms-progress-fill-rose" : ""
                      }`}
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>

                  <div className="wms-cell-stats">
                    <span className="wms-muted">
                      Pasos: {row.completedSteps}/{row.totalSteps} (
                      {row.percent}%)
                    </span>
                    <span className="wms-muted">
                      Escaneado: {row.scannedUnits}/{row.expectedUnits} uds
                    </span>
                    {row.exceptionSteps > 0 ? (
                      <strong className="wms-text-danger">
                        ⚠ {row.exceptionSteps} excepción(es)
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
          <span>Cartera de pedidos de venta ({orders.length})</span>
          <label className="wms-field wms-field-inline">
            <span>Filtrar estado:</span>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as OrderStatus | "ALL")
              }
            >
              <option value="ALL">TODOS LOS ESTADOS</option>
              {ORDER_STATUS_LIST.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
        </div>

        {statusFilter !== "ALL" ? (
          <div className="wms-active-filters" aria-live="polite">
            <span>Filtro activo:</span>
            <span className="wms-filter-chip">Estado: {statusFilter}</span>
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              onClick={() => setStatusFilter("ALL")}
            >
              Ver todos los pedidos
            </button>
          </div>
        ) : null}

        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>Pedido / Referencia</th>
                <th>Cliente</th>
                <th className="wms-num">Prioridad</th>
                <th>Estado</th>
                <th>Líneas (Recolectado / Solicitado)</th>
                <th>Acciones de supervisor</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <span
                      className="wms-skeleton"
                      aria-label="Cargando cartera de pedidos"
                    />
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="wms-empty-state">
                      <div className="wms-empty-title">
                        Sin pedidos para el filtro seleccionado
                      </div>
                      <div className="wms-empty-hint">
                        Crea un pedido manual desde el panel superior o cambia
                        el filtro de estado operativo.
                      </div>
                    </div>
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
                        <div className="wms-cell-meta wms-mono">
                          {order.id}
                        </div>
                      </td>
                      <td>{order.customerName ?? "Cliente estándar"}</td>
                      <td className="wms-num">
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
                        {(() => {
                          const visual = resolveOrderStatusVisual(order.status);
                          return (
                            <span
                              className={`wms-tag ${visual.colors.webTagClass}`}
                            >
                              {visual.symbol} {visual.label}
                            </span>
                          );
                        })()}
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
                        <div className="wms-actions-row">
                          {canAllocate ? (
                            <button
                              type="button"
                              className="wms-btn wms-btn-secondary wms-btn-sm"
                              disabled={isBusy}
                              onClick={() => {
                                void handleAllocateOrder(order.id);
                              }}
                            >
                              Lanzar reserva ATP
                            </button>
                          ) : null}

                          {canDispatch ? (
                            <button
                              type="button"
                              className="wms-btn wms-btn-emerald wms-btn-sm"
                              disabled={isBusy}
                              onClick={() => {
                                void handleDispatchOrder(order.id);
                              }}
                            >
                              Confirmar despacho
                            </button>
                          ) : null}

                          {canCancel ? (
                            <button
                              type="button"
                              className="wms-btn wms-btn-danger wms-btn-sm"
                              disabled={isBusy}
                              onClick={() => {
                                void handleCancelOrder(order.id);
                              }}
                            >
                              Cancelar pedido
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
