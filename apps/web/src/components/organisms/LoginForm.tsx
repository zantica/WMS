// apps/web/src/components/organisms/LoginForm.tsx
// Organismo LoginForm: autenticación por email + contraseña (y tenantId opcional) en Diseño Atómico.

import { useState, type FormEvent, type JSX } from "react";
import type { LoginInput } from "@wms/shared-types";
import { useTranslation } from "../../context/locale-context.js";
import { Alert } from "../atoms/Alert.js";
import { Button } from "../atoms/Button.js";
import { Input } from "../atoms/Input.js";
import { FormField } from "../molecules/FormField.js";
import { PasswordField } from "../molecules/PasswordField.js";

export interface LoginFormProps {
  onSubmit: (input: LoginInput) => Promise<void>;
  loading?: boolean | undefined;
  errorMessage?: string | null | undefined;
  defaultEmail?: string | undefined;
}

export function LoginForm({
  onSubmit,
  loading = false,
  errorMessage,
  defaultEmail = "",
}: LoginFormProps): JSX.Element {
  const { t } = useTranslation();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [showTenantField, setShowTenantField] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    await onSubmit({
      email: email.trim().toLowerCase(),
      password,
      ...(tenantId.trim().length > 0 ? { tenantId: tenantId.trim() } : {}),
    });
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="wms-stack"
      data-testid="login-form"
    >
      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

      <FormField
        label={t("web.auth.emailLabel")}
        htmlFor="wms-login-email"
        required
      >
        <Input
          id="wms-login-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@navelo.dev"
          disabled={loading}
        />
      </FormField>

      <PasswordField
        id="wms-login-password"
        label={t("web.auth.passwordLabel")}
        value={password}
        onChange={setPassword}
        required
        disabled={loading}
        autoComplete="current-password"
        showLabel={t("web.auth.showPassword")}
        hideLabel={t("web.auth.hidePassword")}
      />

      <div className="wms-tenant-toggle-wrap">
        <button
          type="button"
          className="wms-tenant-toggle"
          aria-expanded={showTenantField}
          aria-controls="wms-login-tenant-panel"
          onClick={() => setShowTenantField((prev) => !prev)}
          disabled={loading}
        >
          <span aria-hidden="true">{showTenantField ? "▾" : "▸"}</span>
          <span>{t("web.auth.tenantToggleLabel")}</span>
        </button>

        {showTenantField ? (
          <div id="wms-login-tenant-panel" className="wms-tenant-panel">
            <FormField
              label={t("web.auth.tenantOptionalLabel")}
              htmlFor="wms-login-tenant"
            >
              <Input
                id="wms-login-tenant"
                type="text"
                mono
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                placeholder="demo-tenant"
                disabled={loading}
              />
            </FormField>
          </div>
        ) : null}
      </div>

      <div className="wms-auth-submit-row">
        <Button
          type="submit"
          variant="primary"
          className="wms-btn-block"
          loading={loading}
        >
          {loading ? t("web.auth.loggingInBtn") : t("web.auth.submitLoginBtn")}
        </Button>
      </div>
    </form>
  );
}
