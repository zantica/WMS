"use client";

// apps/web/src/components/dashboard-shell.tsx
// Shell interactivo del Dashboard Web: barra lateral de navegación y panel superior de conexión multi-tenant.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type JSX, type ReactNode } from "react";
import { useSupervisorSession } from "../context/supervisor-session";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Resumen Ejecutivo",
    subtitle: "KPIs globales y alertas",
    badge: "LIVE",
  },
  {
    href: "/catalog",
    label: "Catálogo & Ubicaciones",
    subtitle: "Productos y Mapa de Zonas",
    badge: "A-Z",
  },
  {
    href: "/inventory",
    label: "Inventario & Kardex",
    subtitle: "OnHand / ATP y Ledger Inmutable",
    badge: "LEDGER",
  },
  {
    href: "/operations",
    label: "Pedidos & Tareas",
    subtitle: "Alocación, Picking y Despacho",
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
      setPingMessage(`Conectado a ${res.service} (${res.status})`);
    } catch (err) {
      updateSession({ isConnected: false });
      const msg =
        err instanceof Error ? err.message : "No se pudo conectar con @wms/api";
      setPingMessage(`Error: ${msg}`);
    } finally {
      setIsPinging(false);
    }
  }

  return (
    <div className="wms-shell">
      <aside className="wms-sidebar">
        <div className="wms-brand">
          <div className="wms-brand-badge">WMS</div>
          <div>
            <div className="wms-brand-title">WMS Control Tower</div>
            <div className="wms-brand-subtitle">
              Panel de Supervisores · Hito 4
            </div>
          </div>
        </div>

        <nav className="wms-nav" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
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

        <div className="wms-sidebar-footer">
          <div className="wms-footer-row">
            <span className="wms-muted">Almacén Activo</span>
            <strong className="wms-mono">{session.warehouseId}</strong>
          </div>
          <div className="wms-footer-row">
            <span className="wms-muted">Supervisor</span>
            <strong>{session.supervisorName}</strong>
          </div>
          <div className="wms-footer-row">
            <span className="wms-muted">Aislamiento</span>
            <span className="wms-tag wms-tag-emerald">Multi-Tenant Activo</span>
          </div>
        </div>
      </aside>

      <div className="wms-Workspace">
        <header className="wms-topbar">
          <div className="wms-topbar-left">
            <span
              className={`wms-status-dot ${
                session.isConnected ? "wms-status-online" : "wms-status-offline"
              }`}
            />
            <span className="wms-topbar-url wms-mono">
              {session.apiBaseUrl}
            </span>
            <span className="wms-tag wms-tag-slate wms-mono">
              x-api-key: {session.apiKey.slice(0, 10)}…
            </span>
            {pingMessage ? (
              <span className="wms-ping-msg">{pingMessage}</span>
            ) : null}
          </div>

          <div className="wms-topbar-actions">
            <button
              type="button"
              className="wms-btn wms-btn-secondary"
              onClick={() => {
                void handlePing();
              }}
              disabled={isPinging}
            >
              {isPinging ? "Verificando…" : "Verificar API (/health)"}
            </button>
            <button
              type="button"
              className="wms-btn wms-btn-outline"
              onClick={() => setConfigOpen((prev) => !prev)}
            >
              {configOpen ? "Cerrar Conexión" : "Configurar Tenant / API"}
            </button>
          </div>
        </header>

        {configOpen ? (
          <section className="wms-connection-panel">
            <div className="wms-grid-4">
              <label className="wms-field">
                <span>URL Base de @wms/api</span>
                <input
                  type="text"
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
                <span>Warehouse ID</span>
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
                <span>JWT Bearer Token (Opcional F4.2)</span>
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

        <main className="wms-main">{children}</main>
      </div>
    </div>
  );
}
