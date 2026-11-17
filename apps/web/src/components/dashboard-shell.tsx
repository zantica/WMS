// apps/web/src/components/dashboard-shell.tsx
// Shell interactivo del Dashboard Web: navegación lateral industrial, telemetría de conexión y configuración multi-tenant.

import { Link, useLocation } from "react-router-dom";
import React, { useState, type JSX, type ReactNode } from "react";
import {
  LOCALE_METADATA,
  SUPPORTED_LOCALES,
  type SupportedLocale,
  type TranslationKey,
} from "@wms/shared-types";
import { useTranslation } from "../context/locale-context";
import { useSupervisorSession } from "../context/supervisor-session";
import { SessionUserChip } from "./molecules/SessionUserChip.js";

interface NavItemConfig {
  href: string;
  labelKey: TranslationKey;
  subtitleKey: TranslationKey;
  badge: string;
}

const NAV_ITEMS: readonly NavItemConfig[] = [
  {
    href: "/",
    labelKey: "web.shell.dashboardTitle",
    subtitleKey: "web.shell.dashboardSub",
    badge: "LIVE",
  },
  {
    href: "/catalog",
    labelKey: "web.shell.catalogTitle",
    subtitleKey: "web.shell.catalogSub",
    badge: "SKU",
  },
  {
    href: "/locations",
    labelKey: "web.shell.locationsTitle",
    subtitleKey: "web.shell.locationsSub",
    badge: "ZONES",
  },
  {
    href: "/users",
    labelKey: "web.shell.usersTitle",
    subtitleKey: "web.shell.usersSub",
    badge: "RBAC",
  },
  {
    href: "/inventory",
    labelKey: "web.shell.inventoryTitle",
    subtitleKey: "web.shell.inventorySub",
    badge: "LEDGER",
  },
  {
    href: "/operations",
    labelKey: "web.shell.operationsTitle",
    subtitleKey: "web.shell.operationsSub",
    badge: "OPS",
  },
] as const;

export interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps): JSX.Element {
  const { pathname } = useLocation();
  const { session, updateSession, testConnection, logout } =
    useSupervisorSession();
  const { locale, setLocale, t } = useTranslation();
  const [configOpen, setConfigOpen] = useState(false);
  const [pingMessage, setPingMessage] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout(): Promise<void> {
    if (typeof logout !== "function") return;
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  async function handlePing(): Promise<void> {
    setIsPinging(true);
    setPingMessage(null);
    try {
      const res = await testConnection();
      setPingMessage(`✓ ${res.service} (${res.status})`);
    } catch (err) {
      updateSession({ isConnected: false });
      const msg =
        err instanceof Error ? err.message : "Sin respuesta de @wms/api";
      setPingMessage(`⚠ Error: ${msg}`);
    } finally {
      setIsPinging(false);
    }
  }

  return (
    <div className="wms-shell">
      <a href="#wms-main-content" className="wms-skip-link">
        {t("web.shell.skipLink")}
      </a>

      <aside className="wms-sidebar">
        <div className="wms-brand">
          <div className="wms-brand-badge" aria-hidden="true">
            <img
              src="/icons/navelo-icon.svg"
              alt=""
              aria-hidden="true"
              width={36}
              height={36}
              className="wms-brand-icon"
            />
          </div>
          <div>
            <div className="wms-brand-title">{t("web.shell.brandTitle")}</div>
            <div className="wms-brand-subtitle">
              {t("web.shell.brandSubtitle")}
            </div>
          </div>
        </div>

        <nav className="wms-nav" aria-label={t("web.shell.navMainLabel")}>
          <div className="wms-nav-section-label">
            {t("web.shell.modulesLabel")}
          </div>
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`wms-nav-link ${isActive ? "wms-nav-link-active" : ""}`}
              >
                <div>
                  <div className="wms-nav-label">{t(item.labelKey)}</div>
                  <div className="wms-nav-sub">{t(item.subtitleKey)}</div>
                </div>
                <span className="wms-nav-pill">{item.badge}</span>
              </Link>
            );
          })}
        </nav>

        <div className="wms-sidebar-footer" aria-label={t("settings.profile")}>
          <div className="wms-footer-row">
            <span className="wms-muted">{t("web.shell.activeWarehouse")}</span>
            <strong className="wms-mono">{session.warehouseId}</strong>
          </div>
          <div className="wms-footer-row">
            <span className="wms-muted">{t("web.shell.supervisor")}</span>
            <strong>{session.supervisorName}</strong>
          </div>
          <div className="wms-footer-row">
            <span className="wms-muted">{t("web.shell.dbIsolation")}</span>
            <span className="wms-tag wms-tag-emerald">
              {t("web.shell.rlsActive")}
            </span>
          </div>
        </div>
      </aside>

      <div className="wms-workspace">
        <header className="wms-topbar">
          <div className="wms-topbar-left">
            <span className="wms-status-pill">
              <span
                className={`wms-status-dot ${
                  session.isConnected
                    ? "wms-status-online"
                    : "wms-status-offline"
                }`}
                aria-hidden="true"
              />
              <span className="wms-mono">
                {session.isConnected
                  ? t("web.shell.apiOnline")
                  : t("web.shell.apiOffline")}
              </span>
            </span>

            <span className="wms-topbar-url wms-mono" title={t("web.shell.apiBaseUrlLabel")}>
              {session.apiBaseUrl}
            </span>

            {session.apiKey ? (
              <span className="wms-tag wms-tag-slate wms-mono">
                x-api-key: {session.apiKey.slice(0, 10)}…
              </span>
            ) : null}

            {pingMessage ? (
              <span className="wms-ping-msg" aria-live="polite">
                {pingMessage}
              </span>
            ) : null}
          </div>

          <div className="wms-topbar-actions">
            <label
              className="wms-locale-selector"
              aria-label={t("web.shell.languageLabel")}
            >
              <select
                data-testid="wms-locale-select"
                aria-label={t("web.shell.languageLabel")}
                value={locale}
                onChange={(e) => setLocale(e.target.value as SupportedLocale)}
                className="wms-btn wms-btn-outline wms-btn-sm wms-mono"
              >
                {SUPPORTED_LOCALES.map((loc) => (
                  <option key={loc} value={loc}>
                    {LOCALE_METADATA[loc].shortLabel} ·{" "}
                    {LOCALE_METADATA[loc].nativeName}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="wms-btn wms-btn-secondary wms-btn-sm"
              onClick={() => {
                void handlePing();
              }}
              disabled={isPinging}
            >
              {isPinging ? t("web.shell.pingingBtn") : t("web.shell.pingBtn")}
            </button>
            <SessionUserChip
              currentUser={session.currentUser}
              loginLabel={t("web.shell.loginBtn")}
              logoutLabel={t("web.shell.logoutBtn")}
              onLogout={typeof logout === "function" ? handleLogout : undefined}
              loggingOut={isLoggingOut}
            />
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              aria-expanded={configOpen}
              onClick={() => setConfigOpen((prev) => !prev)}
            >
              {configOpen
                ? t("web.shell.closeConfigBtn")
                : t("web.shell.openConfigBtn")}
            </button>
          </div>
        </header>

        {configOpen ? (
          <section
            className="wms-connection-panel"
            aria-label={t("web.shell.configPanelLabel")}
          >
            <div className="wms-grid-4">
              <label className="wms-field">
                <span>{t("web.shell.apiBaseUrlLabel")}</span>
                <input
                  type="url"
                  value={session.apiBaseUrl}
                  onChange={(e) =>
                    updateSession({ apiBaseUrl: e.target.value })
                  }
                  placeholder="http://localhost:3001"
                />
              </label>

              <label className="wms-field">
                <span>{t("web.shell.apiKeyLabel")}</span>
                <input
                  type="text"
                  value={session.apiKey}
                  onChange={(e) => updateSession({ apiKey: e.target.value })}
                  placeholder="demo-api-key-12345"
                />
              </label>

              <label className="wms-field">
                <span>{t("web.shell.warehouseIdLabel")}</span>
                <input
                  type="text"
                  value={session.warehouseId}
                  onChange={(e) =>
                    updateSession({ warehouseId: e.target.value })
                  }
                  placeholder="warehouse-demo"
                />
              </label>

              <label className="wms-field">
                <span>{t("web.shell.bearerTokenLabel")}</span>
                <input
                  type="password"
                  value={session.bearerToken ?? ""}
                  onChange={(e) =>
                    updateSession({
                      bearerToken:
                        e.target.value.trim().length > 0
                          ? e.target.value
                          : undefined,
                    })
                  }
                  placeholder="eyJhbGciOi..."
                />
              </label>
            </div>
          </section>
        ) : null}

        <main id="wms-main-content" className="wms-main">
          {children}
        </main>
      </div>
    </div>
  );
}
