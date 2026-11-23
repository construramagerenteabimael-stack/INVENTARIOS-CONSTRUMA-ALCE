import React, { useState, useEffect } from 'react';
import {
  X,
  History,
  FileText,
  FileSpreadsheet,
  Download,
  RotateCcw,
  Trash2,
  Calendar,
  User,
  Clock,
  Award,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Check,
  Sparkles,
} from 'lucide-react';
import { InventoryHistorySession, ProductItem, SystemStockItem, CaptureItem } from '../types/inventory';
import {
  getAllHistorySessions,
  deleteHistorySession,
  restoreHistorySession,
} from '../utils/storage';
import { exportDifferencesPdf } from '../utils/pdfExport';
import {
  generateInventoryWorkbook,
  getExportFileName,
  exportToBuffer,
} from '../utils/excelExport';

interface HistorySessionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  systemStock: SystemStockItem[];
  currentCapturesCount?: number;
  currentCaptures?: CaptureItem[];
  currentSummaries?: any[];
  counterName?: string;
  editingSessionId?: string | null;
  editingSessionName?: string | null;
  onExitReopenMode?: () => Promise<void>;
  onSessionRestored: (sessionName: string, draftSavedName?: string) => Promise<void>;
}

export const HistorySessionsModal: React.FC<HistorySessionsModalProps> = ({
  isOpen,
  onClose,
  products,
  systemStock,
  currentCapturesCount = 0,
  currentCaptures,
  currentSummaries,
  counterName,
  editingSessionId,
  editingSessionName,
  onExitReopenMode,
  onSessionRestored,
}) => {
  const [sessions, setSessions] = useState<InventoryHistorySession[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [sessionToRestore, setSessionToRestore] = useState<InventoryHistorySession | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<InventoryHistorySession | null>(null);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const data = await getAllHistorySessions();
      setSessions(data);
    } catch (err) {
      console.error('Error al cargar historial:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadSessions();
      setActionMsg(null);
      setSessionToRestore(null);
      setSessionToDelete(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadPdf = async (session: InventoryHistorySession) => {
    try {
      setActionMsg(`Generando PDF de "${session.name}"...`);
      await exportDifferencesPdf(
        {
          scope: 'counted',
          items: session.summariesSnapshot.filter((s) => s.countedStock > 0),
          allSummaries: session.summariesSnapshot,
          captures: session.capturesSnapshot,
          systemStock: session.systemStockSnapshot || systemStock,
          counterName: session.closedBy,
          filterLabel: 'Solo lo Contado (Histórico)',
          generatedDate: new Date(session.closedAt),
        },
        false
      );
      setActionMsg(`✓ PDF descargado exitosamente`);
    } catch (err) {
      setActionMsg(`Error al generar PDF: ${(err as Error).message}`);
    }
  };

  const handleDownloadExcel = async (session: InventoryHistorySession) => {
    try {
      setActionMsg(`Generando Excel de "${session.name}"...`);
      const wb = generateInventoryWorkbook({
        captures: session.capturesSnapshot,
        products,
        systemStock: session.systemStockSnapshot || systemStock,
        unidentified: [],
        zones: [],
        recountCodes: new Set(),
        inventoryStartTime: session.createdAt,
        inventoryEndTime: session.closedAt,
      });

      const buffer = exportToBuffer(wb);
      const blob = new Blob([buffer as any], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const fileName = getExportFileName(new Date(session.closedAt));

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setActionMsg(`✓ Excel descargado: ${fileName}`);
    } catch (err) {
      setActionMsg(`Error al generar Excel: ${(err as Error).message}`);
    }
  };

  const executeRestore = async (session: InventoryHistorySession) => {
    try {
      setRestoringId(session.id);
      setActionMsg(`Reabriendo conteo "${session.name}"...`);
      const res = await restoreHistorySession(session, {
        currentCaptures,
        currentSummaries,
        currentSystemStock: systemStock,
        counterName,
      });
      await onSessionRestored(session.name, res.draftSavedName);
      setSessionToRestore(null);
      onClose();
    } catch (err) {
      console.error('Error al reabrir conteo:', err);
      setActionMsg(`Error al reabrir conteo: ${(err as Error).message}`);
    } finally {
      setRestoringId(null);
    }
  };

  const executeDelete = async (session: InventoryHistorySession) => {
    try {
      await deleteHistorySession(session.id);
      setSessions((prev) => prev.filter((s) => s.id !== session.id));
      setSessionToDelete(null);
      setActionMsg(`✓ Conteo "${session.name}" eliminado del historial.`);
    } catch (err) {
      setActionMsg(`Error al eliminar: ${(err as Error).message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black leading-tight text-white">
                Historial de Conteos y Auditorías
              </h3>
              <p className="text-xs text-slate-300">
                Consulta auditorías cerradas, vuelve a descargar sus reportes PDF/Excel o restáuralas.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback message banner */}
        {actionMsg && (
          <div className="p-2.5 bg-slate-900 text-amber-300 text-xs font-bold text-center border-b border-slate-800 flex items-center justify-center gap-2">
            <span>{actionMsg}</span>
          </div>
        )}

        {/* Active Session Warning Banner */}
        {editingSessionName && (
          <div className="mx-4 sm:mx-5 mt-3 p-3.5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-2 border-amber-400 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-400 text-slate-950 rounded-xl font-black text-xs shrink-0 flex items-center gap-1 shadow-xs">
                <span>⚡ EN PANTALLA</span>
              </div>
              <div>
                <span className="text-[10px] text-amber-200 font-bold uppercase block tracking-wider">
                  Conteo actualmente abierto para reconteo:
                </span>
                <span className="text-sm font-black text-white">{editingSessionName}</span>
                <p className="text-[11px] text-indigo-200 mt-0.5">
                  Tus otros conteos están guardados abajo. Para volver a un conteo nuevo o cambiar de conteo, pulsa el botón:
                </p>
              </div>
            </div>
            {onExitReopenMode && (
              <button
                type="button"
                onClick={async () => {
                  await onExitReopenMode();
                  await loadSessions();
                  setActionMsg(`✓ Conteo guardado en Historial. Listo para iniciar nuevo conteo.`);
                }}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black uppercase shadow-md active:scale-95 transition flex items-center justify-center gap-1.5 shrink-0"
              >
                <Check className="w-4 h-4 text-slate-950" />
                <span>Guardar y Salir a Conteo Nuevo</span>
              </button>
            )}
          </div>
        )}

        {/* Reconteo & Edit Guidance Tip */}
        <div className="mx-4 sm:mx-5 mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-start gap-2.5 text-xs text-indigo-950">
          <RotateCcw className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-extrabold block">¿Cómo corregir diferencias o alternar entre conteos?</span>
            <p className="text-[11px] text-indigo-900 leading-relaxed">
              Toca <b>"Reabrir / Cambiar a Este"</b> en cualquier auditoría o borrador. Al cambiar de conteo, <b>tu avance actual se guarda en automático</b> como respaldo para que nunca pierdas ninguna pieza contada.
            </p>
          </div>
        </div>

        {/* Sessions list */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-500 font-bold">
              Cargando historial de inventarios...
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-10 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 space-y-2">
              <div className="w-12 h-12 bg-slate-200 text-slate-400 rounded-2xl flex items-center justify-center mx-auto">
                <History className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-black text-slate-700">Sin conteos archivados aún</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Al terminar un conteo físico, pulsa el botón <b>"Finalizar y Guardar en Historial"</b> para archivar la auditoría y reiniciar a cero.
              </p>
            </div>
          ) : (
            sessions.map((session) => {
              const isCurrentlyActive = session.id === editingSessionId || session.name === editingSessionName;
              const isAutoDraft =
                session.name.toLowerCase().includes('borrador') ||
                Boolean(session.notes && session.notes.toLowerCase().includes('respaldo'));

              return (
              <div
                key={session.id}
                className={`bg-white rounded-2xl p-4 shadow-2xs space-y-3 transition ${
                  isCurrentlyActive
                    ? 'border-2 border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/15'
                    : isAutoDraft
                    ? 'border-2 border-emerald-300 bg-emerald-50/20'
                    : 'border border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Title & Metadata */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-black text-slate-900 leading-snug">
                        {session.name}
                      </h4>
                      {isCurrentlyActive && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-400 text-slate-950 shadow-xs flex items-center gap-1">
                          ⚡ En Pantalla Actualmente
                        </span>
                      )}
                      {isAutoDraft && !isCurrentlyActive && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-700" />
                          Borrador Guardado Automáticamente
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-medium mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(session.closedAt).toLocaleDateString('es-MX')}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(session.closedAt).toLocaleTimeString('es-MX', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="flex items-center gap-1 font-bold text-slate-700">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {session.closedBy}
                      </span>
                    </div>
                  </div>

                  <span className="self-start sm:self-auto px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-indigo-50 text-indigo-900 border border-indigo-200">
                    {session.accuracyRatePct.toFixed(1)}% Exactitud
                  </span>
                </div>

                {/* Metrics row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold block">Contado</span>
                    <span className="text-xs sm:text-sm font-black text-slate-900">
                      {session.totalPiecesCounted.toLocaleString()} pzs ({session.totalCountedProducts} arts)
                    </span>
                  </div>

                  <div className="bg-red-50 p-2 rounded-xl border border-red-200">
                    <span className="text-[10px] text-red-700 font-bold block">Faltantes</span>
                    <span className="text-xs sm:text-sm font-black text-red-700">
                      -${session.totalFaltantesValue.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-200">
                    <span className="text-[10px] text-emerald-800 font-bold block">Sobrantes</span>
                    <span className="text-xs sm:text-sm font-black text-emerald-700">
                      +${session.totalSobrantesValue.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <span className="text-[10px] text-slate-500 font-bold block">Impacto Neto</span>
                    <span
                      className={`text-xs sm:text-sm font-black ${
                        session.netFinancialImpact < 0
                          ? 'text-red-600'
                          : session.netFinancialImpact > 0
                          ? 'text-emerald-700'
                          : 'text-slate-800'
                      }`}
                    >
                      {session.netFinancialImpact < 0
                        ? `-$${Math.abs(session.netFinancialImpact).toFixed(2)}`
                        : `$${session.netFinancialImpact.toFixed(2)}`}
                    </span>
                  </div>
                </div>

                {session.notes && (
                  <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg italic">
                    "{session.notes}"
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleDownloadPdf(session)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-black uppercase transition active:scale-95 shadow-2xs flex items-center gap-1"
                      title="Descargar reporte PDF en formato ejecutivo"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-300" />
                      <span>PDF</span>
                    </button>

                    <button
                      onClick={() => handleDownloadExcel(session)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black uppercase transition active:scale-95 shadow-2xs flex items-center gap-1"
                      title="Descargar libro Excel completo"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Excel</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isCurrentlyActive ? (
                      <button
                        onClick={onClose}
                        className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black uppercase transition active:scale-95 shadow-xs flex items-center gap-1.5"
                        title="Este conteo ya está abierto en la pantalla de Diferencias"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                        <span>Ver en Pantalla</span>
                      </button>
                    ) : isAutoDraft ? (
                      <button
                        onClick={() => setSessionToRestore(session)}
                        disabled={restoringId === session.id}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase transition active:scale-95 shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                        title="Recuperar este borrador guardado automáticamente"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-emerald-200" />
                        <span>{restoringId === session.id ? 'Recuperando...' : 'Restaurar Borrador'}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setSessionToRestore(session)}
                        disabled={restoringId === session.id}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase transition active:scale-95 shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                        title="Reabrir este conteo en vivo para aplicar reconteo y corregir diferencias"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-indigo-200" />
                        <span>{restoringId === session.id ? 'Cargando...' : 'Reabrir / Cambiar a Este'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => setSessionToDelete(session)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Eliminar del historial"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 font-bold">
            Total en archivo: {sessions.length} auditorías guardadas
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* IN-APP CONFIRMATION MODAL: Reabrir Conteo para Modificar/Recontar */}
      {sessionToRestore && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border-2 border-indigo-400 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-100 text-indigo-700 rounded-2xl shrink-0">
                <RotateCcw className="w-6 h-6 animate-spin-slow" />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider block">
                  Modificar Conteo Guardado
                </span>
                <h4 className="text-base font-black text-slate-900 leading-tight">
                  ¿Reabrir este conteo en vivo?
                </h4>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">Conteo seleccionado:</span>
                <span className="text-xs font-black text-indigo-950 truncate max-w-[200px]">
                  {sessionToRestore.name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center pt-1 text-xs">
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block">Piezas</span>
                  <span className="font-black text-slate-900">
                    {sessionToRestore.totalPiecesCounted.toLocaleString()}
                  </span>
                </div>
                <div className="bg-white p-2 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold block">Artículos</span>
                  <span className="font-black text-slate-900">
                    {sessionToRestore.totalCountedProducts}
                  </span>
                </div>
              </div>
            </div>

            {currentCapturesCount > 0 && (
              <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-950 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-snug">
                  <b>Respaldo automático activado:</b> Tienes <b>{currentCapturesCount} capturas</b> activas. Para que no pierdas ningún dato, la app las <b>guardará automáticamente como un borrador en el Historial</b> antes de cargar este conteo. Podrás regresar a él en cualquier momento.
                </p>
              </div>
            )}

            <div className="text-xs text-slate-600 space-y-1.5 bg-indigo-50/70 p-3 rounded-xl border border-indigo-200">
              <span className="font-bold text-indigo-950 block">🔒 Garantía de Aislamiento (Sin mezclar):</span>
              <span className="block text-[11px] text-indigo-900 leading-snug">
                • <b>Solo se mostrarán los artículos de este conteo:</b> La tabla y los reportes PDF/Excel mostrarán únicamente los productos de este lote, sin combinarse con otros conteos.
              </span>
              <span className="block text-[11px] text-indigo-900 leading-snug">
                • <b>Modifica o aplica reconteo:</b> Escanea con la pistola/cámara o pulsa <b>[+ Reconteo]</b> para ajustar piezas faltantes.
              </span>
              <span className="block text-[11px] text-indigo-900 leading-snug">
                • <b>Guarda al terminar:</b> Al finalizar, el historial se actualizará con tus nuevos totales corregidos.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSessionToRestore(null)}
                disabled={restoringId !== null}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => executeRestore(sessionToRestore)}
                disabled={restoringId !== null}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase shadow-md active:scale-95 transition flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4 text-indigo-200" />
                <span>{restoringId === sessionToRestore.id ? 'Reabriendo...' : 'Sí, Reabrir Conteo en Vivo'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL: Eliminar Registro */}
      {sessionToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border-2 border-red-300 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 text-red-600 rounded-2xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900 leading-tight">
                  ¿Eliminar del Historial?
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">
                  "{sessionToDelete.name}"
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Esta acción borrará este registro del historial permanentemente.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSessionToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => executeDelete(sessionToDelete)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase shadow-xs transition"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
