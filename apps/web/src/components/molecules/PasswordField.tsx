// apps/web/src/components/molecules/PasswordField.tsx
// Molécula PasswordField: campo de contraseña con toggle accesible de visibilidad.

import { useState, type ChangeEvent, type JSX } from "react";
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
      <div
        className={`wms-password-wrap ${error ? "wms-password-wrap-invalid" : ""}`}
      >
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
        <button
          type="button"
          className="wms-password-toggle"
          disabled={disabled}
          aria-pressed={visible}
          aria-label={visible ? hideLabel : showLabel}
          onClick={() => setVisible((prev) => !prev)}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {visible ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
          <span>{visible ? hideLabel : showLabel}</span>
        </button>
      </div>
    </FormField>
  );
}
