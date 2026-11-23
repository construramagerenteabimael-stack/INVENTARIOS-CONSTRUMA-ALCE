import React, { useState, useMemo } from 'react';
import {
  ProductSummary,
  ZoneItem,
  CountingMode,
  CaptureItem,
} from '../types/inventory';
import {
  isZoneBodega,
  isZoneAutoservicio,
  getCountInBodega,
  getCountInAutoservicio,
  computeProductAutoservicioBalance,
} from '../utils/autoservicioCalculations';
import {
  Search,
  Filter,
  ArrowUpDown,
  Barcode,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  Plus,
  TrendingDown,
  TrendingUp,
  ShoppingCart,
  Warehouse,
  ClipboardList,
  Check,
  ChevronRight,
  Target,
  Sparkles,
} from 'lucide-react';

interface PendingListProps {
  summaries: ProductSummary[];
  zones: ZoneItem[];
  activeZone: ZoneItem | null;
  mode: CountingMode;
  onGoCountProduct: (code: string, pendingQueue?: string[]) => void;
  onToggleRecount: (code: string, isMarked: boolean) => Promise<void>;
  captures: CaptureItem[];
  onSwitchToAutoservicio?: () => void;
}

type MainViewMode = 'general' | 'autoservicio';
type FilterOption = 'todos' | 'faltantes' | 'sin_contar' | 'sobrantes' | 'completos' | 'no_esperados' | 'reconteos';
type AutoFilterOption =
  | 'contados_bodega'
  | 'no_contados_bodega'
  | 'todos_faltantes'
  | 'completos'
  | 'bodega_completa'
  | 'todos';
export type SortOption =
  | 'codigo_num_asc'
  | 'codigo_num_desc'
  | 'faltantes_qty_desc'
  | 'faltantes_qty_asc'
  | 'valor_impacto'
  | 'avance_pct';

