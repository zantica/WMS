"use client";

// apps/web/src/components/dashboard-shell.tsx
// Shell interactivo del Dashboard Web: navegación lateral industrial, telemetría de conexión y configuración multi-tenant.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type JSX, type ReactNode } from "react";
import { useSupervisorSession } from "../context/supervisor-session";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Torre de control",
    subtitle: "KPIs contables y alertas",
    badge: "LIVE",
  },
  {
    href: "/catalog",
    label: "Catálogo y ubicaciones",
    subtitle: "Productos y mapa de zonas",
    badge: "A-Z",
  },
  {
    href: "/inventory",
    label: "Inventario y kardex",
    subtitle: "Saldos ATP y ledger inmutable",
    badge: "LEDGER",
  },
  {
    href: "/operations",
    label: "Pedidos y tareas",
    subtitle: "Reserva, picking y despacho",
    badge: "OPS",
  },
] as const;

export interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps): JSX.Element {
  const pathname = usePathname();
  const { session, updateSession, testConnection } = useSupervisorSession();
  const [configOpen, setConfigOpen] = useState(false);
  const [pingMessage, setPingMessage] = useState<string | null>(null);
  const [isPinging, setIsPinging] = useState(false);

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
        Saltar al contenido principal
      </a>

      <aside className="wms-sidebar">
        <div className="wms-brand">
          <div className="wms-brand-badge" aria-hidden="true">
            WMS
          </div>
          <div>
            <div className="wms-brand-title">WMS Control Tower</div>
            <div className="wms-brand-subtitle">
              Supervisión operativa · S5 Dark
            </div>
          </div>
        </div>

        <nav className="wms-nav" aria-label="Navegación principal">
          <div className="wms-nav-section-label">Módulos operativos</div>
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`wms-nav-link ${isActive ? "wms-nav-link-active" : ""}`}
              >
                <div>
                  <div className="wms-nav-label">{item.label}</div>
                  <div className="wms-nav-sub">{item.subtitle}</div>
                </div>
                <span className="wms-nav-pill">{item.badge}</span>
              </Link>
            );
          })}
        </nav>

        <div className="wms-sidebar-footer" aria-label="Contexto de sesión">
          <div className="wms-footer-row">
            <span className="wms-muted">Almacén activo</span>
            <strong className="wms-mono">{session.warehouseId}</strong>
          </div>
          <div className="wms-footer-row">
            <span className="wms-muted">Supervisor</span>
            <strong>{session.supervisorName}</strong>
          </div>
          <div className="wms-footer-row">
            <span className="wms-muted">Aislamiento DB</span>
            <span className="wms-tag wms-tag-emerald">● RLS Activo</span>
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
                {session.isConnected ? "API ONLINE" : "API OFFLINE"}
              </span>
            </span>

            <span className="wms-topbar-url wms-mono" title="Endpoint de API activo">
              {session.apiBaseUrl}
            </span>

            <span className="wms-tag wms-tag-slate wms-mono">
              x-api-key: {session.apiKey.slice(0, 10)}…
            </span>

            {pingMessage ? (
              <span className="wms-ping-msg" aria-live="polite">
                {pingMessage}
              </span>
            ) : null}
          </div>

          <div className="wms-topbar-actions">
            <button
              type="button"
              className="wms-btn wms-btn-secondary wms-btn-sm"
              onClick={() => {
                void handlePing();
              }}
              disabled={isPinging}
            >
              {isPinging ? "Verificando…" : "Probar conexión (/health)"}
            </button>
            <button
              type="button"
              className="wms-btn wms-btn-outline wms-btn-sm"
              aria-expanded={configOpen}
              onClick={() => setConfigOpen((prev) => !prev)}
            >
              {configOpen ? "Cerrar ajustes" : "Configurar tenant / API"}
            </button>
          </div>
        </header>

        {configOpen ? (
          <section
            className="wms-connection-panel"
            aria-label="Parámetros de conexión multi-tenant"
          >
            <div className="wms-grid-4">
              <label className="wms-field">
                <span>URL base de @wms/api</span>
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
                <span>Header x-api-key (Tenant)</span>
                <input
                  type="text"
                  value={session.apiKey}
                  onChange={(e) => updateSession({ apiKey: e.target.value })}
                  placeholder="demo-api-key-12345"
                />
              </label>

              <label className="wms-field">
                <span>Identificador de almacén</span>
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
                <span>JWT Bearer token (Opcional)</span>
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
