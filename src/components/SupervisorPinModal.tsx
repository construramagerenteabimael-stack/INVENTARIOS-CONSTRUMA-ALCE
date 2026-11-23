import React, { useState } from 'react';
import { ShieldCheck, Lock, X } from 'lucide-react';

interface SupervisorPinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentPin: string;
}

export const SupervisorPinModal: React.FC<SupervisorPinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentPin,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState(false);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pinInput.length < 4) {
      const next = pinInput + digit;
      setPinInput(next);
      setErrorMsg(false);

      if (next.length === 4) {
        if (next === (currentPin || '1234')) {
          onSuccess();
          onClose();
          setPinInput('');
        } else {
          setErrorMsg(true);
          setTimeout(() => setPinInput(''), 600);
        }
      }
    }
  };

  const handleBackspace = () => {
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMsg(false);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-3xl p-5 shadow-2xl text-white text-center space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => {
              setPinInput('');
              onClose();
            }}
            className="p-1 rounded-full text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="w-12 h-12 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/30 mx-auto flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>

        <div>
          <h3 className="text-base font-black">PIN de Supervisor</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Ingresa el PIN de 4 dígitos para cambiar a <strong>Modo Guiado</strong>
          </p>
          <span className="text-[10px] text-slate-500 block mt-1">(PIN por defecto: 1234)</span>
        </div>

        {/* PIN Dots */}
        <div className="flex justify-center gap-3 py-2">
          {[0, 1, 2, 3].map((idx) => {
            const hasDigit = idx < pinInput.length;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition ${
                  hasDigit
                    ? errorMsg
                      ? 'bg-red-500 border-red-500 animate-shake'
                      : 'bg-amber-400 border-amber-400 scale-110'
                    : 'border-slate-600 bg-slate-800'
                }`}
              />
            );
          })}
        </div>

        {errorMsg && (
          <p className="text-xs text-red-400 font-bold animate-pulse">PIN incorrecto. Intenta de nuevo.</p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5 pt-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              className="py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl text-xl font-black text-white active:scale-95 transition"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={() => setPinInput('')}
            className="py-3 bg-slate-800/60 hover:bg-slate-700 rounded-2xl text-xs font-bold text-slate-400 active:scale-95 transition"
          >
            Limpiar
          </button>
          <button
            onClick={() => handleDigit('0')}
            className="py-3 bg-slate-800 hover:bg-slate-700 rounded-2xl text-xl font-black text-white active:scale-95 transition"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="py-3 bg-slate-800/60 hover:bg-slate-700 rounded-2xl text-sm font-bold text-slate-400 active:scale-95 transition"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
};
