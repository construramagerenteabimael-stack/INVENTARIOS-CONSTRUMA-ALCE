import React, { useState, useRef } from 'react';
import {
  ProductItem,
  SystemStockItem,
  ImportSummary,
} from '../types/inventory';
import {
  readWorkbookRaw,
  detectProductHeaders,
  detectStockHeaders,
  processProductImport,
  processStockImport,
  generateProductTemplateWorkbook,
  generateStockTemplateWorkbook,
  generateErrorReportWorkbook,
  ProductColumnKey,
  StockColumnKey,
} from '../utils/excelParser';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  X,
  Database,
  Sparkles,
  Trash2,
  RefreshCw,
  Layers,
  Check,
} from 'lucide-react';

interface ImportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  productsCount: number;
  stockCount: number;
  stockImportDate?: string;
  onSaveProducts: (products: ProductItem[], replaceAll: boolean) => Promise<void>;
  onSaveSystemStock: (stock: SystemStockItem[], replaceAll: boolean) => Promise<void>;
  onSeedDemoData: () => Promise<void>;
  onClearCounts: () => Promise<void>;
  onClearProductsOnly: () => Promise<void>;
  onClearStockOnly: () => Promise<void>;
  onResetAllData: () => Promise<void>;
  existingProductCodes: Set<string>;
}

type ImportTarget = 'products' | 'stock';

interface ConfirmActionState {
  type: 'products' | 'stock' | 'counts' | 'all' | 'demo';
  title: string;
  message: string;
  buttonLabel: string;
  isDestructive: boolean;
}

