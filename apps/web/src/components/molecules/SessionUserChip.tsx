// apps/web/src/components/molecules/SessionUserChip.tsx
// Molécula SessionUserChip: muestra usuario/rol JWT activo y botón de Login o Logout.

import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { AuthUserDTO } from "@wms/shared-types";
import { Button } from "../atoms/Button.js";
import { UserRoleBadge } from "./UserRoleBadge.js";

export interface SessionUserChipProps {
  currentUser?: AuthUserDTO | null | undefined;
  loginLabel: string;
  logoutLabel: string;
  onLogout?: (() => void | Promise<void>) | undefined;
  loggingOut?: boolean | undefined;
}

export function SessionUserChip({
  currentUser,
  loginLabel,
  logoutLabel,
  onLogout,
  loggingOut = false,
}: SessionUserChipProps): JSX.Element {
  if (!currentUser) {
    return (
      <div className="wms-session-chip" data-testid="session-user-chip">
        <Link to="/login" className="wms-btn wms-btn-primary wms-btn-sm">
          {loginLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="wms-session-chip" data-testid="session-user-chip">
      <div className="wms-session-chip-meta">
        <span>{currentUser.name}</span>
        <span className="wms-muted wms-mono">{currentUser.email}</span>
      </div>
      <UserRoleBadge role={currentUser.role} />
      {onLogout ? (
        <Button
          variant="outline"
          size="sm"
          loading={loggingOut}
          onClick={() => {
            void onLogout();
          }}
        >
          {logoutLabel}
        </Button>
      ) : null}
    </div>
  );
}
