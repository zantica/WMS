// apps/web/src/components/molecules/PasswordField.tsx
// Molécula PasswordField: campo de contraseña con toggle accesible de visibilidad.

import { useState, type ChangeEvent, type JSX } from "react";
import { Button } from "../atoms/Button.js";
import { Input } from "../atoms/Input.js";
import { FormField } from "./FormField.js";

export interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  required?: boolean | undefined;
  disabled?: boolean | undefined;
  minLength?: number | undefined;
  autoComplete?: string | undefined;
  hint?: string | undefined;
  error?: string | null | undefined;
  showLabel?: string | undefined;
  hideLabel?: string | undefined;
}

export function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder = "••••••••",
  required = false,
  disabled = false,
  minLength,
  autoComplete = "current-password",
  hint,
  error,
  showLabel = "Mostrar contraseña",
  hideLabel = "Ocultar contraseña",
}: PasswordFieldProps): JSX.Element {
  const [visible, setVisible] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    onChange(e.target.value);
  }

  return (
    <FormField
      label={label}
      htmlFor={id}
      required={required}
      hint={hint}
      error={error}
    >
      <div className="wms-password-wrap">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          minLength={minLength}
          autoComplete={autoComplete}
          invalid={Boolean(error)}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? hideLabel : showLabel}
          onClick={() => setVisible((prev) => !prev)}
        >
          {visible ? hideLabel : showLabel}
        </Button>
      </div>
    </FormField>
  );
}