export const ImportDataModal: React.FC<ImportDataModalProps> = ({
  isOpen,
  onClose,
  productsCount,
  stockCount,
  stockImportDate,
  onSaveProducts,
  onSaveSystemStock,
  onSeedDemoData,
  onClearCounts,
  onClearProductsOnly,
  onClearStockOnly,
  onResetAllData,
  existingProductCodes,
}) => {
  const [activeTarget, setActiveTarget] = useState<ImportTarget>('products');
  const [replaceAll, setReplaceAll] = useState(true);

  // File parsing states
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [currentSheet, setCurrentSheet] = useState<string>('');
  const [cachedBuffer, setCachedBuffer] = useState<ArrayBuffer | null>(null);

  const [productMapping, setProductMapping] = useState<Record<ProductColumnKey, string | null>>({
    code: null,
    barcode: null,
    description: null,
    unit: null,
  });
  const [stockMapping, setStockMapping] = useState<Record<StockColumnKey, string | null>>({
    code: null,
    systemStock: null,
    cost: null,
    unit: null,
    barcode: null,
    description: null,
  });
  const [showManualMapping, setShowManualMapping] = useState(false);

  // Preview & Summary state
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [validProductsToCommit, setValidProductsToCommit] = useState<ProductItem[]>([]);
  const [validStockToCommit, setValidStockToCommit] = useState<SystemStockItem[]>([]);
  const [unmatchedStockCodes, setUnmatchedStockCodes] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // In-app confirmation dialog state (replaces window.confirm completely)
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  // Process workbook buffer for a given sheet
  const processWorkbookBuffer = (buffer: ArrayBuffer, sheetToRead?: string) => {
    try {
      setErrorMessage(null);
      const { headers, rawRows: rows, sheetNames: sheets, currentSheet: activeSheet } =
        readWorkbookRaw(buffer, sheetToRead);

      setSheetNames(sheets);
      setCurrentSheet(activeSheet);
      setParsedHeaders(headers);
      setRawRows(rows);

      if (rows.length === 0) {
        setErrorMessage(`La hoja "${activeSheet}" está vacía o no contiene filas con datos válidos.`);
        setImportSummary(null);
        return;
      }

      if (activeTarget === 'products') {
        const detected = detectProductHeaders(headers);
        setProductMapping(detected);

        if (!detected.code || !detected.description) {
          setShowManualMapping(true);
          setImportSummary(null);
        } else {
          setShowManualMapping(false);
          const { summary, validProducts } = processProductImport(rows, detected);
          setImportSummary(summary);
          setValidProductsToCommit(validProducts);
        }
      } else {
        const detected = detectStockHeaders(headers);
        setStockMapping(detected);

        if (!detected.code || !detected.systemStock) {
          setShowManualMapping(true);
          setImportSummary(null);
        } else {
          setShowManualMapping(false);
          const { summary, validStock, unmatchedCodes } = processStockImport(
            rows,
            detected,
            existingProductCodes
          );
          setImportSummary(summary);
          setValidStockToCommit(validStock);
          setUnmatchedStockCodes(unmatchedCodes);
        }
      }
    } catch (err) {
      const error = err as Error;
      setErrorMessage(`Error al procesar la hoja de cálculo: ${error.message}`);
    }
  };

  // Trigger empty templates download
  const handleDownloadTemplate = (type: 'products' | 'stock') => {
    const buffer =
      type === 'products'
        ? generateProductTemplateWorkbook()
        : generateStockTemplateWorkbook();

    const fileName =
      type === 'products'
        ? 'Plantilla_Base_Productos_Construrama.xlsx'
        : 'Plantilla_Existencias_Sistema_Construrama.xlsx';

    const blob = new Blob([buffer as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download error rows
  const handleDownloadErrors = () => {
    if (!importSummary || importSummary.errorList.length === 0) return;
    const buffer = generateErrorReportWorkbook(importSummary.errorList);
    const blob = new Blob([buffer as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Errores_Importacion_${activeTarget}_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle uploaded file
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsLoading(true);
      setLoadingText('Leyendo archivo Excel/CSV...');
      setStatusMessage(null);
      setErrorMessage(null);
      setImportSummary(null);
      setUploadedFileName(file.name);

      const arrayBuffer = await file.arrayBuffer();
      setCachedBuffer(arrayBuffer);
      processWorkbookBuffer(arrayBuffer);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(`Error al leer archivo: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingText('');
      e.target.value = '';
    }
  };

  // Re-run processing after manual mapping
  const handleApplyManualMapping = () => {
    setErrorMessage(null);
    if (activeTarget === 'products') {
      if (!productMapping.code || !productMapping.description) {
        setErrorMessage('Debes seleccionar al menos las columnas de Código y Descripción.');
        return;
      }
      const { summary, validProducts } = processProductImport(rawRows, productMapping);
      setImportSummary(summary);
      setValidProductsToCommit(validProducts);
    } else {
      if (!stockMapping.code || !stockMapping.systemStock) {
        setErrorMessage('Debes seleccionar al menos las columnas de Código y Existencia.');
        return;
      }
      const { summary, validStock, unmatchedCodes } = processStockImport(
        rawRows,
        stockMapping,
        existingProductCodes
      );
      setImportSummary(summary);
      setValidStockToCommit(validStock);
      setUnmatchedStockCodes(unmatchedCodes);
    }
    setShowManualMapping(false);
  };

  // Commit valid items to IndexedDB
  const handleConfirmImport = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      if (activeTarget === 'products') {
        setLoadingText(`Guardando ${validProductsToCommit.length} productos en la base de datos...`);
        await onSaveProducts(validProductsToCommit, replaceAll);
        setStatusMessage(
          `¡Éxito! Se guardaron ${validProductsToCommit.length} productos en la base de datos local.`
        );
      } else {
        setLoadingText(`Guardando existencias de ${validStockToCommit.length} artículos...`);
        await onSaveSystemStock(validStockToCommit, replaceAll);
        setStatusMessage(
          `¡Éxito! Se cargaron existencias del sistema para ${validStockToCommit.length} artículos.`
        );
      }
      setImportSummary(null);
      setUploadedFileName(null);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(`Error al guardar en base de datos: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  };

  // Execute in-app confirmed action
  const handleExecuteConfirmAction = async () => {
    if (!confirmAction) return;

    try {
      setIsLoading(true);
      setErrorMessage(null);
      setStatusMessage(null);

      switch (confirmAction.type) {
        case 'products':
          setLoadingText('Borrando catálogo de productos...');
          await onClearProductsOnly();
          setStatusMessage('Catálogo de productos borrado exitosamente (0 productos).');
          break;
        case 'stock':
          setLoadingText('Borrando existencias del sistema...');
          await onClearStockOnly();
          setStatusMessage('Existencias del sistema borradas exitosamente (0 registros).');
          break;
        case 'counts':
          setLoadingText('Reiniciando conteos físicos...');
          await onClearCounts();
          setStatusMessage('Conteos físicos reiniciados a cero (catálogo conservado).');
          break;
        case 'all':
          setLoadingText('Borrando toda la base de datos...');
          await onResetAllData();
          setStatusMessage('¡Base de datos completamente reiniciada! Todos los datos fueron borrados.');
          break;
        case 'demo':
          setLoadingText('Cargando 28 productos ferreteros de demostración...');
          await onSeedDemoData();
          setStatusMessage('Datos ferreteros de demostración cargados exitosamente (28 productos).');
          break;
      }
      setImportSummary(null);
      setUploadedFileName(null);
    } catch (err: unknown) {
      const error = err as Error;
      setErrorMessage(`Error al ejecutar acción: ${error.message}`);
    } finally {
      setIsLoading(false);
      setLoadingText('');
      setConfirmAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#122647] text-white px-4 py-3 flex items-center justify-between border-b-2 border-red-600">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold">Base de Datos y Existencias</h2>
              <p className="text-xs text-slate-300">Importación y administración de catálogo (Excel / CSV)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current State Summary */}
        <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white p-2 rounded-xl border border-slate-200">
            <span className="text-slate-500 font-bold block text-[11px]">Base de Productos:</span>
            <strong className={`text-base font-black ${productsCount > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
              {productsCount} productos
            </strong>
          </div>
          <div className="bg-white p-2 rounded-xl border border-slate-200">
            <span className="text-slate-500 font-bold block text-[11px]">Existencias de Sistema:</span>
            <strong className={`text-base font-black ${stockCount > 0 ? 'text-slate-900' : 'text-slate-400'}`}>
              {stockCount} registros
            </strong>
            {stockImportDate && (
              <span className="text-[10px] text-slate-400 font-normal block truncate">
                {new Date(stockImportDate).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            )}
          </div>
        </div>

        {/* Tabs for Target Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold">
          <button
            onClick={() => {
              setActiveTarget('products');
              setImportSummary(null);
              setShowManualMapping(false);
              setErrorMessage(null);
            }}
            className={`flex-1 py-2.5 text-center transition ${
              activeTarget === 'products'
                ? 'bg-white text-red-600 border-b-2 border-red-600 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            1. Base de Productos (Catálogo)
          </button>
          <button
            onClick={() => {
              setActiveTarget('stock');
              setImportSummary(null);
              setShowManualMapping(false);
              setErrorMessage(null);
            }}
            className={`flex-1 py-2.5 text-center transition ${
              activeTarget === 'stock'
                ? 'bg-white text-red-600 border-b-2 border-red-600 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            2. Existencias del Sistema (Teórico)
          </button>
        </div>

        {/* Body content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* Status feedback message */}
          {statusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-xl font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Error feedback message */}
          {errorMessage && (
            <div className="p-3 bg-red-50 border-2 border-red-400 text-red-900 rounded-xl font-bold flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="block font-black">Atención:</span>
                <span className="font-medium text-xs">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl flex items-center justify-center gap-3">
              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin flex-shrink-0" />
              <span className="font-black text-sm">{loadingText || 'Procesando...'}</span>
            </div>
          )}

          {/* In-App Confirmation Card (Replaces window.confirm) */}
          {confirmAction && (
            <div className="p-4 bg-red-50 border-2 border-red-500 rounded-2xl shadow-xl space-y-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-black text-sm text-red-950 uppercase">{confirmAction.title}</h4>
                  <p className="text-xs text-red-800 mt-1 leading-relaxed">{confirmAction.message}</p>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleExecuteConfirmAction}
                  disabled={isLoading}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase rounded-xl shadow-md active:scale-95 transition flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{confirmAction.buttonLabel}</span>
                </button>
                <button
                  onClick={() => setConfirmAction(null)}
                  disabled={isLoading}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Import Setup Box */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-800">
                {activeTarget === 'products'
                  ? 'Importar Catálogo de Productos'
                  : 'Importar Reporte de Existencias'}
              </h3>
              <button
                onClick={() => handleDownloadTemplate(activeTarget)}
                className="flex items-center gap-1 text-[11px] font-bold text-red-700 hover:text-red-800 underline"
              >
                <Download className="w-3 h-3" />
                <span>Descargar plantilla vacía</span>
              </button>
            </div>

            <p className="text-slate-600 leading-relaxed">
              {activeTarget === 'products' ? (
                <>
                  Acepta Excel (.xlsx, .xls) o CSV. Columnas detectadas automáticamente: <strong>Código</strong>,{' '}
                  <strong>Código de barras</strong>, <strong>Descripción</strong> y opcional <strong>Unidad</strong>.
                  Soporta catálogos grandes y múltiples códigos de barra por producto conservando ceros a la izquierda.
                </>
              ) : (
                <>
                  Columnas detectadas automáticamente: <strong>Código</strong>, <strong>Existencia</strong> y opcional{' '}
                  <strong>Costo</strong> y <strong>Unidad</strong>. Se enlazarán automáticamente con la base de productos por Código.
                </>
              )}
            </p>

            {/* Replace or Update Switch */}
            <div className="flex items-center gap-2 pt-1 bg-white p-2.5 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                id="replace-check"
                checked={replaceAll}
                onChange={(e) => setReplaceAll(e.target.checked)}
                className="rounded text-red-600 focus:ring-red-500 w-4 h-4 cursor-pointer"
              />
              <label htmlFor="replace-check" className="font-bold text-slate-800 cursor-pointer">
                {activeTarget === 'products'
                  ? 'Reemplazar base completa (desmarcar para solo agregar/actualizar)'
                  : 'Reemplazar reporte anterior de existencias'}
              </label>
            </div>

            {/* Upload File Button */}
            <div className="pt-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-black text-sm uppercase rounded-xl shadow-md active:scale-95 transition flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>{uploadedFileName ? `Cambiar Archivo: ${uploadedFileName}` : 'Seleccionar Archivo Excel o CSV'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>

          {/* Manual Column Mapping Screen */}
          {showManualMapping && (
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-300 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Asignar Columnas Manualmente</span>
              </div>
              <p className="text-amber-800 text-[11px]">
                No se detectaron todos los encabezados estándar automáticamente. Elige la columna que corresponde a cada campo de tu archivo:
              </p>

              {activeTarget === 'products' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Código (*):</label>
                    <select
                      value={productMapping.code || ''}
                      onChange={(e) => setProductMapping({ ...productMapping, code: e.target.value || null })}
                      className="w-full p-2 bg-white rounded-lg border border-slate-300 font-bold"
                    >
                      <option value="">-- Seleccionar --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Código de barras:</label>
                    <select
                      value={productMapping.barcode || ''}
                      onChange={(e) => setProductMapping({ ...productMapping, barcode: e.target.value || null })}
                      className="w-full p-2 bg-white rounded-lg border border-slate-300 font-bold"
                    >
                      <option value="">-- Opcional (usará Código) --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">Descripción (*):</label>
                    <select
                      value={productMapping.description || ''}
                      onChange={(e) => setProductMapping({ ...productMapping, description: e.target.value || null })}
                      className="w-full p-2 bg-white rounded-lg border border-slate-300 font-bold"
                    >
                      <option value="">-- Seleccionar --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Unidad:</label>
                    <select
                      value={productMapping.unit || ''}
                      onChange={(e) => setProductMapping({ ...productMapping, unit: e.target.value || null })}
                      className="w-full p-2 bg-white rounded-lg border border-slate-300 font-bold"
                    >
                      <option value="">-- Opcional (ej. pza) --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Código (*):</label>
                    <select
                      value={stockMapping.code || ''}
                      onChange={(e) => setStockMapping({ ...stockMapping, code: e.target.value || null })}
                      className="w-full p-2 bg-white rounded-lg border border-slate-300 font-bold"
                    >
                      <option value="">-- Seleccionar --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Existencia (*):</label>
                    <select
                      value={stockMapping.systemStock || ''}
                      onChange={(e) => setStockMapping({ ...stockMapping, systemStock: e.target.value || null })}
                      className="w-full p-2 bg-white rounded-lg border border-slate-300 font-bold"
                    >
                      <option value="">-- Seleccionar --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Costo unitario:</label>
                    <select
                      value={stockMapping.cost || ''}
                      onChange={(e) => setStockMapping({ ...stockMapping, cost: e.target.value || null })}
                      className="w-full p-2 bg-white rounded-lg border border-slate-300 font-bold"
                    >
                      <option value="">-- Opcional --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Unidad:</label>
                    <select
                      value={stockMapping.unit || ''}
                      onChange={(e) => setStockMapping({ ...stockMapping, unit: e.target.value || null })}
                      className="w-full p-2 bg-white rounded-lg border border-slate-300 font-bold"
                    >
                      <option value="">-- Opcional --</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <button
                onClick={handleApplyManualMapping}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase shadow-md active:scale-95 transition"
              >
                Aplicar Asignación de Columnas y Continuar
              </button>
            </div>
          )}

          {/* Pre-Confirmation Preview & Summary */}
          {importSummary && (
            <div className="bg-white p-3.5 rounded-xl border border-slate-300 space-y-3 shadow-xs">
              {sheetNames.length > 1 && (
                <div className="flex items-center justify-between gap-2 p-2 bg-slate-100 rounded-xl text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                    <span>Hoja de Excel ({sheetNames.length} disponibles):</span>
                  </span>
                  <select
                    value={currentSheet}
                    onChange={(e) => {
                      if (cachedBuffer) {
                        processWorkbookBuffer(cachedBuffer, e.target.value);
                      }
                    }}
                    className="p-1.5 bg-white font-bold text-slate-900 rounded-lg border border-slate-300 text-xs"
                  >
                    {sheetNames.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="font-black uppercase text-slate-900 text-xs">
                  Resumen de Validación ({uploadedFileName || currentSheet})
                </span>
                {importSummary.errorRows > 0 && (
                  <button
                    onClick={handleDownloadErrors}
                    className="flex items-center gap-1 text-[11px] font-bold text-red-600 hover:underline"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Descargar {importSummary.errorRows} filas con error</span>
                  </button>
                )}
              </div>

              {importSummary.validRows === 3 && (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs leading-relaxed">
                  <strong>ℹ️ Nota importante:</strong> Si subiste el archivo descargado desde el botón <em>"Descargar plantilla vacía"</em>, este viene con solo <strong>3 artículos de muestra</strong> para mostrar el formato. Para cargar tu catálogo completo con cientos o miles de productos, abre ese archivo en Excel en tu computadora, pega todas tus filas de inventario y súbelo nuevamente.
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                <div className="bg-slate-50 p-2 rounded-lg border">
                  <span className="text-[10px] text-slate-500 block">Total Filas</span>
                  <strong className="text-slate-900 text-sm">{importSummary.totalRows}</strong>
                </div>
                <div className="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 block">Válidas</span>
                  <strong className="text-emerald-700 text-sm">{importSummary.validRows}</strong>
                </div>
                <div className="bg-red-50 p-2 rounded-lg border border-red-200">
                  <span className="text-[10px] text-red-700 block">Con Errores</span>
                  <strong className="text-red-700 text-sm">{importSummary.errorRows}</strong>
                </div>
                <div className="bg-amber-50 p-2 rounded-lg border border-amber-200">
                  <span className="text-[10px] text-amber-800 block">Códigos Dup.</span>
                  <strong className="text-amber-800 text-sm">{importSummary.duplicateCodes}</strong>
                </div>
              </div>

              {/* Unmatched stock codes warning */}
              {activeTarget === 'stock' && unmatchedStockCodes.length > 0 && (
                <div className="bg-purple-50 p-2.5 rounded-lg border border-purple-200 text-purple-900">
                  <strong className="block">
                    {unmatchedStockCodes.length} artículos no existen en la base de productos cargada:
                  </strong>
                  <span className="text-[11px] text-purple-700">
                    Ejemplos: {unmatchedStockCodes.slice(0, 8).join(', ')}...
                  </span>
                </div>
              )}

              {/* Preview First 5 Rows Table */}
              <div>
                <span className="text-[11px] font-bold text-slate-700 block mb-1">
                  Vista previa de las primeras 5 filas:
                </span>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold">
                      <tr>
                        <th className="p-1.5">Fila</th>
                        {Object.keys(importSummary.sampleRows[0]?.data || {}).map((col) => (
                          <th key={col} className="p-1.5">{col}</th>
                        ))}
                        <th className="p-1.5">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {importSummary.sampleRows.map((sample) => (
                        <tr key={sample.rowNumber} className={sample.isValid ? '' : 'bg-red-50/60'}>
                          <td className="p-1.5 font-mono text-slate-400">{sample.rowNumber}</td>
                          {Object.values(sample.data).map((val, idx) => (
                            <td key={idx} className="p-1.5 font-mono truncate max-w-[150px]">{val}</td>
                          ))}
                          <td className="p-1.5">
                            {sample.isValid ? (
                              <span className="text-emerald-600 font-bold">Válida</span>
                            ) : (
                              <span className="text-red-600 font-bold">{sample.errors.join('; ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Confirm Commit Button */}
              <button
                onClick={handleConfirmImport}
                disabled={importSummary.validRows === 0 || isLoading}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase text-sm rounded-xl shadow-md active:scale-95 transition flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar y Guardar {importSummary.validRows} registros</span>
              </button>
            </div>
          )}

          {/* Quick Demo Data Loader & Safe Actions */}
          <div className="pt-2 border-t border-slate-200 space-y-3">
            <span className="text-slate-500 font-black uppercase text-[11px] block">
              Gestión y Borrado de Base de Datos
            </span>

            {/* Seed Demo Button */}
            <button
              onClick={() => {
                setConfirmAction({
                  type: 'demo',
                  title: '¿Cargar base de demostración?',
                  message: 'Se cargarán 28 productos ferreteros auténticos (cemento, varilla, herramientas Truper, tubería PVC, cable Iusa) con existencias y zonas para que puedas probar.',
                  buttonLabel: 'Cargar 28 Productos de Prueba',
                  isDestructive: false,
                });
              }}
              className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-900 font-bold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Cargar 28 Productos Ferreteros de Demostración</span>
            </button>

            {/* Individual Clear Buttons Grid */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setConfirmAction({
                    type: 'products',
                    title: '¿Borrar catálogo de productos?',
                    message: `Se eliminarán los ${productsCount} productos del catálogo local. Las existencias del sistema y los conteos no se verán afectados.`,
                    buttonLabel: 'Sí, borrar catálogo de productos',
                    isDestructive: true,
                  });
                }}
                disabled={productsCount === 0}
                className={`py-2 px-3 border rounded-xl font-bold text-[11px] transition text-left flex items-center justify-between ${
                  productsCount > 0
                    ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                    : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>Borrar catálogo ({productsCount})</span>
                <Trash2 className="w-3.5 h-3.5 text-amber-700" />
              </button>

              <button
                onClick={() => {
                  setConfirmAction({
                    type: 'stock',
                    title: '¿Borrar existencias del sistema?',
                    message: `Se eliminarán los ${stockCount} registros de existencias teóricas del sistema. El catálogo de productos y los conteos físicos se conservarán.`,
                    buttonLabel: 'Sí, borrar existencias de sistema',
                    isDestructive: true,
                  });
                }}
                disabled={stockCount === 0}
                className={`py-2 px-3 border rounded-xl font-bold text-[11px] transition text-left flex items-center justify-between ${
                  stockCount > 0
                    ? 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                    : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <span>Borrar existencias ({stockCount})</span>
                <Trash2 className="w-3.5 h-3.5 text-amber-700" />
              </button>
            </div>

            {/* Clear Counts & Full Factory Reset */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setConfirmAction({
                    type: 'counts',
                    title: '¿Limpiar conteos físicos?',
                    message: 'Se reiniciarán únicamente los conteos físicos a cero. Tu catálogo de productos y existencias teóricas se mantendrán intactos.',
                    buttonLabel: 'Sí, reiniciar conteos a cero',
                    isDestructive: true,
                  });
                }}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-[11px] transition text-center"
              >
                Limpiar solo conteos
              </button>

              <button
                onClick={() => {
                  setConfirmAction({
                    type: 'all',
                    title: '¡ADVERTENCIA! ¿Borrar absolutamente toda la base?',
                    message: 'Esta acción borrará TODO: catálogo de productos, existencias teóricas, zonas y todas las capturas registradas en este dispositivo. Quedará en estado de fábrica.',
                    buttonLabel: 'SÍ, BORRAR TODO DEFINITIVAMENTE',
                    isDestructive: true,
                  });
                }}
                className="flex-1 py-2 bg-red-100 hover:bg-red-200 text-red-800 font-black rounded-xl text-[11px] transition text-center border border-red-300 flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                <span>Borrar toda la base</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-4 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
