import React, { useState } from 'react';
import { User } from 'firebase/auth';
import {
  Cloud,
  CloudOff,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Smartphone,
  Laptop,
  X,
  UploadCloud,
  DownloadCloud,
  Copy,
  Check,
  AlertTriangle,
  WifiOff,
} from 'lucide-react';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncedAt: string | null;
  pendingOfflineOpsCount: number;
  cloudError: string | null;
  cloudCatalogCount: number;
  cloudStockCount: number;
  localProductsCount: number;
  localCapturesCount: number;
  localZonesCount: number;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onPushLocalToCloud: (forceOverwriteCatalog: boolean) => Promise<void>;
  onPullCatalogFromCloud: () => Promise<void>;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  user,
  isOnline,
  isSyncing,
  lastSyncedAt,
  pendingOfflineOpsCount,
  cloudError,
  cloudCatalogCount,
  cloudStockCount,
  localProductsCount,
  localCapturesCount,
  localZonesCount,
  onSignInGoogle,
  onSignOut,
  onPushLocalToCloud,
  onPullCatalogFromCloud,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);

  if (!isOpen) return null;

  const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const sharedUrl = rawOrigin.includes('ais-dev-')
    ? rawOrigin.replace('ais-dev-', 'ais-pre-')
    : rawOrigin || 'https://ais-pre-7zoo3wamcrhjykbqkhnd6g-892439407753.us-east1.run.app';

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(sharedUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg max-h-[90dvh] rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#122647] to-[#1e3c72] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2.5 rounded-2xl border ${
                user
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                  : 'bg-amber-500/20 text-amber-300 border-amber-400/40'
              }`}
            >
              {user ? <Cloud className="w-5 h-5" /> : <CloudOff className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-white leading-tight truncate">
                Sincronización en la Nube
              </h3>
              <p className="text-[11px] text-amber-300 font-semibold truncate">
                Celular ↔ Computadora en tiempo real
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Cerrar sincronización en la nube"
            className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-sm">
          {/* Device Bridge Explainer */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Smartphone className="w-5 h-5 text-red-600 shrink-0" />
              <span>Celular</span>
            </div>
            <div className="flex-1 border-t-2 border-dashed border-emerald-400 relative flex items-center justify-center">
              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-black uppercase border border-emerald-300 -mt-0.5">
                {user ? 'En vivo' : 'Google Sync'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span>Computadora</span>
              <Laptop className="w-5 h-5 text-[#122647] shrink-0" />
            </div>
          </div>

          {!isOnline && (
            <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
              <WifiOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-extrabold">Sin conexión a internet en este momento</p>
                <p className="text-amber-800 mt-0.5">
                  Tus conteos siguen guardándose localmente. Cuando vuelva la señal se subirán automáticamente
                  {pendingOfflineOpsCount > 0 ? ` (${pendingOfflineOpsCount} movimientos pendientes)` : ''}.
                </p>
              </div>
            </div>
          )}

          {cloudError && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="font-medium break-words">
                {(() => {
                  try {
                    const parsed = JSON.parse(cloudError);
                    if (parsed && typeof parsed.error === 'string') {
                      return parsed.path
                        ? `${parsed.error} (${parsed.path})`
                        : parsed.error;
                    }
                  } catch {}
                  return cloudError;
                })()}
              </p>
            </div>
          )}

          {!user ? (
            /* Signed Out View */
            <div className="space-y-3.5">
              <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-2 text-xs text-slate-700">
                <p className="font-black text-sm text-[#122647]">
                  ¿Cómo funciona entre tu celular y tu computadora?
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-700">
                  <li>Inicia sesión con tu <strong>misma cuenta de Google</strong> aquí y en tu otro dispositivo.</li>
                  <li>Tu catálogo, zonas, capturas, avances e historial se sincronizan <strong>en vivo</strong>.</li>
                  <li>Lo que cuentes con la pistola o cámara en el celular aparecerá en segundos en tu computadora.</li>
                </ol>
              </div>

              <button
                onClick={onSignInGoogle}
                disabled={isSyncing || !isOnline}
                className="w-full py-3.5 px-4 bg-[#122647] hover:bg-slate-900 disabled:opacity-50 text-white font-black text-sm rounded-2xl shadow-md flex items-center justify-center gap-2.5 transition active:scale-98"
              >
                {isSyncing ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                ) : (
                  <Cloud className="w-5 h-5 text-amber-300" />
                )}
                <span>Iniciar Sesión con Google y Sincronizar</span>
              </button>
            </div>
          ) : (
            /* Signed In View */
            <div className="space-y-3.5">
              {/* Account Badge */}
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-emerald-950 truncate">
                      {user.displayName || 'Cuenta Conectada'}
                    </p>
                    <p className="text-[11px] font-semibold text-emerald-800 truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase shrink-0">
                  {isSyncing ? 'Sincronizando...' : 'Conectado'}
                </span>
              </div>

              {/* Sync Telemetry Summary */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Catálogo Nube</p>
                  <p className="text-sm font-black text-slate-900">
                    {cloudCatalogCount.toLocaleString()}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Capturas Vivas</p>
                  <p className="text-sm font-black text-emerald-700">
                    {localCapturesCount.toLocaleString()}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <p className="text-[10px] font-bold uppercase text-slate-500">Zonas</p>
                  <p className="text-sm font-black text-[#122647]">
                    {localZonesCount.toLocaleString()}
                  </p>
                </div>
              </div>

              {lastSyncedAt && (
                <p className="text-[11px] text-center text-slate-500 font-medium">
                  Última sincronización en vivo:{' '}
                  <strong className="text-slate-700">
                    {new Date(lastSyncedAt).toLocaleTimeString('es-MX', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </strong>
                  {pendingOfflineOpsCount > 0 && ` • ${pendingOfflineOpsCount} en cola offline`}
                </p>
              )}

              {/* Sync Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={() => onPushLocalToCloud(true)}
                  disabled={isSyncing || !isOnline}
                  className="w-full py-2.5 px-3.5 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 border border-amber-300 text-amber-950 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition active:scale-98"
                >
                  <UploadCloud className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Subir Base y Capturas Locales a la Nube ({localProductsCount.toLocaleString()} prod.)
                  </span>
                </button>

                <button
                  onClick={onPullCatalogFromCloud}
                  disabled={isSyncing || !isOnline || (cloudCatalogCount === 0 && cloudStockCount === 0)}
                  className="w-full py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 border border-slate-200 text-slate-800 font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 transition active:scale-98"
                >
                  <DownloadCloud className="w-4 h-4 text-[#122647] shrink-0" />
                  <span>
                    Descargar Catálogo desde la Nube ({cloudCatalogCount.toLocaleString()} prod.)
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Share URL to open on PC / Phone */}
          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
            <p className="text-[11px] font-black uppercase text-slate-500">
              Enlace para abrir en tu otro dispositivo (PC o Celular):
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={sharedUrl}
                aria-label="Enlace compartido de la aplicación"
                className="flex-1 text-[11px] font-mono bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700"
              />
              <button
                onClick={handleCopyUrl}
                className="px-2.5 py-1.5 rounded-lg bg-[#122647] text-white text-xs font-bold flex items-center gap-1 shrink-0 active:scale-95 transition"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="shrink-0 sticky bottom-0 bg-white border-t border-slate-100 p-3 sm:p-4 flex items-center justify-between gap-2 z-10">
          {user ? (
            <button
              onClick={onSignOut}
              disabled={isSyncing}
              className="px-3 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-extrabold flex items-center gap-1.5 transition active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cerrar Sesión</span>
            </button>
          ) : (
            <span className="text-[11px] text-slate-500 font-medium">
              Tus datos locales nunca se pierden
            </span>
          )}

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase transition active:scale-95"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
};
