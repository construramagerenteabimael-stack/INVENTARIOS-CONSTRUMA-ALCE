import React, { useState, useRef } from 'react';
import {
  ProductItem,
  ZoneItem,
  AIIdentificationResult,
} from '../types/inventory';
import { compressImage } from '../utils/imageCompressor';
import { findTopMatches, MatchResult } from '../utils/fuzzyMatch';
import { soundFeedback } from '../utils/audioHaptics';
import {
  Sparkles,
  Camera,
  Upload,
  AlertCircle,
  Check,
  Search,
  HelpCircle,
  X,
  Loader2,
  Tag,
  ArrowRight,
  WifiOff,
} from 'lucide-react';

interface AIIdentifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeZone: ZoneItem | null;
  products: ProductItem[];
  isOnline: boolean;
  onSelectProduct: (product: ProductItem, quantity?: number) => Promise<void>;
  onOpenManualSearch: (prefill?: string) => void;
  onSaveAsUnidentified: (photoBase64: string, note: string) => void;
}

export const AIIdentifyModal: React.FC<AIIdentifyModalProps> = ({
  isOpen,
  onClose,
  activeZone,
  products,
  isOnline,
  onSelectProduct,
  onOpenManualSearch,
  onSaveAsUnidentified,
}) => {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AIIdentificationResult | null>(null);
  const [matchedCandidates, setMatchedCandidates] = useState<MatchResult[]>([]);
  const [selectedQty, setSelectedQty] = useState(1);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsAnalyzing(true);
      setAnalysisError(null);
      setAiResult(null);
      setMatchedCandidates([]);

      // Compress photo for performance
      const compressedBase64 = await compressImage(file, 800, 0.75);
      setImagePreview(compressedBase64);

      if (!isOnline) {
        setIsAnalyzing(false);
        setAnalysisError(
          'La identificación por IA requiere conexión a internet activa. Puedes buscar el producto manualmente en la base local.'
        );
        return;
      }

      // Sample of catalog descriptions to help model suggest similar names
      const sampleDescriptions = products.slice(0, 30).map((p) => p.description);

      const response = await fetch('/api/ai/identify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: compressedBase64,
          mimeType: 'image/jpeg',
          candidateDescriptions: sampleDescriptions,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Error del servidor (${response.status})`);
      }

      const data = await response.json();
      if (!data.success || !data.analysis) {
        throw new Error(data.error || 'No se pudo interpretar el producto.');
      }

      const analysis: AIIdentificationResult = data.analysis;
      setAiResult(analysis);

      // Search matches against our catalog with fuzzy matching
      const queryStr = `${analysis.nombre} ${analysis.marca} ${analysis.medida} ${analysis.descripcionSugerida}`;
      const topMatches = findTopMatches(queryStr, products, analysis.palabrasClave, 5, 0.15);
      setMatchedCandidates(topMatches);

      if (topMatches.length > 0) {
        soundFeedback.notifyFound();
      } else {
        soundFeedback.notifyNotFound();
      }
    } catch (err: unknown) {
      const error = err as Error;
      setAnalysisError(error.message || 'Error al comunicarse con la IA.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSelect = async (product: ProductItem) => {
    soundFeedback.notifyFound();
    await onSelectProduct(product, selectedQty);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-900 text-white px-4 py-3 flex items-center justify-between border-b-2 border-amber-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-300" />
            <div>
              <h2 className="text-base font-bold">Identificar Producto con IA</h2>
              <p className="text-xs text-indigo-200">Reconocimiento visual Gemini para artículos sin código de barras</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-indigo-200 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* Offline warning if disconnected */}
          {!isOnline && (
            <div className="bg-amber-50 border border-amber-300 p-3 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <WifiOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Sin conexión a internet</strong>
                La visión con IA requiere internet. Si estás en una zona sin cobertura, puedes usar la búsqueda manual por texto.
              </div>
            </div>
          )}

          {/* Photo capture buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture');
                  fileInputRef.current.setAttribute('capture', 'environment');
                  fileInputRef.current.click();
                }
              }}
              className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border-2 border-indigo-500 bg-indigo-50/70 hover:bg-indigo-100/70 text-indigo-950 font-black text-sm active:scale-95 transition shadow-xs"
            >
              <Camera className="w-6 h-6 text-indigo-600" />
              <span>Tomar Foto con Cámara</span>
            </button>

            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.removeAttribute('capture');
                  fileInputRef.current.click();
                }
              }}
              className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 font-bold text-sm active:scale-95 transition"
            >
              <Upload className="w-6 h-6 text-slate-600" />
              <span>Subir de Galería</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {/* Preview Image & Loading State */}
          {imagePreview && (
            <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 flex justify-center max-h-48">
              <img
                src={imagePreview}
                alt="Vista previa del artículo"
                className="max-h-48 w-auto object-contain"
              />
              {isAnalyzing && (
                <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-white space-y-2 p-3 text-center">
                  <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
                  <span className="text-sm font-bold">Analizando imagen con Gemini Visión...</span>
                  <span className="text-xs text-slate-300">Identificando nombre, marca, medidas y categoría ferretera</span>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {analysisError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block">No se pudo identificar:</span>
                <span>{analysisError}</span>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      onOpenManualSearch();
                      onClose();
                    }}
                    className="bg-red-600 text-white font-bold px-3 py-1 rounded-lg text-xs"
                  >
                    Búsqueda Manual
                  </button>
                  {imagePreview && (
                    <button
                      onClick={() => {
                        onSaveAsUnidentified(imagePreview, 'Foto no resuelta por IA');
                        onClose();
                      }}
                      className="bg-slate-200 text-slate-800 font-bold px-3 py-1 rounded-lg text-xs"
                    >
                      Guardar como No Identificado
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AI Analysis Result Card */}
          {aiResult && (
            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-xs uppercase">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Análisis de la IA</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px]">Artículo detectado:</span>
                  <strong className="text-slate-900 text-sm">{aiResult.nombre}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px]">Marca:</span>
                  <strong className="text-slate-900">{aiResult.marca || 'Genérico / No visible'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px]">Medida / Especificación:</span>
                  <strong className="text-slate-900">{aiResult.medida || 'Estándar'}</strong>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold block text-[10px]">Categoría:</span>
                  <strong className="text-slate-900">{aiResult.tipo}</strong>
                </div>
              </div>

              {aiResult.palabrasClave && aiResult.palabrasClave.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold">Términos:</span>
                  {aiResult.palabrasClave.map((kw, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded text-[10px] font-medium">
                      {kw}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Coincidencias sugeridas (Top 3-5 Matches) */}
          {aiResult && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">
                  Coincidencias en Base de Datos ({matchedCandidates.length})
                </h3>
                <span className="text-[11px] text-slate-500 font-medium">Selecciona la correcta:</span>
              </div>

              {matchedCandidates.length === 0 ? (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center space-y-2">
                  <p className="text-xs text-amber-900 font-semibold">
                    No se encontraron productos en el catálogo que coincidan con "{aiResult.nombre}".
                  </p>
                  <div className="flex justify-center gap-2 pt-1">
                    <button
                      onClick={() => {
                        onOpenManualSearch(aiResult.nombre);
                        onClose();
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                    >
                      Buscar manualmente
                    </button>
                    {imagePreview && (
                      <button
                        onClick={() => {
                          onSaveAsUnidentified(
                            imagePreview,
                            `${aiResult.nombre} (${aiResult.marca || ''} ${aiResult.medida || ''})`
                          );
                          onClose();
                        }}
                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                      >
                        Guardar como No Identificado
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {matchedCandidates.map((m, idx) => {
                    const pct = Math.round(m.score * 100);
                    return (
                      <div
                        key={m.product.code}
                        className="p-3 rounded-xl border border-slate-200 hover:border-red-500 bg-white hover:bg-red-50/40 shadow-xs flex items-center justify-between gap-3 transition"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black font-mono bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                              {m.product.code}
                            </span>
                            <span className="text-[11px] font-bold text-emerald-600">
                              {pct}% coincidencia
                            </span>
                          </div>
                          <p className="text-sm font-bold text-slate-900 mt-1 leading-snug">
                            {m.product.description}
                          </p>
                          <span className="text-[11px] text-slate-500 font-medium">
                            Unidad: {m.product.unit} • Barras: {m.product.barcode || 'N/A'}
                          </span>
                        </div>

                        <button
                          onClick={() => handleSelect(m.product)}
                          className="flex items-center gap-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase rounded-xl shadow-sm active:scale-95 transition flex-shrink-0"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Elegir</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-4 py-3 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={() => {
              onOpenManualSearch(aiResult?.nombre || '');
              onClose();
            }}
            className="flex items-center gap-1 text-slate-600 hover:text-slate-900 text-xs font-bold"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Buscar catálogo manual</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-300 hover:bg-slate-400 text-slate-800 font-bold text-xs rounded-xl"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
