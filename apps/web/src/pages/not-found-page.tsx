// apps/web/src/pages/not-found-page.tsx
// Vista de fallback 404 / SPA para rutas no encontradas en @wms/web.

import type { JSX } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "../context/locale-context.js";

export default function NotFoundPage(): JSX.Element {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  return (
    <section className="wms-card" aria-labelledby="wms-not-found-title">
      <div className="wms-eyebrow">HTTP 404 · SPA ROUTER</div>
      <h1 id="wms-not-found-title" className="wms-page-title">
        404 — Ruta no encontrada
      </h1>
      <p className="wms-page-subtitle">
        La ruta <code className="wms-mono">{pathname}</code> no corresponde a ningún módulo operativo de Navelo WMS.
      </p>
      <div className="wms-form-footer">
        <Link to="/" className="wms-btn wms-btn-primary">
          {t("web.shell.dashboardTitle")}
        </Link>
      </div>
    </section>
  );
}
