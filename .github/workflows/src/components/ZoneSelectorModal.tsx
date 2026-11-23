import React, { useState } from 'react';
import { ZoneItem, ZoneStatus, ZoneType, CaptureItem } from '../types/inventory';
import { isZoneBodega, isZoneAutoservicio } from '../utils/autoservicioCalculations';
import {
  MapPin,
  Plus,
  CheckCircle,
  Clock,
  Play,
  X,
  Trash2,
  Edit3,
  ArrowRight,
  Warehouse,
  ShoppingCart,
  Box,
  Sparkles,
} from 'lucide-react';

interface ZoneSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  zones: ZoneItem[];
  activeZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
  onCreateZone: (name: string, type?: ZoneType) => Promise<void>;
  onUpdateZoneStatus: (zoneId: string, status: ZoneStatus) => Promise<void>;
  onUpdateZoneType?: (zoneId: string, type: ZoneType) => Promise<void>;
  onDeleteZone: (zoneId: string) => Promise<void>;
  onStartAutoservicioAfterBodega?: (bodegaZone: ZoneItem) => void;
  captures: CaptureItem[];
}

export const ZoneSelectorModal: React.FC<ZoneSelectorModalProps> = ({
  isOpen,
  onClose,
  zones,
  activeZoneId,
  onSelectZone,
  onCreateZone,
  onUpdateZoneStatus,
  onUpdateZoneType,
  onDeleteZone,
  onStartAutoservicioAfterBodega,
  captures,
}) => {
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneType, setNewZoneType] = useState<ZoneType>('bodega');
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteZoneId, setConfirmDeleteZoneId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    await onCreateZone(newZoneName.trim(), newZoneType);
    setNewZoneName('');
    setIsCreating(false);
  };

  const handleCreatePreset = async (name: string, type: ZoneType) => {
    await onCreateZone(name, type);
    setIsCreating(false);
  };

  // Compute pieces per zone
  const getZoneStats = (zoneId: string) => {
    const zoneCaps = captures.filter((c) => c.zoneId === zoneId);
    const totalPieces = zoneCaps.reduce((acc, c) => acc + c.quantity, 0);
    const distinctCodes = new Set(zoneCaps.map((c) => c.code)).size;
    return { totalPieces, distinctCodes, entriesCount: zoneCaps.length };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#122647] text-white px-4 py-3.5 flex items-center justify-between border-b-2 border-red-600">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold">Zonas de Conteo (Bodega y Autoservicio)</h2>
              <p className="text-xs text-slate-300">
                Separa lo contado en bodega para buscar faltantes en exhibición
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {/* Create new zone bar */}
          {isCreating ? (
            <form onSubmit={handleCreate} className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-300 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 block">
                  Nombre y Tipo de la nueva zona:
                </label>
                <div className="text-[10px] text-slate-500 font-semibold">
                  (Bodega vs Autoservicio)
                </div>
              </div>

              {/* Type selector pills */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setNewZoneType('bodega')}
                  className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    newZoneType === 'bodega'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Warehouse className="w-3.5 h-3.5" />
                  <span>🏢 Bodega</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewZoneType('autoservicio')}
                  className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    newZoneType === 'autoservicio'
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>🛒 Autoservicio</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewZoneType('general')}
                  className={`py-2 px-2.5 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    newZoneType === 'general'
                      ? 'bg-slate-700 text-white border-slate-800 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Box className="w-3.5 h-3.5" />
                  <span>📦 General</span>
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  autoFocus
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  placeholder={
                    newZoneType === 'bodega'
                      ? 'Ej. Bodega Principal / Almacén Trasero'
                      : newZoneType === 'autoservicio'
                      ? 'Ej. Anaqueles de Autoservicio / Exhibición'
                      : 'Ej. Patio de Materiales'
                  }
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 bg-white"
                />
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-2 rounded-lg text-sm transition"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-3 py-2 rounded-lg text-sm"
                >
                  Cancelar
                </button>
              </div>

              {/* Quick suggestions */}
              <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] text-slate-500 font-bold">Rápidas:</span>
                <button
                  type="button"
                  onClick={() => handleCreatePreset('Bodega Principal', 'bodega')}
                  className="text-[11px] bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded-md font-semibold transition"
                >
                  + Bodega Principal
                </button>
                <button
                  type="button"
                  onClick={() => handleCreatePreset('Tapanco / Mezzanine', 'bodega')}
                  className="text-[11px] bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 px-2 py-0.5 rounded-md font-semibold transition"
                >
                  + Tapanco
                </button>
                <button
                  type="button"
                  onClick={() => handleCreatePreset('Autoservicio y Exhibición', 'autoservicio')}
                  className="text-[11px] bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-2 py-0.5 rounded-md font-semibold transition"
                >
                  + Autoservicio y Exhibición
                </button>
                <button
                  type="button"
                  onClick={() => handleCreatePreset('Patio y Materiales', 'general')}
                  className="text-[11px] bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-2 py-0.5 rounded-md font-semibold transition"
                >
                  + Patio y Materiales
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-dashed border-red-500 hover:border-red-600 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-sm transition active:scale-98"
              >
                <Plus className="w-4 h-4" />
                <span>+ Crear Nueva Zona de Conteo</span>
              </button>

              {/* Quick helper if user has only bodega or no autoservicio */}
              {zones.some(isZoneBodega) && !zones.some(isZoneAutoservicio) && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingCart className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="text-xs text-emerald-900 font-semibold truncate">
                      ¿Listo para exhibición? Agrega la zona de Autoservicio.
                    </span>
                  </div>
                  <button
                    onClick={() => handleCreatePreset('Autoservicio / Exhibición', 'autoservicio')}
                    className="shrink-0 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg transition"
                  >
                    + Crear Autoservicio
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Zones list */}
          <div className="space-y-2.5">
            {zones.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No hay zonas registradas. Crea una para comenzar a contar.
              </div>
            ) : (
              zones.map((zone) => {
                const isActive = zone.id === activeZoneId;
                const stats = getZoneStats(zone.id);
                const isBodega = isZoneBodega(zone);
                const isAuto = isZoneAutoservicio(zone);

                return (
                  <div
                    key={zone.id}
                    className={`rounded-xl border p-3.5 transition ${
                      isActive
                        ? 'border-red-600 bg-red-50/40 shadow-md ring-2 ring-red-500'
                        : 'border-slate-200 bg-white hover:border-slate-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* Title and tags */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
                            {zone.name}
                          </h3>

                          {/* Zone Type Badge */}
                          {isBodega && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              <Warehouse className="w-3 h-3" />
                              Bodega
                            </span>
                          )}
                          {isAuto && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <ShoppingCart className="w-3 h-3" />
                              Autoservicio
                            </span>
                          )}
                          {!isBodega && !isAuto && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              <Box className="w-3 h-3" />
                              General
                            </span>
                          )}

                          {isActive && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-600 text-white tracking-wider">
                              Activa
                            </span>
                          )}
                        </div>

                        {/* Zone Type Toggle (Bodega <-> Autoservicio <-> General) */}
                        {onUpdateZoneType && (
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-[10px] text-slate-500 font-semibold">Tipo:</span>
                            <button
                              type="button"
                              onClick={() => onUpdateZoneType(zone.id, 'bodega')}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition ${
                                isBodega
                                  ? 'bg-blue-600 text-white'
                                  : 'text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              Bodega
                            </button>
                            <span className="text-slate-300 text-xs">•</span>
                            <button
                              type="button"
                              onClick={() => onUpdateZoneType(zone.id, 'autoservicio')}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition ${
                                isAuto
                                  ? 'bg-emerald-600 text-white'
                                  : 'text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              Autoservicio
                            </button>
                            <span className="text-slate-300 text-xs">•</span>
                            <button
                              type="button"
                              onClick={() => onUpdateZoneType(zone.id, 'general')}
                              className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition ${
                                !isBodega && !isAuto
                                  ? 'bg-slate-700 text-white'
                                  : 'text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              General
                            </button>
                          </div>
                        )}

                        {/* Status selector */}
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-bold text-slate-500">Estado:</span>
                          <button
                            onClick={() => onUpdateZoneStatus(zone.id, 'pendiente')}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition ${
                              zone.status === 'pendiente'
                                ? 'bg-slate-700 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Pendiente
                          </button>
                          <button
                            onClick={() => onUpdateZoneStatus(zone.id, 'en_conteo')}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition ${
                              zone.status === 'en_conteo'
                                ? 'bg-amber-500 text-slate-950 shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            En conteo
                          </button>
                          <button
                            onClick={() => onUpdateZoneStatus(zone.id, 'terminada')}
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition ${
                              zone.status === 'terminada'
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Terminada
                          </button>
                        </div>

                        {/* Special Bodega Finished banner with action button */}
                        {isBodega && zone.status === 'terminada' && (
                          <div className="mt-2.5 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between gap-2">
                            <span className="text-[11px] text-blue-900 font-bold">
                              🏢 Bodega finalizada. ¿Pasar a buscar faltantes en Autoservicio?
                            </span>
                            {onStartAutoservicioAfterBodega && (
                              <button
                                onClick={() => onStartAutoservicioAfterBodega(zone)}
                                className="shrink-0 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-md transition shadow-xs flex items-center gap-1"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                <span>Ir a Autoservicio</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Stats */}
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                              Piezas Contadas
                            </span>
                            <span className="font-bold text-slate-900 text-sm">
                              {stats.totalPieces.toLocaleString()} pzs
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                              Productos Distintos
                            </span>
                            <span className="font-bold text-slate-900 text-sm">
                              {stats.distinctCodes} prods
                            </span>
                          </div>
                          {zone.startTime && (
                            <div className="col-span-2 text-[10px] text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-200/60">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>
                                Inicio:{' '}
                                {new Date(zone.startTime).toLocaleTimeString('es-MX', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                              {zone.endTime && (
                                <span>
                                  {' '}
                                  • Fin:{' '}
                                  {new Date(zone.endTime).toLocaleTimeString('es-MX', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right actions */}
                      <div className="flex flex-col gap-2 items-end">
                        <button
                          onClick={() => {
                            onSelectZone(zone.id);
                            onClose();
                          }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black uppercase transition active:scale-95 shadow-sm ${
                            isActive
                              ? 'bg-slate-800 text-white hover:bg-slate-700'
                              : 'bg-red-600 hover:bg-red-700 text-white'
                          }`}
                        >
                          {isActive ? 'Seleccionada' : 'Elegir'}
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete zone button */}
                        {confirmDeleteZoneId === zone.id ? (
                          <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-200">
                            <button
                              onClick={() => {
                                onDeleteZone(zone.id);
                                setConfirmDeleteZoneId(null);
                              }}
                              className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-black uppercase transition"
                            >
                              Borrar
                            </button>
                            <button
                              onClick={() => setConfirmDeleteZoneId(null)}
                              className="px-1.5 py-0.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteZoneId(zone.id)}
                            className="p-1 text-slate-400 hover:text-red-600 transition"
                            title="Eliminar zona"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-100 px-4 py-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm transition"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
