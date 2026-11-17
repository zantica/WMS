// apps/web/src/components/atoms/Select.tsx
// Átomo Select con variantes de estado y tipografía monospace opcional.

import type { JSX, ReactNode, SelectHTMLAttributes } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean | undefined;
  mono?: boolean | undefined;
  children: ReactNode;
}

export function Select({
  invalid = false,
  mono = false,
  className = "",
  children,
  ...rest
}: SelectProps): JSX.Element {
  const composedClass = [
    "wms-select",
    invalid ? "wms-input-invalid" : "",
    mono ? "wms-mono" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <select
      aria-invalid={invalid || undefined}
      className={composedClass}
      {...rest}
    >
      {children}
    </select>
  );
}