export const PendingList: React.FC<PendingListProps> = ({
  summaries,
  zones,
  activeZone,
  mode,
  onGoCountProduct,
  onToggleRecount,
  captures,
  onSwitchToAutoservicio,
}) => {
  const [viewMode, setViewMode] = useState<MainViewMode>('general');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<FilterOption>('faltantes');
  const [autoFilterType, setAutoFilterType] = useState<AutoFilterOption>('contados_bodega');
  const [selectedOriginZone, setSelectedOriginZone] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('codigo_num_asc');
  const [selectedZoneFilter, setSelectedZoneFilter] = useState<string>('all');

  const activeIsAutoservicio = isZoneAutoservicio(activeZone);

  // Overall statistics for General Inventory
  const overallStats = useMemo(() => {
    const totalProducts = summaries.length;
    const completedProducts = summaries.filter((s) => s.status === 'completo').length;
    const pctCompletedProducts = totalProducts > 0 ? (completedProducts / totalProducts) * 100 : 0;

    const totalSystemPieces = summaries.reduce((acc, s) => acc + s.systemStock, 0);
    const totalCountedPieces = summaries.reduce((acc, s) => acc + s.countedStock, 0);
    const pctPiecesFound =
      totalSystemPieces > 0 ? Math.min(100, (totalCountedPieces / totalSystemPieces) * 100) : 0;

    const faltantesCount = summaries.filter((s) => s.status === 'faltante').length;
    const uncountedCount = summaries.filter((s) => s.countedStock === 0).length;
    const sobrantesCount = summaries.filter((s) => s.status === 'excedente').length;
    const recountCount = summaries.filter((s) => s.isMarkedForRecount).length;

    return {
      totalProducts,
      completedProducts,
      pctCompletedProducts,
      totalSystemPieces,
      totalCountedPieces,
      pctPiecesFound,
      faltantesCount,
      uncountedCount,
      sobrantesCount,
      recountCount,
    };
  }, [summaries]);

  // Autoservicio (Showroom) specific calculations & balances
  const autoservicioData = useMemo(() => {
    let totalBodegaPieces = 0;
    let totalTargetAutoPieces = 0;
    let totalFoundAutoPieces = 0;
    let totalMissingAutoPieces = 0;
    let productsPendingInAutoCount = 0;
    let productsCompletedInAutoCount = 0;
    let productsFullInBodegaCount = 0;
    let productsCountedInBodegaWithPendingCount = 0;
    let productsCountedInBodegaTotalCount = 0;
    let productsUncountedInBodegaCount = 0;
    let totalSystemPieces = 0;

    const items = summaries.map((s) => {
      const balance = computeProductAutoservicioBalance(s, s.systemStock, zones, captures);

      totalSystemPieces += balance.systemStock;
      totalBodegaPieces += balance.bodegaCount;
      totalTargetAutoPieces += balance.targetToFindInAutoservicio;
      totalFoundAutoPieces += balance.autoservicioCount;
      totalMissingAutoPieces += balance.remainingToFind;

      if (balance.isFullInBodega) productsFullInBodegaCount++;
      if (balance.isCompletedInAuto) productsCompletedInAutoCount++;
      if (balance.isPendingInAuto) productsPendingInAutoCount++;

      if (balance.isCountedInBodega) {
        productsCountedInBodegaTotalCount++;
        if (balance.remainingToFind > 0) {
          productsCountedInBodegaWithPendingCount++;
        }
      }

      if (balance.isUncountedInBodega) {
        productsUncountedInBodegaCount++;
      }

      const finalDesc =
        s.description?.trim() ||
        balance.description?.trim() ||
        captures.find((c) => c.code === s.code && c.description)?.description ||
        `Artículo ${s.code}`;
      const finalBarcode =
        s.barcode?.trim() ||
        balance.barcode?.trim() ||
        captures.find((c) => c.code === s.code && c.barcode)?.barcode ||
        s.code;

      return {
        ...s,
        ...balance,
        code: s.code,
        description: finalDesc,
        barcode: finalBarcode,
        unit: s.unit || balance.unit || 'pza',
      };
    });

    const totalCombinedCounted = totalBodegaPieces + totalFoundAutoPieces;
    const totalDifference = totalCombinedCounted - totalSystemPieces;

    const pctAutoPiecesFound =
      totalTargetAutoPieces > 0
        ? Math.min(100, (totalFoundAutoPieces / totalTargetAutoPieces) * 100)
        : 100;

    return {
      items,
      totalBodegaPieces,
      totalTargetAutoPieces,
      totalFoundAutoPieces,
      totalMissingAutoPieces,
      totalSystemPieces,
      totalCombinedCounted,
      totalDifference,
      productsPendingInAutoCount,
      productsCompletedInAutoCount,
      productsFullInBodegaCount,
      productsCountedInBodegaWithPendingCount,
      productsCountedInBodegaTotalCount,
      productsUncountedInBodegaCount,
      pctAutoPiecesFound,
    };
  }, [summaries, zones, captures]);

  // Storage zones (Tapancos, Bodega, etc.) that have captures recorded
  const availableOriginZones = useMemo(() => {
    const zoneMap = new Map<string, string>();
    for (const c of captures) {
      const z = zones.find((item) => item.id === c.zoneId);
      if (z && isZoneBodega(z)) {
        zoneMap.set(z.id, z.name);
      }
    }
    return Array.from(zoneMap.entries()).map(([id, name]) => ({ id, name }));
  }, [captures, zones]);

  // Codes counted in the selected zone if zone filter is active
  const codesInSelectedZone = useMemo(() => {
    if (selectedZoneFilter === 'all') return null;
    return new Set(captures.filter((c) => c.zoneId === selectedZoneFilter).map((c) => c.code));
  }, [selectedZoneFilter, captures]);

  // Filtered & Sorted items for General View
  const processedGeneralList = useMemo(() => {
    let list = summaries;

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.barcode.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (filterType === 'faltantes') {
      list = list.filter((s) => s.status === 'faltante');
    } else if (filterType === 'sin_contar') {
      list = list.filter((s) => s.countedStock === 0);
    } else if (filterType === 'sobrantes') {
      list = list.filter((s) => s.status === 'excedente');
    } else if (filterType === 'completos') {
      list = list.filter((s) => s.status === 'completo');
    } else if (filterType === 'no_esperados') {
      list = list.filter((s) => s.status === 'no_esperado');
    } else if (filterType === 'reconteos') {
      list = list.filter((s) => s.isMarkedForRecount);
    }

    // Zone filter
    if (codesInSelectedZone) {
      list = list.filter((s) => codesInSelectedZone.has(s.code));
    }

    // Numeric natural comparison
    const compareCodesNumeric = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

    // Sorting (Natural numerical 1->9 or by pending quantities)
    return [...list].sort((a, b) => {
      if (sortBy === 'codigo_num_asc') {
        return compareCodesNumeric(a.code, b.code);
      }
      if (sortBy === 'codigo_num_desc') {
        return compareCodesNumeric(b.code, a.code);
      }
      if (sortBy === 'faltantes_qty_desc') {
        const missingA = a.systemStock - a.countedStock;
        const missingB = b.systemStock - b.countedStock;
        return missingB - missingA;
      }
      if (sortBy === 'faltantes_qty_asc') {
        const missingA = a.systemStock - a.countedStock;
        const missingB = b.systemStock - b.countedStock;
        return missingA - missingB;
      }
      if (sortBy === 'valor_impacto') {
        return Math.abs(b.differenceValue) - Math.abs(a.differenceValue);
      }
      if (sortBy === 'avance_pct') {
        const pctA = a.systemStock > 0 ? (a.countedStock / a.systemStock) * 100 : 0;
        const pctB = b.systemStock > 0 ? (b.countedStock / b.systemStock) * 100 : 0;
        return pctA - pctB;
      }
      return compareCodesNumeric(a.code, b.code);
    });
  }, [summaries, searchTerm, filterType, sortBy, codesInSelectedZone]);

  // Filtered & Sorted items for Autoservicio View
  const processedAutoList = useMemo(() => {
    let list = autoservicioData.items;

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.code.toLowerCase().includes(q) ||
          s.barcode.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      );
    }

    // Filter by Autoservicio stage
    if (autoFilterType === 'contados_bodega') {
      list = list.filter((s) => s.isCountedInBodega && s.remainingToFind > 0);
    } else if (autoFilterType === 'no_contados_bodega') {
      // User request: compare against catalog, showing warehouse items with 0 count
      list = list.filter((s) => s.isUncountedInBodega);
    } else if (autoFilterType === 'todos_faltantes') {
      list = list.filter((s) => s.remainingToFind > 0);
    } else if (autoFilterType === 'completos') {
      list = list.filter((s) => s.isCompletedInAuto);
    } else if (autoFilterType === 'bodega_completa') {
      list = list.filter((s) => s.isFullInBodega);
    }

    // Filter by specific storage zone of origin (e.g. Tapanco, Bodega Principal)
    if (selectedOriginZone !== 'all') {
      list = list.filter((s) =>
        s.sourceZones?.some(
          (sz) => sz.zoneId === selectedOriginZone || sz.zoneName === selectedOriginZone
        )
      );
    }

    const compareCodesNumeric = (a: string, b: string) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

    // Sorting: default to numeric menor a mayor or highest remaining pieces
    return [...list].sort((a, b) => {
      if (sortBy === 'codigo_num_asc') {
        return compareCodesNumeric(a.code, b.code);
      }
      if (sortBy === 'codigo_num_desc') {
        return compareCodesNumeric(b.code, a.code);
      }
      if (sortBy === 'faltantes_qty_desc') {
        return b.remainingToFind - a.remainingToFind;
      }
      if (sortBy === 'faltantes_qty_asc') {
        return a.remainingToFind - b.remainingToFind;
      }
      if (sortBy === 'valor_impacto') {
        return Math.abs(b.differenceValue) - Math.abs(a.differenceValue);
      }
      if (sortBy === 'avance_pct') {
        const pctA =
          a.targetToFindInAutoservicio > 0
            ? (a.autoservicioCount / a.targetToFindInAutoservicio) * 100
            : 100;
        const pctB =
          b.targetToFindInAutoservicio > 0
            ? (b.autoservicioCount / b.targetToFindInAutoservicio) * 100
            : 100;
        return pctA - pctB;
      }
      return compareCodesNumeric(a.code, b.code);
    });
  }, [autoservicioData, searchTerm, autoFilterType, selectedOriginZone, sortBy]);

  const handleGoCountAuto = (code: string) => {
    if (!activeIsAutoservicio && onSwitchToAutoservicio) {
      onSwitchToAutoservicio();
    }
    const queue = processedAutoList.map((i) => i.code);
    onGoCountProduct(code, queue);
  };

  const handleGoCountGeneral = (code: string) => {
    const queue = processedGeneralList.map((i) => i.code);
    onGoCountProduct(code, queue);
  };

  return (
    <div className="space-y-3 pb-32">
      {/* View Switcher: General vs Autoservicio (Bodega -> Exhibición) */}
      <div className="bg-slate-200 p-1 rounded-2xl flex gap-1 shadow-inner">
        <button
          onClick={() => setViewMode('general')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition ${
            viewMode === 'general'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ClipboardList className="w-4 h-4 text-slate-700" />
          <span>Inventario General</span>
        </button>

        <button
          onClick={() => setViewMode('autoservicio')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition ${
            viewMode === 'autoservicio'
              ? 'bg-[#122647] text-amber-300 shadow-md ring-2 ring-amber-400/40'
              : 'text-slate-700 hover:text-slate-900'
          }`}
        >
          <ShoppingCart className="w-4 h-4 text-emerald-400" />
          <span>Faltantes en Autoservicio</span>
          {autoservicioData.productsPendingInAutoCount > 0 && (
            <span className="bg-red-500 text-white text-[11px] font-black px-1.5 py-0.2 rounded-full min-w-5 text-center shadow-xs">
              {autoservicioData.productsPendingInAutoCount}
            </span>
          )}
        </button>
      </div>

      {/* ================= MODE 1: AUTOSERVICIO (BODEGA VS EXHIBICIÓN) ================= */}
      {viewMode === 'autoservicio' && (
        <div className="space-y-3">
          {/* Autoservicio Explanatory & Stat Header */}
          <div className="bg-gradient-to-br from-[#122647] to-[#1c3a6b] text-white p-3.5 rounded-2xl border-2 border-emerald-500/60 shadow-lg space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base text-amber-300">
                    Modo Autoservicio: Suma y Comparativa vs. Sistema
                  </h3>
                  <p className="text-[11px] text-slate-200">
                    Fórmula activa: <span className="font-bold text-white">Bodega + Autoservicio = Total Contado</span> vs <span className="font-bold text-amber-300">Sistema</span>
                  </p>
                </div>
              </div>

              {activeIsAutoservicio ? (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500 text-slate-950 uppercase tracking-wider flex items-center gap-1 shadow-xs">
                  <Check className="w-3 h-3" />
                  Zona Autoservicio Activa
                </span>
              ) : (
                onSwitchToAutoservicio && (
                  <button
                    onClick={onSwitchToAutoservicio}
                    className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black uppercase transition active:scale-95 shadow-sm flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Activar Autoservicio</span>
                  </button>
                )
              )}
            </div>

            {/* Live Sum & Direct System Comparison Panel */}
            <div className="bg-slate-950/80 p-3 rounded-2xl border border-amber-400/50 shadow-inner space-y-2">
              <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <span className="p-1 rounded bg-amber-400/20 text-amber-300">📦</span>
                  <span>Suma Total: Bodega + Autoservicio vs. Sistema</span>
                </span>
                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                  autoservicioData.totalDifference === 0
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                    : autoservicioData.totalDifference < 0
                    ? 'bg-red-500/20 text-red-300 border-red-400/50'
                    : 'bg-purple-500/20 text-purple-300 border-purple-400/50'
                }`}>
                  {autoservicioData.totalDifference === 0
                    ? '✓ 100% Cuadrado con el Sistema'
                    : autoservicioData.totalDifference < 0
                    ? `Faltan ${Math.abs(autoservicioData.totalDifference).toLocaleString()} pzas en piso`
                    : `+${autoservicioData.totalDifference.toLocaleString()} pzas de excedente`}
                </span>
              </div>

              {/* Equation grid */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 sm:gap-2 text-center text-xs font-mono font-black items-stretch">
                <div className="bg-blue-950/90 border border-blue-500/40 p-2 rounded-xl flex flex-col justify-center">
                  <span className="text-[9px] text-blue-300 uppercase font-bold block truncate">🏢 Bodega / Tapanco</span>
                  <span className="text-base sm:text-lg font-black text-blue-200">
                    {autoservicioData.totalBodegaPieces.toLocaleString()} <span className="text-[10px] font-normal">pzs</span>
                  </span>
                </div>

                <div className="bg-emerald-950/90 border border-emerald-500/40 p-2 rounded-xl flex flex-col justify-center">
                  <span className="text-[9px] text-emerald-300 uppercase font-bold block truncate">🛒 Autoservicio</span>
                  <span className="text-base sm:text-lg font-black text-emerald-300">
                    {autoservicioData.totalFoundAutoPieces.toLocaleString()} <span className="text-[10px] font-normal">pzs</span>
                  </span>
                </div>

                <div className="col-span-2 sm:col-span-1 bg-amber-950/90 border-2 border-amber-400 p-2 rounded-xl flex flex-col justify-center shadow-xs">
                  <span className="text-[9px] text-amber-300 uppercase font-bold block truncate">📦 Total Contado</span>
                  <span className="text-base sm:text-lg font-black text-amber-300">
                    {autoservicioData.totalCombinedCounted.toLocaleString()} <span className="text-[10px] font-normal">pzs</span>
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-700 p-2 rounded-xl flex flex-col justify-center">
                  <span className="text-[9px] text-slate-300 uppercase font-bold block truncate">📋 Sistema</span>
                  <span className="text-base sm:text-lg font-black text-white">
                    {autoservicioData.totalSystemPieces.toLocaleString()} <span className="text-[10px] font-normal">pzs</span>
                  </span>
                </div>

                <div className={`col-span-2 sm:col-span-1 p-2 rounded-xl flex flex-col justify-center border ${
                  autoservicioData.totalDifference < 0
                    ? 'bg-red-950/80 border-red-500/60 text-red-300'
                    : autoservicioData.totalDifference === 0
                    ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                    : 'bg-purple-950/80 border-purple-500/60 text-purple-300'
                }`}>
                  <span className="text-[9px] uppercase font-bold block opacity-85">
                    {autoservicioData.totalDifference < 0 ? 'Faltan' : autoservicioData.totalDifference === 0 ? 'Balance' : 'Sobrante'}
                  </span>
                  <span className="text-base sm:text-lg font-black">
                    {autoservicioData.totalDifference < 0
                      ? `-${Math.abs(autoservicioData.totalDifference).toLocaleString()}`
                      : autoservicioData.totalDifference === 0
                      ? '0 (Exacto)'
                      : `+${autoservicioData.totalDifference.toLocaleString()}`}
                  </span>
                </div>
              </div>
            </div>

            {/* 4 Quick Stat Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
              <div className="bg-white/10 backdrop-blur-xs p-2 rounded-xl border border-white/10">
                <span className="text-[10px] text-blue-200 uppercase font-bold block">
                  🏢 En Bodega
                </span>
                <span className="text-base sm:text-lg font-black text-white">
                  {autoservicioData.totalBodegaPieces.toLocaleString()} <span className="text-xs font-normal">pzs</span>
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-xs p-2 rounded-xl border border-white/10">
                <span className="text-[10px] text-amber-200 uppercase font-bold block">
                  🎯 Meta en Piso
                </span>
                <span className="text-base sm:text-lg font-black text-amber-300">
                  {autoservicioData.totalTargetAutoPieces.toLocaleString()} <span className="text-xs font-normal">pzs</span>
                </span>
              </div>

              <div className="bg-white/10 backdrop-blur-xs p-2 rounded-xl border border-white/10">
                <span className="text-[10px] text-emerald-200 uppercase font-bold block">
                  🛒 Hallado en Piso
                </span>
                <span className="text-base sm:text-lg font-black text-emerald-400">
                  {autoservicioData.totalFoundAutoPieces.toLocaleString()} <span className="text-xs font-normal">pzs</span>
                </span>
              </div>

              <div className="bg-red-500/20 backdrop-blur-xs p-2 rounded-xl border border-red-400/40">
                <span className="text-[10px] text-red-200 uppercase font-bold block">
                  👉 Faltan Encontrar
                </span>
                <span className="text-base sm:text-lg font-black text-red-400">
                  {autoservicioData.totalMissingAutoPieces.toLocaleString()} <span className="text-xs font-normal">pzs</span>
                </span>
              </div>
            </div>

            {/* Visual progress bar of showroom count */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-300 font-bold">
                <span>Avance en Piso de Venta:</span>
                <span className="text-emerald-300 font-extrabold">
                  {autoservicioData.pctAutoPiecesFound.toFixed(1)}% completado
                </span>
              </div>
              <div className="w-full bg-slate-800/80 rounded-full h-2.5 overflow-hidden border border-white/10">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-amber-400 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${autoservicioData.pctAutoPiecesFound}%` }}
                />
              </div>
            </div>
          </div>

          {/* Active zone reminder if not in Autoservicio */}
          {!activeIsAutoservicio && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-2xl flex items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-900 font-medium">
                  Zona actual: <strong>{activeZone?.name || 'Ninguna'}</strong>. Para que las capturas cuenten en exhibición, activa la zona Autoservicio.
                </p>
              </div>
              {onSwitchToAutoservicio && (
                <button
                  onClick={onSwitchToAutoservicio}
                  className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs active:scale-95 transition"
                >
                  Activar Autoservicio
                </button>
              )}
            </div>
          )}

          {/* Search and Autoservicio Filters */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código, barras o descripción..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Origin Zone Filter (Tapancos, Bodega, etc.) */}
            {availableOriginZones.length > 0 && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1 shrink-0">
                  <Warehouse className="w-3.5 h-3.5 text-amber-600" />
                  Zona de almacenamiento:
                </span>
                <select
                  value={selectedOriginZone}
                  onChange={(e) => setSelectedOriginZone(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="all">Todas las zonas (Tapancos / Bodega)</option>
                  {availableOriginZones.map((z) => (
                    <option key={z.id} value={z.name}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Autoservicio filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
              <button
                onClick={() => setAutoFilterType('contados_bodega')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
                  autoFilterType === 'contados_bodega'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs ring-2 ring-amber-300'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Target className="w-3.5 h-3.5 text-amber-900" />
                <span>🎯 Contados en Tapancos / Bodega</span>
                <span className="bg-slate-900 text-white text-[10px] px-1.5 py-0.2 rounded-full font-black">
                  {autoservicioData.productsCountedInBodegaWithPendingCount}
                </span>
              </button>

              <button
                onClick={() => setAutoFilterType('no_contados_bodega')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
                  autoFilterType === 'no_contados_bodega'
                    ? 'bg-red-600 text-white font-black shadow-xs ring-2 ring-red-400'
                    : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>⚠️ Sin contar en bodega ({autoservicioData.productsUncountedInBodegaCount})</span>
              </button>

              <button
                onClick={() => setAutoFilterType('todos_faltantes')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                  autoFilterType === 'todos_faltantes'
                    ? 'bg-red-600 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todos los Faltantes de Catálogo ({autoservicioData.productsPendingInAutoCount})
              </button>

              <button
                onClick={() => setAutoFilterType('completos')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                  autoFilterType === 'completos'
                    ? 'bg-emerald-600 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Completados en piso ({autoservicioData.productsCompletedInAutoCount})
              </button>

              <button
                onClick={() => setAutoFilterType('bodega_completa')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                  autoFilterType === 'bodega_completa'
                    ? 'bg-blue-600 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                100% en bodega ({autoservicioData.productsFullInBodegaCount})
              </button>

              <button
                onClick={() => setAutoFilterType('todos')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                  autoFilterType === 'todos'
                    ? 'bg-slate-900 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todos ({summaries.length})
              </button>
            </div>

            {/* Sort Bar in Autoservicio View */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                <ArrowUpDown className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[11px] text-slate-600 font-bold">Ordenar:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-slate-50 font-bold text-slate-800 border border-slate-300 rounded-lg px-2 py-0.5 focus:outline-none cursor-pointer"
                >
                  <option value="codigo_num_asc">🔢 Código numérico (1→9 Menor a Mayor)</option>
                  <option value="codigo_num_desc">🔢 Código numérico (9→1 Mayor a Menor)</option>
                  <option value="faltantes_qty_desc">📉 Más faltantes en piso</option>
                  <option value="faltantes_qty_asc">📈 Menos faltantes en piso</option>
                  <option value="valor_impacto">💰 Mayor valor ($ impacto)</option>
                  <option value="avance_pct">📊 Menor % avance</option>
                </select>
              </div>
              <span className="text-[11px] font-bold text-slate-400">
                {processedAutoList.length} artículo{processedAutoList.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* List of Products in Autoservicio Mode */}
          <div className="space-y-2.5">
            {processedAutoList.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6 space-y-2">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-900">
                  {autoFilterType === 'contados_bodega'
                    ? 'No hay productos de Tapancos / Bodega pendientes de encontrar'
                    : autoFilterType === 'todos_faltantes'
                    ? '¡No hay faltantes en autoservicio con este filtro!'
                    : 'Sin elementos con este filtro'}
                </h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  {autoFilterType === 'contados_bodega'
                    ? 'Si ya contaste artículos en Tapancos o Bodega, verifica que estén registrados en esa zona o pulsa el botón abajo para ver todo el catálogo.'
                    : 'Revisa los otros filtros o busca con otro término.'}
                </p>
                {autoFilterType === 'contados_bodega' && (
                  <button
                    onClick={() => setAutoFilterType('todos_faltantes')}
                    className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black rounded-xl transition shadow-xs"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Ver todos los faltantes del catálogo ({autoservicioData.productsPendingInAutoCount})
                  </button>
                )}
              </div>
            ) : (
              processedAutoList.map((item) => {
                const hasPendingInAuto = item.remainingToFind > 0;
                const isComplete = item.isCompletedInAuto;
                const isFullBodega = item.isFullInBodega;

                return (
                  <div
                    key={item.code}
                    className={`bg-white rounded-2xl p-3.5 border transition shadow-xs ${
                      hasPendingInAuto
                        ? 'border-amber-300 hover:border-amber-400 bg-amber-50/20'
                        : isComplete
                        ? 'border-emerald-300 bg-emerald-50/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-2.5">
                      {/* Top Row: Badges, Code and Action Button */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Header badges */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-black bg-slate-100 text-slate-900 px-2 py-0.5 rounded-md">
                              {item.code}
                            </span>

                            {/* Specific origin storage zone badge requested by the user */}
                            {item.isCountedInBodega ? (
                              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-xs">
                                <Warehouse className="w-3 h-3 text-amber-700" />
                                Pendiente de zona: <span className="underline decoration-amber-500 font-extrabold">{item.primarySourceZoneName || 'Tapancos'}</span>
                              </span>
                            ) : item.isUncountedInBodega ? (
                              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-red-100 text-red-900 border border-red-300 flex items-center gap-1 shadow-xs">
                                <AlertCircle className="w-3 h-3 text-red-600" />
                                ⚠️ Sin contar en bodega (0 / {item.systemStock} {item.unit})
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                Sin existencia en sistema
                              </span>
                            )}

                            {hasPendingInAuto && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-900 border border-red-200 flex items-center gap-1">
                                <Target className="w-3 h-3 text-red-600" />
                                Faltan {item.remainingToFind} {item.unit}
                              </span>
                            )}

                            {isComplete && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                Completado en Autoservicio
                              </span>
                            )}

                            {isFullBodega && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                                🏢 100% en Bodega
                              </span>
                            )}

                            {item.difference > 0 && (
                              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-900">
                                +{item.difference} sobrante
                              </span>
                            )}
                          </div>

                          {/* Product Title & Details */}
                          <h4 className="text-sm font-extrabold text-slate-900 mt-1 leading-snug">
                            {item.description}
                          </h4>

                          <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                            Barras: {item.barcode} • Unidad: {item.unit}
                          </div>
                        </div>

                        {/* Top-Right Quick Count Action Button */}
                        <button
                          onClick={() => handleGoCountAuto(item.code)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black uppercase shadow-xs transition active:scale-95 shrink-0 ${
                            hasPendingInAuto
                              ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/30 ring-2 ring-red-400/40'
                              : 'bg-slate-800 hover:bg-slate-900 text-white'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Contar</span>
                        </button>
                      </div>

                      {/* Quantitative Breakdown: Full-width 5-cuadros grid with complete headers */}
                      <div className="grid grid-cols-5 gap-1.5 sm:gap-2 text-center text-xs pt-1">
                        {/* Cuadro 1: Bodega / Pasillo */}
                        <div className="bg-blue-50/90 border border-blue-200 rounded-xl p-1.5 flex flex-col justify-between items-center text-center shadow-2xs">
                          <span
                            className="text-[9px] sm:text-[10px] text-blue-800 block font-black uppercase leading-tight tracking-tight break-words"
                            title={item.primarySourceZoneName || 'Bodega / Tapanco'}
                          >
                            {item.primarySourceZoneName
                              ? (item.primarySourceZoneName.length > 10
                                  ? (item.primarySourceZoneName.split(/[-–—/]/)[0]?.trim() || item.primarySourceZoneName.slice(0, 10))
                                  : item.primarySourceZoneName)
                              : 'Bodega'}
                          </span>
                          <span className="text-blue-950 font-black text-sm sm:text-base mt-1">
                            {item.bodegaCount}
                          </span>
                        </div>

                        {/* Cuadro 2: Piso */}
                        <div className="bg-emerald-50/90 border border-emerald-200 rounded-xl p-1.5 flex flex-col justify-between items-center text-center shadow-2xs">
                          <span className="text-[9px] sm:text-[10px] text-emerald-800 block font-black uppercase leading-tight tracking-tight">
                            Piso
                          </span>
                          <span className="text-emerald-950 font-black text-sm sm:text-base mt-1">
                            {item.autoservicioCount}
                          </span>
                        </div>

                        {/* Cuadro 3: Total Contado */}
                        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-1.5 flex flex-col justify-between items-center text-center shadow-xs ring-1 ring-amber-200/50">
                          <span className="text-[9px] sm:text-[10px] text-amber-900 block font-black uppercase leading-tight tracking-tight">
                            Total Contado
                          </span>
                          <span className="text-amber-950 font-black text-sm sm:text-base mt-1">
                            {item.totalCounted}
                          </span>
                        </div>

                        {/* Cuadro 4: Sistema */}
                        <div className="bg-slate-100 border border-slate-300 rounded-xl p-1.5 flex flex-col justify-between items-center text-center shadow-2xs">
                          <span className="text-[9px] sm:text-[10px] text-slate-700 block font-black uppercase leading-tight tracking-tight">
                            Sistema
                          </span>
                          <span className="text-slate-950 font-black text-sm sm:text-base mt-1">
                            {item.systemStock}
                          </span>
                        </div>

                        {/* Cuadro 5: Faltan / Estatus */}
                        <div className={`p-1.5 rounded-xl border-2 flex flex-col justify-between items-center text-center shadow-xs ${
                          item.difference < 0
                            ? 'bg-red-50 border-red-300 ring-1 ring-red-200/50'
                            : item.difference === 0
                            ? 'bg-emerald-50 border-emerald-400 ring-1 ring-emerald-200/50'
                            : 'bg-purple-50 border-purple-300 ring-1 ring-purple-200/50'
                        }`}>
                          <span className={`text-[9px] sm:text-[10px] block font-black uppercase leading-tight tracking-tight ${
                            item.difference < 0 ? 'text-red-700' : item.difference === 0 ? 'text-emerald-700' : 'text-purple-700'
                          }`}>
                            {item.difference < 0 ? 'Faltan' : item.difference === 0 ? 'Estatus' : 'Sobrante'}
                          </span>
                          <span className={`font-black text-sm sm:text-base mt-1 ${
                            item.difference < 0 ? 'text-red-800' : item.difference === 0 ? 'text-emerald-800' : 'text-purple-800'
                          }`}>
                            {item.difference < 0 ? Math.abs(item.difference) : item.difference === 0 ? '✓ Ok' : `+${item.difference}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ================= MODE 2: INVENTARIO GENERAL ================= */}
      {viewMode === 'general' && (
        <div className="space-y-3">
          {/* Global Progress Metrics Cards */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black uppercase text-slate-500">% Piezas Encontradas</span>
                <span className="text-xs font-bold text-slate-400">
                  {overallStats.totalCountedPieces.toLocaleString()} / {overallStats.totalSystemPieces.toLocaleString()}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900">
                  {overallStats.pctPiecesFound.toFixed(1)}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className="bg-emerald-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${overallStats.pctPiecesFound}%` }}
                />
              </div>
            </div>

            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-black uppercase text-slate-500">% Productos Completos</span>
                <span className="text-xs font-bold text-slate-400">
                  {overallStats.completedProducts} / {overallStats.totalProducts}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-slate-900">
                  {overallStats.pctCompletedProducts.toFixed(1)}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className="bg-[#DE1C24] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${overallStats.pctCompletedProducts}%` }}
                />
              </div>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por código, barras o descripción..."
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-bold scrollbar-none">
              <button
                onClick={() => setFilterType('faltantes')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                  filterType === 'faltantes'
                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Faltantes ({overallStats.faltantesCount})
              </button>

              <button
                onClick={() => setFilterType('sin_contar')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition flex items-center gap-1.5 ${
                  filterType === 'sin_contar'
                    ? 'bg-red-600 text-white font-black shadow-xs ring-2 ring-red-400'
                    : 'bg-red-50 text-red-800 hover:bg-red-100 border border-red-200'
                }`}
              >
                Sin contar ({overallStats.uncountedCount})
              </button>

              <button
                onClick={() => setFilterType('sobrantes')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                  filterType === 'sobrantes'
                    ? 'bg-purple-600 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Sobrantes ({overallStats.sobrantesCount})
              </button>

              <button
                onClick={() => setFilterType('todos')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                  filterType === 'todos'
                    ? 'bg-slate-900 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Todos ({summaries.length})
              </button>

              <button
                onClick={() => setFilterType('completos')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                  filterType === 'completos'
                    ? 'bg-emerald-600 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Completos ({overallStats.completedProducts})
              </button>

              <button
                onClick={() => setFilterType('reconteos')}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition ${
                  filterType === 'reconteos'
                    ? 'bg-purple-600 text-white font-black shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Reconteos ({overallStats.recountCount})
              </button>
            </div>

            {/* Sort & Zone Dropdowns */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-1.5 text-slate-500 font-bold">
                <ArrowUpDown className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[11px] text-slate-600 font-bold">Ordenar:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-slate-50 font-bold text-slate-800 border border-slate-300 rounded-lg px-2 py-0.5 focus:outline-none cursor-pointer"
                >
                  <option value="codigo_num_asc">🔢 Código numérico (1→9 Menor a Mayor)</option>
                  <option value="codigo_num_desc">🔢 Código numérico (9→1 Mayor a Menor)</option>
                  <option value="faltantes_qty_desc">📉 Más faltantes / pendientes</option>
                  <option value="faltantes_qty_asc">📈 Menos faltantes / pendientes</option>
                  <option value="valor_impacto">💰 Mayor valor ($ impacto)</option>
                  <option value="avance_pct">📊 Menor % de avance</option>
                </select>
              </div>

              <div className="flex items-center gap-1 text-slate-500 font-bold">
                <select
                  value={selectedZoneFilter}
                  onChange={(e) => setSelectedZoneFilter(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[140px] truncate"
                >
                  <option value="all">Todas las zonas</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      Zona: {z.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Items List */}
          <div className="space-y-2">
            {processedGeneralList.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-base font-bold text-slate-900">¡Sin elementos pendientes aquí!</h3>
                <p className="text-xs text-slate-500 mt-1">
                  No hay productos con los filtros seleccionados.
                </p>
              </div>
            ) : (
              processedGeneralList.map((item) => {
                const isFaltante = item.status === 'faltante';
                const isExcedente = item.status === 'excedente';
                const isCompleto = item.status === 'completo';

                return (
                  <div
                    key={item.code}
                    className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs hover:border-slate-300 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black bg-slate-100 text-slate-900 px-2 py-0.5 rounded-md">
                            {item.code}
                          </span>

                          {/* Semáforo badge */}
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isCompleto
                                ? 'bg-emerald-100 text-emerald-800'
                                : isFaltante
                                ? 'bg-amber-100 text-amber-900'
                                : isExcedente
                                ? 'bg-red-100 text-red-900'
                                : item.status === 'no_esperado'
                                ? 'bg-purple-100 text-purple-900'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.status === 'faltante'
                              ? `Faltan ${Math.abs(item.difference)}`
                              : item.status === 'excedente'
                              ? `Sobran +${item.difference}`
                              : item.status === 'completo'
                              ? 'Completo'
                              : item.status === 'no_esperado'
                              ? 'No esperado'
                              : 'Sin contar'}
                          </span>

                          {item.isMarkedForRecount && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-600 text-white">
                              Reconteo
                            </span>
                          )}
                        </div>

                        <h4 className="text-sm font-extrabold text-slate-900 mt-1 leading-snug">
                          {item.description}
                        </h4>

                        <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                          Barras: {item.barcode} • Unidad: {item.unit}
                        </div>

                        {/* Stock comparison - Guided vs Blind */}
                        {mode === 'guiado' ? (
                          <div className="mt-2 grid grid-cols-3 gap-1.5 bg-slate-50 p-2 rounded-xl text-center border border-slate-100 text-xs font-bold">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                                Sistema
                              </span>
                              <span className="text-slate-800">
                                {item.systemStock} {item.unit}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                                Contado
                              </span>
                              <span className="text-amber-600 font-black">
                                {item.countedStock} {item.unit}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block font-semibold uppercase">
                                Impacto $
                              </span>
                              <span
                                className={
                                  item.differenceValue < 0 ? 'text-amber-600' : 'text-emerald-700'
                                }
                              >
                                ${item.differenceValue.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 bg-slate-50 p-2 rounded-xl border border-slate-100 text-xs font-bold flex justify-between items-center">
                            <span className="text-slate-500 font-medium">Contadas hasta ahora:</span>
                            <span className="text-slate-900 text-sm font-black">
                              {item.countedStock} {item.unit}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Right actions */}
                      <div className="flex flex-col gap-1 items-end">
                        <button
                          onClick={() => handleGoCountGeneral(item.code)}
                          className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase transition active:scale-95 shadow-sm"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Contar</span>
                        </button>

                        <button
                          onClick={() => onToggleRecount(item.code, !item.isMarkedForRecount)}
                          className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                            item.isMarkedForRecount
                              ? 'bg-purple-100 text-purple-700'
                              : 'text-slate-400 hover:text-purple-600'
                          }`}
                          title={
                            item.isMarkedForRecount
                              ? 'Quitar marca de reconteo'
                              : 'Marcar para reconteo'
                          }
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span className="text-[10px]">
                            {item.isMarkedForRecount ? 'Recontar' : 'Marcar'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
