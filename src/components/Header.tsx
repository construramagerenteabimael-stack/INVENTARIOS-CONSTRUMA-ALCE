import React from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import { CountingMode, ZoneItem } from '../types/inventory';
import { MapPin, Eye, EyeOff, User, WifiOff, Volume2, VolumeX, Scan, Sun, Camera, Cloud, CloudOff, RefreshCw } from 'lucide-react';

interface HeaderProps {
  counterName: string;
  activeZone: ZoneItem | null;
  mode: CountingMode;
  onOpenZoneSelector: () => void;
  onOpenCounterNameModal: () => void;
  onToggleMode: () => void;
  isOnline: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  hasHardwareScanner?: boolean;
  wakeLockActive?: boolean;
  onToggleWakeLock?: () => void;
  scanMethod?: 'camera' | 'hardware';
  onToggleScanMethod?: () => void;
  cloudConnected?: boolean;
  cloudSyncing?: boolean;
  cloudEmail?: string | null;
  onOpenCloudSync?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  counterName,
  activeZone,
  mode,
  onOpenZoneSelector,
  onOpenCounterNameModal,
  onToggleMode,
  isOnline,
  soundEnabled,
  onToggleSound,
  wakeLockActive,
  onToggleWakeLock,
  scanMethod = 'camera',
  onToggleScanMethod,
  cloudConnected = false,
  cloudSyncing = false,
  cloudEmail,
  onOpenCloudSync,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#122647] text-white shadow-md border-b-4 border-[#DE1C24]">
      {/* Brand & Identity Row */}
      <div className="max-w-7xl mx-auto px-2.5 sm:px-3 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-2 gap-y-1.5">
        {/* Left: Mascot & Logo/Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="relative flex-shrink-0">
            <img
              src="/alce_mascot.jpg"
              alt="Mascota Alce"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-cover border-2 border-amber-400 shadow-sm"
            />
            {/* Online / Offline indicator badge */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full border-2 border-[#122647] ${
                isOnline ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              title={isOnline ? 'Conexión a internet activa' : 'Sin conexión a internet (Modo Offline)'}
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-xs sm:text-base font-black tracking-tight text-white leading-tight truncate">
              Inventarios Construrama Alce
            </h1>
            <p className="text-[10px] sm:text-[11px] font-semibold text-amber-300 tracking-wide truncate">
              by Ing Abimael
            </p>
          </div>
        </div>

        {/* Right action controls */}
        <div className="flex items-center flex-wrap justify-end gap-1 sm:gap-1.5 flex-shrink-0 relative z-10 max-w-full">
          {/* Cloud Sync Button */}
          {onOpenCloudSync && (
            <button
              onClick={onOpenCloudSync}
              aria-label={
                cloudConnected
                  ? `Sincronización en la nube activa (${cloudEmail || 'Conectado'})`
                  : 'Conectar sincronización en la nube'
              }
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition active:scale-95 border shrink-0 ${
                cloudConnected
                  ? 'bg-emerald-700/80 hover:bg-emerald-600 text-white border-emerald-400 shadow-xs'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-amber-300 border-amber-400/50'
              }`}
              title={
                cloudConnected
                  ? `Nube activa (${cloudEmail || 'Sincronizado'})`
                  : 'Sincronizar celular y computadora en la nube'
              }
            >
              {cloudSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300 shrink-0" />
              ) : cloudConnected ? (
                <Cloud className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
              ) : (
                <CloudOff className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              )}
              <span className="hidden md:inline">
                {cloudConnected ? 'Nube Activa' : 'Nube'}
              </span>
            </button>
          )}

          {/* Scan Method Toggle: Cámara vs Pistola (Sin Cámara) */}
          {onToggleScanMethod && (
            <button
              onClick={onToggleScanMethod}
              aria-label={scanMethod === 'hardware' ? 'Pistola (Sin Cámara)' : 'Cámara'}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition active:scale-95 border shrink-0 ${
                scanMethod === 'hardware'
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700'
              }`}
              title={
                scanMethod === 'hardware'
                  ? 'Modo Lector Físico Activo: La cámara no se activará para ahorrar batería y evitar bloqueos. Clic para cambiar a cámara.'
                  : 'Modo Cámara Activo. Clic para cambiar a Lector Físico (Sin Cámara).'
              }
            >
              {scanMethod === 'hardware' ? (
                <>
                  <Scan className="w-3.5 h-3.5 text-slate-950 shrink-0" />
                  <span className="hidden sm:inline font-extrabold">Pistola (Sin Cámara)</span>
                  <span className="sm:hidden font-extrabold">Pistola</span>
                </>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="hidden sm:inline">Cámara</span>
                </>
              )}
            </button>
          )}

          {/* Wake Lock / Anti-bloqueo status */}
          {onToggleWakeLock && (
            <button
              onClick={onToggleWakeLock}
              aria-label="Alternar pantalla siempre encendida"
              className={`p-1.5 rounded-lg border text-xs font-bold transition active:scale-95 shrink-0 ${
                wakeLockActive
                  ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-xs'
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 border-slate-700'
              }`}
              title={
                wakeLockActive
                  ? 'Anti-bloqueo ACTIVO: La pantalla permanecerá encendida sin apagarse durante los conteos'
                  : 'Anti-bloqueo INACTIVO: Clic para mantener la pantalla siempre encendida'
              }
            >
              <Sun className={`w-4 h-4 ${wakeLockActive ? 'text-slate-950 fill-current' : 'text-slate-400'}`} />
            </button>
          )}

          {/* Sound / Mute toggle */}
          <button
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'Silenciar sonidos' : 'Activar sonidos'}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 active:scale-95 transition shrink-0"
            title={soundEnabled ? 'Sonido activado' : 'Sonido desactivado'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>

          {/* Mode Switch (GUIADO vs CIEGO) */}
          <button
            onClick={onToggleMode}
            aria-label={`Cambiar modo de conteo. Modo actual: ${mode.toUpperCase()}`}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition active:scale-95 shadow-sm border shrink-0 ${
              mode === 'guiado'
                ? 'bg-emerald-700/80 hover:bg-emerald-600 text-white border-emerald-400'
                : 'bg-amber-600 hover:bg-amber-500 text-slate-900 border-amber-300'
            }`}
            title={mode === 'guiado' ? 'Modo Guiado (Muestra existencias)' : 'Modo Ciego (Oculta existencias del sistema)'}
          >
            {mode === 'guiado' ? <Eye className="w-3.5 h-3.5 shrink-0" /> : <EyeOff className="w-3.5 h-3.5 shrink-0" />}
            <span className="hidden sm:inline uppercase">{mode}</span>
          </button>

          {/* Counter name trigger */}
          <button
            onClick={onOpenCounterNameModal}
            aria-label={`Contador: ${counterName || 'Contador'}`}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium max-w-[110px] truncate active:scale-95 transition shrink-0"
            title="Cambiar nombre de quien cuenta"
          >
            <User className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="hidden sm:inline truncate">{counterName || 'Contador'}</span>
          </button>

          {/* PWA Install */}
          <PWAInstallButton />
        </div>
      </div>

      {/* Always Visible Active Zone Bar */}
      <div className="bg-[#DE1C24] px-3 py-1.5 text-white flex items-center justify-between text-xs sm:text-sm font-bold shadow-inner">
        <div className="flex items-center gap-1.5 min-w-0">
          <MapPin className="w-4 h-4 flex-shrink-0 animate-bounce text-amber-300" />
          <span className="text-amber-200 uppercase tracking-wider text-[11px] font-black">ZONA ACTIVA:</span>
          <span className="truncate underline underline-offset-2 font-black text-white">
            {activeZone ? activeZone.name : 'Ninguna zona elegida'}
          </span>
          {activeZone && (
            <span
              className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold uppercase ${
                activeZone.status === 'terminada'
                  ? 'bg-emerald-600 text-white'
                  : activeZone.status === 'en_conteo'
                  ? 'bg-amber-400 text-slate-900'
                  : 'bg-slate-700 text-white'
              }`}
            >
              {activeZone.status === 'en_conteo' ? 'En conteo' : activeZone.status}
            </span>
          )}
        </div>

        <button
          onClick={onOpenZoneSelector}
          className="flex-shrink-0 ml-2 px-2.5 py-1 bg-white hover:bg-amber-50 text-[#DE1C24] font-black rounded-md text-xs uppercase shadow-sm active:scale-95 transition"
        >
          Cambiar Zona
        </button>
      </div>

      {/* Offline Toast Banner if not online */}
      {!isOnline && (
        <div className="bg-amber-500 text-slate-950 font-bold px-3 py-1 text-center text-xs flex items-center justify-center gap-1.5">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Modo Sin Conexión — El escáner y la base local funcionan al 100% offline</span>
        </div>
      )}
    </header>
  );
};
