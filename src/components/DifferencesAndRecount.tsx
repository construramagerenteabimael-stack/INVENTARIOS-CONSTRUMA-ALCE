import React, { useState, useMemo, useEffect } from 'react';
import {
  ProductSummary,
  CaptureItem,
  ProductItem,
  SystemStockItem,
  UnidentifiedItem,
  ZoneItem,
  InventoryHistorySession,
} from '../types/inventory';
import {
  generateInventoryWorkbook,
  getExportFileName,
  exportToBuffer,
} from '../utils/excelExport';
import {
  computeCountedDifferencesMetrics,
  computeGeneralInventoryProgress,
  computeCountedDashboardData,
} from '../utils/inventoryCalculations';
import {
  FileSpreadsheet,
  Share2,
  Download,
  RotateCcw,
  CheckCircle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Lock,
  Search,
  CheckCircle2,
  PieChart,
  Boxes,
  Target,
  ListFilter,
  Check,
  AlertCircle,
  X,
  FileText,
  Printer,
  BarChart3,
  LayoutGrid,
  Award,
  ShieldAlert,
  Layers,
  ArrowRight,
  Archive,
  History,
  Trash2,
  Edit3,
  Plus,
  Minus,
  Sliders,
} from 'lucide-react';
import { exportDifferencesPdf } from '../utils/pdfExport';

interface DifferencesAndRecountProps {
  summaries: ProductSummary[];
  captures: CaptureItem[];
  products: ProductItem[];
  systemStock: SystemStockItem[];
  unidentified: UnidentifiedItem[];
  zones: ZoneItem[];
  recountCodes: Set<string>;
  onToggleRecount: (code: string, isMarked: boolean) => Promise<void>;
  onStartRecountMode: (code: string) => void;
  counterName?: string;
  stockImportDate?: string;
  inventoryStartTime?: string;
  inventoryEndTime?: string;
  onFinalizeCount?: () => void;
  onOpenHistory?: () => void;
  onDeleteProductCaptures?: (code: string) => Promise<void>;
  onSetProductQuantities?: (
    code: string,
    tapancoQty: number,
    autoservicioQty: number,
    notes?: string
  ) => Promise<void>;
  accumulatedSummaries?: ProductSummary[];
  accumulatedCaptures?: CaptureItem[];
  historySessions?: InventoryHistorySession[];
  editingSessionName?: string | null;
  editingSessionDate?: string | null;
  onExitReopenMode?: () => void;
}

export type DifferencesScope = 'accumulated' | 'session' | 'catalog';

