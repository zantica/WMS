// apps/web/src/components/organisms/BootstrapSuperuserForm.tsx
// Organismo BootstrapSuperuserForm: inicializa la cuenta raíz SUPERUSER (admin@navelo.dev).

import { useState, type FormEvent, type JSX } from "react";
import type { BootstrapSuperuserInput } from "@wms/shared-types";
import { useTranslation } from "../../context/locale-context.js";
import { Alert } from "../atoms/Alert.js";
import { Button } from "../atoms/Button.js";
import { Input } from "../atoms/Input.js";
import { FormField } from "../molecules/FormField.js";
import { PasswordField } from "../molecules/PasswordField.js";

export interface BootstrapSuperuserFormProps {
  onSubmit: (input: BootstrapSuperuserInput) => Promise<void>;
  defaultEmail?: string | undefined;
  requiresSetupSecret?: boolean | undefined;
  loading?: boolean | undefined;
  errorMessage?: string | null | undefined;
}

export function BootstrapSuperuserForm({
  onSubmit,
  defaultEmail = "admin@navelo.dev",
  requiresSetupSecret = false,
  loading = false,
  errorMessage,
}: BootstrapSuperuserFormProps): JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState("Navelo Superuser");
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [setupSecret, setSetupSecret] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    await onSubmit({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      ...(setupSecret.trim().length > 0
        ? { setupSecret: setupSecret.trim() }
        : {}),
    });
  }

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="wms-stack"
      data-testid="bootstrap-superuser-form"
    >
      <Alert variant="info">{t("web.auth.bootstrapSubtitle")}</Alert>

      {errorMessage ? <Alert variant="error">{errorMessage}</Alert> : null}

      <FormField
        label={t("web.auth.bootstrapNameLabel")}
        htmlFor="wms-bootstrap-name"
        required
      >
        <Input
          id="wms-bootstrap-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Navelo Superuser"
          disabled={loading}
        />
      </FormField>

      <FormField
        label={t("web.auth.emailLabel")}
        htmlFor="wms-bootstrap-email"
        required
      >
        <Input
          id="wms-bootstrap-email"
          type="email"
          required
          mono
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="admin@navelo.dev"
          disabled={loading}
        />
      </FormField>

      <PasswordField
        id="wms-bootstrap-password"
        label={t("web.auth.passwordLabel")}
        value={password}
        onChange={setPassword}
        required
        minLength={8}
        disabled={loading}
        autoComplete="new-password"
        placeholder={t("web.users.passwordPlaceholder")}
        showLabel={t("web.auth.showPassword")}
        hideLabel={t("web.auth.hidePassword")}
      />

      {requiresSetupSecret ? (
        <PasswordField
          id="wms-bootstrap-secret"
          label={t("web.auth.bootstrapSecretLabel")}
          value={setupSecret}
          onChange={setSetupSecret}
          required
          disabled={loading}
          autoComplete="off"
          showLabel={t("web.auth.showPassword")}
          hideLabel={t("web.auth.hidePassword")}
        />
      ) : null}

      <div className="wms-auth-submit-row">
        <Button
          type="submit"
          variant="primary"
          className="wms-btn-block"
          loading={loading}
        >
          {loading
            ? t("web.auth.bootstrappingBtn")
            : t("web.auth.bootstrapSubmitBtn")}
        </Button>
      </div>
    </form>
  );
}
