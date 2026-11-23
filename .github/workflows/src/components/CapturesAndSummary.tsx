import React, { useState, useMemo, useRef } from 'react';
import { CaptureItem, ZoneItem } from '../types/inventory';
import {
  FileText,
  Layers,
  MapPin,
  Trash2,
  Edit2,
  Check,
  X,
  Share2,
  Download,
  Upload,
  Search,
  Users,
} from 'lucide-react';

interface CapturesAndSummaryProps {
  captures: CaptureItem[];
  zones: ZoneItem[];
  counterName: string;
  onUpdateCaptureQuantity: (captureId: string, newQty: number) => Promise<void>;
  onDeleteCapture: (captureId: string) => Promise<void>;
  onExportSessionBackup: () => void;
  onImportSessionBackup: (file: File) => Promise<void>;
}

export const CapturesAndSummary: React.FC<CapturesAndSummaryProps> = ({
  captures,
  zones,
  counterName,
  onUpdateCaptureQuantity,
  onDeleteCapture,
  onExportSessionBackup,
  onImportSessionBackup,
}) => {
  const [activeTab, setActiveTab] = useState<'individual' | 'general' | 'zonas'>('individual');
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQtyValue, setEditQtyValue] = useState<number>(1);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Individual filtered captures
  const filteredCaptures = useMemo(() => {
    let list = [...captures].reverse();
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.barcode.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.zoneName.toLowerCase().includes(q) ||
          c.counterName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [captures, search]);

  // General accumulated by product code
  const generalAccumulated = useMemo(() => {
    const map = new Map<string, { code: string; barcode: string; description: string; unit: string; totalQty: number; entries: number }>();
    for (const c of captures) {
      const existing = map.get(c.code);
      if (existing) {
        existing.totalQty += c.quantity;
        existing.entries += 1;
      } else {
        map.set(c.code, {
          code: c.code,
          barcode: c.barcode,
          description: c.description,
          unit: c.unit,
          totalQty: c.quantity,
          entries: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [captures]);

  // Accumulated by Zone
  const zoneAccumulated = useMemo(() => {
    const map = new Map<string, { zoneId: string; zoneName: string; totalPieces: number; uniqueProducts: Set<string>; items: Map<string, { description: string; qty: number; unit: string }> }>();

    for (const c of captures) {
      let z = map.get(c.zoneId);
      if (!z) {
        z = {
          zoneId: c.zoneId,
          zoneName: c.zoneName,
          totalPieces: 0,
          uniqueProducts: new Set(),
          items: new Map(),
        };
        map.set(c.zoneId, z);
      }
      z.totalPieces += c.quantity;
      z.uniqueProducts.add(c.code);

      const existingProd = z.items.get(c.code);
      if (existingProd) {
        existingProd.qty += c.quantity;
      } else {
        z.items.set(c.code, { description: c.description, qty: c.quantity, unit: c.unit });
      }
    }

    return Array.from(map.values());
  }, [captures]);

  const handleStartEdit = (cap: CaptureItem) => {
    setEditingId(cap.id);
    setEditQtyValue(cap.quantity);
  };

  const handleSaveEdit = async (capId: string) => {
    if (editQtyValue <= 0) return;
    await onUpdateCaptureQuantity(capId, editQtyValue);
    setEditingId(null);
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Top Controls & Multi-Device Sync Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-bold text-slate-700">
            Dispositivo: <strong className="text-slate-900">{counterName}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExportSessionBackup}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition active:scale-95 shadow-xs"
            title="Exportar archivo de sincronización para combinar con otros celulares"
          >
            <Share2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Respaldar / Compartir</span>
          </button>

          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition active:scale-95 border border-slate-200"
            title="Importar conteo de otro celular y combinarlo sin duplicar"
          >
            <Upload className="w-3.5 h-3.5 text-red-600" />
            <span>Combinar Conteo</span>
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,.xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onImportSessionBackup(file);
                e.target.value = '';
              }
            }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-xs flex text-xs font-bold">
        <button
          onClick={() => setActiveTab('individual')}
          className={`flex-1 py-2 text-center rounded-xl transition ${
            activeTab === 'individual'
              ? 'bg-red-600 text-white font-black shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Registro Individual ({captures.length})
        </button>

        <button
          onClick={() => setActiveTab('general')}
          className={`flex-1 py-2 text-center rounded-xl transition ${
            activeTab === 'general'
              ? 'bg-red-600 text-white font-black shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Acumulado General ({generalAccumulated.length})
        </button>

        <button
          onClick={() => setActiveTab('zonas')}
          className={`flex-1 py-2 text-center rounded-xl transition ${
            activeTab === 'zonas'
              ? 'bg-red-600 text-white font-black shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Por Zonas ({zoneAccumulated.length})
        </button>
      </div>

      {/* Tab 1: Registro Individual */}
      {activeTab === 'individual' && (
        <div className="space-y-2">
          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en capturas..."
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white rounded-xl border border-slate-200 font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {filteredCaptures.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
              No hay capturas registradas aún.
            </div>
          ) : (
            filteredCaptures.map((cap) => (
              <div
                key={cap.id}
                className="bg-white rounded-2xl p-3 border border-slate-200 shadow-xs flex items-center justify-between gap-3 hover:border-slate-300 transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-mono font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">
                      {cap.code}
                    </span>
                    <span className="text-red-700 font-bold bg-red-50 px-2 py-0.5 rounded-full text-[10px] uppercase">
                      {cap.zoneName}
                    </span>
                    <span className="text-slate-400 text-[10px]">
                      {new Date(cap.timestamp).toLocaleTimeString('es-MX', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-slate-900 mt-1 truncate">
                    {cap.description}
                  </p>

                  <div className="text-[11px] text-slate-500 font-medium">
                    Barras: {cap.barcode} • Por: <strong className="text-slate-700">{cap.counterName}</strong>
                  </div>
                </div>

                {/* Quantity and Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {editingId === cap.id ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        value={editQtyValue}
                        onChange={(e) => setEditQtyValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-14 text-center font-black border border-red-500 rounded-lg p-1 text-sm"
                      />
                      <button
                        onClick={() => handleSaveEdit(cap.id)}
                        className="p-1 bg-emerald-600 text-white rounded-lg"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 bg-slate-200 text-slate-700 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-right">
                      <span className="text-base font-black text-amber-500 block">
                        +{cap.quantity} {cap.unit}
                      </span>
                      <div className="flex items-center gap-1 justify-end mt-0.5">
                        <button
                          onClick={() => handleStartEdit(cap)}
                          className="p-1 text-slate-400 hover:text-slate-700 transition"
                          title="Editar cantidad"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === cap.id ? (
                          <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                            <button
                              onClick={() => {
                                onDeleteCapture(cap.id);
                                setConfirmDeleteId(null);
                              }}
                              className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-black uppercase transition"
                            >
                              Borrar
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(cap.id)}
                            className="p-1 text-slate-400 hover:text-red-600 transition"
                            title="Eliminar captura"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Acumulado General */}
      {activeTab === 'general' && (
        <div className="space-y-2">
          {generalAccumulated.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
              Sin acumulados registrados.
            </div>
          ) : (
            generalAccumulated.map((g) => (
              <div
                key={g.code}
                className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs flex items-center justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-black bg-slate-100 px-2 py-0.5 rounded text-slate-900">
                      {g.code}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">Barras: {g.barcode}</span>
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-900 mt-0.5 truncate">
                    {g.description}
                  </h4>
                  <span className="text-xs text-slate-500 font-semibold">
                    Registrado en {g.entries} capturas
                  </span>
                </div>

                <div className="text-right flex-shrink-0">
                  <span className="text-lg font-black text-red-600">
                    {g.totalQty.toLocaleString()}
                  </span>
                  <span className="text-xs font-bold text-slate-500 block">{g.unit}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Acumulado por Zonas */}
      {activeTab === 'zonas' && (
        <div className="space-y-3">
          {zoneAccumulated.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
              Sin capturas por zona.
            </div>
          ) : (
            zoneAccumulated.map((z) => (
              <div
                key={z.zoneId}
                className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-red-600" />
                    <h3 className="font-extrabold text-slate-900 text-base">{z.zoneName}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-amber-500">
                      {z.totalPieces.toLocaleString()} piezas
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {z.uniqueProducts.size} productos distintos
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {Array.from(z.items.entries()).map(([code, item]) => (
                    <div
                      key={code}
                      className="flex items-center justify-between text-xs py-1 border-b border-slate-50"
                    >
                      <div className="truncate flex-1 pr-2">
                        <strong className="font-mono text-slate-900 mr-1.5">{code}</strong>
                        <span className="text-slate-700">{item.description}</span>
                      </div>
                      <span className="font-bold text-slate-900 flex-shrink-0">
                        {item.qty} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
