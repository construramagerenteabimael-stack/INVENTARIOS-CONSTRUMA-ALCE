import React, { useState } from 'react';
import { User, Check, X } from 'lucide-react';

interface CounterNameModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onSaveName: (name: string) => Promise<void>;
  forceRequired?: boolean;
}

export const CounterNameModal: React.FC<CounterNameModalProps> = ({
  isOpen,
  onClose,
  currentName,
  onSaveName,
  forceRequired = false,
}) => {
  const [name, setName] = useState(currentName || '');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSaveName(name.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl text-slate-900 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-xl">
              <User className="w-5 h-5" />
            </div>
            <h3 className="text-base font-black text-slate-900">Nombre de Quien Cuenta</h3>
          </div>
          {!forceRequired && (
            <button
              onClick={onClose}
              aria-label="Cerrar ventana"
              className="p-1 rounded-full text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <p className="text-xs text-slate-600">
          Este nombre se grabará en cada registro individual de escaneo y en los reportes de Excel de Construrama Alce. Se recuerda automáticamente en este teléfono.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Ing Abimael / Juan Pérez"
            className="w-full rounded-xl border border-slate-300 p-3 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
          />

          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black text-sm uppercase rounded-xl shadow-md active:scale-95 transition flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Guardar Nombre</span>
          </button>
        </form>
      </div>
    </div>
  );
};
