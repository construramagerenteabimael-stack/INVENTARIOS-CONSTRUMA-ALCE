import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  ProductItem,
  SystemStockItem,
  CaptureItem,
  ZoneItem,
  CountingMode,
  ProductSummary,
} from '../types/inventory';
import { soundFeedback } from '../utils/audioHaptics';
import { useHardwareScanner } from '../hooks/useHardwareScanner';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  Camera,
  Flashlight,
  FlashlightOff,
  RotateCcw,
  Plus,
  Minus,
  Sparkles,
  Search,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  X,
  Volume2,
  Layers,
  ChevronDown,
  Hash,
  Send,
  ZoomIn,
  Target,
  Scan,
  Radio,
  ShoppingCart,
  Warehouse,
  Sun,
  Zap,
} from 'lucide-react';
import {
  isZoneBodega,
  isZoneAutoservicio,
  getCountInBodega,
  getCountInAutoservicio,
  computeProductAutoservicioBalance,
} from '../utils/autoservicioCalculations';

export type FlowAfterCountMode = 'next_pending' | 'return_to_list' | 'manual';

interface ScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeZone: ZoneItem | null;
  zones?: ZoneItem[];
  products: ProductItem[];
  systemStock: SystemStockItem[];
  captures: CaptureItem[];
  mode: CountingMode;
  counterName: string;
  onAddCapture: (item: {
    code: string;
    barcode: string;
    description: string;
    unit: string;
    quantity: number;
    zoneId: string;
    zoneName: string;
  }) => Promise<void>;
  onUndoLastCapture: () => Promise<void>;
  onOpenAIMode: () => void;
  onOpenManualSearch: () => void;
  onOpenUnidentifiedModal: (prefilledBarcode?: string) => void;
  lastCapture: CaptureItem | null;
  // Flow and queue props
  initialProductCode?: string | null;
  pendingQueue?: string[];
  pendingIndex?: number;
  onAdvancePendingQueue?: (nextCode: string, nextIndex: number) => void;
  continuousFlowMode?: FlowAfterCountMode;
  onChangeContinuousFlowMode?: (mode: FlowAfterCountMode) => void;
}

