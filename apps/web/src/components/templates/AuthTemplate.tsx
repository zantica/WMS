// apps/web/src/components/templates/AuthTemplate.tsx
// Template AuthTemplate: layout centrado S5 dark-data-dense para Login y Bootstrap de Superuser.

import type { JSX, ReactNode } from "react";
import { useTranslation } from "../../context/locale-context.js";

export type AuthTemplateMode = "login" | "bootstrap";

export interface AuthTemplateProps {
  mode: AuthTemplateMode;
  onModeChange: (mode: AuthTemplateMode) => void;
  showModeTabs?: boolean | undefined;
  title: string;
  subtitle: string;
  footerText?: string | undefined;
  children: ReactNode;
}

export function AuthTemplate({
  mode,
  onModeChange,
  showModeTabs = true,
  title,
  subtitle,
  footerText,
  children,
}: AuthTemplateProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="wms-auth-page" data-testid="auth-template">
      <div className="wms-auth-card">
        <header className="wms-auth-header">
          <div className="wms-brand-badge wms-auth-brand-badge" aria-hidden="true">
            <img
              src="/icons/navelo-icon.svg"
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
              className="wms-brand-icon"
            />
          </div>
          <div className="wms-auth-header-copy">
            <div className="wms-eyebrow">{t("web.auth.eyebrow")}</div>
            <h1 className="wms-auth-title">{title}</h1>
            <p className="wms-auth-subtitle">{subtitle}</p>
          </div>
        </header>

        {showModeTabs ? (
          <div className="wms-auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`wms-auth-tab ${
                mode === "login" ? "wms-auth-tab-active" : ""
              }`}
              onClick={() => onModeChange("login")}
            >
              {t("web.auth.loginTab")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "bootstrap"}
              className={`wms-auth-tab ${
                mode === "bootstrap" ? "wms-auth-tab-active" : ""
              }`}
              onClick={() => onModeChange("bootstrap")}
            >
              {t("web.auth.bootstrapTab")}
            </button>
          </div>
        ) : null}

        <div className="wms-auth-body">{children}</div>

        {footerText ? (
          <footer className="wms-auth-footer">
            <span className="wms-mono">{footerText}</span>
            <span className="wms-tag wms-tag-emerald">
              {t("web.shell.rlsActive")}
            </span>
          </footer>
        ) : null}
      </div>
    </section>
  );
}
