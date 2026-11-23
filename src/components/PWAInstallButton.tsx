import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Check } from 'lucide-react';
import { InstallModal } from './InstallModal';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleClick = async () => {
    if (isInstallable) {
      const ok = await install();
      if (!ok) {
        setIsModalOpen(true);
      }
    } else {
      setIsModalOpen(true);
    }
  };

  if (isInstalled) {
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 px-2 py-1 text-[11px] font-bold transition active:scale-95"
          title="App Instalada • Funcionando Offline"
        >
          <Check className="w-3 h-3 text-emerald-400" />
          <span className="hidden sm:inline">Offline</span>
        </button>
        <InstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        aria-label="Instalar App / APK"
        className="flex items-center gap-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-2 sm:px-2.5 py-1 text-xs shadow-sm transition active:scale-95 shrink-0"
        title="Instalar App / Descargar APK"
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline">Instalar App / APK</span>
        <span className="sm:hidden">App</span>
      </button>
      <InstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};

