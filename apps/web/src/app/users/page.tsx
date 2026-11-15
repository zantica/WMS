"use client";

// apps/web/src/app/users/page.tsx
// Gobierno de Usuarios y Roles del Tenant (RBAC) con Divulgación Progresiva.
//
// ## Design tokens — Tenant Users & Access Governance
// - Estilo: S5 dark-data-dense
// - Paleta (P2): --bg #0B1120 | --surface #111A2E | --surface-card #162238 | --border #23334D | --text #E8EEF6 | --muted #8CA0BA | --accent #38BDF8 | --success #34D399 | --danger #F43F5E
// - Tipografía (T3): DM Sans (cuerpo e inputs) + JetBrains Mono (roles, emails y contadores), base 14/20
// - Memorable: Tablero de telemetría de roles con cambio inline reactivo y formulario de alta en panel colapsable

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type JSX,
} from "react";
import type { TenantUserDTO, UserRole } from "@wms/shared-types";
import { useSupervisorSession } from "../../context/supervisor-session";
import { computeUsersSummary } from "../../lib/dashboard-metrics";

export default function TenantUsersPage(): JSX.Element {
  const { client, session } = useSupervisorSession();

  // Datos
  const [users, setUsers] = useState<TenantUserDTO[]>([]);

  // Estados de carga y feedback
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Divulgación progresiva: formulario colapsado por defecto
  const [showCreateUser, setShowCreateUser] = useState<boolean>(false);

  // Formulario nuevo usuario
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("OPERATOR");

  // ── Carga de datos de usuarios del tenant ────────────────────
  const loadUsersData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await client.listUsers({ includeInactive: true });
      setUsers(res);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Error al cargar la lista de usuarios del tenant";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadUsersData();
  }, [loadUsersData]);

  // ── Acciones de Usuario ─────────────────────────────────────
  async function handleCreateUser(
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const created = await client.createUser({
        name: userName.trim(),
        email: userEmail.trim().toLowerCase(),
        role: userRole,
      });

      setUsers((prev) => [...prev, created]);
      setUserName("");
      setUserEmail("");
      setUserRole("OPERATOR");
      setShowCreateUser(false);
      setSuccessMsg(
        `✓ Usuario ${created.name} (${created.role}) registrado para el tenant.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo registrar el usuario",
      );
    }
  }

  async function handleUpdateUserRole(
    userId: string,
    newRole: UserRole,
  ): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const updated = await client.updateUser(userId, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u)),
      );
      setSuccessMsg(`✓ Rol de ${updated.name} actualizado a ${updated.role}.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error al cambiar rol del usuario",
      );
    }
  }

  async function handleToggleUserStatus(user: TenantUserDTO): Promise<void> {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const newStatus = !user.isActive;
      const updated = await client.updateUser(user.id, {
        isActive: newStatus,
      });
      setUsers((prev) =>
        prev.map((u) => (u.id === updated.id ? updated : u)),
      );
      setSuccessMsg(
        `✓ Cuenta de ${updated.name} ${
          newStatus ? "reactivada" : "desactivada"
        }.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Error al cambiar estado del usuario",
      );
    }
  }

  const summary = computeUsersSummary(users);

  return (
    <>
      <div className="wms-page-header">
        <div>
          <div className="wms-eyebrow">
            <span>◆ GOBIERNO DE USUARIOS Y ACCESOS</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
          </div>
          <h1 className="wms-page-title">Control de Usuarios y Roles (RBAC)</h1>
          <p className="wms-page-subtitle">
            Gestión de miembros del inquilino, delegación de privilegios
            operativos (Admin, Supervisor, Operador) y administración de
            estados.
          </p>
        </div>

        <button
          type="button"
          className="wms-btn wms-btn-primary"
          onClick={() => {
            void loadUsersData();
          }}
          disabled={loading}
        >
          {loading ? "Sincronizando…" : "Sincronizar usuarios"}
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

      {/* ── Resumen Rápido por Rol y Estado (KPI Strip) ────────────── */}
      <section className="wms-grid-4" style={{ marginBottom: "1.25rem" }}>
        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Total Miembros</span>
            <span className="wms-tag wms-tag-blue">TENANT</span>
          </div>
          <div className="wms-kpi-value">{summary.totalUsers}</div>
          <div className="wms-kpi-foot">
            <span className="wms-text-success">
              {summary.activeCount} activos
            </span>
            {summary.inactiveCount > 0 ? (
              <>
                <span>·</span>
                <span className="wms-muted">
                  {summary.inactiveCount} inactivos
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-amber">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Administradores</span>
            <span className="wms-tag wms-tag-amber">ADMIN</span>
          </div>
          <div className="wms-kpi-value">{summary.adminCount}</div>
          <div className="wms-kpi-foot">
            <span>Acceso total y configuración</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Supervisores</span>
            <span className="wms-tag wms-tag-blue">SUPERVISOR</span>
          </div>
          <div className="wms-kpi-value">{summary.supervisorCount}</div>
          <div className="wms-kpi-foot">
            <span>Control de planta y catálogo</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">Operadores de Piso</span>
            <span className="wms-tag wms-tag-emerald">OPERATOR</span>
          </div>
          <div className="wms-kpi-value">{summary.operatorCount}</div>
          <div className="wms-kpi-foot">
            <span>App móvil y ejecución de tareas</span>
          </div>
        </div>
      </section>

      {/* ── Barra de Acciones y Divulgación Progresiva ────────────── */}
      <div className="wms-row-between" style={{ marginBottom: "1.25rem" }}>
        <div className="wms-actions-row">
          <span className="wms-tag wms-tag-slate">
            {users.length} cuentas registradas en el tenant
          </span>
        </div>

        <div>
          <button
            type="button"
            className={`wms-btn ${
              showCreateUser ? "wms-btn-secondary" : "wms-btn-primary"
            }`}
            onClick={() => setShowCreateUser((prev) => !prev)}
          >
            {showCreateUser ? "✕ Ocultar formulario" : "+ Registrar usuario"}
          </button>
        </div>
      </div>

      {/* ── Formulario de Alta de Usuario (Divulgación Progresiva) ──── */}
      {showCreateUser ? (
        <div className="wms-disclosure-box">
          <div className="wms-disclosure-header">
            <h2 className="wms-disclosure-title">
              <span>◆ Registro de nuevo usuario en el tenant</span>
            </h2>
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              onClick={() => setShowCreateUser(false)}
            >
              ✕ Cerrar
            </button>
          </div>
          <form onSubmit={(e) => void handleCreateUser(e)}>
            <div className="wms-grid-3">
              <label className="wms-field">
                <span>Nombre completo *</span>
                <input
                  type="text"
                  required
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Pedro Gómez"
                />
              </label>
              <label className="wms-field">
                <span>Email corporativo *</span>
                <input
                  type="email"
                  required
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="pedro.gomez@empresa.com"
                />
              </label>
              <label className="wms-field">
                <span>Rol operativo *</span>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value as UserRole)}
                >
                  <option value="OPERATOR">OPERATOR (App Móvil / Escáner)</option>
                  <option value="SUPERVISOR">
                    SUPERVISOR (Control de planta y catálogo)
                  </option>
                  <option value="ADMIN">ADMIN (Acceso total e inquilino)</option>
                </select>
              </label>
            </div>
            <div className="wms-form-footer">
              <button
                type="button"
                className="wms-btn wms-btn-outline"
                onClick={() => setShowCreateUser(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="wms-btn wms-btn-primary">
                Registrar usuario
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* ── Tabla de Miembros del Tenant ───────────────────────────── */}
      <section className="wms-card">
        <div className="wms-row-between" style={{ marginBottom: "1rem" }}>
          <div className="wms-card-title" style={{ margin: 0 }}>
            <span>Miembros del inquilino y asignación de roles</span>
            <span className="wms-tag wms-tag-slate">
              {users.length} miembros
            </span>
          </div>
        </div>

        <div className="wms-table-wrap">
          <table className="wms-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol Operativo</th>
                <th>Estado</th>
                <th style={{ textAlign: "right" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <span
                      className="wms-skeleton"
                      aria-label="Cargando usuarios"
                    />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="wms-empty-state">
                      <div className="wms-empty-title">
                        Sin usuarios registrados
                      </div>
                      <div className="wms-empty-hint">
                        Pulsa en "+ Registrar usuario" para invitar miembros a
                        este tenant.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((usr) => (
                  <tr key={usr.id}>
                    <td>
                      <strong>{usr.name}</strong>
                      <div className="wms-cell-meta">{usr.email}</div>
                    </td>
                    <td>
                      <select
                        value={usr.role}
                        onChange={(e) =>
                          void handleUpdateUserRole(
                            usr.id,
                            e.target.value as UserRole,
                          )
                        }
                        className="wms-mono"
                        style={{
                          fontSize: "0.8rem",
                          padding: "0.25rem 0.45rem",
                          minHeight: "30px",
                        }}
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="SUPERVISOR">SUPERVISOR</option>
                        <option value="OPERATOR">OPERATOR</option>
                      </select>
                    </td>
                    <td>
                      <span
                        className={`wms-tag ${
                          usr.isActive ? "wms-tag-emerald" : "wms-tag-slate"
                        }`}
                      >
                        {usr.isActive ? "● ACTIVO" : "○ INACTIVO"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className={`wms-btn wms-btn-sm ${
                          usr.isActive
                            ? "wms-btn-danger"
                            : "wms-btn-emerald"
                        }`}
                        onClick={() => void handleToggleUserStatus(usr)}
                      >
                        {usr.isActive ? "Desactivar" : "Reactivar"}
                      </button>
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
