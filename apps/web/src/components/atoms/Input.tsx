// apps/web/src/components/atoms/Input.tsx
// Átomo Input con soporte de estado inválido y tipografía monospace opcional.

import type { InputHTMLAttributes, JSX } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean | undefined;
  mono?: boolean | undefined;
}

export function Input({
  invalid = false,
  mono = false,
  className = "",
  ...rest
}: InputProps): JSX.Element {
  const composedClass = [
    "wms-input",
    invalid ? "wms-input-invalid" : "",
    mono ? "wms-mono" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <input
      aria-invalid={invalid || undefined}
      className={composedClass}
      {...rest}
    />
  );
}
