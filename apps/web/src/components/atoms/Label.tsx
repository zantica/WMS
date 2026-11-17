// apps/web/src/components/atoms/Label.tsx
// Átomo Label accesible con indicador visual opcional de campo obligatorio.

import type { JSX, LabelHTMLAttributes, ReactNode } from "react";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean | undefined;
  children: ReactNode;
}

export function Label({
  required = false,
  className = "",
  children,
  ...rest
}: LabelProps): JSX.Element {
  const composedClass = ["wms-label", className].filter(Boolean).join(" ");
  const normalizedChildren =
    required && typeof children === "string" && children.trimEnd().endsWith("*")
      ? children.trimEnd().slice(0, -1).trimEnd()
      : children;

  return (
    <label className={composedClass} {...rest}>
      <span>{normalizedChildren}</span>
      {required ? (
        <span className="wms-label-required" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
  );
}