export const ScannerModal: React.FC<ScannerModalProps> = ({
  isOpen,
  onClose,
  activeZone,
  zones = [],
  products,
  systemStock,
  captures,
  mode,
  counterName,
  onAddCapture,
  onUndoLastCapture,
  onOpenAIMode,
  onOpenManualSearch,
  onOpenUnidentifiedModal,
  lastCapture,
  initialProductCode,
  pendingQueue = [],
  pendingIndex = 0,
  onAdvancePendingQueue,
  continuousFlowMode,
  onChangeContinuousFlowMode,
}) => {
  // Scan method: 'camera' vs 'hardware' (Lector Físico / Pistola Sin Cámara)
  const [scanMethod, setScanMethod] = useState<'camera' | 'hardware'>(() => {
    try {
      const saved = localStorage.getItem('inventory_scan_method');
      if (saved === 'hardware' || saved === 'camera') return saved;
    } catch {}
    return 'camera';
  });

  const handleSetScanMethod = (method: 'camera' | 'hardware') => {
    setScanMethod(method);
    try {
      localStorage.setItem('inventory_scan_method', method);
    } catch {}
  };

  // Screen Wake Lock to prevent phone from locking/sleeping during physical scanning
  const { isActive: isWakeLockActive, requestWakeLock } = useWakeLock(isOpen);

  // Hardware scanner laser flash feedback
  const [hardwareScanFlash, setHardwareScanFlash] = useState(false);
  const hardwareInputRef = useRef<HTMLInputElement | null>(null);

  // Hardware instructions collapsible: default FALSE so product information is displayed right at the top
  const [showHardwareHelp, setShowHardwareHelp] = useState(false);

  // Flow after counting: 'next_pending' (load next automatically) vs 'return_to_list' (go back to list) vs 'manual'
  const [flowMode, setFlowMode] = useState<FlowAfterCountMode>(() => {
    if (continuousFlowMode) return continuousFlowMode;
    try {
      const saved = localStorage.getItem('inventory_flow_after_count');
      if (saved === 'next_pending' || saved === 'return_to_list' || saved === 'manual') {
        return saved;
      }
    } catch {}
    return 'next_pending';
  });

  const handleSetFlowMode = (m: FlowAfterCountMode) => {
    setFlowMode(m);
    onChangeContinuousFlowMode?.(m);
    try {
      localStorage.setItem('inventory_flow_after_count', m);
    } catch {}
  };

  // In-scanner feedback banner
  const [flowToast, setFlowToast] = useState<string | null>(null);

  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [continuousMode, setContinuousMode] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Zoom control (critical for small hardware barcodes on screws/fittings)
  const [currentZoom, setCurrentZoom] = useState<number>(1);
  const [hasZoom, setHasZoom] = useState(false);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);

  // Direct manual code entry inside scanner
  const [directCodeInput, setDirectCodeInput] = useState<string>('');

  // Active scanned product details
  const [currentScannedProduct, setCurrentScannedProduct] = useState<ProductItem | null>(null);
  const [currentBarcode, setCurrentBarcode] = useState<string>('');
  const [currentQty, setCurrentQty] = useState<number>(1);
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);

  // Quick number entry keypad
  const [showKeypad, setShowKeypad] = useState(false);
  const [keypadValue, setKeypadValue] = useState<string>('');

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const lastScannedTimeRef = useRef<{ [code: string]: number }>({});
  const lastScannedCodeRef = useRef<string | null>(null);

  // Map for fast lookups
  const productBarcodeMap = useRef<Map<string, ProductItem>>(new Map());
  const productCodeMap = useRef<Map<string, ProductItem>>(new Map());
  const stockMap = useRef<Map<string, SystemStockItem>>(new Map());

  // Update lookup maps
  useEffect(() => {
    const bcMap = new Map<string, ProductItem>();
    const cMap = new Map<string, ProductItem>();
    for (const p of products) {
      if (p.barcode) bcMap.set(p.barcode.trim(), p);
      if (p.code) cMap.set(p.code.trim(), p);
    }
    productBarcodeMap.current = bcMap;
    productCodeMap.current = cMap;

    const sMap = new Map<string, SystemStockItem>();
    for (const s of systemStock) {
      sMap.set(s.code.trim(), s);
    }
    stockMap.current = sMap;
  }, [products, systemStock]);

  // Compute total counted in active zone for current product
  const getProductCountInZone = useCallback(
    (code: string) => {
      if (!activeZone) return 0;
      return captures
        .filter((c) => c.zoneId === activeZone.id && c.code === code)
        .reduce((sum, c) => sum + c.quantity, 0);
    },
    [activeZone, captures]
  );

  // Handle scanned barcode with debounce and feedback
  const handleBarcodeDetected = useCallback(
    async (decodedText: string) => {
      const barcode = decodedText.trim();
      if (!barcode) return;

      setHardwareScanFlash(true);
      setTimeout(() => setHardwareScanFlash(false), 600);

      const now = Date.now();
      const lastTime = lastScannedTimeRef.current[barcode] || 0;

      // Universal deduplication guard: prevents gun bounce, \r\n, and double registrations
      const minIntervalMs = continuousMode ? 800 : 600;
      if (now - lastTime < minIntervalMs) {
        return;
      }
      lastScannedTimeRef.current[barcode] = now;

      // Look up product in catalog
      const matched =
        productBarcodeMap.current.get(barcode) || productCodeMap.current.get(barcode);

      if (!matched) {
        // Not found in catalog
        soundFeedback.notifyNotFound();
        setNotFoundBarcode(barcode);
        setCurrentScannedProduct(null);
        setCurrentBarcode(barcode);
        return;
      }

      // Clear not found error if found
      setNotFoundBarcode(null);
      setCurrentScannedProduct(matched);
      setCurrentBarcode(barcode);

      const isRepeated = lastScannedCodeRef.current === matched.code;
      lastScannedCodeRef.current = matched.code;

      // Check system stock comparison
      const stock = stockMap.current.get(matched.code);
      const prevCount = getProductCountInZone(matched.code);
      const newTotal = prevCount + 1;

      if (stock && newTotal > stock.systemStock) {
        soundFeedback.notifyExceeded();
      } else if (isRepeated) {
        soundFeedback.notifyRepeated();
      } else {
        soundFeedback.notifyFound();
      }

      if (!activeZone) return;

      // Automatically add 1 in continuous mode
      await onAddCapture({
        code: matched.code,
        barcode: matched.barcode || barcode,
        description: matched.description,
        unit: matched.unit || 'pza',
        quantity: 1,
        zoneId: activeZone.id,
        zoneName: activeZone.name,
      });
    },
    [continuousMode, activeZone, getProductCountInZone, onAddCapture]
  );

  // External hardware scanner hook (Bluetooth or USB-OTG laser scanner)
  const { hasDetectedScanner } = useHardwareScanner({
    enabled: isOpen,
    onScan: (scannedCode) => {
      handleBarcodeDetected(scannedCode);
    },
  });

  // Start Camera ONLY when in 'camera' mode; skip completely in 'hardware' mode
  useEffect(() => {
    if (!isOpen || scanMethod !== 'camera') {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current
          .stop()
          .then(() => html5QrCodeRef.current?.clear())
          .catch(() => {});
      }
      setIsScanning(false);
      setCameraError(null);
      return;
    }

    let isMounted = true;
    const scannerId = 'reader-qr-view';

    const startScanner = async () => {
      try {
        setCameraError(null);

        // Hardware-optimized formats commonly found in Mexican ferreterías
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ];

        // Enable native hardware BarcodeDetector (Android Chrome & modern browsers)
        const scanner = new Html5Qrcode(scannerId, {
          formatsToSupport,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
        html5QrCodeRef.current = scanner;

        await scanner.start(
          {
            facingMode: 'environment',
          },
          {
            fps: 25, // 25 frames per sec for near-instant detection
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              // 1D barcodes in hardware stores are wide rectangles (not square)
              const width = Math.min(Math.round(viewfinderWidth * 0.9), 360);
              const height = Math.min(Math.round(viewfinderHeight * 0.48), 180);
              return { width, height };
            },
            aspectRatio: 1.333,
          },
          (decodedText) => {
            if (isMounted) {
              handleBarcodeDetected(decodedText);
            }
          },
          () => {
            // Frame scanned without barcode; normal
          }
        );

        if (isMounted) {
          setIsScanning(true);

          // Check camera capabilities: Torch, Zoom, Continuous Focus
          try {
            const videoElem = document.querySelector(`#${scannerId} video`) as HTMLVideoElement | null;
            if (videoElem && videoElem.srcObject) {
              const stream = videoElem.srcObject as MediaStream;
              const track = stream.getVideoTracks()[0];
              if (track) {
                videoTrackRef.current = track;

                // Attempt continuous autofocus
                try {
                  const constraints = {
                    advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
                  };
                  await track.applyConstraints(constraints);
                } catch {}

                const capabilities = track.getCapabilities ? (track.getCapabilities() as Record<string, unknown>) : {};
                if (capabilities && capabilities.torch) {
                  setHasTorch(true);
                }
                if (capabilities && capabilities.zoom) {
                  setHasZoom(true);
                }
              }
            }
          } catch {}
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (isMounted) {
          setCameraError(
            error.message ||
              'No se pudo acceder a la cámara. Asegúrate de otorgar permisos de cámara en tu navegador.'
          );
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current
          .stop()
          .then(() => html5QrCodeRef.current?.clear())
          .catch(() => {});
      }
    };
  }, [isOpen, scanMethod, handleBarcodeDetected]);

  // Toggle torch / linterna
  const toggleTorch = async () => {
    if (!videoTrackRef.current) return;
    try {
      const nextState = !torchOn;
      await (videoTrackRef.current as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setTorchOn(nextState);
    } catch {}
  };

  // Set camera zoom (1x, 1.5x, 2x, 2.5x)
  const handleSetZoom = async (zoomLevel: number) => {
    if (!videoTrackRef.current) return;
    try {
      await (videoTrackRef.current as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ zoom: zoomLevel }],
      });
      setCurrentZoom(zoomLevel);
    } catch (err) {
      console.warn('Zoom not supported:', err);
    }
  };

  // Tap on viewport to refocus camera
  const handleTapToFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoTrackRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setFocusPoint({ x, y });
    setTimeout(() => setFocusPoint(null), 1200);

    try {
      // Re-trigger continuous autofocus
      await (videoTrackRef.current as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ focusMode: 'continuous' }],
      });
    } catch {}
  };

  // Submit direct code from input box
  const handleDirectCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = directCodeInput.trim();
    if (!code) return;
    setDirectCodeInput('');
    handleBarcodeDetected(code);
  };

  // Adjust count (+ / - or batch)
  const handleAdjustCount = async (delta: number) => {
    if (!currentScannedProduct || !activeZone) return;
    if (delta > 0) {
      soundFeedback.notifyFound();
    } else {
      soundFeedback.notifyRepeated();
    }

    await onAddCapture({
      code: currentScannedProduct.code,
      barcode: currentScannedProduct.barcode || currentBarcode,
      description: currentScannedProduct.description,
      unit: currentScannedProduct.unit || 'pza',
      quantity: delta,
      zoneId: activeZone.id,
      zoneName: activeZone.name,
    });
  };

  // Set explicit count from keypad
  const handleApplyKeypadCount = async () => {
    const qty = parseInt(keypadValue, 10);
    if (isNaN(qty) || qty <= 0 || !currentScannedProduct || !activeZone) return;

    soundFeedback.notifyFound();
    await onAddCapture({
      code: currentScannedProduct.code,
      barcode: currentScannedProduct.barcode || currentBarcode,
      description: currentScannedProduct.description,
      unit: currentScannedProduct.unit || 'pza',
      quantity: qty,
      zoneId: activeZone.id,
      zoneName: activeZone.name,
    });

    setShowKeypad(false);
    setKeypadValue('');
  };

  // Pre-load product if opened from PendingList or queue
  useEffect(() => {
    if (isOpen && initialProductCode) {
      const trimmed = initialProductCode.trim();
      const prod =
        productCodeMap.current.get(trimmed) ||
        products.find((p) => p.code === trimmed || p.barcode === trimmed);
      if (prod) {
        setCurrentScannedProduct(prod);
        setCurrentBarcode(prod.barcode || prod.code);
        setCurrentQty(1);
        setNotFoundBarcode(null);
      }
    }
  }, [isOpen, initialProductCode, products]);

  // Handle flow transition when confirming count
  const handleConfirmCountAndProceed = () => {
    if (!currentScannedProduct) return;

    soundFeedback.notifySuccess();

    if (flowMode === 'next_pending') {
      const queue = pendingQueue || [];
      const currentIdx =
        pendingIndex !== undefined && pendingIndex >= 0
          ? pendingIndex
          : queue.indexOf(currentScannedProduct.code);

      const nextIdx = currentIdx + 1;
      if (nextIdx < queue.length) {
        const nextCode = queue[nextIdx];
        const nextProd =
          productCodeMap.current.get(nextCode) ||
          products.find((p) => p.code === nextCode);

        if (nextProd) {
          setCurrentScannedProduct(nextProd);
          setCurrentBarcode(nextProd.barcode || nextProd.code);
          setCurrentQty(1);
          setNotFoundBarcode(null);
          setDirectCodeInput('');
          onAdvancePendingQueue?.(nextCode, nextIdx);
          setFlowToast(
            `⚡ Siguiente pendiente (${nextIdx + 1}/${queue.length}): ${nextProd.code} - ${nextProd.description}`
          );
          setTimeout(() => setFlowToast(null), 3000);
          return;
        }
      }

      // If no more items in queue
      setFlowToast('🎉 ¡Has contado todos los artículos de esta lista!');
      setTimeout(() => {
        setFlowToast(null);
        onClose();
      }, 1200);
    } else if (flowMode === 'return_to_list') {
      onClose();
    } else {
      // Manual mode: stays on scanner
      setFlowToast(`✓ Conteo guardado para ${currentScannedProduct.code}`);
      setTimeout(() => setFlowToast(null), 2500);
    }
  };

  if (!isOpen) return null;

  // Compute status semáforo for active scanned product
  const activeStock = currentScannedProduct ? stockMap.current.get(currentScannedProduct.code) : null;
  const totalCounted = currentScannedProduct ? getProductCountInZone(currentScannedProduct.code) : 0;
  const systemQty = activeStock ? activeStock.systemStock : 0;

  // Autoservicio specific calculations
  const isAutoZone = isZoneAutoservicio(activeZone);
  const autoBalance =
    isAutoZone && currentScannedProduct
      ? computeProductAutoservicioBalance(currentScannedProduct.code, systemQty, zones, captures)
      : null;

  const bodegaCount = autoBalance
    ? autoBalance.bodegaCount
    : currentScannedProduct
    ? getCountInBodega(currentScannedProduct.code, zones, captures)
    : 0;
  const autoCount = autoBalance
    ? autoBalance.autoservicioCount
    : totalCounted;
  const targetInAuto = autoBalance
    ? autoBalance.targetToFindInAutoservicio
    : Math.max(0, systemQty - bodegaCount);
  const remainingInAuto = autoBalance
    ? autoBalance.remainingToFind
    : Math.max(0, targetInAuto - autoCount);
  const primarySourceZoneName = autoBalance?.primarySourceZoneName || (bodegaCount > 0 ? 'Tapancos / Bodega' : null);

  let semaforoBadge = { text: 'Sin contar', bg: 'bg-slate-600', textCol: 'text-white' };
  if (!activeStock && currentScannedProduct) {
    semaforoBadge = { text: 'No esperado en reporte', bg: 'bg-purple-600', textCol: 'text-white' };
  } else if (isAutoZone && currentScannedProduct && activeStock) {
    // Specialized Autoservicio Semáforo
    if (targetInAuto === 0 && systemQty > 0) {
      semaforoBadge = {
        text: `🏢 Bodega completa (${bodegaCount}/${systemQty})`,
        bg: 'bg-blue-600',
        textCol: 'text-white font-black',
      };
    } else if (remainingInAuto > 0) {
      semaforoBadge = {
        text: `👉 Faltan ${remainingInAuto} en Exhibición`,
        bg: 'bg-amber-500',
        textCol: 'text-slate-950 font-black',
      };
    } else if (remainingInAuto === 0 && (bodegaCount + autoCount) === systemQty) {
      semaforoBadge = {
        text: `🎯 Completo en Piso (${autoCount}/${targetInAuto})`,
        bg: 'bg-emerald-600',
        textCol: 'text-white font-black',
      };
    } else {
      semaforoBadge = {
        text: `⚠️ Excede por +${(bodegaCount + autoCount) - systemQty}`,
        bg: 'bg-red-600',
        textCol: 'text-white font-black',
      };
    }
  } else if (totalCounted === 0) {
    semaforoBadge = { text: 'Gris: Sin contar', bg: 'bg-slate-500', textCol: 'text-white' };
  } else if (totalCounted < systemQty) {
    semaforoBadge = {
      text: `Amarillo: Faltan ${systemQty - totalCounted}`,
      bg: 'bg-amber-500',
      textCol: 'text-slate-950 font-black',
    };
  } else if (totalCounted === systemQty) {
    semaforoBadge = { text: 'Verde: Completo', bg: 'bg-emerald-600', textCol: 'text-white font-black' };
  } else {
    semaforoBadge = {
      text: `Rojo: Excede por ${totalCounted - systemQty}`,
      bg: 'bg-red-600',
      textCol: 'text-white font-black',
    };
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-white select-none">
      {/* Top Bar with Scanner Controls */}
      <div className="bg-[#122647] px-3 py-2 flex items-center justify-between border-b-2 border-red-600 z-10 gap-1.5 flex-wrap">
        <div className="flex items-center gap-2">
          {scanMethod === 'hardware' ? (
            <Scan className="w-5 h-5 text-amber-400" />
          ) : (
            <Camera className="w-5 h-5 text-amber-400" />
          )}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black uppercase text-amber-300 block">
                ZONA: {activeZone?.name || 'Sin zona'}
              </span>
              {isAutoZone && (
                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-1.5 py-0.2 rounded">
                  <ShoppingCart className="w-2.5 h-2.5" />
                  Autoservicio
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <span>{continuousMode ? 'Continuo (+1)' : 'Manual'}</span>
              <span>•</span>
              <span className={isWakeLockActive ? 'text-amber-300 font-bold' : 'text-slate-400'}>
                🔆 Anti-bloqueo {isWakeLockActive ? 'Activo' : 'Listo'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Scan Method Switch: Pistola (Sin Cámara) vs Cámara */}
          <div className="flex bg-slate-900 p-0.5 rounded-xl border border-slate-700">
            <button
              onClick={() => handleSetScanMethod('hardware')}
              className={`px-2 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition ${
                scanMethod === 'hardware'
                  ? 'bg-amber-400 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Modo Pistola / Lector Físico: La cámara se apaga para ahorrar batería y evitar bloqueos"
            >
              <Scan className="w-3.5 h-3.5" />
              <span>Pistola</span>
            </button>
            <button
              onClick={() => handleSetScanMethod('camera')}
              className={`px-2 py-1 rounded-lg text-xs font-black flex items-center gap-1 transition ${
                scanMethod === 'camera'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Modo Cámara: Escanea usando la cámara del celular"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Cámara</span>
            </button>
          </div>

          {/* Torch button (only relevant in camera mode) */}
          {scanMethod === 'camera' && (
            <button
              onClick={toggleTorch}
              aria-label={torchOn ? 'Apagar linterna' : 'Encender linterna'}
              className={`p-2 rounded-xl text-xs font-bold transition flex items-center gap-1 ${
                torchOn ? 'bg-amber-400 text-slate-950 shadow-lg' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
              title="Linterna"
            >
              {torchOn ? <Flashlight className="w-4 h-4 fill-current" /> : <FlashlightOff className="w-4 h-4" />}
            </button>
          )}

          {/* Continuous mode toggle */}
          <button
            onClick={() => setContinuousMode(!continuousMode)}
            className={`px-2 py-1.5 rounded-xl text-xs font-black transition ${
              continuousMode ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400'
            }`}
          >
            {continuousMode ? '+1' : '1x'}
          </button>

          {/* Close Scanner */}
          <button
            onClick={onClose}
            aria-label="Cerrar escáner"
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* VIEWPORT AREA: Hardware Reader Compact Bar vs Camera Stream */}
      {scanMethod === 'hardware' ? (
        /* Dedicated Physical Reader Compact Surface (NO CAMERA STREAM - Ultra-compact to lift product info to top) */
        <div
          className={`relative bg-slate-950 px-3 py-2 border-b border-slate-800 transition-colors duration-200 shrink-0 ${
            hardwareScanFlash ? 'bg-emerald-950/90 ring-2 ring-emerald-400' : ''
          }`}
          onClick={() => hardwareInputRef.current?.focus()}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`p-1.5 rounded-lg shrink-0 ${hardwareScanFlash ? 'bg-emerald-500 text-slate-950 animate-bounce' : 'bg-amber-400/20 text-amber-300'}`}>
                <Scan className="w-4 h-4" />
              </span>
              <div className="min-w-0">
                <span className="text-xs font-black uppercase tracking-wider block text-amber-300 truncate">
                  {hardwareScanFlash ? '⚡ ¡CÓDIGO CAPTURADO!' : '🔫 LECTOR FÍSICO LISTO'}
                </span>
                <span className="text-[10px] text-slate-400 block truncate">
                  Dispara al código • Cámara apagada
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHardwareHelp((prev) => !prev);
                }}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold border border-slate-700 transition"
              >
                {showHardwareHelp ? 'Ocultar' : 'ℹ️ Ayuda'}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSetScanMethod('camera');
                }}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold border border-slate-700 flex items-center gap-1 transition"
                title="Cambiar a escaneo con cámara del celular"
              >
                <Camera className="w-3 h-3" />
                <span className="hidden xs:inline">Cámara</span>
              </button>
            </div>
          </div>

          {/* Collapsible detailed help if requested */}
          {showHardwareHelp && (
            <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-300 space-y-1 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase bg-emerald-950 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                  ✓ Cámara apagada (Ahorro de batería y sin sobrecalentamiento)
                </span>
                <span className="text-[10px] font-black uppercase bg-amber-950 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">
                  🔆 Pantalla activa (No se bloqueará)
                </span>
              </div>
              <p className="text-slate-300">
                Conecta tu lector físico Bluetooth o USB y presiona el gatillo en cualquier producto. El código se capturará al instante.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Camera Viewport Container */
        <div
          onClick={handleTapToFocus}
          className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[190px] max-h-[36vh] cursor-crosshair"
          title="Toca la pantalla para enfocar"
        >
          <div id="reader-qr-view" className="w-full h-full object-cover"></div>

          {/* Reticle / Aiming Guide */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-68 h-28 border-2 border-dashed border-amber-400/90 rounded-xl relative shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                Centra el código de barras
              </div>
              <div className="absolute top-1/2 left-2 right-2 h-0.5 bg-red-500/90 animate-pulse shadow-[0_0_8px_#ef4444]" />
            </div>
          </div>

          {/* Switch to hardware reader pill */}
          <div className="absolute top-2 left-2 z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSetScanMethod('hardware');
              }}
              className="bg-slate-950/90 backdrop-blur-xs border border-amber-400/60 hover:bg-slate-900 px-2.5 py-1 rounded-lg text-[10px] font-bold text-amber-300 flex items-center gap-1.5 shadow-md active:scale-95 transition"
              title="Apagar cámara y usar solo lector de código de barras físico"
            >
              <Scan className="w-3.5 h-3.5 text-amber-400" />
              <span>Usar Lector Físico (Sin Cámara)</span>
            </button>
          </div>

          {/* Zoom Selector Controls (1x, 1.5x, 2x) */}
          <div className="absolute bottom-2 right-2 z-20 flex items-center gap-1 bg-slate-950/80 backdrop-blur-xs p-1 rounded-xl border border-white/20 shadow-md">
            <span className="text-[10px] font-bold text-slate-400 px-1 hidden xs:inline">Zoom:</span>
            {[1, 1.5, 2].map((lvl) => (
              <button
                key={lvl}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSetZoom(lvl);
                }}
                className={`px-2 py-0.5 rounded-lg text-xs font-black transition active:scale-95 ${
                  currentZoom === lvl
                    ? 'bg-amber-400 text-slate-950 shadow-xs'
                    : 'text-slate-300 hover:text-white bg-slate-800/80'
                }`}
              >
                {lvl}x
              </button>
            ))}
          </div>

          {/* Interactive Tap-to-Focus Ripple */}
          {focusPoint && (
            <div
              className="absolute pointer-events-none w-12 h-12 -translate-x-1/2 -translate-y-1/2 border-2 border-amber-400 rounded-full animate-ping z-30"
              style={{ left: focusPoint.x, top: focusPoint.y }}
            />
          )}

          {/* Camera error message */}
          {cameraError && (
            <div className="absolute inset-0 bg-slate-950/90 p-4 flex flex-col items-center justify-center text-center z-30">
              <AlertTriangle className="w-10 h-10 text-amber-500 mb-2" />
              <p className="text-sm font-medium text-slate-200 mb-3">{cameraError}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSetScanMethod('hardware')}
                  className="bg-amber-400 text-slate-950 font-black px-3.5 py-2 rounded-xl text-xs"
                >
                  Usar Modo Pistola (Sin Cámara)
                </button>
                <button
                  onClick={onOpenManualSearch}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs"
                >
                  Búsqueda Manual
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Direct Quick Barcode Input & Scanner Wedge Receptor */}
      <form
        onSubmit={handleDirectCodeSubmit}
        className="bg-slate-950 px-3 py-1.5 flex items-center gap-2 border-b border-slate-800 z-10"
      >
        <div className="relative flex-1">
          <input
            type="text"
            value={directCodeInput}
            onChange={(e) => setDirectCodeInput(e.target.value)}
            placeholder="Dispara con lector físico o escribe código..."
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-400"
          />
        </div>
        <button
          type="submit"
          disabled={!directCodeInput.trim()}
          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs font-black uppercase rounded-xl transition active:scale-95 flex-shrink-0"
        >
          Ingresar
        </button>
      </form>

      {/* Not Found Banner Alert */}
      {notFoundBarcode && (
        <div className="bg-red-600/95 text-white p-2.5 px-3 flex items-center justify-between gap-2 shadow-lg animate-bounce">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-300" />
            <div className="truncate">
              <span className="font-extrabold text-xs block">CÓDIGO NO REGISTRADO:</span>
              <span className="text-xs font-mono font-bold">{notFoundBarcode}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={onOpenManualSearch}
              className="bg-white text-red-700 px-2.5 py-1 rounded-lg text-xs font-black uppercase shadow-xs active:scale-95"
            >
              Buscar
            </button>
            <button
              onClick={() => onOpenUnidentifiedModal(notFoundBarcode)}
              className="bg-amber-400 text-slate-950 px-2.5 py-1 rounded-lg text-xs font-black uppercase shadow-xs active:scale-95"
            >
              No Identificado
            </button>
          </div>
        </div>
      )}

      {/* Active Product HUD / Counter Display */}
      <div className="flex-1 bg-slate-900 border-t-2 border-slate-700 p-3 flex flex-col justify-between overflow-y-auto">
        {currentScannedProduct ? (
          <div className="space-y-2">
            {/* Semáforo badge & Mode */}
            <div className="flex items-center justify-between gap-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider ${semaforoBadge.bg} ${semaforoBadge.textCol}`}
              >
                {semaforoBadge.text}
              </span>
              <span className="text-xs font-bold text-slate-400">
                Código: <strong className="text-white font-mono">{currentScannedProduct.code}</strong>
              </span>
            </div>

            {/* Product Description */}
            <div>
              <h2 className="text-base sm:text-lg font-black text-white leading-tight line-clamp-2">
                {currentScannedProduct.description}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Barras: {currentScannedProduct.barcode || currentBarcode} • Unidad: {currentScannedProduct.unit}
              </p>
            </div>

            {/* Autoservicio Live Balance Card (Bodega -> Exhibición) */}
            {isAutoZone && activeStock ? (
              <div className="bg-gradient-to-r from-emerald-950/90 to-slate-900 border border-emerald-500/60 p-2.5 rounded-xl space-y-2 shadow-md">
                <div className="flex items-center justify-between text-xs font-bold gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Conteo en Piso / Autoservicio</span>
                    </span>
                    {primarySourceZoneName && (
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40 flex items-center gap-1">
                        <Warehouse className="w-3 h-3 text-amber-400" />
                        Pendiente de zona: <strong className="underline">{primarySourceZoneName}</strong>
                      </span>
                    )}
                  </div>
                  {/* Exact 3-part comparison requested by user */}
                  <span className="text-[11px] font-black font-mono text-amber-300 bg-slate-950/90 px-2 py-0.5 rounded-md border border-amber-400/50">
                    {primarySourceZoneName || 'Bodega'}: {bodegaCount} | Pendientes: {remainingInAuto} | Total Sistema: {systemQty}
                  </span>
                </div>

                {/* Direct Sum Equation Bar */}
                <div className="bg-slate-950/90 p-2 rounded-xl border border-amber-400/40 flex flex-wrap items-center justify-between gap-1.5 text-xs font-mono font-black">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-blue-300">{primarySourceZoneName || 'Bodega'}: {bodegaCount}</span>
                    <span className="text-amber-400 font-extrabold">+</span>
                    <span className="text-emerald-400 font-extrabold">Piso: {autoCount}</span>
                    <span className="text-amber-400 font-extrabold">=</span>
                    <span className="text-amber-300 bg-amber-400/20 px-1.5 py-0.5 rounded border border-amber-400/40">
                      Total Contado: {bodegaCount + autoCount}
                    </span>
                    <span className="text-slate-400 font-bold">vs</span>
                    <span className="text-white">Sistema: {systemQty}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                    (bodegaCount + autoCount) === systemQty
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/50'
                      : (bodegaCount + autoCount) < systemQty
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50'
                      : 'bg-purple-500/20 text-purple-300 border border-purple-400/50'
                  }`}>
                    {(bodegaCount + autoCount) === systemQty
                      ? '✓ Cuadrado al 100%'
                      : (bodegaCount + autoCount) < systemQty
                      ? `Faltan ${systemQty - (bodegaCount + autoCount)}`
                      : `+${(bodegaCount + autoCount) - systemQty} Sobrante`}
                  </span>
                </div>

                {/* 5-column quantitative breakdown */}
                <div className="grid grid-cols-5 gap-1 text-center text-xs">
                  <div className="bg-slate-900/90 p-1.5 rounded-lg border border-slate-700 flex flex-col justify-between items-center text-center">
                    <span className="text-[9px] text-blue-300 block font-bold uppercase leading-tight tracking-tight break-words" title={primarySourceZoneName || 'Bodega/Tapanco'}>
                      {primarySourceZoneName
                        ? (primarySourceZoneName.length > 10
                            ? (primarySourceZoneName.split(/[-–—/]/)[0]?.trim() || primarySourceZoneName.slice(0, 10))
                            : primarySourceZoneName)
                        : 'Bodega'}
                    </span>
                    <span className="font-black text-blue-400 text-sm mt-0.5">{bodegaCount}</span>
                  </div>
                  <div className="bg-slate-900/90 p-1.5 rounded-lg border border-slate-700">
                    <span className="text-[9px] text-emerald-300 block font-bold uppercase">Piso</span>
                    <span className="font-black text-emerald-400 text-sm">{autoCount}</span>
                  </div>
                  <div className="bg-amber-950/70 p-1.5 rounded-lg border border-amber-400/60 shadow-2xs">
                    <span className="text-[9px] text-amber-300 block font-bold uppercase">Total</span>
                    <span className="font-black text-amber-300 text-sm">{bodegaCount + autoCount}</span>
                  </div>
                  <div className="bg-slate-900/90 p-1.5 rounded-lg border border-slate-700">
                    <span className="text-[9px] text-slate-300 block font-bold uppercase">Sistema</span>
                    <span className="font-black text-white text-sm">{systemQty}</span>
                  </div>
                  <div className={`p-1.5 rounded-lg border ${
                    (bodegaCount + autoCount) < systemQty
                      ? 'bg-amber-950/80 border-amber-400 shadow-xs'
                      : (bodegaCount + autoCount) === systemQty
                      ? 'bg-emerald-950/80 border-emerald-500 shadow-xs'
                      : 'bg-purple-950/80 border-purple-500 shadow-xs'
                  }`}>
                    <span className={`text-[9px] block font-bold uppercase ${
                      (bodegaCount + autoCount) < systemQty
                        ? 'text-amber-300'
                        : (bodegaCount + autoCount) === systemQty
                        ? 'text-emerald-300'
                        : 'text-purple-300'
                    }`}>
                      {(bodegaCount + autoCount) < systemQty ? 'Faltan' : (bodegaCount + autoCount) === systemQty ? 'Estatus' : 'Sobrante'}
                    </span>
                    <span className={`font-black text-sm ${
                      (bodegaCount + autoCount) < systemQty
                        ? 'text-amber-300 font-extrabold'
                        : (bodegaCount + autoCount) === systemQty
                        ? 'text-emerald-400 font-extrabold'
                        : 'text-purple-400 font-extrabold'
                    }`}>
                      {(bodegaCount + autoCount) < systemQty
                        ? systemQty - (bodegaCount + autoCount)
                        : (bodegaCount + autoCount) === systemQty
                        ? '✓ Ok'
                        : `+${(bodegaCount + autoCount) - systemQty}`}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-300 pt-1 border-t border-emerald-900/50 flex items-center justify-between">
                  <span>
                    {targetInAuto === 0
                      ? `✓ Todo el stock (${bodegaCount} pzs) ya se contó en ${primarySourceZoneName || 'bodega/tapanco'}.`
                      : remainingInAuto > 0
                      ? `👉 En ${primarySourceZoneName || 'bodega/tapanco'} tienes ${bodegaCount} pzs y en piso llevas ${autoCount}. Total contado: ${bodegaCount + autoCount} vs ${systemQty} en sistema (faltan ${remainingInAuto} ${currentScannedProduct.unit}).`
                      : `🎯 ¡Completo! ${primarySourceZoneName || 'Bodega'} (${bodegaCount}) + Piso (${autoCount}) = ${bodegaCount + autoCount} pzs vs ${systemQty} en sistema.`}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 font-mono ml-2 shrink-0">
                    Total: {bodegaCount + autoCount}/{systemQty}
                  </span>
                </div>
              </div>
            ) : mode === 'guiado' ? (
              <div className="grid grid-cols-3 gap-2 bg-slate-800/80 p-2 rounded-xl text-center border border-slate-700/80">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Sistema</span>
                  <span className="text-sm font-extrabold text-slate-200">
                    {activeStock ? `${activeStock.systemStock} ${currentScannedProduct.unit}` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-300 block">Contado</span>
                  <span className="text-sm font-extrabold text-amber-400">
                    {totalCounted} {currentScannedProduct.unit}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Diferencia</span>
                  <span
                    className={`text-sm font-extrabold ${
                      totalCounted - systemQty < 0
                        ? 'text-amber-400'
                        : totalCounted - systemQty > 0
                        ? 'text-red-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {totalCounted - systemQty > 0 ? `+${totalCounted - systemQty}` : totalCounted - systemQty}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Big Interactive Counter Control */}
            <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 flex items-center justify-between gap-3 shadow-inner">
              <button
                onClick={() => handleAdjustCount(-1)}
                aria-label="Restar una pieza"
                className="w-14 h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-2xl flex items-center justify-center active:scale-95 transition border border-slate-700"
              >
                <Minus className="w-7 h-7" />
              </button>

              <div className="flex-1 text-center">
                {isAutoZone && activeStock ? (
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-emerald-400 block">
                      SUMA TOTAL: BODEGA ({bodegaCount}) + PISO ({autoCount})
                    </span>
                    <div className="flex items-baseline justify-center gap-1.5">
                      <span className="text-4xl sm:text-5xl font-black text-amber-400 tracking-tight">
                        {bodegaCount + autoCount}
                      </span>
                      <span className="text-base sm:text-lg font-bold text-slate-400">
                        / {systemQty} {currentScannedProduct.unit}
                      </span>
                    </div>
                    <div className="text-xs font-bold mt-0.5">
                      {(bodegaCount + autoCount) === systemQty ? (
                        <span className="text-emerald-400 font-black">¡Cuadrado al 100% con Sistema!</span>
                      ) : (bodegaCount + autoCount) < systemQty ? (
                        <span className="text-amber-400 font-black">
                          Faltan {systemQty - (bodegaCount + autoCount)} para igualar sistema (Llevas {autoCount} en piso)
                        </span>
                      ) : (
                        <span className="text-purple-400 font-black">
                          Sobrante: +{(bodegaCount + autoCount) - systemQty} pzs sobre sistema
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
                      Total en Zona Activa
                    </span>
                    <span className="text-4xl sm:text-5xl font-black text-amber-400 tracking-tight">
                      {totalCounted}
                    </span>
                    <span className="text-xs font-semibold text-slate-400 block">{currentScannedProduct.unit}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => handleAdjustCount(1)}
                aria-label="Sumar una pieza"
                className="w-14 h-14 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-2xl flex items-center justify-center active:scale-95 transition shadow-lg shadow-red-600/30"
              >
                <Plus className="w-7 h-7" />
              </button>
            </div>

            {/* Batch increment pills */}
            <div className="flex items-center justify-between gap-1.5 pt-1">
              {[5, 10, 25, 50].map((batch) => (
                <button
                  key={batch}
                  onClick={() => handleAdjustCount(batch)}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black rounded-lg border border-slate-700 active:scale-95 transition"
                >
                  +{batch}
                </button>
              ))}
              <button
                onClick={() => {
                  setKeypadValue('');
                  setShowKeypad(true);
                }}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-lg active:scale-95 transition flex items-center gap-1"
                title="Teclado numérico"
              >
                <Hash className="w-3.5 h-3.5" />
                <span>Fijar</span>
              </button>
            </div>

            {/* In-Scanner Flow Toast Notification */}
            {flowToast && (
              <div className="bg-emerald-500 text-slate-950 p-2 rounded-xl font-black text-xs text-center shadow-lg animate-in fade-in slide-in-from-top duration-200 flex items-center justify-center gap-1.5">
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>{flowToast}</span>
              </div>
            )}

            {/* Continuous Flow Queue Bar & Mode Switcher */}
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                  <Target className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    {pendingQueue.length > 0
                      ? `Pendiente ${(pendingIndex !== undefined ? pendingIndex : pendingQueue.indexOf(currentScannedProduct.code)) + 1} de ${pendingQueue.length}`
                      : 'Flujo tras contar:'}
                  </span>
                </div>

                {/* 3-way flow toggle */}
                <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => handleSetFlowMode('next_pending')}
                    className={`px-2 py-0.5 rounded transition ${
                      flowMode === 'next_pending'
                        ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Carga en automático el siguiente artículo pendiente de la lista"
                  >
                    ⚡ Siguiente auto
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetFlowMode('return_to_list')}
                    className={`px-2 py-0.5 rounded transition ${
                      flowMode === 'return_to_list'
                        ? 'bg-emerald-500 text-slate-950 font-black shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Regresa a la lista de pendientes al terminar este artículo"
                  >
                    ↩️ Volver a lista
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetFlowMode('manual')}
                    className={`px-2 py-0.5 rounded transition ${
                      flowMode === 'manual'
                        ? 'bg-slate-700 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Permanecer en el escáner libre"
                  >
                    🎯 Libre
                  </button>
                </div>
              </div>

              {/* Big Prominent Confirmation Button */}
              <button
                type="button"
                onClick={handleConfirmCountAndProceed}
                className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-wide shadow-md active:scale-95 transition flex items-center justify-center gap-2"
              >
                {flowMode === 'next_pending' ? (
                  <>
                    <Zap className="w-4 h-4 text-amber-300 fill-current" />
                    <span>✓ Confirmar y Cargar Siguiente Pendiente</span>
                  </>
                ) : flowMode === 'return_to_list' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-white" />
                    <span>✓ Confirmar y Regresar a la Lista</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-emerald-200" />
                    <span>✓ Confirmar Conteo de Artículo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400 flex flex-col items-center justify-center space-y-2">
            <Camera className="w-10 h-10 text-slate-600 animate-pulse" />
            <p className="text-sm font-semibold text-slate-300">
              Escanea un código de barras para ver detalles y registrar cantidades.
            </p>
            <p className="text-xs text-slate-500">
              O usa las opciones debajo para buscar por nombre o tomar foto con IA.
            </p>
          </div>
        )}

        {/* Bottom Persistent Action Bar */}
        <div className="pt-2 border-t border-slate-800 grid grid-cols-4 gap-2">
          {/* Deshacer último */}
          <button
            onClick={onUndoLastCapture}
            aria-label="Deshacer última captura"
            className="flex flex-col items-center justify-center py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[11px] font-bold active:scale-95 transition border border-slate-700"
          >
            <RotateCcw className="w-4 h-4 text-amber-400 mb-0.5" />
            <span>Deshacer</span>
          </button>

          {/* Identificar con IA */}
          <button
            onClick={onOpenAIMode}
            className="flex flex-col items-center justify-center py-2 bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-[11px] font-bold active:scale-95 transition shadow-sm"
          >
            <Sparkles className="w-4 h-4 text-amber-300 mb-0.5 animate-spin-slow" />
            <span>Foto IA</span>
          </button>

          {/* Búsqueda manual */}
          <button
            onClick={onOpenManualSearch}
            className="flex flex-col items-center justify-center py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[11px] font-bold active:scale-95 transition border border-slate-700"
          >
            <Search className="w-4 h-4 text-sky-400 mb-0.5" />
            <span>Buscar</span>
          </button>

          {/* No identificado */}
          <button
            onClick={() => onOpenUnidentifiedModal(currentBarcode)}
            className="flex flex-col items-center justify-center py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[11px] font-bold active:scale-95 transition border border-slate-700"
          >
            <HelpCircle className="w-4 h-4 text-amber-400 mb-0.5" />
            <span>No Id.</span>
          </button>
        </div>
      </div>

      {/* Numeric Keypad Modal for High Quantities */}
      {showKeypad && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xs bg-slate-900 border border-slate-700 rounded-2xl p-4 shadow-2xl text-white space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold uppercase text-amber-400">Fijar cantidad exacta</span>
              <button
                onClick={() => setShowKeypad(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-right">
              <span className="text-3xl font-black font-mono text-amber-400">
                {keypadValue || '0'}
              </span>
              <span className="text-xs font-bold text-slate-500 ml-1">{currentScannedProduct?.unit}</span>
            </div>

            {/* 0-9 buttons */}
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => setKeypadValue((prev) => (prev === '0' ? String(num) : prev + num))}
                  className="py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xl font-bold active:scale-95 transition"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={() => setKeypadValue('')}
                className="py-3 bg-red-900/60 hover:bg-red-800 rounded-xl text-sm font-bold text-red-200 active:scale-95 transition"
              >
                Borrar
              </button>
              <button
                onClick={() => setKeypadValue((prev) => (prev ? prev + '0' : '0'))}
                className="py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-xl font-bold active:scale-95 transition"
              >
                0
              </button>
              <button
                onClick={() => setKeypadValue((prev) => prev.slice(0, -1))}
                className="py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-bold active:scale-95 transition"
              >
                ⌫
              </button>
            </div>

            <button
              onClick={handleApplyKeypadCount}
              disabled={!keypadValue || parseInt(keypadValue, 10) <= 0}
              className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-black text-sm uppercase rounded-xl shadow-lg active:scale-95 transition flex items-center justify-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              <span>Registrar {keypadValue || 0} {currentScannedProduct?.unit}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
