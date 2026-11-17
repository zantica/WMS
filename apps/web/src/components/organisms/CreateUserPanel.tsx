// apps/web/src/components/organisms/CreateUserPanel.tsx
// Organismo CreateUserPanel: formulario en divulgación progresiva para alta de usuarios con contraseña opcional y rol RBAC.

import { useState, type FormEvent, type JSX } from "react";
import type { CreateTenantUserInput, UserRole } from "@wms/shared-types";
import { useTranslation } from "../../context/locale-context.js";
import { Button } from "../atoms/Button.js";
import { Input } from "../atoms/Input.js";
import { Select } from "../atoms/Select.js";
import { FormField } from "../molecules/FormField.js";
import { PasswordField } from "../molecules/PasswordField.js";

export interface CreateUserPanelProps {
  actorRole: UserRole;
  onCreate: (input: CreateTenantUserInput) => Promise<void>;
  onClose: () => void;
  submitting?: boolean | undefined;
}

export function CreateUserPanel({
  actorRole,
  onCreate,
  onClose,
  submitting = false,
}: CreateUserPanelProps): JSX.Element {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("OPERATOR");

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    await onCreate({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      ...(password.length > 0 ? { password } : {}),
    });
    setName("");
    setEmail("");
    setPassword("");
    setRole("OPERATOR");
  }

  return (
    <div className="wms-disclosure-box" data-testid="create-user-panel">
      <div className="wms-disclosure-header">
        <h2 className="wms-disclosure-title">
          <span>{t("web.users.formTitle")}</span>
        </h2>
        <Button variant="outline" size="sm" onClick={onClose}>
          ✕ {t("common.close")}
        </Button>
      </div>
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <div className="wms-grid-2">
          <FormField
            label={t("web.users.fullNameLabel")}
            htmlFor="wms-create-user-name"
            required
          >
            <Input
              id="wms-create-user-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pedro Gómez"
              disabled={submitting}
            />
          </FormField>

          <FormField
            label={t("web.users.emailLabel")}
            htmlFor="wms-create-user-email"
            required
          >
            <Input
              id="wms-create-user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pedro.gomez@empresa.com"
              disabled={submitting}
            />
          </FormField>

          <FormField
            label={t("web.users.roleLabel")}
            htmlFor="wms-create-user-role"
            required
          >
            <Select
              id="wms-create-user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              disabled={submitting}
            >
              <option value="OPERATOR">OPERATOR (App Móvil / Escáner)</option>
              <option value="SUPERVISOR">
                SUPERVISOR (Control de planta y catálogo)
              </option>
              <option value="ADMIN">ADMIN (Acceso total e inquilino)</option>
              {actorRole === "SUPERUSER" ? (
                <option value="SUPERUSER">
                  SUPERUSER (Control global del sistema)
                </option>
              ) : null}
            </Select>
          </FormField>

          <PasswordField
            id="wms-create-user-password"
            label={t("web.users.passwordLabel")}
            value={password}
            onChange={setPassword}
            minLength={8}
            disabled={submitting}
            autoComplete="new-password"
            placeholder={t("web.users.passwordPlaceholder")}
            showLabel={t("web.auth.showPassword")}
            hideLabel={t("web.auth.hidePassword")}
          />
        </div>
        <div className="wms-form-footer">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={submitting}>
            {t("web.users.submitBtn")}
          </Button>
        </div>
      </form>
    </div>
  );
}
