// apps/web/src/components/organisms/UsersTable.tsx
// Organismo UsersTable: tabla de miembros del tenant con UserRoleBadge, cambio de rol y toggle de estado.

import type { JSX } from "react";
import type { TenantUserDTO, UserRole } from "@wms/shared-types";
import { useTranslation } from "../../context/locale-context.js";
import { Badge } from "../atoms/Badge.js";
import { Button } from "../atoms/Button.js";
import { Select } from "../atoms/Select.js";
import { UserRoleBadge } from "../molecules/UserRoleBadge.js";

export interface UsersTableProps {
  users: TenantUserDTO[];
  loading: boolean;
  actorRole: UserRole;
  onUpdateRole: (userId: string, role: UserRole) => Promise<void>;
  onToggleStatus: (user: TenantUserDTO) => Promise<void>;
}

export function UsersTable({
  users,
  loading,
  actorRole,
  onUpdateRole,
  onToggleStatus,
}: UsersTableProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="wms-card" data-testid="users-table">
      <div className="wms-row-between" style={{ marginBottom: "1rem" }}>
        <div className="wms-card-title" style={{ margin: 0 }}>
          <span>{t("web.users.membersTitle")}</span>
          <Badge tone="slate">
            {t("web.users.membersCount", { count: users.length })}
          </Badge>
        </div>
      </div>

      <div className="wms-table-wrap">
        <table className="wms-table">
          <thead>
            <tr>
              <th>{t("web.users.userCol")}</th>
              <th>{t("web.users.roleCol")}</th>
              <th>{t("web.users.statusCol")}</th>
              <th style={{ textAlign: "right" }}>{t("web.users.actionCol")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <span
                    className="wms-skeleton"
                    aria-label={t("common.loading")}
                  />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="wms-empty-state">
                    <div className="wms-empty-title">
                      {t("web.users.emptyTitle")}
                    </div>
                    <div className="wms-empty-hint">
                      {t("web.users.emptyHint")}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              users.map((usr) => {
                const isProtectedSuperuser =
                  usr.role === "SUPERUSER" && actorRole !== "SUPERUSER";

                return (
                  <tr key={usr.id}>
                    <td>
                      <strong>{usr.name}</strong>
                      <div className="wms-cell-meta">{usr.email}</div>
                    </td>
                    <td>
                      <div className="wms-actions-row">
                        <UserRoleBadge role={usr.role} />
                        <Select
                          aria-label={`${t("web.users.roleCol")} ${usr.name}`}
                          value={usr.role}
                          mono
                          disabled={isProtectedSuperuser}
                          onChange={(e) => {
                            void onUpdateRole(
                              usr.id,
                              e.target.value as UserRole,
                            );
                          }}
                          style={{
                            width: "auto",
                            minHeight: "30px",
                            fontSize: "0.78rem",
                            padding: "0.2rem 0.45rem",
                          }}
                        >
                          {actorRole === "SUPERUSER" ||
                          usr.role === "SUPERUSER" ? (
                            <option value="SUPERUSER">SUPERUSER</option>
                          ) : null}
                          <option value="ADMIN">ADMIN</option>
                          <option value="SUPERVISOR">SUPERVISOR</option>
                          <option value="OPERATOR">OPERATOR</option>
                        </Select>
                      </div>
                    </td>
                    <td>
                      <Badge tone={usr.isActive ? "emerald" : "slate"}>
                        {usr.isActive
                          ? t("web.users.activeBadge")
                          : t("web.users.inactiveBadge")}
                      </Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Button
                        size="sm"
                        variant={usr.isActive ? "danger" : "emerald"}
                        disabled={isProtectedSuperuser}
                        onClick={() => {
                          void onToggleStatus(usr);
                        }}
                      >
                        {usr.isActive
                          ? t("web.users.deactivateBtn")
                          : t("web.users.reactivateBtn")}
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
