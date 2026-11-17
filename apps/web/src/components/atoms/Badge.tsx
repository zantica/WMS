// apps/web/src/components/atoms/Badge.tsx
// Átomo Badge semántico (S5 dark-data-dense) para roles, estados y etiquetas de telemetría.

import type { HTMLAttributes, JSX, ReactNode } from "react";
import type { WmsTone } from "@wms/shared-types";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: WmsTone | undefined;
  mono?: boolean | undefined;
  children: ReactNode;
}

export function Badge({
  tone = "slate",
  mono = true,
  className = "",
  children,
  ...rest
}: BadgeProps): JSX.Element {
  const composedClass = [
    "wms-tag",
    `wms-tag-${tone}`,
    mono ? "wms-mono" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={composedClass} {...rest}>
      {children}
    </span>
  );
}
