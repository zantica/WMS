// apps/web/src/components/molecules/FormField.tsx
// Molécula FormField: agrupa Label + control hijo + texto de ayuda + mensaje de error accesible.

import type { JSX, ReactNode } from "react";
import { Label } from "../atoms/Label.js";

export interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean | undefined;
  hint?: string | undefined;
  error?: string | null | undefined;
  className?: string | undefined;
  children: ReactNode;
}

export function FormField({
  label,
  htmlFor,
  required = false,
  hint,
  error,
  className = "",
  children,
}: FormFieldProps): JSX.Element {
  return (
    <div className={["wms-form-field", className].filter(Boolean).join(" ")}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {hint && !error ? <span className="wms-field-hint">{hint}</span> : null}
      {error ? (
        <span className="wms-field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
