import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  FileText,
  RotateCcw,
  AlertTriangle,
  Award,
  DollarSign,
  TrendingDown,
  TrendingUp,
  History,
  Archive,
  Save,
} from 'lucide-react';
import { ProductSummary, CaptureItem, SystemStockItem, ZoneItem } from '../types/inventory';
import {
  computeCountedDifferencesMetrics,
  computeCountedDashboardData,
} from '../utils/inventoryCalculations';

interface FinalizeCountModalProps {
  isOpen: boolean;
  onClose: () => void;
  captures: CaptureItem[];
  summaries: ProductSummary[];
  systemStock: SystemStockItem[];
  counterName: string;
  editingSessionName?: string | null;
  onConfirmArchiveAndReset: (sessionName: string, notes: string, downloadPdf: boolean) => Promise<void>;
  onOpenHistory: () => void;
}

export const FinalizeCountModal: React.FC<FinalizeCountModalProps> = ({
  isOpen,
  onClose,
  captures,
  summaries,
  systemStock,
  counterName,
  editingSessionName,
  onConfirmArchiveAndReset,
  onOpenHistory,
}) => {
  const [sessionName, setSessionName] = useState(() => {
    if (editingSessionName) return editingSessionName;
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `Inventario Construrama - ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  React.useEffect(() => {
    if (editingSessionName) {
      setSessionName(editingSessionName);
    }
  }, [editingSessionName, isOpen]);
  const [notes, setNotes] = useState('');
  const [downloadPdfBefore, setDownloadPdfBefore] = useState(true);
  const [isArchiving, setIsArchiving] = useState(false);

  if (!isOpen) return null;

  const countedMetrics = computeCountedDifferencesMetrics(summaries);
  const dashboard = computeCountedDashboardData(summaries);
  const totalPieces = captures.reduce((acc, c) => acc + (c.quantity || 0), 0);

  const handleFinalize = async () => {
    try {
      setIsArchiving(true);
      await onConfirmArchiveAndReset(sessionName, notes, downloadPdfBefore);
      onClose();
    } catch (err) {
      console.error('Error al archivar sesión de inventario:', err);
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden max-h-[90dvh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black leading-tight text-white">
                Finalizar y Archivar Conteo
              </h3>
              <p className="text-xs text-slate-300">
                Guarda este inventario en el historial y reinicia una lista limpia a cero.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isArchiving}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3.5 sm:p-5 space-y-3 sm:space-y-4 flex-1 overflow-y-auto min-h-0">
          {/* Quick Metrics of current count */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-black text-slate-700">
              <span>Resumen Ejecutivo a Guardar:</span>
              <span className="text-indigo-600 font-extrabold">
                {dashboard.accuracyRatePct.toFixed(1)}% Exactitud
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold block">Artículos</span>
                <span className="text-sm font-black text-slate-900">
                  {dashboard.totalCountedProducts}
                </span>
              </div>

              <div className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 font-bold block">Piezas</span>
                <span className="text-sm font-black text-slate-900">
                  {totalPieces.toLocaleString()}
                </span>
              </div>

              <div className="bg-red-50 p-2 rounded-xl border border-red-200 shadow-2xs">
                <span className="text-[10px] text-red-700 font-bold block">Faltantes</span>
                <span className="text-sm font-black text-red-700">
                  -${dashboard.totalFaltantesValue.toFixed(2)}
                </span>
              </div>

              <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-200 shadow-2xs">
                <span className="text-[10px] text-emerald-800 font-bold block">Sobrantes</span>
                <span className="text-sm font-black text-emerald-700">
                  +${dashboard.totalSobrantesValue.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200 font-medium">
              <span>Balance Financiero Neto:</span>
              <span
                className={`font-black ${
                  dashboard.netFinancialImpact < 0
                    ? 'text-red-600'
                    : dashboard.netFinancialImpact > 0
                    ? 'text-emerald-700'
                    : 'text-slate-800'
                }`}
              >
                {dashboard.netFinancialImpact < 0
                  ? `-$${Math.abs(dashboard.netFinancialImpact).toFixed(2)}`
                  : `$${dashboard.netFinancialImpact.toFixed(2)}`}
              </span>
            </div>
          </div>

          {/* Form inputs */}
          <div className="space-y-3">
            {editingSessionName && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs flex items-center gap-2.5 text-indigo-950 font-bold">
                <RotateCcw className="w-4 h-4 text-indigo-600 shrink-0" />
                <div>
                  <span className="block text-[11px] text-indigo-700 font-extrabold uppercase">
                    Sesión Reabierta para Corrección
                  </span>
                  <span>{editingSessionName}</span>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-black text-slate-800 block mb-1">
                Nombre o Identificador del Conteo:
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="Ej. Inventario Anual Pasillo 1 al 4..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>

            <div>
              <label className="text-xs font-black text-slate-800 block mb-1">
                Notas / Observaciones del Auditor (Opcional):
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Ej. Se encontraron cajas completas en tapanco. Pendiente revisar anaquel 3..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40 resize-none"
              />
            </div>

            {/* Checkbox: Download PDF report before clearing */}
            <label className="flex items-start gap-2.5 p-2.5 bg-amber-50 rounded-xl border border-amber-200 cursor-pointer">
              <input
                type="checkbox"
                checked={downloadPdfBefore}
                onChange={(e) => setDownloadPdfBefore(e.target.checked)}
                className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
              />
              <div className="text-xs">
                <span className="font-black text-amber-950 block">
                  Descargar copia oficial en PDF antes de reiniciar
                </span>
                <span className="text-[11px] text-amber-800">
                  Genera el reporte ejecutivo con gráficos y tabla en 1 sola línea para tu archivo.
                </span>
              </div>
            </label>

            {/* Warning info */}
            <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 flex items-start gap-2.5 text-xs text-blue-900">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">¿Qué pasará al reiniciar?</span>
                <span className="text-[11px] text-blue-800 leading-snug block mt-0.5 space-y-1">
                  <span className="block">1. Este lote se guardará íntegro en el <b>Historial de Conteos</b> con sus capturas y diferencias.</span>
                  <span className="block">2. El <b>Avance General se MANTIENE y ACUMULA</b>: las piezas y artículos ya contados siguen sumando en el porcentaje global.</span>
                  <span className="block">3. La lista activa se limpia a <b>cero</b> para que puedas registrar la siguiente zona sin confusiones.</span>
                  <span className="block">4. Tu catálogo de productos y existencias teóricas <b>se mantienen intactos</b>.</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions - Sticky at bottom so confirmation button is always visible */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-2 shrink-0 sticky bottom-0 z-10">
          <button
            onClick={onClose}
            disabled={isArchiving}
            className="w-full sm:w-auto px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition"
          >
            Cancelar (Seguir contando)
          </button>

          <button
            onClick={handleFinalize}
            disabled={isArchiving || captures.length === 0}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase shadow-xs transition active:scale-95 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4 text-emerald-200" />
            <span>{isArchiving ? 'Guardando e iniciando...' : 'Guardar en Historial y Reiniciar'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
