// apps/web/src/components/molecules/UserRoleBadge.tsx
// Molécula UserRoleBadge: representa visualmente un UserRole (SUPERUSER, ADMIN, SUPERVISOR, OPERATOR).

import type { JSX } from "react";
import type { UserRole, WmsTone } from "@wms/shared-types";
import { Badge } from "../atoms/Badge.js";

export interface UserRoleBadgeProps {
  role: UserRole;
}

const ROLE_VISUALS: Record<UserRole, { tone: WmsTone; symbol: string }> = {
  SUPERUSER: { tone: "rose", symbol: "★" },
  ADMIN: { tone: "amber", symbol: "◆" },
  SUPERVISOR: { tone: "blue", symbol: "▲" },
  OPERATOR: { tone: "emerald", symbol: "●" },
};

export function UserRoleBadge({ role }: UserRoleBadgeProps): JSX.Element {
  const visual = ROLE_VISUALS[role];
  return (
    <Badge tone={visual.tone}>
      <span aria-hidden="true">{visual.symbol}</span>
      <span>{role}</span>
    </Badge>
  );
}
