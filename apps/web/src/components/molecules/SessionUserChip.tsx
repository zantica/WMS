// apps/web/src/components/molecules/SessionUserChip.tsx
// Molécula SessionUserChip: muestra usuario/rol JWT activo y botón de Login o Logout.

import type { JSX } from "react";
import { Link } from "react-router-dom";
import type { AuthUserDTO } from "@wms/shared-types";
import { getUserInitials } from "../../lib/user-initials.js";
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
      <Link
        to="/login"
        className="wms-btn wms-btn-primary wms-btn-sm wms-login-trigger"
        data-testid="session-user-chip"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>{loginLabel}</span>
      </Link>
    );
  }

  const initials = getUserInitials(currentUser.name, currentUser.email);

  return (
    <div
      className="wms-session-chip wms-session-chip-active"
      data-testid="session-user-chip"
    >
      <span className="wms-session-avatar" aria-hidden="true">
        {initials}
      </span>
      <span className="wms-session-active-dot" aria-hidden="true" />
      <div className="wms-session-chip-meta">
        <span className="wms-session-chip-name">{currentUser.name}</span>
        <span className="wms-session-chip-email wms-mono">
          {currentUser.email}
        </span>
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
