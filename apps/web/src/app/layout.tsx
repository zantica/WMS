// apps/web/src/app/layout.tsx
// Layout raíz del Dashboard de Supervisores (@wms/web) en Next.js App Router.

import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";
import "./globals.css";
import { SupervisorSessionProvider } from "../context/supervisor-session";
import { DashboardShell } from "../components/dashboard-shell";

export const metadata: Metadata = {
  title: "WMS Control Tower — Dashboard de Supervisores",
  description:
    "Panel web multi-tenant para gestión de catálogo, mapa de ubicaciones, ledger inmutable (Kardex) y monitoreo de pedidos y tareas.",
};

export interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="es">
      <body>
        <SupervisorSessionProvider>
          <DashboardShell>{children}</DashboardShell>
        </SupervisorSessionProvider>
      </body>
    </html>
  );
}
