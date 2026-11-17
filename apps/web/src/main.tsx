// apps/web/src/main.tsx
// Composition root de la aplicación Vite + React SPA (@wms/web).
// Único punto de lectura de variables de entorno (import.meta.env.VITE_*).

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";
import { App } from "./App.js";
import { resolveBootstrapSession } from "./bootstrap.js";

const initialSession = resolveBootstrapSession({
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_API_KEY: import.meta.env.VITE_API_KEY,
  VITE_WAREHOUSE_ID: import.meta.env.VITE_WAREHOUSE_ID,
});

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App initialSession={initialSession} />
  </StrictMode>,
);
