// apps/web/src/pages/users-page.tsx
// Gobierno de Usuarios y Roles del Tenant (RBAC) en Diseño Atómico con alta con contraseña y soporte SUPERUSER.
//
// ## Design tokens — Tenant Users & Access Governance
// - Estilo: S5 dark-data-dense
// - Paleta (P2 Refinada): --bg #061815 | --surface #0a221d | --surface-card #0f2d26 | --border #1f4a40 | --text #e6f4f0 | --muted #8fb3a9 | --accent #2dd4bf | --success #4ade80 | --warning #fbbf24 | --danger #f43f5e
// - Tipografía (T3): DM Sans (cuerpo e inputs) + JetBrains Mono (roles, emails y contadores), base 14/20
// - Memorable: Tablero de telemetría de roles con cambio inline reactivo y formulario atómico de alta con contraseña Bcrypt

import { useCallback, useEffect, useState, type JSX } from "react";
import type {
  CreateTenantUserInput,
  TenantUserDTO,
  UserRole,
} from "@wms/shared-types";
import { Alert } from "../components/atoms/Alert.js";
import { Badge } from "../components/atoms/Badge.js";
import { Button } from "../components/atoms/Button.js";
import { CreateUserPanel } from "../components/organisms/CreateUserPanel.js";
import { UsersTable } from "../components/organisms/UsersTable.js";
import { useTranslation } from "../context/locale-context.js";
import { useSupervisorSession } from "../context/supervisor-session.js";
import { computeUsersSummary } from "../lib/dashboard-metrics.js";

export default function TenantUsersPage(): JSX.Element {
  const { client, session } = useSupervisorSession();
  const { t } = useTranslation();

  const actorRole: UserRole = session.currentUser?.role ?? "ADMIN";

  // Datos
  const [users, setUsers] = useState<TenantUserDTO[]>([]);

  // Estados de carga y feedback
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Divulgación progresiva: formulario colapsado por defecto
  const [showCreateUser, setShowCreateUser] = useState<boolean>(false);

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
  async function handleCreateUser(input: CreateTenantUserInput): Promise<void> {
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const created = await client.createUser(input);
      setUsers((prev) => [...prev, created]);
      setShowCreateUser(false);
      setSuccessMsg(
        `✓ Usuario ${created.name} (${created.role}) registrado para el tenant.`,
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "No se pudo registrar el usuario",
      );
    } finally {
      setSubmitting(false);
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
            <span>{t("web.users.eyebrow")}</span>
            <span>·</span>
            <span>{session.warehouseId}</span>
          </div>
          <h1 className="wms-page-title">{t("web.users.pageTitle")}</h1>
          <p className="wms-page-subtitle">{t("web.users.pageSubtitle")}</p>
        </div>

        <Button
          variant="primary"
          loading={loading}
          onClick={() => {
            void loadUsersData();
          }}
        >
          {loading ? t("web.users.syncingBtn") : t("web.users.syncBtn")}
        </Button>
      </div>

      {errorMsg ? (
        <Alert variant="error">
          <strong>⚠ Error:</strong> {errorMsg}
        </Alert>
      ) : null}

      {successMsg ? <Alert variant="success">{successMsg}</Alert> : null}

      {/* ── Resumen Rápido por Rol y Estado (KPI Strip) ────────────── */}
      <section className="wms-grid-4" style={{ marginBottom: "1.25rem" }}>
        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.users.kpiTotal")}</span>
            <Badge tone="blue">TENANT</Badge>
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
            {summary.superuserCount > 0 ? (
              <>
                <span>·</span>
                <span className="wms-text-danger">
                  {summary.superuserCount} {t("web.users.kpiSuperusers")}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-amber">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.users.kpiAdmins")}</span>
            <Badge tone="amber">ADMIN</Badge>
          </div>
          <div className="wms-kpi-value">{summary.adminCount}</div>
          <div className="wms-kpi-foot">
            <span>Acceso total y configuración</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-cyan">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">
              {t("web.users.kpiSupervisors")}
            </span>
            <Badge tone="blue">SUPERVISOR</Badge>
          </div>
          <div className="wms-kpi-value">{summary.supervisorCount}</div>
          <div className="wms-kpi-foot">
            <span>Control de planta y catálogo</span>
          </div>
        </div>

        <div className="wms-card wms-kpi-card wms-kpi-card-emerald">
          <div className="wms-kpi-header">
            <span className="wms-kpi-label">{t("web.users.kpiOperators")}</span>
            <Badge tone="emerald">OPERATOR</Badge>
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
          <Badge tone="slate">
            {t("web.users.accountsInTenant", { count: users.length })}
          </Badge>
        </div>

        <div>
          <Button
            variant={showCreateUser ? "secondary" : "primary"}
            onClick={() => setShowCreateUser((prev) => !prev)}
          >
            {showCreateUser
              ? t("web.users.hideFormBtn")
              : t("web.users.registerUserBtn")}
          </Button>
        </div>
      </div>

      {/* ── Formulario de Alta de Usuario (Organismo Atómico) ──────── */}
      {showCreateUser ? (
        <CreateUserPanel
          actorRole={actorRole}
          onCreate={handleCreateUser}
          onClose={() => setShowCreateUser(false)}
          submitting={submitting}
        />
      ) : null}

      {/* ── Tabla de Miembros del Tenant (Organismo Atómico) ───────── */}
      <UsersTable
        users={users}
        loading={loading}
        actorRole={actorRole}
        onUpdateRole={handleUpdateUserRole}
        onToggleStatus={handleToggleUserStatus}
      />
    </>
  );
}
