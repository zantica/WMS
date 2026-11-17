// apps/web/src/components/labels/label-print-modal.tsx
// Modal de generación y vista previa interactiva de etiquetas logísticas con aislamiento de impresión.
// Soporta portal DOM en document.body, presets en mm, auto-regeneración viva, ajuste de copias por item
// y hoja de impresión dedicada (.wms-label-print-sheet) para @media print sin Tailwind.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type JSX,
} from "react";
import { createPortal } from "react-dom";
import type {
  BarcodeSymbology,
  LabelBatchResponseDTO,
  RenderedLabelDTO,
} from "@wms/shared-types";
import { useSupervisorSession } from "../../context/supervisor-session";
import { useTranslation } from "../../context/locale-context";

export interface LabelItemTarget {
  id: string;
  code: string;
  title: string;
  subtitle?: string | null | undefined;
}

export interface LabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "LOCATION" | "PRODUCT";
  items: LabelItemTarget[];
  initialBatchData?: LabelBatchResponseDTO | undefined;
}

export interface DimensionPreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

export interface ModalItemState extends LabelItemTarget {
  copies: number;
}

export const DIMENSION_PRESETS: readonly DimensionPreset[] = [
  { id: "70x35", label: "70 × 35 mm (Estantería / Estándar)", widthMm: 70, heightMm: 35 },
  { id: "50x25", label: "50 × 25 mm (Artículo / Bin Pequeño)", widthMm: 50, heightMm: 25 },
  { id: "100x50", label: "100 × 50 mm (Caja / Pallet)", widthMm: 100, heightMm: 50 },
  { id: "custom", label: "Personalizado (mm)", widthMm: 70, heightMm: 35 },
] as const;

/**
 * Modifica la cantidad de copias para un item específico asegurando límites 1..50.
 */
export function updateItemCopies(
  items: readonly ModalItemState[],
  id: string,
  deltaOrExact: number | { exact: number },
): ModalItemState[] {
  return items.map((item) => {
    if (item.id === id) {
      const next =
        typeof deltaOrExact === "number"
          ? item.copies + deltaOrExact
          : deltaOrExact.exact;
      const valid = Math.max(1, Math.min(50, Number.isFinite(next) ? next : 1));
      return { ...item, copies: valid };
    }
    return item;
  });
}

/**
 * Elimina un item de la cola de impresión.
 */
export function removeItemFromQueue(
  items: readonly ModalItemState[],
  id: string,
): ModalItemState[] {
  return items.filter((item) => item.id !== id);
}

/**
 * Resuelve las dimensiones en mm de un preset predeterminado.
 */
export function resolvePresetDimensions(
  presetId: string,
): { widthMm: number; heightMm: number } | null {
  const found = DIMENSION_PRESETS.find((p) => p.id === presetId);
  if (!found || presetId === "custom") return null;
  return { widthMm: found.widthMm, heightMm: found.heightMm };
}

/**
 * Expande las etiquetas renderizadas para la hoja de impresión física según el número de copias.
 */
export function expandPrintLabels(
  items: readonly ModalItemState[],
  renderedLabels: readonly RenderedLabelDTO[],
): { key: string; label: RenderedLabelDTO }[] {
  const labelsMap = new Map<string, RenderedLabelDTO>(
    renderedLabels.map((l) => [l.code, l]),
  );
  const result: { key: string; label: RenderedLabelDTO }[] = [];
  for (const item of items) {
    const label = labelsMap.get(item.code);
    if (label) {
      for (let copy = 0; copy < item.copies; copy++) {
        result.push({
          key: `${item.id}-copy-${copy}`,
          label,
        });
      }
    }
  }
  return result;
}