export const DifferencesAndRecount: React.FC<DifferencesAndRecountProps> = ({
  summaries,
  captures,
  products,
  systemStock,
  unidentified,
  zones,
  recountCodes,
  onToggleRecount,
  onStartRecountMode,
  counterName,
  stockImportDate,
  inventoryStartTime,
  inventoryEndTime,
  onFinalizeCount,
  onOpenHistory,
  onDeleteProductCaptures,
  onSetProductQuantities,
  accumulatedSummaries,
  accumulatedCaptures,
  historySessions = [],
  editingSessionName,
  editingSessionDate,
  onExitReopenMode,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Manual quantity editing state (enables tactile/manual adjustments during recount)
  const [productToEditQuantity, setProductToEditQuantity] = useState<ProductSummary | null>(null);
  const [manualTapancoQty, setManualTapancoQty] = useState<number>(0);
  const [manualAutoservicioQty, setManualAutoservicioQty] = useState<number>(0);
  const [manualNotes, setManualNotes] = useState<string>('');
  const [isSavingManualQty, setIsSavingManualQty] = useState<boolean>(false);

  const openManualQuantityEdit = (item: ProductSummary) => {
    setProductToEditQuantity(item);
    setManualTapancoQty(item.tapancoCount ?? 0);
    setManualAutoservicioQty(item.autoservicioCount ?? 0);
    setManualNotes('');
  };

  const handleSaveManualQuantity = async () => {
    if (!productToEditQuantity || !onSetProductQuantities) return;
    try {
      setIsSavingManualQty(true);
      await onSetProductQuantities(
        productToEditQuantity.code,
        Math.max(0, manualTapancoQty),
        Math.max(0, manualAutoservicioQty),
        manualNotes.trim() || undefined
      );
      setProductToEditQuantity(null);
    } catch (err) {
      console.error('Error al guardar cantidad manualmente:', err);
    } finally {
      setIsSavingManualQty(false);
    }
  };

  // Scope: 'session' (⚡ Solo este conteo activo - DEFAULT para no mezclar) vs 'accumulated' (📊 Acumulado de todas las sesiones) vs 'catalog' (📦 Todo el catálogo)
  const [scope, setScope] = useState<DifferencesScope>('session');

  // Enforce session scope strictly whenever a previous session is reopened for recount
  useEffect(() => {
    if (editingSessionName) {
      setScope('session');
    }
  }, [editingSessionName]);

  // Toggle for the Avance General card: 'accumulated' (Acumulado de toda la tienda) vs 'live' (Solo esta tanda)
  const [progressViewMode, setProgressViewMode] = useState<'accumulated' | 'live'>('accumulated');

  // Sub-filter for the table / list
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'differences' | 'faltantes' | 'sobrantes' | 'cuadrados'
  >('all');

  // Search filter
  const [searchTerm, setSearchTerm] = useState('');

  // In-app confirmation dialog for discarding a product's captures
  const [productToDeleteCaptures, setProductToDeleteCaptures] = useState<{
    code: string;
    description: string;
  } | null>(null);

  const handleDeleteProductCapturesWithConfirm = (code: string, description: string) => {
    if (!onDeleteProductCaptures) return;
    setProductToDeleteCaptures({ code, description });
  };

  const executeDiscardProductCaptures = async (code: string) => {
    if (!onDeleteProductCaptures) return;
    try {
      await onDeleteProductCaptures(code);
      setProductToDeleteCaptures(null);
    } catch (err) {
      console.error('Error al descartar capturas del producto:', err);
    }
  };

  // 1. Overall Inventory Progress (Avance General de Todo el Inventario)
  // Maintains and accumulates progress from historySessions so it never drops back to 0% when resetting
  const progress = useMemo(() => {
    return computeGeneralInventoryProgress(
      accumulatedSummaries || summaries,
      captures,
      systemStock,
      historySessions
    );
  }, [accumulatedSummaries, summaries, captures, systemStock, historySessions]);

  // 2a. Differences metrics for live session items
  const liveMetrics = useMemo(() => {
    return computeCountedDifferencesMetrics(summaries);
  }, [summaries]);

  // 2b. Differences metrics for accumulated items across all closed sessions + live
  const accumulatedMetrics = useMemo(() => {
    return computeCountedDifferencesMetrics(accumulatedSummaries || summaries);
  }, [accumulatedSummaries, summaries]);

  // Active base summaries & captures based on selected scope
  // If an editing session is open or scope is 'session', strictly isolate to this count's summaries & captures
  const activeBaseSummaries = useMemo(() => {
    if (scope === 'session' || (editingSessionName && scope !== 'catalog')) {
      return summaries;
    }
    return accumulatedSummaries || summaries;
  }, [scope, summaries, accumulatedSummaries, editingSessionName]);

  const activeBaseCaptures = useMemo(() => {
    if (scope === 'session' || (editingSessionName && scope !== 'catalog')) {
      return captures;
    }
    return accumulatedCaptures || captures;
  }, [scope, captures, accumulatedCaptures, editingSessionName]);

  // 3. Deep visual dashboard analytics for active base summaries
  const countedDashboard = useMemo(() => {
    return computeCountedDashboardData(activeBaseSummaries);
  }, [activeBaseSummaries]);

  // View mode: 'cards' (Lista detallada) vs 'dashboard' (Gráficos y KPIs ejecutivos)
  const [viewMode, setViewMode] = useState<'cards' | 'dashboard'>('cards');

  // 4. Full catalog theoretical totals (para cuando el usuario cambia a 'catalog')
  const catalogMetrics = useMemo(() => {
    const base = accumulatedSummaries || summaries;
    const totalFaltantes = base.filter((s) => s.status === 'faltante');
    const totalSobrantes = base.filter((s) => s.status === 'excedente');
    const totalExactos = base.filter((s) => s.status === 'completo' || s.difference === 0);

    const totalFaltantesValue = totalFaltantes.reduce(
      (acc, s) => acc + Math.abs(s.differenceValue),
      0
    );
    const totalSobrantesValue = totalSobrantes.reduce(
      (acc, s) => acc + s.differenceValue,
      0
    );
    const totalFaltantesPieces = totalFaltantes.reduce(
      (acc, s) => acc + Math.abs(s.difference),
      0
    );
    const totalSobrantesPieces = totalSobrantes.reduce(
      (acc, s) => acc + s.difference,
      0
    );
    const netFinancialImpact = base.reduce((acc, s) => acc + s.differenceValue, 0);

    return {
      totalProducts: base.length,
      faltantes: totalFaltantes,
      sobrantes: totalSobrantes,
      exactos: totalExactos,
      totalFaltantesValue,
      totalSobrantesValue,
      totalFaltantesPieces,
      totalSobrantesPieces,
      netFinancialImpact,
    };
  }, [summaries, accumulatedSummaries]);

  // Active metrics based on selected scope
  const activeMetrics = useMemo(() => {
    if (scope === 'session' || (editingSessionName && scope !== 'catalog')) {
      return {
        totalItems: liveMetrics.totalCountedProducts,
        faltantesCount: liveMetrics.countedFaltantes.length,
        faltantesValue: liveMetrics.totalFaltantesValue,
        faltantesPieces: liveMetrics.totalFaltantesPieces,
        sobrantesCount: liveMetrics.countedSobrantes.length,
        sobrantesValue: liveMetrics.totalSobrantesValue,
        sobrantesPieces: liveMetrics.totalSobrantesPieces,
        cuadradosCount: liveMetrics.countedExactos.length,
        netImpact: liveMetrics.netFinancialImpact,
        itemsBase: summaries.filter((s) => s.countedStock > 0),
      };
    } else if (scope === 'accumulated') {
      const baseItems = accumulatedSummaries || summaries;
      return {
        totalItems: accumulatedMetrics.totalCountedProducts,
        faltantesCount: accumulatedMetrics.countedFaltantes.length,
        faltantesValue: accumulatedMetrics.totalFaltantesValue,
        faltantesPieces: accumulatedMetrics.totalFaltantesPieces,
        sobrantesCount: accumulatedMetrics.countedSobrantes.length,
        sobrantesValue: accumulatedMetrics.totalSobrantesValue,
        sobrantesPieces: accumulatedMetrics.totalSobrantesPieces,
        cuadradosCount: accumulatedMetrics.countedExactos.length,
        netImpact: accumulatedMetrics.netFinancialImpact,
        itemsBase: baseItems.filter((s) => s.countedStock > 0),
      };
    } else {
      const baseItems = accumulatedSummaries || summaries;
      return {
        totalItems: catalogMetrics.totalProducts,
        faltantesCount: catalogMetrics.faltantes.length,
        faltantesValue: catalogMetrics.totalFaltantesValue,
        faltantesPieces: catalogMetrics.totalFaltantesPieces,
        sobrantesCount: catalogMetrics.sobrantes.length,
        sobrantesValue: catalogMetrics.totalSobrantesValue,
        sobrantesPieces: catalogMetrics.totalSobrantesPieces,
        cuadradosCount: catalogMetrics.exactos.length,
        netImpact: catalogMetrics.netFinancialImpact,
        itemsBase: baseItems,
      };
    }
  }, [scope, liveMetrics, accumulatedMetrics, catalogMetrics, summaries, accumulatedSummaries]);

  // Filtered list of products for the table/cards
  const filteredItems = useMemo(() => {
    let list = activeMetrics.itemsBase;

    // Apply status filter
    if (statusFilter === 'differences') {
      list = list.filter((s) => s.difference !== 0);
    } else if (statusFilter === 'faltantes') {
      list = list.filter((s) => s.difference < 0);
    } else if (statusFilter === 'sobrantes') {
      list = list.filter((s) => s.difference > 0);
    } else if (statusFilter === 'cuadrados') {
      list = list.filter((s) => s.difference === 0);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }

    return list;
  }, [activeMetrics.itemsBase, statusFilter, searchTerm]);

  const totalReconteos = summaries.filter((s) => s.isMarkedForRecount);

  // Generate and Download / Share Excel
  const handleExportExcel = async (shouldShare = false) => {
    try {
      setIsExporting(true);
      setExportSuccessMsg(null);

      const wb = generateInventoryWorkbook({
        captures: activeBaseCaptures,
        products,
        systemStock,
        unidentified,
        zones,
        recountCodes,
        stockImportDate,
        inventoryStartTime,
        inventoryEndTime: inventoryEndTime || new Date().toISOString(),
        historySessions: historySessions,
      });

      const buffer = exportToBuffer(wb);
      const fileName = getExportFileName();
      const blob = new Blob([buffer as unknown as BlobPart], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      if (shouldShare && navigator.canShare) {
        const file = new File([blob], fileName, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'Inventario Construrama Alce',
            text: `Reporte de inventario físico Construrama Alce (${new Date().toLocaleDateString('es-MX')})`,
            files: [file],
          });
          setExportSuccessMsg('Archivo compartido exitosamente.');
          setIsExporting(false);
          return;
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportSuccessMsg(`Archivo descargado: ${fileName}`);
    } catch (err: unknown) {
      const error = err as Error;
      setExportSuccessMsg(`Error al generar Excel: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Generate and Download / Share PDF (Matching current screen view format)
  const handleExportPdf = async (shouldShare = false) => {
    try {
      setIsExportingPdf(true);
      setExportSuccessMsg(null);

      const activeFilterLabel =
        statusFilter === 'all'
          ? scope === 'session'
            ? `Solo Conteo Actual (${filteredItems.length})`
            : scope === 'accumulated'
            ? `Acumulado Global (${filteredItems.length})`
            : `Todo el Catálogo (${filteredItems.length})`
          : statusFilter === 'differences'
          ? `Con Diferencia (${filteredItems.length})`
          : statusFilter === 'faltantes'
          ? `Faltantes (${filteredItems.length})`
          : statusFilter === 'sobrantes'
          ? `Sobrantes (${filteredItems.length})`
          : `Cuadrados (${filteredItems.length})`;

      const result = await exportDifferencesPdf(
        {
          scope: scope === 'catalog' ? 'catalog' : 'counted',
          items: filteredItems,
          allSummaries: activeBaseSummaries,
          captures: activeBaseCaptures,
          systemStock,
          zones,
          counterName: counterName || 'No especificado',
          filterLabel: activeFilterLabel,
          generatedDate: new Date(),
          historySessions: historySessions,
        },
        shouldShare
      );

      setExportSuccessMsg(result.message);
    } catch (err: unknown) {
      const error = err as Error;
      setExportSuccessMsg(`Error al generar PDF: ${error.message}`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4 pb-32">
      {/* Reconteo Mode Active Alert Banner */}
      {editingSessionName && (
        <div className="p-4 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-2 border-indigo-400 text-white rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-2xl border border-indigo-400/40 shrink-0 mt-1 sm:mt-0">
              <RotateCcw className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-400 text-slate-950 shadow-xs">
                  Auditoría Reabierta
                </span>
                <span className="text-xs font-black text-amber-200">{editingSessionName}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  🔒 Aislado: Sin mezclar otros conteos
                </span>
                {editingSessionDate && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-200 border border-blue-400/30">
                    📅 Existencias del Sistema: {new Date(editingSessionDate).toLocaleDateString('es-MX')}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-indigo-200 mt-1 leading-snug">
                Viendo <b>únicamente los {liveMetrics.totalCountedProducts} artículos</b> contados en este lote ({progress.livePieces.toLocaleString()} piezas). Las existencias del sistema están <b>fijadas a la fecha original del conteo</b> para que las diferencias no varíen con cargas posteriores. Puedes modificar cantidades manualmente con el botón <b>[✏️ Modificar]</b> o escanear con la pistola.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end md:self-auto">
            {onFinalizeCount && (
              <button
                type="button"
                onClick={onFinalizeCount}
                className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black uppercase shadow-sm active:scale-95 transition flex items-center gap-1.5"
                title="Guardar los cambios y actualizar este conteo en el historial"
              >
                <Check className="w-4 h-4 text-slate-950" />
                <span>Guardar Cambios</span>
              </button>
            )}
            {onExitReopenMode && (
              <button
                type="button"
                onClick={onExitReopenMode}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-indigo-200 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1 border border-white/20"
                title="Cerrar esta auditoría y volver al conteo nuevo"
              >
                <X className="w-4 h-4" />
                <span>Cerrar</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SECCIÓN 1: PORCENTAJE DE AVANCE GENERAL DE TODO EL INVENTARIO  */}
      {/* ============================================================== */}
      {(() => {
        const displayPieces =
          progressViewMode === 'accumulated'
            ? progress.totalCountedPieces
            : progress.livePieces;

        const displayPctPieces =
          progressViewMode === 'accumulated'
            ? progress.pctProgressPieces
            : progress.totalSystemPieces > 0
            ? (progress.livePieces / progress.totalSystemPieces) * 100
            : 0;

        const displayProducts =
          progressViewMode === 'accumulated'
            ? progress.totalCountedProducts
            : progress.liveProductsCount;

        const displayPctProducts =
          progressViewMode === 'accumulated'
            ? progress.pctProgressProducts
            : progress.totalCatalogProducts > 0
            ? (progress.liveProductsCount / progress.totalCatalogProducts) * 100
            : 0;

        const displayPendingProducts =
          progressViewMode === 'accumulated'
            ? progress.totalPendingProducts
            : Math.max(0, progress.totalCatalogProducts - progress.liveProductsCount);

        const displayPendingPieces =
          progressViewMode === 'accumulated'
            ? progress.totalPendingPieces
            : Math.max(0, progress.totalSystemPieces - progress.livePieces);

        return (
          <div className="bg-gradient-to-br from-[#122647] via-[#1c3a6b] to-[#0f1f38] text-white p-4 sm:p-5 rounded-3xl border-2 border-emerald-500/50 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/20 text-emerald-300 rounded-2xl border border-emerald-400/40 shadow-inner">
                  <PieChart className="w-6 h-6 sm:w-7 sm:h-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-slate-950 px-2 py-0.5 rounded-full">
                      Métrica Global
                    </span>
                    <span className="text-xs text-slate-300 font-bold">
                      {progress.sessionsCount > 0
                        ? `Acumulado (${progress.sessionsCount} lote${progress.sessionsCount > 1 ? 's' : ''} + actual)`
                        : 'Inventario en curso'}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-black text-amber-300 tracking-tight leading-tight mt-0.5">
                    Avance General de Todo el Inventario
                  </h2>
                </div>
              </div>

              <div className="flex items-center sm:items-end justify-between sm:justify-end gap-2 flex-wrap">
                {onOpenHistory && (
                  <button
                    type="button"
                    onClick={onOpenHistory}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-950/70 hover:bg-slate-950 text-indigo-300 hover:text-white font-bold text-[11px] border border-indigo-400/30 flex items-center gap-1.5 transition active:scale-95 shadow-2xs"
                    title="Ver auditorías archivadas o reabrir una para reconteo"
                  >
                    <History className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Historial ({historySessions?.length || 0})</span>
                  </button>
                )}

                {progress.sessionsCount > 0 && (
                  <div className="flex items-center bg-slate-950/70 p-0.5 rounded-xl border border-slate-700/80 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setProgressViewMode('accumulated')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        progressViewMode === 'accumulated'
                          ? 'bg-emerald-500 text-slate-950 font-black shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                      title="Mantiene y acumula todas las sesiones finalizadas más el conteo activo"
                    >
                      📊 Acumulado ({progress.totalCountedPieces.toLocaleString()} pzs)
                    </button>
                    <button
                      type="button"
                      onClick={() => setProgressViewMode('live')}
                      className={`px-2.5 py-1 rounded-lg transition ${
                        progressViewMode === 'live'
                          ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                          : 'text-slate-300 hover:text-white'
                      }`}
                      title="Muestra únicamente las piezas contadas en esta nueva tanda de trabajo"
                    >
                      ⚡ Solo Este Conteo ({progress.livePieces.toLocaleString()} pzs)
                    </button>
                  </div>
                )}

                <div className="text-right shrink-0">
                  <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                    {displayPctPieces.toFixed(1)}%
                  </span>
                  <span className="text-[10px] block text-slate-300 font-bold uppercase">
                    Avance en Piezas
                  </span>
                </div>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-slate-950/80 rounded-full h-4 sm:h-5 p-0.5 border border-slate-700 shadow-inner overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-400 via-emerald-400 to-emerald-500 h-full rounded-full transition-all duration-700 shadow-md flex items-center justify-end pr-2"
                  style={{ width: `${Math.max(5, displayPctPieces)}%` }}
                >
                  <span className="text-[10px] font-black text-slate-950">
                    {displayPctPieces.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-300">
                <span>Inicio (0 pzs)</span>
                <span className="text-amber-300 font-bold">
                  {displayPieces.toLocaleString()} piezas contadas {progressViewMode === 'accumulated' && progress.sessionsCount > 0 ? '(acumulado)' : ''}
                </span>
                <span>Meta: {progress.totalSystemPieces.toLocaleString()} pzs</span>
              </div>

              {/* Breakdown strip when sessions exist */}
              {progress.sessionsCount > 0 && (
                <div className="flex items-center justify-between bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 flex-wrap gap-2 mt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="font-bold text-emerald-300">Progreso Acumulado Activo:</span>
                    <span>
                      {progress.historicalPieces.toLocaleString()} pzs en {progress.sessionsCount} lote{progress.sessionsCount > 1 ? 's' : ''} anterior{progress.sessionsCount > 1 ? 'es' : ''} + {progress.livePieces.toLocaleString()} pzs en conteo actual
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                    {progress.totalCountedProducts.toLocaleString()} de {progress.totalCatalogProducts.toLocaleString()} artículos ({progress.pctProgressProducts.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>

            {/* General Progress Breakdown Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-300">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Piezas Contadas
                  </span>
                  <span className="text-sm font-black text-white">
                    {displayPieces.toLocaleString()} <span className="text-slate-400 font-normal">/ {progress.totalSystemPieces.toLocaleString()}</span>
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold block mt-0.5">
                    {displayPctPieces.toFixed(1)}% del stock total
                  </span>
                  {progress.sessionsCount > 0 && progressViewMode === 'accumulated' && (
                    <span className="text-[9px] text-slate-400 block mt-0.5 font-medium">
                      ({progress.historicalPieces.toLocaleString()} en historial + {progress.livePieces.toLocaleString()} actual)
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Artículos con Conteo
                  </span>
                  <span className="text-sm font-black text-white">
                    {displayProducts.toLocaleString()} <span className="text-slate-400 font-normal">/ {progress.totalCatalogProducts.toLocaleString()}</span>
                  </span>
                  <span className="text-[10px] text-amber-300 font-bold block mt-0.5">
                    {displayPctProducts.toFixed(1)}% del catálogo
                  </span>
                  {progress.sessionsCount > 0 && progressViewMode === 'accumulated' && (
                    <span className="text-[9px] text-slate-400 block mt-0.5 font-medium">
                      ({progress.historicalProductsCount} en historial + {progress.liveProductsCount} actual)
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800 flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300">
                  <ListFilter className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">
                    Pendientes por Contar
                  </span>
                  <span className="text-sm font-black text-white">
                    {displayPendingProducts.toLocaleString()} artículos
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                    ~{displayPendingPieces.toLocaleString()} pzs restantes
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ============================================================== */}
      {/* EXCEL & PDF EXPORT & FINALIZATION BANNER                       */}
      {/* ============================================================== */}
      <div className="bg-gradient-to-r from-red-700 via-red-600 to-amber-600 rounded-3xl p-4 sm:p-5 text-white shadow-lg space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-xs flex-shrink-0">
              <FileSpreadsheet className="w-7 h-7 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-tight leading-tight">
                Exportar Reportes Oficiales (Excel & PDF)
              </h2>
              <p className="text-xs text-red-100 font-medium">
                Genera el reporte ejecutivo en PDF (con el formato de tarjetas) y el libro de Excel con las 7 hojas oficiales.
              </p>
            </div>
          </div>
        </div>

        {inventoryEndTime ? (
          <div className="p-3 bg-emerald-950/70 border border-emerald-400/50 rounded-2xl flex items-center justify-between gap-2 text-xs flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <span className="font-black text-emerald-300 block">Inventario Oficialmente Finalizado</span>
                <span className="text-[11px] text-emerald-100">
                  Cerrado el {new Date(inventoryEndTime).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleExportPdf(true)}
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded-xl text-xs uppercase shadow-sm active:scale-95 transition flex items-center gap-1"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                onClick={() => handleExportExcel(true)}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs uppercase shadow-sm active:scale-95 transition flex items-center gap-1"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {/* Row 1: PDF Export Options (User requested format) */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleExportPdf(false)}
                disabled={isExportingPdf}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs uppercase shadow-md active:scale-95 transition flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4 text-slate-950" />
                <span>{isExportingPdf ? 'Generando PDF...' : '📄 Descargar Reporte en PDF'}</span>
              </button>

              <button
                onClick={() => handleExportPdf(true)}
                disabled={isExportingPdf}
                className="py-2.5 px-4 rounded-xl bg-white/20 hover:bg-white/30 text-white font-black text-xs transition active:scale-95 flex items-center gap-1.5 border border-white/40 shadow-xs"
                title="Compartir PDF por WhatsApp o Correo"
              >
                <Share2 className="w-4 h-4 text-amber-300" />
                <span>Compartir PDF</span>
              </button>
            </div>

            {/* Row 2: Excel Export Options */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleExportExcel(false)}
                disabled={isExporting}
                className="flex-1 py-2 px-3 rounded-xl bg-slate-900/80 hover:bg-slate-900 text-white font-bold text-xs transition active:scale-95 flex items-center justify-center gap-1.5"
                title="Descargar archivo Excel completo en este dispositivo"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Descargar Libro Excel (.xlsx)</span>
              </button>

              <button
                onClick={() => handleExportExcel(true)}
                disabled={isExporting}
                className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition active:scale-95 flex items-center gap-1.5 border border-white/20"
                title="Compartir Excel directamente"
              >
                <Share2 className="w-3.5 h-3.5 text-red-200" />
                <span>Compartir Excel</span>
              </button>
            </div>

            {/* Row 3: Finalizar Conteo & Historial de Conteos */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/10">
              {onFinalizeCount && (
                <button
                  onClick={onFinalizeCount}
                  disabled={captures.length === 0}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase shadow-md active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50"
                  title="Archivar este conteo en el historial y reiniciar las diferencias a cero para un nuevo conteo"
                >
                  <Archive className="w-4 h-4 text-slate-950" />
                  <span>🏁 Finalizar Conteo y Reiniciar</span>
                </button>
              )}

              {onOpenHistory && (
                <button
                  onClick={onOpenHistory}
                  className="py-2.5 px-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-900 text-white font-black text-xs transition active:scale-95 flex items-center gap-1.5 border border-white/20 shadow-xs"
                  title="Ver auditorías y conteos anteriores guardados"
                >
                  <History className="w-4 h-4 text-indigo-300" />
                  <span>Ver Historial</span>
                </button>
              )}
            </div>
          </div>
        )}

        {exportSuccessMsg && (
          <div className="p-2.5 bg-emerald-600/90 text-white text-xs font-bold rounded-xl text-center shadow-xs flex items-center justify-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span>{exportSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* SECCIÓN 2: RESUMEN DE DIFERENCIAS (SOLO LO CONTADO POR DEFECTO) */}
      {/* ============================================================== */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        {/* Header with Scope Switcher and PDF Quick Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                Resumen de Diferencias
              </h3>
              <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                editingSessionName
                  ? 'bg-indigo-100 text-indigo-950 border border-indigo-300'
                  : scope === 'session'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : scope === 'accumulated'
                  ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                  : 'bg-slate-100 text-slate-700 border border-slate-300'
              }`}>
                {editingSessionName
                  ? `⚡ Conteo Reabierto: ${editingSessionName}`
                  : scope === 'session'
                  ? '⚡ Solo este Conteo'
                  : scope === 'accumulated'
                  ? '📊 Acumulado Global'
                  : '📦 Todo el Catálogo'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {editingSessionName
                ? `Mostrando exclusivamente los ${liveMetrics.totalCountedProducts} artículos contados en "${editingSessionName}". No se mezclan con ningún otro conteo.`
                : scope === 'session'
                ? `Calculando diferencias exclusivamente sobre los ${liveMetrics.totalCountedProducts} artículos escaneados en este conteo.`
                : scope === 'accumulated'
                ? `Calculando diferencias acumuladas sobre los ${accumulatedMetrics.totalCountedProducts} artículos contados en la campaña (lotes guardados + actual).`
                : `Mostrando la comparativa teórica de los ${catalogMetrics.totalProducts} productos del catálogo.`}
            </p>
          </div>

          {/* Action buttons: PDF export & Scope Selector */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {/* Quick Export in PDF button matching the screenshot */}
            <button
              onClick={() => handleExportPdf(false)}
              disabled={isExportingPdf}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase shadow-xs transition active:scale-95 flex items-center gap-1.5"
              title="Descargar este resumen en formato PDF"
            >
              <FileText className="w-3.5 h-3.5 text-amber-300" />
              <span>{isExportingPdf ? 'Creando PDF...' : 'Exportar PDF'}</span>
            </button>

            <button
              onClick={() => handleExportPdf(true)}
              disabled={isExportingPdf}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition active:scale-95 border border-slate-200"
              title="Compartir PDF por WhatsApp"
            >
              <Share2 className="w-4 h-4 text-slate-700" />
            </button>

            {/* Scope Selector Tabs */}
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 overflow-x-auto">
              <button
                type="button"
                onClick={() => setScope('session')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 whitespace-nowrap ${
                  scope === 'session' || editingSessionName
                    ? 'bg-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-300'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Diferencias únicamente de este lote (sin mezclar artículos de otros conteos)"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>
                  {editingSessionName
                    ? `⚡ Solo este Conteo (${liveMetrics.totalCountedProducts})`
                    : `⚡ Solo lo Contado (${liveMetrics.totalCountedProducts})`}
                </span>
              </button>

              {progress.sessionsCount > 0 && !editingSessionName && (
                <button
                  type="button"
                  onClick={() => setScope('accumulated')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                    scope === 'accumulated'
                      ? 'bg-emerald-600 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Diferencias acumuladas sumando todas las sesiones anteriores y el conteo activo"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>📊 Acumulado Global ({accumulatedMetrics.totalCountedProducts})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setScope('catalog')}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  scope === 'catalog'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Todo el catálogo teórico de productos"
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Todo el Catálogo ({catalogMetrics.totalProducts})</span>
              </button>
            </div>
          </div>
        </div>


        {/* 4 Financial & Quantitative Metric Cards of the selected Scope */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Card 1: Faltantes */}
          <div className="bg-red-50/80 p-3 sm:p-3.5 rounded-2xl border border-red-200 shadow-2xs">
            <div className="flex items-center justify-between text-red-700 text-xs font-extrabold">
              <span>Faltantes ({activeMetrics.faltantesCount})</span>
              <TrendingDown className="w-4 h-4 text-red-600" />
            </div>
            <span className="text-xl sm:text-2xl font-black text-red-700 block mt-1">
              -${activeMetrics.faltantesValue.toFixed(2)}
            </span>
            <span className="text-[11px] text-red-600/90 font-bold block mt-0.5">
              -{activeMetrics.faltantesPieces} piezas faltantes
            </span>
          </div>

          {/* Card 2: Sobrantes */}
          <div className="bg-emerald-50/80 p-3 sm:p-3.5 rounded-2xl border border-emerald-200 shadow-2xs">
            <div className="flex items-center justify-between text-emerald-800 text-xs font-extrabold">
              <span>Sobrantes ({activeMetrics.sobrantesCount})</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <span className="text-xl sm:text-2xl font-black text-emerald-700 block mt-1">
              +${activeMetrics.sobrantesValue.toFixed(2)}
            </span>
            <span className="text-[11px] text-emerald-700/90 font-bold block mt-0.5">
              +{activeMetrics.sobrantesPieces} piezas excedentes
            </span>
          </div>

          {/* Card 3: Cuadrados al 100% */}
          <div className="bg-blue-50/80 p-3 sm:p-3.5 rounded-2xl border border-blue-200 shadow-2xs">
            <div className="flex items-center justify-between text-blue-800 text-xs font-extrabold">
              <span>Cuadrados ({activeMetrics.cuadradosCount})</span>
              <Check className="w-4 h-4 text-blue-600" />
            </div>
            <span className="text-xl sm:text-2xl font-black text-blue-800 block mt-1">
              {activeMetrics.cuadradosCount} <span className="text-xs font-bold">artículos</span>
            </span>
            <span className="text-[11px] text-blue-600 font-bold block mt-0.5">
              ✓ Coinciden con sistema
            </span>
          </div>

          {/* Card 4: Impacto Financiero Neto */}
          <div className="bg-slate-50 p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-600 text-xs font-extrabold">
              <span>Impacto Neto</span>
              <DollarSign className="w-4 h-4 text-slate-600" />
            </div>
            <span
              className={`text-xl sm:text-2xl font-black block mt-1 ${
                activeMetrics.netImpact < 0
                  ? 'text-red-600'
                  : activeMetrics.netImpact > 0
                  ? 'text-emerald-700'
                  : 'text-slate-900'
              }`}
            >
              {activeMetrics.netImpact < 0
                ? `-$${Math.abs(activeMetrics.netImpact).toFixed(2)}`
                : `$${activeMetrics.netImpact.toFixed(2)}`}
            </span>
            <span className="text-[11px] text-slate-500 font-medium block mt-0.5">
              Balance financiero neto
            </span>
          </div>
        </div>

        {/* Recontos Pendientes Section */}
        {totalReconteos.length > 0 && (
          <div className="bg-purple-50/60 rounded-2xl border border-purple-200 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-purple-700" />
                <h4 className="text-xs sm:text-sm font-extrabold text-purple-950">
                  Reconteos Pendientes ({totalReconteos.length})
                </h4>
              </div>
              <span className="text-[11px] font-bold text-purple-700">Modo Ciego</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {totalReconteos.map((item) => (
                <div
                  key={item.code}
                  className="p-2.5 bg-white rounded-xl border border-purple-200 flex items-center justify-between gap-2 shadow-2xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11px] font-black bg-purple-100 text-purple-900 px-1.5 py-0.2 rounded">
                        {item.code}
                      </span>
                      <span className="text-[11px] font-bold text-purple-900 truncate">
                        Contado: {item.countedStock} {item.unit}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                      {item.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onStartRecountMode(item.code)}
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white font-black text-[11px] uppercase rounded-lg active:scale-95 transition flex items-center gap-1"
                    >
                      <Lock className="w-3 h-3" />
                      <span>Recontar</span>
                    </button>
                    <button
                      onClick={() => onToggleRecount(item.code, false)}
                      className="p-1 text-slate-400 hover:text-slate-600 rounded"
                      title="Quitar de reconteo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sub-view switcher: Tarjetas vs Dashboard */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-950 shadow-xs ring-1 ring-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Lista de Artículos ({activeMetrics.itemsBase.length})</span>
            </button>

            <button
              onClick={() => setViewMode('dashboard')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                viewMode === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-amber-300" />
              <span>Dashboard de lo Contado</span>
            </button>
          </div>

          <span className="text-[11px] font-bold text-slate-500">
            {viewMode === 'cards'
              ? `${filteredItems.length} productos en vista`
              : `Analizando ${countedDashboard.totalCountedProducts} artículos verificados`}
          </span>
        </div>

        {/* VIEW 1: DASHBOARD ANALÍTICO DE LO CONTADO */}
        {viewMode === 'dashboard' && (
          <div className="space-y-4 pt-1">
            {/* Dashboard Banner & Precision Gauge */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Card 1: Exactitud de Inventario (Circular Gauge) */}
              <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white p-4 rounded-3xl border border-indigo-700/40 shadow-xs flex items-center gap-4">
                {/* SVG circular progress ring */}
                <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-800"
                      strokeWidth="3.6"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={
                        countedDashboard.accuracyRatePct >= 80
                          ? 'text-emerald-400'
                          : countedDashboard.accuracyRatePct >= 50
                          ? 'text-blue-400'
                          : 'text-amber-400'
                      }
                      strokeDasharray={`${countedDashboard.accuracyRatePct}, 100`}
                      strokeWidth="3.6"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-sm font-black text-white leading-none">
                      {countedDashboard.accuracyRatePct.toFixed(0)}%
                    </span>
                    <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Exacto</span>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-300" />
                    <span className="text-xs font-black uppercase text-amber-300">
                      Exactitud del Conteo
                    </span>
                  </div>
                  <p className="text-lg font-black text-white mt-0.5">
                    {countedDashboard.totalExactProducts} / {countedDashboard.totalCountedProducts}
                  </p>
                  <p className="text-[11px] text-slate-300 font-medium leading-snug">
                    Artículos contados que coinciden exactamente con el sistema.
                  </p>
                </div>
              </div>

              {/* Card 2: Discrepancia & Piezas */}
              <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                    Tasa de Discrepancia
                  </span>
                  <span className="text-amber-700 font-black">
                    {(100 - countedDashboard.accuracyRatePct).toFixed(1)}%
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900">
                  {countedDashboard.totalFaltantesProducts + countedDashboard.totalSobrantesProducts}{' '}
                  <span className="text-xs font-bold text-slate-500">artículos con diferencia</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  {countedDashboard.totalCountedPieces.toLocaleString()} piezas físicas contadas en total.
                </p>
              </div>

              {/* Card 3: Valoración Total */}
              <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200 shadow-2xs space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    Valor del Inventario Contado
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900">
                  ${countedDashboard.totalCountedValuation.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center justify-between font-medium">
                  <span>Valor Teórico en Sistema:</span>
                  <span className="font-bold text-slate-700">
                    ${countedDashboard.totalSystemValuation.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Distribution Bar of Counted Items */}
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <span className="font-black text-slate-900 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-indigo-600" />
                  Distribución Porcentual de lo Contado ({countedDashboard.totalCountedProducts} Artículos)
                </span>
                <span className="text-[11px] text-slate-500 font-bold">
                  Haz clic en cualquier segmento para ver sus artículos
                </span>
              </div>

              {/* Multi-segment horizontal bar */}
              <div className="h-5 w-full bg-slate-200 rounded-xl overflow-hidden flex shadow-inner">
                {countedDashboard.accuracyRatePct > 0 && (
                  <button
                    onClick={() => { setViewMode('cards'); setStatusFilter('cuadrados'); }}
                    style={{ width: `${countedDashboard.accuracyRatePct}%` }}
                    className="h-full bg-blue-600 hover:bg-blue-700 transition"
                    title={`Cuadrados: ${countedDashboard.totalExactProducts} (${countedDashboard.accuracyRatePct.toFixed(1)}%)`}
                  />
                )}
                {countedDashboard.faltantesRatePct > 0 && (
                  <button
                    onClick={() => { setViewMode('cards'); setStatusFilter('faltantes'); }}
                    style={{ width: `${countedDashboard.faltantesRatePct}%` }}
                    className="h-full bg-red-600 hover:bg-red-700 transition"
                    title={`Faltantes: ${countedDashboard.totalFaltantesProducts} (${countedDashboard.faltantesRatePct.toFixed(1)}%)`}
                  />
                )}
                {countedDashboard.sobrantesRatePct > 0 && (
                  <button
                    onClick={() => { setViewMode('cards'); setStatusFilter('sobrantes'); }}
                    style={{ width: `${countedDashboard.sobrantesRatePct}%` }}
                    className="h-full bg-emerald-600 hover:bg-emerald-700 transition"
                    title={`Sobrantes: ${countedDashboard.totalSobrantesProducts} (${countedDashboard.sobrantesRatePct.toFixed(1)}%)`}
                  />
                )}
              </div>

              {/* Legend with interactive chips */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <button
                  onClick={() => { setViewMode('cards'); setStatusFilter('cuadrados'); }}
                  className="p-2.5 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 text-left transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-600 shrink-0" />
                    <div>
                      <span className="text-xs font-black text-blue-900 block leading-tight">
                        Cuadrados ({countedDashboard.totalExactProducts})
                      </span>
                      <span className="text-[10px] text-blue-700 font-bold">
                        {countedDashboard.accuracyRatePct.toFixed(1)}% del conteo
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                </button>

                <button
                  onClick={() => { setViewMode('cards'); setStatusFilter('faltantes'); }}
                  className="p-2.5 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200 text-left transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-600 shrink-0" />
                    <div>
                      <span className="text-xs font-black text-red-900 block leading-tight">
                        Faltantes ({countedDashboard.totalFaltantesProducts})
                      </span>
                      <span className="text-[10px] text-red-700 font-bold">
                        {countedDashboard.faltantesRatePct.toFixed(1)}% • -${countedDashboard.totalFaltantesValue.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-red-600" />
                </button>

                <button
                  onClick={() => { setViewMode('cards'); setStatusFilter('sobrantes'); }}
                  className="p-2.5 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 text-left transition flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-600 shrink-0" />
                    <div>
                      <span className="text-xs font-black text-emerald-900 block leading-tight">
                        Sobrantes ({countedDashboard.totalSobrantesProducts})
                      </span>
                      <span className="text-[10px] text-emerald-700 font-bold">
                        {countedDashboard.sobrantesRatePct.toFixed(1)}% • +${countedDashboard.totalSobrantesValue.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-emerald-600" />
                </button>
              </div>
            </div>

            {/* Top 5 Discrepancies (Pareto Analysis) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* Top Faltantes */}
              <div className="bg-white p-4 rounded-3xl border border-red-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-black text-red-900 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4 text-red-600" />
                    Top 5 Faltantes de Mayor Pérdida ($)
                  </h4>
                  <span className="text-[10px] font-black uppercase bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                    Críticos
                  </span>
                </div>

                <div className="space-y-2">
                  {countedDashboard.topFaltantes.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3 text-center">
                      ✓ No hay faltantes registrados en los artículos contados.
                    </p>
                  ) : (
                    countedDashboard.topFaltantes.map((item, idx) => {
                      const itemCaps = captures.filter((c) => c.code === item.code);
                      const zonesText =
                        Array.from(new Set(itemCaps.map((c) => c.zoneName).filter(Boolean))).join(', ') ||
                        'Sin zona asignada';
                      const auditorsText = Array.from(
                        new Set(itemCaps.map((c) => c.counterName).filter(Boolean))
                      ).join(', ');

                      return (
                        <div
                          key={item.code}
                          className="p-2.5 bg-red-50/50 rounded-2xl border border-red-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="w-5 h-5 rounded-full bg-red-200 text-red-900 font-black text-[10px] flex items-center justify-center shrink-0">
                                #{idx + 1}
                              </span>
                              <span className="font-mono text-xs font-black text-slate-800">
                                {item.code}
                              </span>
                              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded">
                                Faltan {Math.abs(item.difference)} {item.unit}
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                              {item.description}
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium flex-wrap mt-0.5">
                              <span className="bg-white/80 border border-red-100 text-slate-700 px-1.5 py-0.2 rounded">
                                📍 {zonesText}
                              </span>
                              {auditorsText && (
                                <span className="text-slate-600">
                                  por <strong>{auditorsText}</strong>
                                </span>
                              )}
                              <span className="text-red-800 font-bold">
                                (Contado: {item.countedStock} / Sist: {item.systemStock})
                              </span>
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-red-100">
                            <span className="text-xs sm:text-sm font-black text-red-700 block">
                              -${Math.abs(item.differenceValue).toFixed(2)}
                            </span>
                            <div className="flex items-center gap-1">
                              {onDeleteProductCaptures && (
                                <button
                                  onClick={() =>
                                    handleDeleteProductCapturesWithConfirm(item.code, item.description)
                                  }
                                  className="text-[10px] font-bold text-red-700 hover:text-red-900 bg-red-100/90 hover:bg-red-200 px-2 py-0.5 rounded-md flex items-center gap-1 transition"
                                  title="¿No contaste este producto o fue un escaneo accidental? Presiona aquí para eliminarlo"
                                >
                                  <Trash2 className="w-3 h-3 text-red-600" />
                                  <span>No lo conté</span>
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  onToggleRecount(item.code, !recountCodes.has(item.code))
                                }
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition ${
                                  recountCodes.has(item.code)
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {recountCodes.has(item.code) ? '✓ Reconteo' : '+ Recontar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Top Sobrantes */}
              <div className="bg-white p-4 rounded-3xl border border-emerald-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-black text-emerald-950 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    Top 5 Sobrantes de Mayor Excedente ($)
                  </h4>
                  <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    Excedentes
                  </span>
                </div>

                <div className="space-y-2">
                  {countedDashboard.topSobrantes.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3 text-center">
                      ✓ No hay sobrantes registrados en los artículos contados.
                    </p>
                  ) : (
                    countedDashboard.topSobrantes.map((item, idx) => {
                      const itemCaps = captures.filter((c) => c.code === item.code);
                      const zonesText =
                        Array.from(new Set(itemCaps.map((c) => c.zoneName).filter(Boolean))).join(', ') ||
                        'Sin zona asignada';
                      const auditorsText = Array.from(
                        new Set(itemCaps.map((c) => c.counterName).filter(Boolean))
                      ).join(', ');

                      return (
                        <div
                          key={item.code}
                          className="p-2.5 bg-emerald-50/50 rounded-2xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-900 font-black text-[10px] flex items-center justify-center shrink-0">
                                #{idx + 1}
                              </span>
                              <span className="font-mono text-xs font-black text-slate-800">
                                {item.code}
                              </span>
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                                +{item.difference} {item.unit} Sob.
                              </span>
                            </div>
                            <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                              {item.description}
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium flex-wrap mt-0.5">
                              <span className="bg-white/80 border border-emerald-100 text-slate-700 px-1.5 py-0.2 rounded">
                                📍 {zonesText}
                              </span>
                              {auditorsText && (
                                <span className="text-slate-600">
                                  por <strong>{auditorsText}</strong>
                                </span>
                              )}
                              <span className="text-emerald-800 font-bold">
                                (Contado: {item.countedStock} / Sist: {item.systemStock})
                              </span>
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-1.5 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-emerald-100">
                            <span className="text-xs sm:text-sm font-black text-emerald-700 block">
                              +${item.differenceValue.toFixed(2)}
                            </span>
                            <div className="flex items-center gap-1">
                              {onDeleteProductCaptures && (
                                <button
                                  onClick={() =>
                                    handleDeleteProductCapturesWithConfirm(item.code, item.description)
                                  }
                                  className="text-[10px] font-bold text-slate-600 hover:text-amber-800 bg-slate-100 hover:bg-amber-100 px-2 py-0.5 rounded-md flex items-center gap-1 transition"
                                  title="¿No contaste este producto o fue un escaneo accidental? Presiona aquí para eliminarlo"
                                >
                                  <Trash2 className="w-3 h-3 text-slate-500" />
                                  <span>No lo conté</span>
                                </button>
                              )}
                              <span className="text-[10px] text-slate-400 font-medium block">
                                Costo: ${(item.cost || 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Actions of Dashboard */}
            <div className="p-3 bg-slate-900 text-white rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <h5 className="text-xs font-black text-white">¿Deseas imprimir o compartir este reporte?</h5>
                <p className="text-[11px] text-slate-400">
                  Exporta el reporte en PDF con los gráficos y tabla de una sola línea de descripción.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportPdf(false)}
                  disabled={isExportingPdf}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase rounded-xl transition active:scale-95 shadow-xs flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4 text-amber-300" />
                  <span>{isExportingPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
                </button>
                <button
                  onClick={() => handleExportPdf(true)}
                  disabled={isExportingPdf}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition active:scale-95 flex items-center gap-1.5"
                >
                  <Share2 className="w-4 h-4 text-emerald-400" />
                  <span>Compartir</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: CARDS LIST */}
        {viewMode === 'cards' && (
          <div className="space-y-3">
            {/* Filter & Search Bar */}
            <div className="space-y-2 pt-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar por código o descripción..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-red-500/40"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

            {/* Quick Status Filters */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs font-bold">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1.5 rounded-xl whitespace-nowrap transition ${
                  statusFilter === 'all'
                    ? 'bg-slate-900 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todos ({activeMetrics.itemsBase.length})
              </button>

              <button
                onClick={() => setStatusFilter('differences')}
                className={`px-2.5 py-1.5 rounded-xl whitespace-nowrap transition flex items-center gap-1 ${
                  statusFilter === 'differences'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <AlertCircle className="w-3 h-3 text-amber-800" />
                <span>Con Diferencia ({activeMetrics.faltantesCount + activeMetrics.sobrantesCount})</span>
              </button>

              <button
                onClick={() => setStatusFilter('faltantes')}
                className={`px-2.5 py-1.5 rounded-xl whitespace-nowrap transition ${
                  statusFilter === 'faltantes'
                    ? 'bg-red-600 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Faltantes ({activeMetrics.faltantesCount})
              </button>

              <button
                onClick={() => setStatusFilter('sobrantes')}
                className={`px-2.5 py-1.5 rounded-xl whitespace-nowrap transition ${
                  statusFilter === 'sobrantes'
                    ? 'bg-emerald-600 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Sobrantes ({activeMetrics.sobrantesCount})
              </button>

              <button
                onClick={() => setStatusFilter('cuadrados')}
                className={`px-2.5 py-1.5 rounded-xl whitespace-nowrap transition ${
                  statusFilter === 'cuadrados'
                    ? 'bg-blue-600 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Cuadrados ({activeMetrics.cuadradosCount})
              </button>
            </div>
          </div>
        </div>

        {/* Product Items List (Card layout for mobile + full breakdown) */}
        <div className="space-y-2">
          {filteredItems.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h4 className="text-sm font-extrabold text-slate-900">
                {scope !== 'catalog' && activeMetrics.totalItems === 0
                  ? 'Aún no se han registrado conteos físicos'
                  : 'Sin productos con este filtro'}
              </h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                {scope !== 'catalog' && activeMetrics.totalItems === 0
                  ? 'Cuando comiences a escanear productos con la pistola o cámara, aquí se calcularán automáticamente las diferencias.'
                  : 'Prueba cambiando los filtros o buscando con otro término.'}
              </p>
            </div>
          ) : (
            filteredItems.map((s) => {
              const isFaltante = s.difference < 0;
              const isSobrante = s.difference > 0;
              const isExacto = s.difference === 0;

              return (
                <div
                  key={s.code}
                  className={`p-3 rounded-2xl border transition shadow-2xs ${
                    isFaltante
                      ? 'bg-red-50/30 border-red-200 hover:border-red-300'
                      : isSobrante
                      ? 'bg-emerald-50/30 border-emerald-200 hover:border-emerald-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-black bg-slate-100 text-slate-900 px-2 py-0.5 rounded-md">
                          {s.code}
                        </span>

                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            isFaltante
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : isSobrante
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {isFaltante ? (
                            <>
                              <TrendingDown className="w-3 h-3 text-red-600" />
                              Faltan {Math.abs(s.difference)} {s.unit}
                            </>
                          ) : isSobrante ? (
                            <>
                              <TrendingUp className="w-3 h-3 text-emerald-600" />
                              +{s.difference} {s.unit} excedente
                            </>
                          ) : (
                            <>
                              <Check className="w-3 h-3 text-blue-600" />
                              ✓ 100% Cuadrado
                            </>
                          )}
                        </span>

                        {s.differenceValue !== 0 && (
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                              s.differenceValue < 0
                                ? 'bg-red-200/80 text-red-900'
                                : 'bg-emerald-200/80 text-emerald-900'
                            }`}
                          >
                            {s.differenceValue < 0
                              ? `-$${Math.abs(s.differenceValue).toFixed(2)}`
                              : `+$${s.differenceValue.toFixed(2)}`}
                          </span>
                        )}
                      </div>

                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 mt-1 leading-snug">
                        {s.description}
                      </h4>

                      {s.countedStock > 0 && (() => {
                        const itemCaps = captures.filter((c) => c.code === s.code);
                        const zonesText =
                          Array.from(new Set(itemCaps.map((c) => c.zoneName).filter(Boolean))).join(', ') ||
                          'Sin zona asignada';
                        const auditorsText = Array.from(
                          new Set(itemCaps.map((c) => c.counterName).filter(Boolean))
                        ).join(', ');
                        return (
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium flex-wrap mt-1">
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                              📍 {zonesText}
                            </span>
                            {auditorsText && <span>• {auditorsText}</span>}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Reconteo, Modificar & Discard Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {onSetProductQuantities && (
                        <button
                          type="button"
                          onClick={() => openManualQuantityEdit(s)}
                          className="text-[10px] font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-xl transition flex items-center gap-1 active:scale-95 shadow-2xs"
                          title="Modificar manualmente las piezas contadas en Tapanco y Autoservicio"
                        >
                          <Edit3 className="w-3 h-3 text-indigo-600" />
                          <span>Modificar</span>
                        </button>
                      )}

                      {onDeleteProductCaptures && s.countedStock > 0 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteProductCapturesWithConfirm(s.code, s.description)}
                          className="text-[10px] font-bold text-slate-400 hover:text-red-700 bg-slate-100 hover:bg-red-50 p-1.5 rounded-xl transition"
                          title="¿Escaneo accidental? Eliminar capturas de este código para que no aparezca en lo contado"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggleRecount(s.code, !s.isMarkedForRecount)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-xl transition shrink-0 active:scale-95 ${
                          s.isMarkedForRecount
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                        title={s.isMarkedForRecount ? 'Marcado para reconteo ciego' : 'Marcar para reconteo ciego'}
                      >
                        {s.isMarkedForRecount ? '🔄 Recontar' : '+ Reconteo'}
                      </button>
                    </div>
                  </div>

                  {/* Quantitative 6-box breakdown with Tapanco & Autoservicio separated */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center text-xs pt-2 mt-2 border-t border-slate-200/80">
                    {/* 1. Tapanco / Bodega */}
                    <div
                      onClick={() => onSetProductQuantities && openManualQuantityEdit(s)}
                      className={`bg-indigo-50/80 p-1.5 rounded-xl border border-indigo-200 ${
                        onSetProductQuantities ? 'cursor-pointer hover:border-indigo-400 hover:shadow-2xs active:scale-95 transition' : ''
                      }`}
                      title={onSetProductQuantities ? 'Toca para modificar piezas en Tapanco' : undefined}
                    >
                      <span className="text-[9px] text-indigo-700 font-bold uppercase block truncate">
                        Tapanco {onSetProductQuantities ? '✏️' : ''}
                      </span>
                      <span className="text-xs sm:text-sm font-black text-indigo-950">
                        {s.tapancoCount ?? 0}
                      </span>
                    </div>

                    {/* 2. Autoservicio / Piso */}
                    <div
                      onClick={() => onSetProductQuantities && openManualQuantityEdit(s)}
                      className={`bg-emerald-50/80 p-1.5 rounded-xl border border-emerald-200 ${
                        onSetProductQuantities ? 'cursor-pointer hover:border-emerald-400 hover:shadow-2xs active:scale-95 transition' : ''
                      }`}
                      title={onSetProductQuantities ? 'Toca para modificar piezas en Autoservicio' : undefined}
                    >
                      <span className="text-[9px] text-emerald-800 font-bold uppercase block truncate">
                        Autoserv. {onSetProductQuantities ? '✏️' : ''}
                      </span>
                      <span className="text-xs sm:text-sm font-black text-emerald-950">
                        {s.autoservicioCount ?? 0}
                      </span>
                    </div>

                    {/* 3. Total Contado */}
                    <div
                      onClick={() => onSetProductQuantities && openManualQuantityEdit(s)}
                      className={`bg-amber-50/90 p-1.5 rounded-xl border border-amber-300 shadow-2xs ${
                        onSetProductQuantities ? 'cursor-pointer hover:border-amber-400 hover:shadow-2xs active:scale-95 transition' : ''
                      }`}
                      title={onSetProductQuantities ? 'Toca para modificar total de piezas contadas' : undefined}
                    >
                      <span className="text-[9px] text-amber-800 font-black uppercase block truncate">
                        Total Cont. {onSetProductQuantities ? '✏️' : ''}
                      </span>
                      <span className="text-xs sm:text-sm font-black text-amber-950">
                        {s.countedStock}
                      </span>
                    </div>

                    {/* 4. Sistema */}
                    <div className="bg-slate-100/80 p-1.5 rounded-xl border border-slate-200">
                      <span className="text-[9px] text-slate-500 font-bold uppercase block truncate">
                        Sistema
                      </span>
                      <span className="text-xs sm:text-sm font-black text-slate-800">
                        {s.systemStock}
                      </span>
                    </div>

                    {/* 5. Diferencia */}
                    <div
                      className={`p-1.5 rounded-xl border ${
                        isFaltante
                          ? 'bg-red-50 border-red-300'
                          : isSobrante
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-blue-50 border-blue-200'
                      }`}
                    >
                      <span
                        className={`text-[9px] font-bold uppercase block truncate ${
                          isFaltante
                            ? 'text-red-700'
                            : isSobrante
                            ? 'text-emerald-700'
                            : 'text-blue-700'
                        }`}
                      >
                        Diferencia
                      </span>
                      <span
                        className={`text-xs sm:text-sm font-black ${
                          isFaltante
                            ? 'text-red-700'
                            : isSobrante
                            ? 'text-emerald-700'
                            : 'text-blue-800'
                        }`}
                      >
                        {s.difference > 0 ? `+${s.difference}` : s.difference}
                      </span>
                    </div>

                    {/* 6. Valor de la diferencia */}
                    <div
                      className={`p-1.5 rounded-xl border ${
                        s.differenceValue < 0
                          ? 'bg-red-50 border-red-300'
                          : s.differenceValue > 0
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <span className="text-[9px] text-slate-500 font-bold uppercase block truncate">
                        Valor Dif.
                      </span>
                      <span
                        className={`text-xs sm:text-sm font-black ${
                          s.differenceValue < 0
                            ? 'text-red-700'
                            : s.differenceValue > 0
                            ? 'text-emerald-700'
                            : 'text-slate-800'
                        }`}
                      >
                        {s.differenceValue < 0
                          ? `-$${Math.abs(s.differenceValue).toFixed(2)}`
                          : s.differenceValue > 0
                          ? `+$${s.differenceValue.toFixed(2)}`
                          : '$0.00'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    )}

      {/* IN-APP CONFIRMATION MODAL: Descartar capturas de un producto */}
      {productToDeleteCaptures && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border-2 border-red-300 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 text-red-600 rounded-2xl shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900 leading-tight">
                  ¿Descartar capturas?
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">
                  Código {productToDeleteCaptures.code}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              ¿Deseas descartar todas las capturas registradas del código{' '}
              <b className="text-slate-900">{productToDeleteCaptures.code}</b> ({productToDeleteCaptures.description})?
              <br /><br />
              Esto quitará este artículo de los productos contados en vivo y corregirá el resumen de diferencias.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProductToDeleteCaptures(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => executeDiscardProductCaptures(productToDeleteCaptures.code)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase shadow-xs transition"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP MODAL: Modificación Manual de Cantidades en Reconteo */}
      {productToEditQuantity && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border-2 border-indigo-400 overflow-hidden max-h-[90dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-2xl shrink-0">
                  <Edit3 className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-indigo-600 tracking-wider block">
                    Modificación Manual en Reconteo
                  </span>
                  <h4 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                    {productToEditQuantity.description}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mt-0.5">
                    <span className="font-bold text-slate-700">Cód: {productToEditQuantity.code}</span>
                    <span>•</span>
                    <span>Unid: {productToEditQuantity.unit}</span>
                    <span>•</span>
                    <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-semibold">
                      Costo: ${productToEditQuantity.cost.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProductToEditQuantity(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-4 sm:p-5 space-y-3.5 flex-1 overflow-y-auto min-h-0">
              {/* Frozen System Stock info */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase block">
                  Existencia en Sistema {editingSessionDate ? `(del ${new Date(editingSessionDate).toLocaleDateString('es-MX')})` : ''}
                </span>
                <span className="text-base font-black text-slate-900">
                  {productToEditQuantity.systemStock} {productToEditQuantity.unit}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 font-bold uppercase block">
                  Estado Original
                </span>
                <span className={`text-xs font-black uppercase px-2 py-0.5 rounded-full ${
                  productToEditQuantity.difference === 0
                    ? 'bg-blue-100 text-blue-900'
                    : productToEditQuantity.difference < 0
                    ? 'bg-red-100 text-red-900'
                    : 'bg-emerald-100 text-emerald-900'
                }`}>
                  {productToEditQuantity.difference === 0
                    ? 'Cuadrado'
                    : productToEditQuantity.difference < 0
                    ? `Faltan ${Math.abs(productToEditQuantity.difference)}`
                    : `+${productToEditQuantity.difference} Sobrante`}
                </span>
              </div>
            </div>

            {/* Tapanco Input Group */}
            <div className="p-3.5 bg-indigo-50/70 rounded-2xl border border-indigo-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-indigo-950 uppercase flex items-center gap-1.5">
                  <span>📦 Tapanco / Mezzanine / Bodega</span>
                </label>
                <span className="text-xs font-bold text-indigo-700">
                  {manualTapancoQty} {productToEditQuantity.unit}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setManualTapancoQty((prev) => Math.max(0, prev - 10))}
                  className="px-2.5 py-2 bg-white hover:bg-indigo-100 text-indigo-900 font-black text-xs rounded-xl border border-indigo-200 active:scale-95 transition"
                >
                  -10
                </button>
                <button
                  type="button"
                  onClick={() => setManualTapancoQty((prev) => Math.max(0, prev - 1))}
                  className="px-3 py-2 bg-white hover:bg-indigo-100 text-indigo-900 font-black text-xs rounded-xl border border-indigo-200 active:scale-95 transition"
                >
                  -1
                </button>
                <input
                  type="number"
                  min="0"
                  value={manualTapancoQty}
                  onChange={(e) => setManualTapancoQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="flex-1 text-center font-black text-base py-2 rounded-xl border border-indigo-300 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setManualTapancoQty((prev) => prev + 1)}
                  className="px-3 py-2 bg-white hover:bg-indigo-100 text-indigo-900 font-black text-xs rounded-xl border border-indigo-200 active:scale-95 transition"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setManualTapancoQty((prev) => prev + 10)}
                  className="px-2.5 py-2 bg-white hover:bg-indigo-100 text-indigo-900 font-black text-xs rounded-xl border border-indigo-200 active:scale-95 transition"
                >
                  +10
                </button>
              </div>
            </div>

            {/* Autoservicio Input Group */}
            <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-emerald-950 uppercase flex items-center gap-1.5">
                  <span>🛒 Autoservicio / Piso de Venta</span>
                </label>
                <span className="text-xs font-bold text-emerald-800">
                  {manualAutoservicioQty} {productToEditQuantity.unit}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setManualAutoservicioQty((prev) => Math.max(0, prev - 10))}
                  className="px-2.5 py-2 bg-white hover:bg-emerald-100 text-emerald-900 font-black text-xs rounded-xl border border-emerald-200 active:scale-95 transition"
                >
                  -10
                </button>
                <button
                  type="button"
                  onClick={() => setManualAutoservicioQty((prev) => Math.max(0, prev - 1))}
                  className="px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-900 font-black text-xs rounded-xl border border-emerald-200 active:scale-95 transition"
                >
                  -1
                </button>
                <input
                  type="number"
                  min="0"
                  value={manualAutoservicioQty}
                  onChange={(e) => setManualAutoservicioQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="flex-1 text-center font-black text-base py-2 rounded-xl border border-emerald-300 bg-white text-slate-900 focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setManualAutoservicioQty((prev) => prev + 1)}
                  className="px-3 py-2 bg-white hover:bg-emerald-100 text-emerald-900 font-black text-xs rounded-xl border border-emerald-200 active:scale-95 transition"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => setManualAutoservicioQty((prev) => prev + 10)}
                  className="px-2.5 py-2 bg-white hover:bg-emerald-100 text-emerald-900 font-black text-xs rounded-xl border border-emerald-200 active:scale-95 transition"
                >
                  +10
                </button>
              </div>
            </div>

            {/* Quick Auto-Fill Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-slate-400 font-bold uppercase">Atajos:</span>
              <button
                type="button"
                onClick={() => {
                  setManualTapancoQty(productToEditQuantity.systemStock);
                  setManualAutoservicioQty(0);
                }}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition"
              >
                Cuadrar todo en Tapanco ({productToEditQuantity.systemStock})
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualTapancoQty(0);
                  setManualAutoservicioQty(productToEditQuantity.systemStock);
                }}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition"
              >
                Cuadrar todo en Piso ({productToEditQuantity.systemStock})
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualTapancoQty(0);
                  setManualAutoservicioQty(0);
                }}
                className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 text-[11px] font-bold rounded-lg transition"
              >
                Poner en 0
              </button>
            </div>

            {/* Live New Difference Calculation Box */}
            {(() => {
              const newTotal = manualTapancoQty + manualAutoservicioQty;
              const newDiff = newTotal - productToEditQuantity.systemStock;
              const newDiffValue = newDiff * productToEditQuantity.cost;
              const isNewCuadrado = newDiff === 0;
              const isNewFaltante = newDiff < 0;

              return (
                <div className={`p-3.5 rounded-2xl border text-xs ${
                  isNewCuadrado
                    ? 'bg-blue-50/80 border-blue-300 text-blue-950'
                    : isNewFaltante
                    ? 'bg-red-50/80 border-red-300 text-red-950'
                    : 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                }`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold uppercase text-[10px] tracking-wider">
                      Resultado con esta Modificación:
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-black uppercase text-[10px] ${
                      isNewCuadrado
                        ? 'bg-blue-200 text-blue-900'
                        : isNewFaltante
                        ? 'bg-red-200 text-red-900'
                        : 'bg-emerald-200 text-emerald-900'
                    }`}>
                      {isNewCuadrado ? '✓ Cuadrado al 100%' : isNewFaltante ? `Faltan ${Math.abs(newDiff)}` : `+${newDiff} Sobrante`}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="bg-white/80 p-2 rounded-xl">
                      <span className="text-[9px] text-slate-500 font-bold block">Nuevo Total Contado</span>
                      <span className="font-black text-slate-900 text-sm">
                        {newTotal} {productToEditQuantity.unit}
                      </span>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl">
                      <span className="text-[9px] text-slate-500 font-bold block">Nueva Diferencia</span>
                      <span className={`font-black text-sm ${
                        isNewCuadrado ? 'text-blue-700' : isNewFaltante ? 'text-red-700' : 'text-emerald-700'
                      }`}>
                        {newDiff > 0 ? `+${newDiff}` : newDiff}
                      </span>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl">
                      <span className="text-[9px] text-slate-500 font-bold block">Nuevo Valor Dif.</span>
                      <span className={`font-black text-sm ${
                        newDiffValue < 0 ? 'text-red-700' : newDiffValue > 0 ? 'text-emerald-700' : 'text-slate-800'
                      }`}>
                        {newDiffValue < 0
                          ? `-$${Math.abs(newDiffValue).toFixed(2)}`
                          : newDiffValue > 0
                          ? `+$${newDiffValue.toFixed(2)}`
                          : '$0.00'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Optional note */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">
                Nota o motivo del ajuste (opcional):
              </label>
              <input
                type="text"
                placeholder="Ej. Reconteo físico verificado por supervisor"
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            </div>

            {/* Actions - Sticky at bottom */}
            <div className="flex items-center justify-end gap-2 p-3 sm:p-4 border-t border-slate-100 shrink-0 sticky bottom-0 bg-white z-10">
              <button
                type="button"
                onClick={() => setProductToEditQuantity(null)}
                disabled={isSavingManualQty}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveManualQuantity}
                disabled={isSavingManualQty}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase shadow-md active:scale-95 transition flex items-center gap-2 disabled:opacity-50"
              >
                <Check className="w-4 h-4 text-indigo-200" />
                <span>{isSavingManualQty ? 'Guardando...' : '💾 Guardar Cantidad en Automático'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
