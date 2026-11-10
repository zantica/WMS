// apps/web/src/app/layout.tsx
// Layout raíz del Dashboard de Supervisores (@wms/web) en Next.js App Router.
// Carga tipografía T3 (DM Sans + JetBrains Mono) y expone variables CSS globales.

import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import type { JSX, ReactNode } from "react";
import "./globals.css";
import { SupervisorSessionProvider } from "../context/supervisor-session";
import { DashboardShell } from "../components/dashboard-shell";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WMS Control Tower — Panel de supervisión operativa",
  description:
    "Panel web multi-tenant para supervisión de catálogo, mapa de ubicaciones, ledger inmutable (Kardex) y monitoreo de pedidos y tareas en tiempo real.",
};

export interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="es" className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body>
        <SupervisorSessionProvider>
          <DashboardShell>{children}</DashboardShell>
        </SupervisorSessionProvider>
      </body>
    </html>
  );
}
