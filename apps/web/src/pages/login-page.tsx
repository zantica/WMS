// apps/web/src/pages/login-page.tsx
// Página /login en Diseño Atómico: flujo de Login JWT y Bootstrap de Superuser (admin@navelo.dev).
//
// ## Design tokens — Login & Bootstrap Superuser (F10.1)
// - Estilo: S5 dark-data-dense
// - Paleta (P2 Refinada): --bg #061815 | --surface #0a221d | --surface-card #0f2d26 | --border #1f4a40 | --text #e6f4f0 | --muted #8fb3a9 | --accent #2dd4bf | --success #4ade80 | --warning #fbbf24 | --danger #f43f5e
// - Tipografía (T3): DM Sans + JetBrains Mono
// - Memorable: Tarjeta de autenticación industrial con conmutador Login / Bootstrap Superuser y verificación de rol en tiempo real

import { useEffect, useState, type JSX } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  BootstrapStatusDTO,
  BootstrapSuperuserInput,
  LoginInput,
} from "@wms/shared-types";
import { Alert } from "../components/atoms/Alert.js";
import { Badge } from "../components/atoms/Badge.js";
import { Button } from "../components/atoms/Button.js";
import { UserRoleBadge } from "../components/molecules/UserRoleBadge.js";
import { BootstrapSuperuserForm } from "../components/organisms/BootstrapSuperuserForm.js";
import { LoginForm } from "../components/organisms/LoginForm.js";
import {
  AuthTemplate,
  type AuthTemplateMode,
} from "../components/templates/AuthTemplate.js";
import { useTranslation } from "../context/locale-context.js";
import { useSupervisorSession } from "../context/supervisor-session.js";

export default function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { session, client, login, bootstrapSuperuser, logout } =
    useSupervisorSession();

  const [mode, setMode] = useState<AuthTemplateMode>("login");
  const [bootstrapStatus, setBootstrapStatus] =
    useState<BootstrapStatusDTO | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadBootstrapStatus(): Promise<void> {
      try {
        const status = await client.getBootstrapStatus();
        if (!active) return;
        setBootstrapStatus(status);
        if (!status.hasSuperuser) {
          setMode("bootstrap");
        }
      } catch {
        // Ignorar fallo de red inicial para mantener login disponible
      }
    }
    void loadBootstrapStatus();
    return () => {
      active = false;
    };
  }, [client]);

  async function handleLogin(input: LoginInput): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await login(input);
      navigate("/");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : t("errors.unauthorized"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBootstrap(input: BootstrapSuperuserInput): Promise<void> {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await bootstrapSuperuser(input);
      navigate("/");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : t("errors.generic"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (session.currentUser) {
    return (
      <AuthTemplate
        mode={mode}
        onModeChange={setMode}
        showModeTabs={false}
        title={t("web.auth.sessionActiveTitle")}
        subtitle={session.currentUser.email}
        footerText={`Tenant: ${session.currentUser.tenantId}`}
      >
        <div className="wms-stack">
          <Alert variant="success">
            <strong>{session.currentUser.name}</strong> ({session.currentUser.email})
          </Alert>
          <div className="wms-row-between">
            <UserRoleBadge role={session.currentUser.role} />
            <Badge tone="slate">{session.currentUser.tenantId}</Badge>
          </div>
          <div className="wms-form-footer">
            <Button
              variant="outline"
              onClick={() => {
                void logout();
              }}
            >
              {t("web.auth.logoutBtn")}
            </Button>
            <Link to="/" className="wms-btn wms-btn-primary">
              {t("web.auth.goToDashboardBtn")}
            </Link>
          </div>
        </div>
      </AuthTemplate>
    );
  }

  const showBootstrapTab =
    bootstrapStatus === null ||
    !bootstrapStatus.hasSuperuser ||
    bootstrapStatus.requiresSetupSecret;

  const title =
    mode === "bootstrap"
      ? t("web.auth.bootstrapTitle")
      : t("web.auth.loginTitle");
  const subtitle =
    mode === "bootstrap"
      ? t("web.auth.bootstrapSubtitle")
      : t("web.auth.loginSubtitle");

  return (
    <AuthTemplate
      mode={mode}
      onModeChange={(nextMode) => {
        setErrorMessage(null);
        setMode(nextMode);
      }}
      showModeTabs={showBootstrapTab}
      title={title}
      subtitle={subtitle}
      footerText={session.apiBaseUrl}
    >
      {mode === "bootstrap" ? (
        <BootstrapSuperuserForm
          onSubmit={handleBootstrap}
          defaultEmail={
            bootstrapStatus?.defaultSuperuserEmail ?? "admin@navelo.dev"
          }
          requiresSetupSecret={bootstrapStatus?.requiresSetupSecret ?? false}
          loading={submitting}
          errorMessage={errorMessage}
        />
      ) : (
        <LoginForm
          onSubmit={handleLogin}
          loading={submitting}
          errorMessage={errorMessage}
          defaultEmail={bootstrapStatus?.defaultSuperuserEmail ?? ""}
        />
      )}
    </AuthTemplate>
  );
}
