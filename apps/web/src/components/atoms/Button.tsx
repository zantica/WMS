// apps/web/src/components/atoms/Button.tsx
// Átomo Button con variantes semánticas S5/P2 y estados completos (hover, focus-visible, disabled, loading).

import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "emerald"
  | "danger";

export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  loading?: boolean | undefined;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const sizeClass = size === "sm" ? "wms-btn-sm" : "";
  const composedClass = [
    "wms-btn",
    `wms-btn-${variant}`,
    sizeClass,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      disabled={Boolean(disabled || loading)}
      aria-busy={loading || undefined}
      className={composedClass}
      {...rest}
    >
      {children}
    </button>
  );
}
