// apps/web/src/components/atoms/Alert.tsx
// Átomo Alert accesible con variantes semánticas (error, success, info, warning).

import type { HTMLAttributes, JSX, ReactNode } from "react";

export type AlertVariant = "error" | "success" | "info" | "warning";

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant | undefined;
  children: ReactNode;
}

const ALERT_CLASS_MAP: Record<AlertVariant, string> = {
  error: "wms-alert-banner",
  success: "wms-success-banner",
  info: "wms-alert-info",
  warning: "wms-alert-warning",
};

export function Alert({
  variant = "info",
  className = "",
  children,
  ...rest
}: AlertProps): JSX.Element {
  const isAssertive = variant === "error" || variant === "warning";
  const composedClass = [ALERT_CLASS_MAP[variant], className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role={isAssertive ? "alert" : "status"}
      aria-live={isAssertive ? "assertive" : "polite"}
      className={composedClass}
      {...rest}
    >
      <span>{children}</span>
    </div>
  );
}