export function LabelPrintModal({
  isOpen,
  onClose,
  entityType,
  items,
  initialBatchData,
}: LabelPrintModalProps): JSX.Element | null {
  const { client } = useSupervisorSession();
  const { t } = useTranslation();

  // Estado local de ítems con copias modificables y capacidad de eliminación
  const [itemsState, setItemsState] = useState<ModalItemState[]>(() =>
    items.map((i) => ({ ...i, copies: 1 })),
  );

  // Sincronizar items al abrir o recibir nuevos items
  useEffect(() => {
    setItemsState(items.map((i) => ({ ...i, copies: 1 })));
  }, [items, isOpen]);

  // Configuración de renderizado
  const [symbology, setSymbology] = useState<BarcodeSymbology>(
    entityType === "LOCATION" ? "QR" : "CODE128",
  );
  const [selectedPreset, setSelectedPreset] = useState<string>("70x35");
  const [widthMm, setWidthMm] = useState<number>(70);
  const [heightMm, setHeightMm] = useState<number>(35);
  const [includeHumanReadable, setIncludeHumanReadable] = useState<boolean>(true);
  const [useBarcodeAsPayload, setUseBarcodeAsPayload] = useState<boolean>(false);

  // Datos generados desde la API
  const [batchData, setBatchData] = useState<LabelBatchResponseDTO | null>(
    initialBatchData ?? null,
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Clave serializada de códigos activos para disparar auto-regeneración si cambian
  const activeCodesKey = useMemo(
    () => itemsState.map((i) => i.code).join(","),
    [itemsState],
  );

  // Carga / generación de etiquetas en la API
  const fetchLabels = useCallback(async (): Promise<void> => {
    if (itemsState.length === 0) {
      setBatchData(null);
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const activeCodes = itemsState.map((i) => i.code);
      if (entityType === "LOCATION") {
        const res = await client.generateLocationLabels({
          locationCodes: activeCodes,
          symbology,
          widthMm,
          heightMm,
          includeHumanReadable,
        });
        setBatchData(res);
      } else {
        const res = await client.generateProductLabels({
          skus: activeCodes,
          symbology,
          widthMm,
          heightMm,
          includeHumanReadable,
          useBarcodeAsPayload,
        });
        setBatchData(res);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Error al generar las etiquetas logísticas.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    itemsState,
    entityType,
    client,
    symbology,
    widthMm,
    heightMm,
    includeHumanReadable,
    useBarcodeAsPayload,
  ]);

  // Auto-regeneración viva al modificar configuración o lista de códigos
  useEffect(() => {
    if (isOpen && itemsState.length > 0) {
      void fetchLabels();
    }
  }, [
    isOpen,
    activeCodesKey,
    symbology,
    widthMm,
    heightMm,
    includeHumanReadable,
    useBarcodeAsPayload,
    fetchLabels,
  ]);

  if (!isOpen) return null;

  // Manejo de cambio de presets de tamaño
  function handlePresetChange(presetId: string): void {
    setSelectedPreset(presetId);
    const dims = resolvePresetDimensions(presetId);
    if (dims) {
      setWidthMm(dims.widthMm);
      setHeightMm(dims.heightMm);
    }
  }

  // Modificación de copias por item
  function handleCopiesDelta(id: string, delta: number): void {
    setItemsState((prev) => updateItemCopies(prev, id, delta));
  }

  function handleSetCopies(id: string, val: number): void {
    setItemsState((prev) => updateItemCopies(prev, id, { exact: val }));
  }

  // Quitar un item de la cola
  function handleRemoveItem(id: string): void {
    setItemsState((prev) => removeItemFromQueue(prev, id));
  }

  // Disparar diálogo de impresión nativo del navegador
  function handlePrint(): void {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  // Mapeo rápido de etiquetas por código para asociarlas con cada item
  const labelsMap = new Map<string, RenderedLabelDTO>(
    batchData ? batchData.labels.map((l) => [l.code, l]) : [],
  );

  // Cálculo de copias totales
  const totalCopies = itemsState.reduce((acc, curr) => acc + curr.copies, 0);

  // Hoja expandida de impresión: repite cada etiqueta según el número de copias
  const expandedPrintLabels = expandPrintLabels(
    itemsState,
    batchData?.labels ?? [],
  );

  const modalContent = (
    <div className="wms-label-modal-root">
      <div
        className="wms-label-modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="label-modal-title"
      >
        <div className="wms-label-modal-dialog">
          {/* Cabecera del Modal (no imprimible) */}
          <div className="wms-label-modal-header wms-no-print">
            <div className="wms-label-modal-title-group">
              <span className="wms-label-modal-icon">🏷️</span>
              <div>
                <h2 id="label-modal-title" className="wms-label-modal-title">
                  {entityType === "LOCATION"
                    ? t("web.labelModal.titleLocation")
                    : t("web.labelModal.titleProduct")}
                </h2>
                <p className="wms-label-modal-subtitle">
                  {itemsState.length}{" "}
                  {itemsState.length === 1
                    ? t("web.labelModal.itemInQueue")
                    : t("web.labelModal.itemsInQueue")}{" "}
                  {t("web.labelModal.copiesToPrint", { count: totalCopies })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="wms-label-modal-close"
              aria-label={t("web.labelModal.closeModalAria")}
            >
              ✕
            </button>
          </div>

          {/* Barra de Configuración y Auto-Regeneración (no imprimible) */}
          <div className="wms-label-modal-toolbar wms-no-print">
            {/* Simbología */}
            <div className="wms-label-toolbar-group">
              <span className="wms-label-toolbar-label">
                {t("web.labelModal.symbologyLabel")}
              </span>
              <div className="wms-label-segmented-control">
                <button
                  type="button"
                  onClick={() => setSymbology("QR")}
                  className={`wms-label-segment-btn ${symbology === "QR" ? "active" : ""}`}
                >
                  {t("web.labelModal.qrCode")}
                </button>
                <button
                  type="button"
                  onClick={() => setSymbology("CODE128")}
                  className={`wms-label-segment-btn ${symbology === "CODE128" ? "active" : ""}`}
                >
                  {t("web.labelModal.code128")}
                </button>
              </div>
            </div>

            {/* Presets de Tamaño */}
            <div className="wms-label-toolbar-group">
              <span className="wms-label-toolbar-label">
                {t("web.labelModal.sizeLabel")}
              </span>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="wms-label-select"
              >
                {DIMENSION_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Inputs personalizados si custom */}
            {selectedPreset === "custom" && (
              <div className="wms-label-toolbar-group">
                <label className="wms-label-checkbox-label">
                  {t("web.labelModal.widthLabel")}
                  <input
                    type="number"
                    min="20"
                    max="250"
                    value={widthMm}
                    onChange={(e) => setWidthMm(Number(e.target.value))}
                    className="wms-label-number-input"
                  />
                  mm
                </label>
                <label className="wms-label-checkbox-label">
                  {t("web.labelModal.heightLabel")}
                  <input
                    type="number"
                    min="15"
                    max="200"
                    value={heightMm}
                    onChange={(e) => setHeightMm(Number(e.target.value))}
                    className="wms-label-number-input"
                  />
                  mm
                </label>
              </div>
            )}

            {/* Texto legible */}
            <label className="wms-label-checkbox-label">
              <input
                type="checkbox"
                checked={includeHumanReadable}
                onChange={(e) => setIncludeHumanReadable(e.target.checked)}
              />
              <span>{t("web.labelModal.humanReadable")}</span>
            </label>

            {/* Toggle EAN comercial para productos */}
            {entityType === "PRODUCT" && (
              <label className="wms-label-checkbox-label">
                <input
                  type="checkbox"
                  checked={useBarcodeAsPayload}
                  onChange={(e) => setUseBarcodeAsPayload(e.target.checked)}
                />
                <span>{t("web.labelModal.useCommercialEan")}</span>
              </label>
            )}

            {/* Botón manual de actualización */}
            <button
              type="button"
              disabled={loading || itemsState.length === 0}
              onClick={() => void fetchLabels()}
              className="wms-btn wms-btn-secondary wms-btn-sm"
              style={{ marginLeft: "auto" }}
            >
              {loading
                ? t("web.labelModal.generatingBtn")
                : t("web.labelModal.refreshBtn")}
            </button>
          </div>

          {/* Mensaje de error si falla la llamada */}
          {errorMsg && (
            <div className="wms-label-modal-error wms-no-print">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Cuerpo del Modal */}
          <div className="wms-label-modal-body">
            {/* 1. Vista previa interactiva en pantalla (no imprimible) */}
            <div className="wms-no-print">
              {loading && !batchData && (
                <div className="wms-label-modal-loading">
                  <div className="wms-label-spinner" />
                  <span>Renderizando vectores de códigos de barras...</span>
                </div>
              )}

              {itemsState.length === 0 && (
                <div className="wms-label-modal-empty">
                  <span>{t("web.labelModal.emptyTitle")}</span>
                  <span style={{ fontSize: "0.75rem" }}>
                    {t("web.labelModal.emptyHint")}
                  </span>
                </div>
              )}

              {itemsState.length > 0 && batchData && (
                <div className="wms-label-modal-preview-grid">
                  {itemsState.map((item) => {
                    const label = labelsMap.get(item.code);
                    return (
                      <div key={item.id} className="wms-label-preview-card">
                        {/* Contenedor del SVG renderizado */}
                        <div className="wms-label-card-svg-container">
                          {label ? (
                            <div
                              style={{ width: "100%", display: "flex", justifyContent: "center" }}
                              dangerouslySetInnerHTML={{ __html: label.svg }}
                            />
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                              Generando SVG...
                            </span>
                          )}
                        </div>

                        {/* Metadatos y Payload */}
                        <div className="wms-label-preview-info">
                          <div className="wms-label-preview-code-row">
                            <span className="wms-label-preview-title" title={item.title}>
                              {item.title}
                            </span>
                            {item.copies > 1 && (
                              <span className="wms-label-preview-badge-copies">
                                ×{item.copies}
                              </span>
                            )}
                          </div>

                          <div className="wms-label-preview-code-row">
                            <span className="wms-label-preview-payload">
                              {label?.barcodePayload ?? item.code}
                            </span>
                            <span className="wms-label-preview-dims">
                              {widthMm}×{heightMm} mm
                            </span>
                          </div>
                        </div>

                        {/* Controles de copias y botón quitar */}
                        <div className="wms-label-preview-actions">
                          <div className="wms-label-copies-control">
                            <span>{t("web.labelModal.copiesLabel")}</span>
                            <button
                              type="button"
                              className="wms-label-qty-btn"
                              onClick={() => handleCopiesDelta(item.id, -1)}
                              disabled={item.copies <= 1}
                              aria-label={`Disminuir copias de ${item.code}`}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              max="50"
                              value={item.copies}
                              onChange={(e) => handleSetCopies(item.id, Number(e.target.value))}
                              className="wms-label-qty-input"
                              aria-label={`Número de copias para ${item.code}`}
                            />
                            <button
                              type="button"
                              className="wms-label-qty-btn"
                              onClick={() => handleCopiesDelta(item.id, 1)}
                              disabled={item.copies >= 50}
                              aria-label={`Aumentar copias de ${item.code}`}
                            >
                              +
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="wms-label-remove-btn"
                            aria-label={`Quitar ${item.code} de la cola`}
                          >
                            {t("web.labelModal.removeBtn")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Hoja dedicada de impresión (@media print únicamente) */}
            <div className="wms-label-print-sheet">
              {expandedPrintLabels.map((card) => (
                <div
                  key={card.key}
                  className="wms-label-print-card"
                  style={{
                    width: `${card.label.widthMm}mm`,
                    height: `${card.label.heightMm}mm`,
                  }}
                  dangerouslySetInnerHTML={{ __html: card.label.svg }}
                />
              ))}
            </div>
          </div>

          {/* Pie del Modal con resumen y botón de impresión (no imprimible) */}
          <div className="wms-label-modal-footer wms-no-print">
            <div className="wms-label-footer-summary">
              {itemsState.length > 0 && batchData ? (
                <span>
                  {t("web.labelModal.totalReady")}{" "}
                  <strong>{totalCopies}</strong>{" "}
                  {totalCopies === 1
                    ? t("web.labelModal.labelSingular")
                    : t("web.labelModal.labelPlural")}{" "}
                  ({itemsState.length} ítems, {widthMm}×{heightMm} mm)
                </span>
              ) : (
                <span>{t("web.labelModal.selectHint")}</span>
              )}
            </div>

            <div className="wms-label-footer-actions">
              <button
                type="button"
                onClick={onClose}
                className="wms-btn wms-btn-secondary wms-btn-sm"
              >
                {t("web.labelModal.cancelBtn")}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={loading || itemsState.length === 0 || expandedPrintLabels.length === 0}
                className="wms-btn wms-btn-primary wms-btn-sm"
              >
                <span>{t("web.labelModal.printGridBtn")}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Si estamos en entorno navegador (browser), montar vía portal en document.body
  if (typeof document !== "undefined" && document.body) {
    return createPortal(modalContent, document.body);
  }

  // Fallback seguro para SSR o testing estático en Node
  return modalContent;
}
