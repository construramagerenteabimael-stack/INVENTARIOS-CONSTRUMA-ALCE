import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { usePWAInstall } from '../hooks/usePWAInstall';
import {
  APK_LOCAL_BUILD_COMMANDS,
  buildWhatsAppShareUrl,
  isRunningInEmbeddedFrame,
  resolveShareableAppUrl,
} from '../utils/installHelpers';
import {
  Download,
  Smartphone,
  X,
  CheckCircle2,
  WifiOff,
  Copy,
  Check,
  ExternalLink,
  ShieldCheck,
  Package,
  QrCode,
  Share2,
  Terminal,
  GitBranch,
} from 'lucide-react';

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallModal: React.FC<InstallModalProps> = ({ isOpen, onClose }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCommands, setCopiedCommands] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'direct' | 'apk' | 'offline'>('direct');

  const rawOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const appUrl = resolveShareableAppUrl(rawOrigin);
  const inEmbeddedFrame = isRunningInEmbeddedFrame();
  const whatsappShareUrl = buildWhatsAppShareUrl(appUrl);
  const canUseWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    QRCode.toDataURL(appUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: '#122647',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [appUrl, isOpen]);

  if (!isOpen) return null;

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {}
  };

  const handleCopyCommands = async () => {
    try {
      await navigator.clipboard.writeText(APK_LOCAL_BUILD_COMMANDS);
      setCopiedCommands(true);
      setTimeout(() => setCopiedCommands(false), 2500);
    } catch {}
  };

  const handleNativeShare = async () => {
    if (!canUseWebShare) return;
    try {
      await navigator.share({
        title: 'Inventarios Construrama Alce',
        text: 'Abre este enlace en Chrome o Safari para instalar la app de inventarios Construrama Alce:',
        url: appUrl,
      });
    } catch {}
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-lg min-w-0 rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col max-h-[90dvh] overflow-hidden text-slate-800">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#122647] to-[#1c3a6b] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/alce_mascot.jpg"
              alt="Construrama Alce"
              className="w-10 h-10 rounded-2xl object-cover border-2 border-amber-400 shadow-sm shrink-0"
            />
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-amber-300 leading-tight truncate">
                Instalar y Compartir App / APK
              </h3>
              <p className="text-xs text-slate-200 truncate">
                Construrama Alce • Sin Play Store • 100% Offline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar ventana de instalación"
            className="p-1.5 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex min-w-0 border-b border-slate-200 bg-slate-50 text-[11px] sm:text-xs font-bold p-1 gap-1 shrink-0">
          <button
            onClick={() => setActiveTab('direct')}
            className={`flex-1 min-w-0 py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1 ${
              activeTab === 'direct'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="truncate">1. Compartir</span>
          </button>
          <button
            onClick={() => setActiveTab('apk')}
            className={`flex-1 min-w-0 py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1 ${
              activeTab === 'apk'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">2. Generar .APK</span>
          </button>
          <button
            onClick={() => setActiveTab('offline')}
            className={`flex-1 min-w-0 py-2 px-1.5 rounded-xl transition flex items-center justify-center gap-1 ${
              activeTab === 'offline'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-black'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate">Modo Offline</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 min-w-0 p-4 sm:p-5 overflow-y-auto overflow-x-hidden space-y-4 text-sm leading-relaxed">
          {/* TAB 1: Direct Install (QR + Link + Native WebAPK) */}
          {activeTab === 'direct' && (
            <div className="space-y-3.5 min-w-0">
              {inEmbeddedFrame && !isInstalled && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-2 text-xs">
                  <p className="font-black text-amber-900">
                    Estás viendo la app dentro de la vista previa de AI Studio
                  </p>
                  <p className="text-amber-800">
                    Para que Chrome o Safari muestren el botón de instalación directa como app en tu teléfono, ábrela primero en una pestaña independiente:
                  </p>
                  <a
                    href={appUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition active:scale-98"
                  >
                    <ExternalLink className="w-4 h-4 shrink-0" />
                    <span>Abrir App Suelta para Instalar</span>
                  </a>
                </div>
              )}

              {/* Share via QR + Link + WhatsApp */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 min-w-0">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 min-w-0">
                  <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs shrink-0 flex items-center justify-center w-28 h-28">
                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt="Código QR para abrir e instalar Inventarios Construrama Alce"
                        className="w-24 h-24 object-contain"
                      />
                    ) : (
                      <QrCode className="w-10 h-10 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5 text-xs text-center sm:text-left">
                    <h4 className="font-black text-slate-900 text-sm leading-tight">
                      Escanea el QR o envía por WhatsApp
                    </h4>
                    <p className="text-slate-600 text-[11px] leading-snug">
                      Cualquier celular o pistola Android puede escanear este QR con la cámara para abrir e instalar la app al instante (sin Play Store).
                    </p>
                    <div className="flex flex-wrap justify-center sm:justify-start gap-1.5 pt-1">
                      <a
                        href={whatsappShareUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] inline-flex items-center gap-1 transition active:scale-95"
                      >
                        <Share2 className="w-3 h-3 shrink-0" />
                        <span>Enviar por WhatsApp</span>
                      </a>
                      {canUseWebShare && (
                        <button
                          onClick={handleNativeShare}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[11px] inline-flex items-center gap-1 transition active:scale-95"
                        >
                          <Share2 className="w-3 h-3 shrink-0" />
                          <span>Compartir</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1 min-w-0">
                  <input
                    type="text"
                    readOnly
                    value={appUrl}
                    aria-label="Enlace público de instalación"
                    className="flex-1 min-w-0 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-[11px] font-mono text-slate-700 truncate select-all"
                  />
                  <button
                    onClick={handleCopyUrl}
                    className="px-3 py-1.5 bg-[#122647] hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 transition active:scale-95"
                  >
                    {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedUrl ? '¡Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {isInstallable && (
                <div className="text-center">
                  <button
                    onClick={async () => {
                      const success = await install();
                      if (success) onClose();
                    }}
                    className="w-full px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-sm uppercase shadow-lg shadow-emerald-600/30 active:scale-95 transition inline-flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Instalar Ahora en este Dispositivo</span>
                  </button>
                </div>
              )}

              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-extrabold text-emerald-900">
                    Instalación rápida estilo APK desde Chrome (WebAPK)
                  </p>
                  <p className="text-emerald-800 mt-0.5">
                    En Android, Chrome empaqueta la app como aplicación nativa sin avisos de origen desconocido y se actualiza sola cada vez que mejoras la app.
                  </p>
                </div>
              </div>

              {isIOS ? (
                <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs text-slate-700">
                  <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5 text-sm">
                    <Smartphone className="w-4 h-4 text-blue-600" />
                    Pasos en iPhone / iPad (Safari):
                  </h4>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                    <li>Abre el enlace en <strong>Safari</strong>.</li>
                    <li>Toca <strong>Compartir</strong> (cuadro con flecha arriba).</li>
                    <li>Elige <strong>&quot;Agregar a pantalla de inicio&quot;</strong> y confirma <strong>Agregar</strong>.</li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs text-slate-700">
                  <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5 text-sm">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    Pasos en Celular o Terminal Android (Chrome):
                  </h4>
                  <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                    <li>Abre el enlace o QR en <strong>Google Chrome</strong>.</li>
                    <li>Toca los <strong>3 puntos (⋮)</strong> arriba a la derecha.</li>
                    <li>Selecciona <strong>&quot;Instalar aplicación&quot;</strong> o <strong>&quot;Agregar a pantalla principal&quot;</strong>.</li>
                    <li>Confirma en <strong>&quot;Instalar&quot;</strong> y aparecerá el icono de Construrama Alce listo para trabajar offline.</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Build real APK without Play Store */}
          {activeTab === 'apk' && (
            <div className="space-y-3.5 text-xs text-slate-700">
              <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-950 flex items-start gap-2.5">
                <Package className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-extrabold text-blue-900">
                    Proyecto Android (.apk) ya configurado con Capacitor
                  </p>
                  <p className="text-blue-800 mt-0.5">
                    Este código ya incluye <code className="bg-white px-1 rounded font-mono font-bold">capacitor.config.ts</code>, la carpeta nativa <code className="bg-white px-1 rounded font-mono font-bold">android/</code> y un compilador automático en la nube para generar tu archivo <strong>.apk</strong> instalable por WhatsApp o USB sin Play Store.
                  </p>
                </div>
              </div>

              {/* Method 1: GitHub Actions cloud build */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-1.5 font-black text-slate-900 text-xs uppercase">
                  <GitBranch className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Opción 1: Generar .APK en la nube con GitHub (Sin Android Studio)</span>
                </div>
                <ol className="list-decimal pl-4 space-y-1.5 text-slate-700">
                  <li>
                    Descarga o sube este proyecto a un repositorio en <strong>GitHub</strong> (puedes dejarlo privado).
                  </li>
                  <li>
                    Abre la pestaña <strong>Actions</strong> en tu repositorio y elige{' '}
                    <strong>&quot;Generar APK Android (Sin Play Store)&quot;</strong>.
                  </li>
                  <li>
                    Pulsa <strong>&quot;Run workflow&quot;</strong>; en ~2 minutos aparecerá el archivo descargable{' '}
                    <code className="bg-white px-1 py-0.5 rounded border font-mono font-bold">Inventarios-Construrama-Alce.apk</code>.
                  </li>
                  <li>
                    Envía ese <strong>.apk</strong> por WhatsApp o USB a cualquier teléfono o terminal Android y ábrelo para instalar.
                  </li>
                </ol>
              </div>

              {/* Method 2: Local PC / Android Studio */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-black text-slate-900 text-xs uppercase">
                    <Terminal className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Opción 2: Compilar en tu computadora</span>
                  </div>
                  <button
                    onClick={handleCopyCommands}
                    className="px-2.5 py-1 rounded-lg bg-[#122647] text-white text-[11px] font-bold flex items-center gap-1 shrink-0 transition active:scale-95"
                  >
                    {copiedCommands ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCommands ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>

                <pre className="bg-slate-900 text-emerald-300 p-2.5 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all leading-relaxed select-all">
                  {APK_LOCAL_BUILD_COMMANDS}
                </pre>

                <p className="text-[11px] text-slate-600 break-words">
                  El archivo instalable se generará en:{' '}
                  <code className="bg-white px-1 py-0.5 rounded border font-mono text-slate-900 break-all">
                    android/app/build/outputs/apk/debug/app-debug.apk
                  </code>{' '}
                  (también puedes abrir la carpeta <code className="bg-white px-1 rounded border">android/</code> en Android Studio y usar <strong>Build &gt; Build APK(s)</strong>).
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: How Offline Works */}
          {activeTab === 'offline' && (
            <div className="space-y-3.5 text-xs text-slate-700">
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-2.5">
                <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-extrabold text-amber-900">
                    100% Autónomo sin Conexión a Internet
                  </p>
                  <p className="text-amber-800 mt-0.5">
                    Diseñado especialmente para bodegas de lámina, sótanos o pasillos sin cobertura de red WiFi o datos celulares.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-slate-900">Base de Datos Local (IndexedDB)</h5>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      Todo el catálogo, existencias, conteos y zonas se guardan en la memoria flash del teléfono. Si el teléfono se apaga o reinicia, nada se pierde.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-slate-900">Pistola Lectora de Códigos Física</h5>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      El modo pistola procesa códigos por Bluetooth/USB instantáneamente sin consultar ningún servidor externo.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-slate-900">Exportación a Excel y PDF sin Internet</h5>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      El generador del archivo Excel (.xlsx con 7 pestañas) y los reportes PDF se ejecutan directamente en el dispositivo.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-slate-900">Sincronización Automática al Volver la Señal</h5>
                    <p className="text-slate-600 text-[11px] mt-0.5">
                      Si conectaste tu cuenta de Google en Nube, tus capturas se suben y combinan entre celular y computadora automáticamente.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="shrink-0 sticky bottom-0 bg-slate-50 p-3.5 sm:p-4 border-t border-slate-200 flex items-center justify-between gap-2 z-10">
          <span className="text-[11px] text-slate-500 font-medium">
            Construrama Alce • Android / iOS / PC
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition active:scale-95"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
