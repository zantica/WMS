"use client";

// apps/web/src/components/labels/label-print-modal.tsx
// Modal de generación y vista previa de cuadrícula de etiquetas logísticas para impresión térmica o A4.
// Soporta selección de simbología (QR / Code128), dimensiones físicas en mm y estilos CSS @media print.

import React, { useEffect, useState, useTransition, type JSX } from "react";
import type {
  BarcodeSymbology,
  LabelBatchResponseDTO,
  RenderedLabelDTO,
} from "@wms/shared-types";
import { useSupervisorSession } from "../../context/supervisor-session";

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
}

interface DimensionPreset {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

const DIMENSION_PRESETS: readonly DimensionPreset[] = [
  { id: "70x35", label: "70 × 35 mm (Estantería Estándar)", widthMm: 70, heightMm: 35 },
  { id: "50x25", label: "50 × 25 mm (Artículo / Bin Pequeño)", widthMm: 50, heightMm: 25 },
  { id: "100x50", label: "100 × 50 mm (Caja / Pallet)", widthMm: 100, heightMm: 50 },
  { id: "custom", label: "Personalizado (mm)", widthMm: 70, heightMm: 35 },
] as const;

export function LabelPrintModal({
  isOpen,
  onClose,
  entityType,
  items,
}: LabelPrintModalProps): JSX.Element | null {
  const { client } = useSupervisorSession();
  const [isPending, startTransition] = useTransition();

  // Configuración de renderizado
  const [symbology, setSymbology] = useState<BarcodeSymbology>(
    entityType === "LOCATION" ? "QR" : "CODE128",
  );
  const [selectedPreset, setSelectedPreset] = useState<string>("70x35");
  const [widthMm, setWidthMm] = useState<number>(70);
  const [heightMm, setHeightMm] = useState<number>(35);
  const [includeHumanReadable, setIncludeHumanReadable] = useState<boolean>(true);
  const [useBarcodeAsPayload, setUseBarcodeAsPayload] = useState<boolean>(false);

  // Datos generados
  const [batchData, setBatchData] = useState<LabelBatchResponseDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-generar al abrir o al cambiar items
  useEffect(() => {
    if (isOpen && items.length > 0) {
      void fetchLabels();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, items]);

  if (!isOpen) return null;

  async function fetchLabels(): Promise<void> {
    if (items.length === 0) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      if (entityType === "LOCATION") {
        const res = await client.generateLocationLabels({
          locationCodes: items.map((i) => i.code),
          symbology,
          widthMm,
          heightMm,
          includeHumanReadable,
        });
        setBatchData(res);
      } else {
        const res = await client.generateProductLabels({
          skus: items.map((i) => i.code),
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
  }

  function handlePresetChange(presetId: string): void {
    setSelectedPreset(presetId);
    const found = DIMENSION_PRESETS.find((p) => p.id === presetId);
    if (found && presetId !== "custom") {
      setWidthMm(found.widthMm);
      setHeightMm(found.heightMm);
    }
  }

  function handlePrint(): void {
    window.print();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="label-modal-title"
    >
      <div className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-[#111A2E] border border-[#23334D] rounded-xl shadow-2xl text-[#E8EEF6] overflow-hidden print:w-full print:max-w-none print:max-h-none print:border-none print:bg-white print:text-black print:p-0">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#23334D] bg-[#162238] print:hidden">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#38BDF8]/10 text-[#38BDF8] font-bold text-sm">
              🏷️
            </span>
            <div>
              <h2 id="label-modal-title" className="text-base font-bold text-[#E8EEF6]">
                Impresión de Etiquetas {entityType === "LOCATION" ? "de Ubicación" : "de Producto"}
              </h2>
              <p className="text-xs text-[#8CA0BA]">
                {items.length} {items.length === 1 ? "elemento seleccionado" : "elementos seleccionados"} para generación en cuadrícula
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#8CA0BA] hover:text-[#E8EEF6] hover:bg-[#23334D] rounded-lg transition-colors"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Barra de Configuración de Etiquetas */}
        <div className="px-6 py-3 bg-[#0B1120] border-b border-[#23334D] flex flex-wrap items-center gap-4 text-xs print:hidden">
          {/* Selector de Simbología */}
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[#8CA0BA]">Simbología:</span>
            <div className="inline-flex rounded-lg bg-[#162238] p-0.5 border border-[#23334D]">
              <button
                type="button"
                onClick={() => setSymbology("QR")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  symbology === "QR"
                    ? "bg-[#38BDF8] text-[#0B1120] font-semibold"
                    : "text-[#8CA0BA] hover:text-[#E8EEF6]"
                }`}
              >
                QR Code
              </button>
              <button
                type="button"
                onClick={() => setSymbology("CODE128")}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  symbology === "CODE128"
                    ? "bg-[#38BDF8] text-[#0B1120] font-semibold"
                    : "text-[#8CA0BA] hover:text-[#E8EEF6]"
                }`}
              >
                Code 128 (1D)
              </button>
            </div>
          </div>

          {/* Selector de Tamaño */}
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[#8CA0BA]">Tamaño:</span>
            <select
              value={selectedPreset}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="bg-[#162238] border border-[#23334D] rounded-lg px-2.5 py-1 text-[#E8EEF6] text-xs focus:outline-none focus:border-[#38BDF8]"
            >
              {DIMENSION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Dimensiones personalizadas si custom */}
          {selectedPreset === "custom" && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[#8CA0BA]">
                Ancho (mm):
                <input
                  type="number"
                  min="20"
                  max="250"
                  value={widthMm}
                  onChange={(e) => setWidthMm(Number(e.target.value))}
                  className="w-16 bg-[#162238] border border-[#23334D] rounded px-2 py-0.5 text-[#E8EEF6] text-center"
                />
              </label>
              <label className="flex items-center gap-1 text-[#8CA0BA]">
                Alto (mm):
                <input
                  type="number"
                  min="15"
                  max="200"
                  value={heightMm}
                  onChange={(e) => setHeightMm(Number(e.target.value))}
                  className="w-16 bg-[#162238] border border-[#23334D] rounded px-2 py-0.5 text-[#E8EEF6] text-center"
                />
              </label>
            </div>
          )}

          {/* Toggle Human-Readable */}
          <label className="flex items-center gap-1.5 cursor-pointer text-[#8CA0BA] hover:text-[#E8EEF6]">
            <input
              type="checkbox"
              checked={includeHumanReadable}
              onChange={(e) => setIncludeHumanReadable(e.target.checked)}
              className="rounded bg-[#162238] border-[#23334D] text-[#38BDF8] focus:ring-0"
            />
            <span>Texto legible</span>
          </label>

          {/* Toggle EAN comercial para productos */}
          {entityType === "PRODUCT" && (
            <label className="flex items-center gap-1.5 cursor-pointer text-[#8CA0BA] hover:text-[#E8EEF6]">
              <input
                type="checkbox"
                checked={useBarcodeAsPayload}
                onChange={(e) => setUseBarcodeAsPayload(e.target.checked)}
                className="rounded bg-[#162238] border-[#23334D] text-[#38BDF8] focus:ring-0"
              />
              <span>Usar EAN comercial si existe</span>
            </label>
          )}

          {/* Botón Actualizar Vista */}
          <button
            type="button"
            disabled={loading}
            onClick={() => void fetchLabels()}
            className="ml-auto px-3 py-1 bg-[#23334D] hover:bg-[#2b3e5c] text-[#E8EEF6] font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Generando..." : "↻ Actualizar"}
          </button>
        </div>

        {/* Mensaje de error si ocurre */}
        {errorMsg && (
          <div className="mx-6 mt-3 p-3 bg-[#F43F5E]/15 border border-[#F43F5E]/40 text-[#F43F5E] rounded-lg text-xs print:hidden">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Contenido / Cuadrícula de Etiquetas */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#0B1120] print:p-0 print:bg-white print:overflow-visible">
          {loading && !batchData && (
            <div className="flex flex-col items-center justify-center py-16 text-[#8CA0BA] text-sm gap-2">
              <div className="w-8 h-8 border-2 border-[#38BDF8] border-t-transparent rounded-full animate-spin" />
              <span>Renderizando vectores vectoriales de etiquetas...</span>
            </div>
          )}

          {batchData && batchData.labels.length > 0 && (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-2 print:gap-2 print:m-0"
              style={{ pageBreakInside: "avoid" }}
            >
              {batchData.labels.map((label: RenderedLabelDTO) => (
                <div
                  key={label.id}
                  className="flex flex-col items-center justify-center p-3 bg-white rounded-lg border border-slate-300 shadow-sm print:shadow-none print:border-dashed print:border-slate-400 print:p-2"
                  style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
                >
                  <div
                    className="w-full max-w-[280px] flex items-center justify-center overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: label.svg }}
                  />
                  <div className="mt-2 text-[10px] text-slate-500 font-mono tracking-tight flex items-center justify-between w-full print:hidden">
                    <span>{label.code}</span>
                    <span>{label.widthMm}×{label.heightMm}mm</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pie del Modal con Botón de Impresión */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#162238] border-t border-[#23334D] print:hidden">
          <div className="text-xs text-[#8CA0BA]">
            {batchData ? (
              <span>
                Listo para imprimir: <strong className="text-[#E8EEF6] font-mono">{batchData.count}</strong> etiquetas ({batchData.dimensions.widthMm}×{batchData.dimensions.heightMm}mm)
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#8CA0BA] hover:text-[#E8EEF6] hover:bg-[#23334D] rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !batchData || batchData.labels.length === 0}
              className="px-4 py-2 text-xs font-semibold bg-[#38BDF8] text-[#0B1120] hover:bg-[#38BDF8]/90 disabled:opacity-50 rounded-lg shadow-md transition-all flex items-center gap-2"
            >
              <span>🖨️</span>
              <span>Imprimir Cuadrícula</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
