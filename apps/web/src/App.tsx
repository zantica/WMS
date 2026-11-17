// apps/web/src/App.tsx
// Enrutador SPA de cliente (@wms/web) con React Router y preservación de proveedores globales.

import type { JSX } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { SupportedLocale } from "@wms/shared-types";
import { DashboardShell } from "./components/dashboard-shell.js";
import { LocaleProvider } from "./context/locale-context.js";
import {
  SupervisorSessionProvider,
  type SupervisorSession,
} from "./context/supervisor-session.js";
import CatalogMasterPage from "./pages/catalog-page.js";
import InventoryAndKardexPage from "./pages/inventory-page.js";
import WarehouseLocationsPage from "./pages/locations-page.js";
import NotFoundPage from "./pages/not-found-page.js";
import OperationsMonitorPage from "./pages/operations-page.js";
import SupervisorOverviewPage from "./pages/overview-page.js";
import TenantUsersPage from "./pages/users-page.js";

export interface AppRoutesProps {
  initialSession?: Partial<SupervisorSession> | undefined;
  initialLocale?: SupportedLocale | undefined;
}

export function AppRoutes({
  initialSession,
  initialLocale,
}: AppRoutesProps): JSX.Element {
  return (
    <LocaleProvider initialLocale={initialLocale}>
      <SupervisorSessionProvider initialSession={initialSession}>
        <DashboardShell>
          <Routes>
            <Route path="/" element={<SupervisorOverviewPage />} />
            <Route path="/catalog" element={<CatalogMasterPage />} />
            <Route path="/inventory" element={<InventoryAndKardexPage />} />
            <Route path="/locations" element={<WarehouseLocationsPage />} />
            <Route path="/operations" element={<OperationsMonitorPage />} />
            <Route path="/users" element={<TenantUsersPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </DashboardShell>
      </SupervisorSessionProvider>
    </LocaleProvider>
  );
}

export interface AppProps {
  initialSession?: Partial<SupervisorSession> | undefined;
}

export function App({ initialSession }: AppProps): JSX.Element {
  return (
    <BrowserRouter>
      <AppRoutes initialSession={initialSession} />
    </BrowserRouter>
  );
}

export default App;
