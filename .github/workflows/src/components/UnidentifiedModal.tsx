import React, { useState, useRef } from 'react';
import { ZoneItem, ProductItem, UnidentifiedItem } from '../types/inventory';
import { compressImage } from '../utils/imageCompressor';
import { soundFeedback } from '../utils/audioHaptics';
import {
  HelpCircle,
  Camera,
  X,
  Plus,
  Minus,
  Save,
  Trash2,
  CheckCircle,
  Image as ImageIcon,
} from 'lucide-react';

interface UnidentifiedModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeZone: ZoneItem | null;
  counterName: string;
  prefilledBarcode?: string | null;
  onSaveUnidentified: (item: Omit<UnidentifiedItem, 'id' | 'timestamp'>) => Promise<void>;
  unidentifiedList: UnidentifiedItem[];
  onDeleteUnidentified: (id: string) => Promise<void>;
  onResolveUnidentified: (unidentifiedId: string, product: ProductItem) => Promise<void>;
  products: ProductItem[];
}

export const UnidentifiedModal: React.FC<UnidentifiedModalProps> = ({
  isOpen,
  onClose,
  activeZone,
  counterName,
  prefilledBarcode,
  onSaveUnidentified,
  unidentifiedList,
  onDeleteUnidentified,
  onResolveUnidentified,
  products,
}) => {
  const [activeTab, setActiveTab] = useState<'nuevo' | 'lista'>('nuevo');
  const [photoBase64, setPhotoBase64] = useState<string>('');
  const [note, setNote] = useState<string>(
    prefilledBarcode ? `Código escaneado no encontrado: ${prefilledBarcode}` : ''
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<string>('pza');
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolveSearch, setResolveSearch] = useState<string>('');

  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800, 0.75);
      setPhotoBase64(compressed);
    } catch (err) {
      console.error('Error al comprimir foto:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeZone) return;

    await onSaveUnidentified({
      zoneId: activeZone.id,
      zoneName: activeZone.name,
      photoBase64: photoBase64 || undefined,
      note: note.trim() || 'Artículo sin descripción',
      quantity,
      unit,
      counterName,
    });

    soundFeedback.notifyRepeated();
    setPhotoBase64('');
    setNote('');
    setQuantity(1);
    onClose();
  };

  // Filter products for resolving
  const filteredProducts = resolveSearch.trim()
    ? products
        .filter(
          (p) =>
            p.code.toLowerCase().includes(resolveSearch.toLowerCase()) ||
            p.description.toLowerCase().includes(resolveSearch.toLowerCase())
        )
        .slice(0, 10)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#122647] text-white px-4 py-3 flex items-center justify-between border-b-2 border-amber-400">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold">Artículos No Identificados</h2>
              <p className="text-xs text-slate-300">Guarda foto, nota y cantidad sin detener el conteo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-100 text-xs font-bold">
          <button
            onClick={() => setActiveTab('nuevo')}
            className={`flex-1 py-2.5 text-center transition ${
              activeTab === 'nuevo'
                ? 'bg-white text-red-600 border-b-2 border-red-600 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            + Registrar Nuevo
          </button>
          <button
            onClick={() => setActiveTab('lista')}
            className={`flex-1 py-2.5 text-center transition flex items-center justify-center gap-1.5 ${
              activeTab === 'lista'
                ? 'bg-white text-red-600 border-b-2 border-red-600 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Pendientes por Resolver</span>
            <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 rounded-full text-[10px] font-black">
              {unidentifiedList.length}
            </span>
          </button>
        </div>

        {/* Tab 1: Registrar Nuevo */}
        {activeTab === 'nuevo' && (
          <form onSubmit={handleSubmit} className="p-4 overflow-y-auto flex-1 space-y-3.5">
            {/* Zone confirmation */}
            <div className="bg-slate-50 p-2 rounded-xl text-xs flex justify-between items-center text-slate-700">
              <span>Zona activa: <strong className="text-slate-900">{activeZone?.name}</strong></span>
              <span>Contador: <strong className="text-slate-900">{counterName}</strong></span>
            </div>

            {/* Photo capture section */}
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Foto del producto (opcional, muy recomendada):
              </label>
              {photoBase64 ? (
                <div className="relative rounded-xl overflow-hidden border border-slate-300 bg-slate-900 max-h-48 flex justify-center">
                  <img src={photoBase64} alt="Producto no identificado" className="max-h-48 object-contain" />
                  <button
                    type="button"
                    onClick={() => setPhotoBase64('')}
                    className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full shadow-md"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-xl border-2 border-dashed border-slate-300 hover:border-amber-500 bg-slate-50 hover:bg-amber-50/50 text-slate-700 font-bold text-sm transition"
                >
                  <Camera className="w-5 h-5 text-amber-500" />
                  <span>Tomar Foto del Artículo</span>
                </button>
              )}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handlePhotoCapture}
              />
            </div>

            {/* Note & description */}
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Nota o descripción visible (ubicación, color, forma, marca):
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Bote de pegamento sin etiqueta amarilla, anaquel superior"
                className="w-full rounded-xl border border-slate-300 p-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            {/* Quantity and Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Cantidad contada:</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-xl bg-slate-200 text-slate-800 font-black flex items-center justify-center active:scale-95"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="flex-1 text-center font-black text-lg border border-slate-300 rounded-xl py-1.5 text-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-10 h-10 rounded-xl bg-slate-200 text-slate-800 font-black flex items-center justify-center active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1">Unidad de medida:</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value="pza">Pieza (pza)</option>
                  <option value="kg">Kilos (kg)</option>
                  <option value="metro">Metros (m)</option>
                  <option value="tramo">Tramo</option>
                  <option value="caja">Caja</option>
                  <option value="bolsa">Bolsa</option>
                  <option value="bulto">Bulto</option>
                  <option value="bote">Bote / Galón</option>
                  <option value="jgo">Juego (jgo)</option>
                  <option value="litro">Litros (L)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-black text-sm uppercase rounded-xl shadow-md active:scale-95 transition flex items-center justify-center gap-2 mt-2"
            >
              <Save className="w-4 h-4" />
              <span>Guardar y Continuar Contando</span>
            </button>
          </form>
        )}

        {/* Tab 2: Lista de pendientes */}
        {activeTab === 'lista' && (
          <div className="p-4 overflow-y-auto flex-1 space-y-3">
            {unidentifiedList.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-sm">
                No hay artículos pendientes de identificar. ¡Excelente!
              </div>
            ) : (
              unidentifiedList.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-slate-200 bg-white shadow-xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex gap-2.5 min-w-0">
                      {item.photoBase64 ? (
                        <img
                          src={item.photoBase64}
                          alt="Foto"
                          className="w-14 h-14 rounded-lg object-cover border border-slate-200 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 flex-shrink-0">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-red-600 block">{item.zoneName}</span>
                        <p className="text-sm font-bold text-slate-900 leading-snug break-words">
                          {item.note}
                        </p>
                        <span className="text-xs font-black text-amber-600 block mt-0.5">
                          Cantidad: {item.quantity} {item.unit} • Por: {item.counterName}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onDeleteUnidentified(item.id)}
                      className="p-1 text-slate-400 hover:text-red-600 transition"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Resolve action */}
                  {resolvingId === item.id ? (
                    <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                        <span>Buscar en catálogo para asignar código:</span>
                        <button
                          onClick={() => setResolvingId(null)}
                          className="text-slate-500 hover:text-slate-800"
                        >
                          Cancelar
                        </button>
                      </div>
                      <input
                        type="text"
                        autoFocus
                        value={resolveSearch}
                        onChange={(e) => setResolveSearch(e.target.value)}
                        placeholder="Escribe código o descripción..."
                        className="w-full text-xs p-2 rounded-lg border border-slate-300 font-medium text-slate-900"
                      />
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {filteredProducts.map((p) => (
                          <button
                            key={p.code}
                            onClick={() => {
                              onResolveUnidentified(item.id, p);
                              setResolvingId(null);
                              setResolveSearch('');
                            }}
                            className="w-full text-left p-1.5 rounded-lg hover:bg-red-50 hover:text-red-700 text-xs font-bold text-slate-800 flex items-center justify-between"
                          >
                            <span className="truncate">{p.code} - {p.description}</span>
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 ml-1 flex-shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setResolvingId(item.id);
                        setResolveSearch('');
                      }}
                      className="w-full py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg transition"
                    >
                      Asignar código del catálogo
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-100 px-4 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
