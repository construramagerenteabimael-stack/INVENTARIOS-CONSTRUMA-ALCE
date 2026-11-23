import React, { useState, useMemo } from 'react';
import { ProductItem, ZoneItem } from '../types/inventory';
import { soundFeedback } from '../utils/audioHaptics';
import { Search, X, Plus, Check } from 'lucide-react';

interface ManualSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductItem[];
  activeZone: ZoneItem | null;
  initialQuery?: string;
  onSelectProduct: (product: ProductItem, quantity: number) => Promise<void>;
}

export const ManualSearchModal: React.FC<ManualSearchModalProps> = ({
  isOpen,
  onClose,
  products,
  activeZone,
  initialQuery = '',
  onSelectProduct,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [qty, setQty] = useState(1);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 20);

    return products
      .filter(
        (p) =>
          p.code.toLowerCase().includes(q) ||
          p.barcode.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [query, products]);

  if (!isOpen) return null;

  const handleSelect = async (p: ProductItem) => {
    soundFeedback.notifyFound();
    await onSelectProduct(p, qty);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#122647] text-white px-4 py-3 flex items-center justify-between border-b-2 border-red-600">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold">Buscar Producto en Catálogo</h2>
              <p className="text-xs text-slate-300">Zona activa: {activeZone?.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input & Qty */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Escribe código, código de barras o descripción..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Resultados: {filteredProducts.length}</span>
            <div className="flex items-center gap-1.5">
              <span>Cantidad a sumar:</span>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-14 text-center border border-slate-300 rounded-lg py-1 font-bold text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="p-3 overflow-y-auto flex-1 space-y-2">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              No se encontraron productos con "{query}".
            </div>
          ) : (
            filteredProducts.map((p) => (
              <div
                key={`${p.code}_${p.barcode}`}
                className="p-3 rounded-xl border border-slate-200 hover:border-red-500 bg-white hover:bg-red-50/30 flex items-center justify-between gap-3 transition shadow-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                      {p.code}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500">
                      Barras: {p.barcode || 'N/A'}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-900 mt-0.5 leading-snug">
                    {p.description}
                  </p>
                  <span className="text-xs text-slate-500 font-medium">Unidad: {p.unit}</span>
                </div>

                <button
                  onClick={() => handleSelect(p)}
                  className="flex items-center gap-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase rounded-xl shadow-xs active:scale-95 transition flex-shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+{qty}</span>
                </button>
              </div>
            ))
          )}
        </div>

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
