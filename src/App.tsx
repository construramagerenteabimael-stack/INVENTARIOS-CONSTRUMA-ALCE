/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ProductItem,
  SystemStockItem,
  ZoneItem,
  ZoneType,
  CaptureItem,
  UnidentifiedItem,
  CountingMode,
  ZoneStatus,
  InventoryHistorySession,
} from './types/inventory';
import { isZoneBodega, isZoneAutoservicio } from './utils/autoservicioCalculations';
import {
  getAllProducts,
  getAllSystemStock,
  getAllZones,
  getAllCaptures,
  getAllUnidentified,
  getAllRecountCodes,
  saveProducts,
  saveSystemStock,
  saveZone,
  deleteZone,
  addCapture,
  updateCapture,
  deleteCapture,
  addUnidentified,
  deleteUnidentified,
  updateUnidentified,
  toggleRecountCode,
  getSetting,
  saveSetting,
  seedDemoData,
  clearAllInventoryCounts,
  clearProductsOnly,
  clearStockOnly,
  resetCompleteDatabase,
  archiveCurrentCountAndReset,
  deleteCapturesForProduct,
  getAllHistorySessions,
  clearAllHistorySessions,
  saveCapture,
  replaceAllZonesLocal,
  replaceAllCapturesLocal,
  replaceAllUnidentifiedLocal,
  replaceAllRecountsLocal,
  replaceAllHistorySessionsLocal,
} from './utils/storage';
import { User } from 'firebase/auth';
import { testConnection } from './firebase';
import * as cloudSync from './services/cloudSyncService';
import { buildProductSummaries, classifyCaptureZoneType } from './utils/excelExport';
import { getAccumulatedCaptures } from './utils/inventoryCalculations';
import { soundFeedback } from './utils/audioHaptics';
import { exportDifferencesPdf } from './utils/pdfExport';

import { Header } from './components/Header';
import { ZoneSelectorModal } from './components/ZoneSelectorModal';
import { ScannerModal, FlowAfterCountMode } from './components/ScannerModal';
import { AIIdentifyModal } from './components/AIIdentifyModal';
import { UnidentifiedModal } from './components/UnidentifiedModal';
import { ManualSearchModal } from './components/ManualSearchModal';
import { PendingList } from './components/PendingList';
import { CapturesAndSummary } from './components/CapturesAndSummary';
import { DifferencesAndRecount } from './components/DifferencesAndRecount';
import { ImportDataModal } from './components/ImportDataModal';
import { SupervisorPinModal } from './components/SupervisorPinModal';
import { CounterNameModal } from './components/CounterNameModal';
import { InstallModal } from './components/InstallModal';
import { FinalizeCountModal } from './components/FinalizeCountModal';
import { HistorySessionsModal } from './components/HistorySessionsModal';
import { CloudSyncModal } from './components/CloudSyncModal';
import { useHardwareScanner } from './hooks/useHardwareScanner';
import { useWakeLock } from './hooks/useWakeLock';

import {
  Camera,
  Scan,
  ClipboardList,
  FileText,
  FileSpreadsheet,
  Database,
  MapPin,
  Sparkles,
  Search,
  Plus,
  ShoppingCart,
  Warehouse,
  Check,
  CheckCircle2,
  ArrowRight,
  Cloud,
} from 'lucide-react';

type MainViewTab = 'pendientes' | 'registros' | 'diferencias' | 'basedatos';

export default function App() {
  // App state loaded from IndexedDB
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [systemStock, setSystemStock] = useState<SystemStockItem[]>([]);
  const [zones, setZones] = useState<ZoneItem[]>([]);
  const [captures, setCaptures] = useState<CaptureItem[]>([]);
  const [unidentified, setUnidentified] = useState<UnidentifiedItem[]>([]);
  const [recountCodes, setRecountCodes] = useState<Set<string>>(new Set());
  const [historySessions, setHistorySessions] = useState<InventoryHistorySession[]>([]);
  const [editingSessionName, setEditingSessionName] = useState<string | null>(null);
  const [editingSessionSystemStock, setEditingSessionSystemStock] = useState<SystemStockItem[] | null>(null);
  const [editingSessionDate, setEditingSessionDate] = useState<string | null>(null);

  // Settings
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [counterName, setCounterName] = useState<string>('');
  const [mode, setMode] = useState<CountingMode>('guiado');
  const [supervisorPin, setSupervisorPin] = useState<string>('1234');
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Scan method: 'camera' vs 'hardware' (Lector físico sin cámara)
  const [scanMethod, setScanMethod] = useState<'camera' | 'hardware'>(() => {
    try {
      const saved = localStorage.getItem('inventory_scan_method');
      if (saved === 'hardware' || saved === 'camera') return saved;
    } catch {}
    return 'camera';
  });

  // Screen Wake Lock state (anti-bloqueo de pantalla)
  const [wakeLockRequested, setWakeLockRequested] = useState(true);
  const { isActive: isWakeLockActive } = useWakeLock(wakeLockRequested);

  const handleToggleScanMethod = () => {
    const next = scanMethod === 'camera' ? 'hardware' : 'camera';
    setScanMethod(next);
    try {
      localStorage.setItem('inventory_scan_method', next);
    } catch {}
    setAppToast({
      text:
        next === 'hardware'
          ? '🔫 Modo Pistola Activo: La cámara no se activará para ahorrar batería y evitar bloqueos.'
          : '📷 Modo Cámara Activo.',
    });
  };

  const handleToggleWakeLock = () => {
    const next = !wakeLockRequested;
    setWakeLockRequested(next);
    setAppToast({
      text: next
        ? '🔆 Anti-bloqueo activado: Pantalla siempre encendida sin apagarse durante los conteos.'
        : 'Anti-bloqueo desactivado.',
    });
  };

  // App Navigation & Modals
  const [currentTab, setCurrentTab] = useState<MainViewTab>('pendientes');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isAIModeOpen, setIsAIModeOpen] = useState(false);
  const [isUnidentifiedOpen, setIsUnidentifiedOpen] = useState(false);
  const [isManualSearchOpen, setIsManualSearchOpen] = useState(false);
  const [isZoneSelectorOpen, setIsZoneSelectorOpen] = useState(false);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isCounterNameModalOpen, setIsCounterNameModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState(false);
  const [bodegaCompletedPromptZone, setBodegaCompletedPromptZone] = useState<ZoneItem | null>(null);

  // Cloud Sync (Firebase Auth & Firestore) state
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingOfflineOpsCount, setPendingOfflineOpsCount] = useState<number>(0);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudCatalogCount, setCloudCatalogCount] = useState<number>(0);
  const [cloudStockCount, setCloudStockCount] = useState<number>(0);
  const lastCatalogVersionRef = useRef<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('alce_cloud_catalog_version') : null
  );
  const lastStockVersionRef = useRef<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('alce_cloud_stock_version') : null
  );

  const [unidentifiedPrefillBarcode, setUnidentifiedPrefillBarcode] = useState<string | null>(null);
  const [manualSearchPrefill, setManualSearchPrefill] = useState<string>('');

  // Continuous queue navigation & auto-advance after count
  const [selectedProductCodeForScanner, setSelectedProductCodeForScanner] = useState<string | null>(null);
  const [pendingCountQueue, setPendingCountQueue] = useState<string[]>([]);
  const [pendingCurrentIndex, setPendingCurrentIndex] = useState<number>(0);
  const [continuousFlowMode, setContinuousFlowMode] = useState<FlowAfterCountMode>('next_pending');

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isLoading, setIsLoading] = useState(true);
  const [appToast, setAppToast] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (appToast) {
      const timer = setTimeout(() => setAppToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [appToast]);

  // Network listener & Firebase startup connectivity check
  useEffect(() => {
    testConnection().catch(() => {});
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initial load from IndexedDB
  const loadAllData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [
        prods,
        stock,
        zns,
        caps,
        unids,
        recounts,
        savedZoneId,
        savedCounter,
        savedMode,
        savedPin,
        savedHistory,
        savedEditingSession,
        savedEditingStock,
        savedEditingDate,
      ] = await Promise.all([
        getAllProducts(),
        getAllSystemStock(),
        getAllZones(),
        getAllCaptures(),
        getAllUnidentified(),
        getAllRecountCodes(),
        getSetting<string | null>('activeZoneId', null),
        getSetting<string>('counterName', ''),
        getSetting<CountingMode>('countingMode', 'guiado'),
        getSetting<string>('supervisorPin', '1234'),
        getAllHistorySessions(),
        getSetting<string | null>('editingSessionName', null),
        getSetting<SystemStockItem[] | null>('editingSessionSystemStock', null),
        getSetting<string | null>('editingSessionDate', null),
      ]);

      setProducts(prods);
      setSystemStock(stock);
      setZones(zns);
      setCaptures(caps);
      setUnidentified(unids);
      setRecountCodes(recounts);
      setCounterName(savedCounter);
      setMode(savedMode);
      setSupervisorPin(savedPin);
      setHistorySessions(savedHistory);
      setEditingSessionName(savedEditingSession);
      setEditingSessionSystemStock(savedEditingStock);
      setEditingSessionDate(savedEditingDate);

      // Auto-assign first zone if none active or current no longer exists
      let targetZoneId = savedZoneId;
      if (!targetZoneId || !zns.some((z) => z.id === targetZoneId)) {
        if (zns.length > 0) {
          targetZoneId = zns[0].id;
        } else {
          // If no zones exist at all, create a default "Pasillo 1 - Principal"
          const defaultZone: ZoneItem = {
            id: 'zone-default-1',
            name: 'Pasillo 1 - Principal',
            status: 'en_conteo',
            startTime: new Date().toISOString(),
          };
          await saveZone(defaultZone);
          setZones([defaultZone]);
          targetZoneId = defaultZone.id;
        }
      }
      setActiveZoneId(targetZoneId);
      await saveSetting('activeZoneId', targetZoneId);

      // If counter name is not set, prompt user
      if (!savedCounter) {
        setIsCounterNameModalOpen(true);
      }

      // Check if products are empty, offer demo data if URL has ?demo=1 or autostart
      const urlParams = new URLSearchParams(window.location.search);
      if (prods.length === 0 && urlParams.get('autostart') === '1') {
        await seedDemoData();
        await loadAllData();
      }
    } catch (err) {
      console.error('Error al inicializar IndexedDB:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Helper to run cloud writes without blocking offline counting
  const runCloudSync = useCallback(
    (task: (uid: string) => Promise<void>) => {
      if (!cloudUser || !cloudUser.emailVerified) return;
      if (!isOnline) {
        setPendingOfflineOpsCount((prev) => prev + 1);
        return;
      }
      task(cloudUser.uid)
        .then(() => {
          setLastSyncedAt(new Date().toISOString());
          setCloudError(null);
        })
        .catch((err: unknown) => {
          const error = err as Error;
          console.error('Error sincronizando con la nube:', error);
          setCloudError(error.message || 'Error al sincronizar cambios');
        });
    },
    [cloudUser, isOnline]
  );

  // Pull catalog or stock chunks from cloud if version changed remotely (e.g. imported from PC)
  const pullCatalogAndStockIfNeeded = useCallback(
    async (uid: string, meta?: cloudSync.WorkspaceMetadata, forcePull = false) => {
      try {
        if (
          forcePull ||
          (meta?.catalogVersion && meta.catalogVersion !== lastCatalogVersionRef.current)
        ) {
          const { items, version } = await cloudSync.fetchCloudCatalogChunks<ProductItem>(
            uid,
            'products'
          );
          if (items.length > 0) {
            await saveProducts(items, true);
            setProducts(items);
          }
          if (version) {
            lastCatalogVersionRef.current = version;
            try {
              localStorage.setItem('alce_cloud_catalog_version', version);
            } catch {}
          }
        }

        if (
          forcePull ||
          (meta?.stockVersion && meta.stockVersion !== lastStockVersionRef.current)
        ) {
          const { items, version } = await cloudSync.fetchCloudCatalogChunks<SystemStockItem>(
            uid,
            'systemStock'
          );
          if (items.length > 0) {
            await saveSystemStock(items, true);
            setSystemStock(items);
          }
          if (version) {
            lastStockVersionRef.current = version;
            try {
              localStorage.setItem('alce_cloud_stock_version', version);
            } catch {}
          }
        }
      } catch (err: unknown) {
        const error = err as Error;
        console.error('Error descargando catálogo desde la nube:', error);
      }
    },
    []
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsub = cloudSync.subscribeToAuth((user) => {
      setCloudUser(user);
    });
    return () => unsub();
  }, []);

  // Attach real-time Firestore listeners once authenticated & online
  useEffect(() => {
    if (!cloudUser || !cloudUser.emailVerified || !isOnline) return;

    let cancelled = false;
    let unsubscribeCollections: (() => void) | null = null;

    const startSync = async () => {
      try {
        setIsCloudSyncing(true);
        setCloudError(null);

        const savedCounter = await getSetting<string>('counterName', '');
        const wsMeta = await cloudSync.ensureUserWorkspaceAndProfile(cloudUser, savedCounter);
        if (cancelled) return;

        setCloudCatalogCount(wsMeta.catalogCount || 0);
        setCloudStockCount(wsMeta.stockCount || 0);

        // Merge any offline/pre-login local data into cloud BEFORE starting snapshots
        const [
          localZones,
          localCaptures,
          localUnid,
          localRecounts,
          localHistory,
          localProds,
          localStock,
        ] = await Promise.all([
          getAllZones(),
          getAllCaptures(),
          getAllUnidentified(),
          getAllRecountCodes(),
          getAllHistorySessions(),
          getAllProducts(),
          getAllSystemStock(),
        ]);

        await cloudSync.mergeAndUploadLocalToCloud({
          uid: cloudUser.uid,
          zones: localZones,
          captures: localCaptures,
          unidentified: localUnid,
          recountCodes: localRecounts,
          historySessions: localHistory,
          products: localProds,
          systemStock: localStock,
          forceOverwriteCatalog: false,
        });
        if (cancelled) return;

        await pullCatalogAndStockIfNeeded(cloudUser.uid, wsMeta, localProds.length === 0);
        if (cancelled) return;

        setPendingOfflineOpsCount(0);
        setLastSyncedAt(new Date().toISOString());

        unsubscribeCollections = cloudSync.subscribeToWorkspaceCollections(cloudUser.uid, {
          onWorkspaceMeta: (meta) => {
            setCloudCatalogCount(meta.catalogCount || 0);
            setCloudStockCount(meta.stockCount || 0);
            pullCatalogAndStockIfNeeded(cloudUser.uid, meta, false);
          },
          onZones: (cloudZones) => {
            if (cloudZones.length > 0) {
              setZones(cloudZones);
              replaceAllZonesLocal(cloudZones).catch(console.error);
              setActiveZoneId((curr) =>
                curr && cloudZones.some((z) => z.id === curr) ? curr : cloudZones[0].id
              );
            }
            setLastSyncedAt(new Date().toISOString());
          },
          onCaptures: (cloudCaps) => {
            setCaptures(cloudCaps);
            replaceAllCapturesLocal(cloudCaps).catch(console.error);
            setLastSyncedAt(new Date().toISOString());
          },
          onUnidentified: (cloudUnid) => {
            setUnidentified(cloudUnid);
            replaceAllUnidentifiedLocal(cloudUnid).catch(console.error);
          },
          onRecounts: (cloudRecounts) => {
            setRecountCodes(cloudRecounts);
            replaceAllRecountsLocal(cloudRecounts).catch(console.error);
          },
          onHistorySessions: (cloudSessions) => {
            setHistorySessions(cloudSessions);
            replaceAllHistorySessionsLocal(cloudSessions).catch(console.error);
            setLastSyncedAt(new Date().toISOString());
          },
          onSyncError: (err) => {
            setCloudError(err.message || 'Error en suscripción en vivo');
          },
        });
      } catch (err: unknown) {
        if (!cancelled) {
          const error = err as Error;
          setCloudError(error.message || 'No se pudo iniciar la sincronización en la nube.');
        }
      } finally {
        if (!cancelled) setIsCloudSyncing(false);
      }
    };

    startSync();

    return () => {
      cancelled = true;
      if (unsubscribeCollections) unsubscribeCollections();
    };
  }, [cloudUser, isOnline, pullCatalogAndStockIfNeeded]);

  // Active zone object
  const activeZone = useMemo(() => {
    return zones.find((z) => z.id === activeZoneId) || null;
  }, [zones, activeZoneId]);

  // Effective system stock:
  // If an editing session is open, use the system stock snapshot frozen at the date of that count,
  // so that differences remain identical to that count's date, not modified by subsequent catalog imports!
  const effectiveSystemStock = useMemo(() => {
    if (editingSessionName && editingSessionSystemStock && editingSessionSystemStock.length > 0) {
      return editingSessionSystemStock;
    }
    return systemStock;
  }, [editingSessionName, editingSessionSystemStock, systemStock]);

  // Consolidated product summaries for current live count session
  const summaries = useMemo(() => {
    return buildProductSummaries(products, effectiveSystemStock, captures, recountCodes, zones);
  }, [products, effectiveSystemStock, captures, recountCodes, zones]);

  // Combined accumulated captures across all historical sessions + active count session
  const accumulatedCaptures = useMemo(() => {
    return getAccumulatedCaptures(historySessions, captures);
  }, [historySessions, captures]);

  // Consolidated cumulative summaries across whole inventory campaign
  const accumulatedSummaries = useMemo(() => {
    return buildProductSummaries(products, effectiveSystemStock, accumulatedCaptures, recountCodes, zones);
  }, [products, effectiveSystemStock, accumulatedCaptures, recountCodes, zones]);

  const existingCodesSet = useMemo(() => {
    return new Set(products.map((p) => p.code));
  }, [products]);

  // Last capture for fast undo
  const lastCapture = captures.length > 0 ? captures[captures.length - 1] : null;

  // Sound toggle handler
  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundFeedback.setSoundEnabled(next);
  };

  // Switch mode handler: Guiado -> Ciego is free; Ciego -> Guiado requires PIN
  const handleToggleMode = () => {
    if (mode === 'guiado') {
      setMode('ciego');
      saveSetting('countingMode', 'ciego');
    } else {
      setIsPinModalOpen(true);
    }
  };

  // Add capture (with automatic persistence)
  const handleAddCapture = async (item: {
    code: string;
    barcode: string;
    description: string;
    unit: string;
    quantity: number;
    zoneId: string;
    zoneName: string;
    isRecount?: boolean;
  }) => {
    const newCapture: CaptureItem = {
      id: `cap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      zoneId: item.zoneId,
      zoneName: item.zoneName,
      code: item.code,
      barcode: item.barcode,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      timestamp: new Date().toISOString(),
      counterName: counterName || 'Contador Alce',
      isRecount: item.isRecount,
    };

    // Optimistic UI update for instant feedback (zero latency)
    setCaptures((prev) => [...prev, newCapture]);

    // Persist to IndexedDB in background
    addCapture(newCapture).catch((err) => {
      console.error('Error guardando captura en IndexedDB:', err);
    });

    // Real-time cloud sync
    runCloudSync((uid) => cloudSync.upsertCloudCapture(uid, newCapture));

    // Update zone status to 'en_conteo' if it was 'pendiente'
    const targetZone = zones.find((z) => z.id === item.zoneId);
    if (targetZone && targetZone.status === 'pendiente') {
      const updatedZone = { ...targetZone, status: 'en_conteo' as ZoneStatus, startTime: new Date().toISOString() };
      setZones((prev) => prev.map((z) => (z.id === updatedZone.id ? updatedZone : z)));
      saveZone(updatedZone).catch(console.error);
      runCloudSync((uid) => cloudSync.upsertCloudZone(uid, updatedZone));
    }
  };

  // Deduplication ref to prevent gun double-trigger on global scan
  const lastGlobalScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });

  // Global external hardware scanner support (Bluetooth / USB-OTG laser scanner)
  const handleExternalHardwareScan = useCallback(
    async (scannedCode: string) => {
      const code = scannedCode.replace(/[\r\n]+/g, '').trim();
      if (!code) return;

      // Validación de debounce agresiva (800ms): ignora cualquier entrada duplicada
      // generada por múltiples eventos keydown, \n, o rebotes de gatillo del lector físico
      const now = Date.now();
      if (lastGlobalScanRef.current.code === code && now - lastGlobalScanRef.current.time < 800) {
        return;
      }
      lastGlobalScanRef.current = { code, time: now };

      if (!activeZone) {
        soundFeedback.notifyNotFound();
        setAppToast({
          text: `⚠️ Código "${code}" leído, pero debes seleccionar una Zona activa primero.`,
          isError: true,
        });
        setIsZoneSelectorOpen(true);
        return;
      }

      // Search product by barcode or by code
      const matched =
        products.find((p) => p.barcode && p.barcode.trim() === code) ||
        products.find((p) => p.code && p.code.trim() === code);

      if (!matched) {
        soundFeedback.notifyNotFound();
        setAppToast({
          text: `❌ Código "${code}" no encontrado en catálogo. Pulsa aquí para registrar como No Identificado.`,
          isError: true,
        });
        setUnidentifiedPrefillBarcode(code);
        return;
      }

      // Check stock comparison
      const stock = systemStock.find((s) => s.code.trim() === matched.code.trim());
      const zoneCount = captures
        .filter((c) => c.zoneId === activeZone.id && c.code === matched.code)
        .reduce((sum, c) => sum + c.quantity, 0);
      const newTotal = zoneCount + 1;

      if (stock && newTotal > stock.systemStock) {
        soundFeedback.notifyExceeded();
      } else {
        soundFeedback.notifyFound();
      }

      await handleAddCapture({
        code: matched.code,
        barcode: matched.barcode || code,
        description: matched.description,
        unit: matched.unit || 'pza',
        quantity: 1,
        zoneId: activeZone.id,
        zoneName: activeZone.name,
      });

      setAppToast({
        text: `🔫 [${matched.code}] ${matched.description} — +1 en ${activeZone.name} (Total contado: ${newTotal} ${matched.unit || 'pza'})`,
      });
    },
    [activeZone, products, systemStock, captures, handleAddCapture]
  );

  // Hook listening globally for external scanners when camera or input modals are closed
  const { hasDetectedScanner } = useHardwareScanner({
    enabled: !isScannerOpen && !isAIModeOpen && !isManualSearchOpen && !isImportModalOpen,
    onScan: handleExternalHardwareScan,
    debounceMs: 800,
  });

  // Undo last capture
  const handleUndoLastCapture = async () => {
    if (!lastCapture) return;
    soundFeedback.notifyRepeated();
    const removedId = lastCapture.id;
    await deleteCapture(removedId);
    setCaptures((prev) => prev.filter((c) => c.id !== removedId));
    runCloudSync((uid) => cloudSync.deleteCloudCapture(uid, removedId));
  };

  // Zones handlers
  const handleSelectZone = async (zoneId: string) => {
    setActiveZoneId(zoneId);
    await saveSetting('activeZoneId', zoneId);
    runCloudSync((uid) => cloudSync.updateWorkspaceActiveZone(uid, zoneId));
  };

  const handleCreateZone = async (name: string, type?: ZoneType) => {
    const deducedType: ZoneType =
      type ||
      (name.toLowerCase().includes('bodega') ||
      name.toLowerCase().includes('tapanco') ||
      name.toLowerCase().includes('almacen') ||
      name.toLowerCase().includes('almacén') ||
      name.toLowerCase().includes('mezzanine') ||
      name.toLowerCase().includes('trastienda')
        ? 'bodega'
        : name.toLowerCase().includes('autoservicio') ||
          name.toLowerCase().includes('exhibicion') ||
          name.toLowerCase().includes('exhibición') ||
          name.toLowerCase().includes('piso') ||
          name.toLowerCase().includes('mostrador') ||
          name.toLowerCase().includes('anaquel')
        ? 'autoservicio'
        : 'general');

    const newZone: ZoneItem = {
      id: `zone_${Date.now()}`,
      name,
      type: deducedType,
      status: 'pendiente',
    };
    await saveZone(newZone);
    setZones((prev) => [...prev, newZone]);
    setActiveZoneId(newZone.id);
    await saveSetting('activeZoneId', newZone.id);
    runCloudSync(async (uid) => {
      await cloudSync.upsertCloudZone(uid, newZone);
      await cloudSync.updateWorkspaceActiveZone(uid, newZone.id);
    });
  };

  const handleUpdateZoneType = async (zoneId: string, type: ZoneType) => {
    const z = zones.find((item) => item.id === zoneId);
    if (!z) return;
    const updated: ZoneItem = { ...z, type };
    await saveZone(updated);
    setZones((prev) => prev.map((item) => (item.id === zoneId ? updated : item)));
    runCloudSync((uid) => cloudSync.upsertCloudZone(uid, updated));
  };

  const handleUpdateZoneStatus = async (zoneId: string, status: ZoneStatus) => {
    const z = zones.find((item) => item.id === zoneId);
    if (!z) return;

    const updated: ZoneItem = {
      ...z,
      status,
      startTime: status === 'en_conteo' && !z.startTime ? new Date().toISOString() : z.startTime,
      endTime: status === 'terminada' ? new Date().toISOString() : undefined,
    };
    await saveZone(updated);
    setZones((prev) => prev.map((item) => (item.id === zoneId ? updated : item)));
    runCloudSync((uid) => cloudSync.upsertCloudZone(uid, updated));

    // When finishing a Bodega zone, prompt user to continue in Autoservicio!
    if (status === 'terminada' && isZoneBodega(updated)) {
      setBodegaCompletedPromptZone(updated);
    }
  };

  // Switch to or auto-create Autoservicio zone with pending bodega balances
  const handleSwitchToAutoservicio = async (openScanner = false) => {
    let autoZone = zones.find(isZoneAutoservicio);
    let zoneChanged = false;
    if (!autoZone) {
      autoZone = {
        id: `zone_auto_${Date.now()}`,
        name: 'Autoservicio / Exhibición',
        type: 'autoservicio',
        status: 'en_conteo',
        startTime: new Date().toISOString(),
      };
      await saveZone(autoZone);
      setZones((prev) => [...prev, autoZone!]);
      zoneChanged = true;
    } else if (autoZone.status === 'pendiente') {
      const updatedAuto: ZoneItem = {
        ...autoZone,
        status: 'en_conteo',
        startTime: new Date().toISOString(),
      };
      await saveZone(updatedAuto);
      setZones((prev) => prev.map((z) => (z.id === autoZone!.id ? updatedAuto : z)));
      autoZone = updatedAuto;
      zoneChanged = true;
    }

    setActiveZoneId(autoZone.id);
    await saveSetting('activeZoneId', autoZone.id);
    const activeAuto = autoZone;
    runCloudSync(async (uid) => {
      if (zoneChanged) await cloudSync.upsertCloudZone(uid, activeAuto);
      await cloudSync.updateWorkspaceActiveZone(uid, activeAuto.id);
    });

    setAppToast({
      text: `🛒 Zona activada: ${autoZone.name}. Sumando Bodega + Autoservicio vs. Sistema.`,
    });

    if (openScanner) {
      setIsScannerOpen(true);
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    await deleteZone(zoneId);
    setZones((prev) => prev.filter((z) => z.id !== zoneId));
    setCaptures((prev) => prev.filter((c) => c.zoneId !== zoneId));
    runCloudSync((uid) => cloudSync.deleteCloudZone(uid, zoneId));
    if (activeZoneId === zoneId) {
      const remaining = zones.filter((z) => z.id !== zoneId);
      const nextId = remaining.length > 0 ? remaining[0].id : null;
      setActiveZoneId(nextId);
      await saveSetting('activeZoneId', nextId);
      if (nextId) runCloudSync((uid) => cloudSync.updateWorkspaceActiveZone(uid, nextId));
    }
  };

  // Save counter name
  const handleSaveCounterName = async (name: string) => {
    setCounterName(name);
    await saveSetting('counterName', name);
  };

  // Toggle recount
  const handleToggleRecount = async (code: string, isMarked: boolean) => {
    await toggleRecountCode(code, isMarked);
    setRecountCodes((prev) => {
      const next = new Set(prev);
      if (isMarked) next.add(code);
      else next.delete(code);
      return next;
    });
    runCloudSync((uid) => cloudSync.toggleCloudRecountCode(uid, code, isMarked));
  };

  // Start recount mode for a product (force blind mode and open scanner)
  const handleStartRecountMode = (code: string) => {
    setMode('ciego');
    saveSetting('countingMode', 'ciego');
    setSelectedProductCodeForScanner(code);
    setPendingCountQueue([code]);
    setPendingCurrentIndex(0);
    setIsScannerOpen(true);
  };

  // "Ir a contar" shortcut with queue support for continuous counting
  const handleGoCountProduct = (code: string, queue?: string[]) => {
    setSelectedProductCodeForScanner(code);
    if (queue && queue.length > 0) {
      setPendingCountQueue(queue);
      const idx = queue.indexOf(code);
      setPendingCurrentIndex(idx >= 0 ? idx : 0);
    } else {
      setPendingCountQueue([code]);
      setPendingCurrentIndex(0);
    }
    setIsScannerOpen(true);
  };

  // Save product from AI selection
  const handleSelectProductFromAI = async (product: ProductItem, quantity = 1) => {
    if (!activeZone) {
      setIsZoneSelectorOpen(true);
      return;
    }
    await handleAddCapture({
      code: product.code,
      barcode: product.barcode,
      description: product.description,
      unit: product.unit || 'pza',
      quantity,
      zoneId: activeZone.id,
      zoneName: activeZone.name,
    });
  };

  // Unidentified items handlers
  const handleSaveUnidentified = async (item: Omit<UnidentifiedItem, 'id' | 'timestamp'>) => {
    const newItem: UnidentifiedItem = {
      ...item,
      id: `unid_${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    await addUnidentified(newItem);
    setUnidentified((prev) => [...prev, newItem]);
    runCloudSync((uid) => cloudSync.upsertCloudUnidentified(uid, newItem));
  };

  const handleDeleteUnidentified = async (id: string) => {
    await deleteUnidentified(id);
    setUnidentified((prev) => prev.filter((u) => u.id !== id));
    runCloudSync((uid) => cloudSync.deleteCloudUnidentified(uid, id));
  };

  const handleResolveUnidentified = async (unidentifiedId: string, product: ProductItem) => {
    const target = unidentified.find((u) => u.id === unidentifiedId);
    if (!target) return;

    // Record as physical capture
    await handleAddCapture({
      code: product.code,
      barcode: product.barcode,
      description: product.description,
      unit: product.unit || target.unit || 'pza',
      quantity: target.quantity,
      zoneId: target.zoneId,
      zoneName: target.zoneName,
    });

    // Remove from unidentified list
    await deleteUnidentified(unidentifiedId);
    setUnidentified((prev) => prev.filter((u) => u.id !== unidentifiedId));
    runCloudSync((uid) => cloudSync.deleteCloudUnidentified(uid, unidentifiedId));
    soundFeedback.notifyFound();
  };

  // Multi-device export & import
  const handleExportSessionBackup = () => {
    const payload = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      counterName,
      captures,
      unidentified,
      zones,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const fileName = `Respaldo_Inventario_${counterName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportSessionBackup = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.captures || !Array.isArray(data.captures)) {
        throw new Error('El archivo no contiene un formato de respaldo válido de inventario.');
      }

      // Merge captures by unique id
      const existingIds = new Set(captures.map((c) => c.id));
      let addedCaptures = 0;

      for (const cap of data.captures) {
        if (!existingIds.has(cap.id)) {
          await addCapture(cap);
          existingIds.add(cap.id);
          addedCaptures++;
        }
      }

      // Merge unidentified
      const existingUnidIds = new Set(unidentified.map((u) => u.id));
      let addedUnid = 0;
      if (data.unidentified && Array.isArray(data.unidentified)) {
        for (const u of data.unidentified) {
          if (!existingUnidIds.has(u.id)) {
            await addUnidentified(u);
            existingUnidIds.add(u.id);
            addedUnid++;
          }
        }
      }

      // Merge zones
      const existingZoneIds = new Set(zones.map((z) => z.id));
      if (data.zones && Array.isArray(data.zones)) {
        for (const z of data.zones) {
          if (!existingZoneIds.has(z.id)) {
            await saveZone(z);
          }
        }
      }

      await loadAllData();
      setAppToast({
        text: `¡Sincronización exitosa! Se combinaron ${addedCaptures} capturas y ${addedUnid} pendientes de otro celular sin duplicados.`,
      });
    } catch (err: unknown) {
      const error = err as Error;
      setAppToast({
        text: `Error al combinar archivo: ${error.message}`,
        isError: true,
      });
    }
  };

  const handleConfirmArchiveAndReset = async (
    sessionName: string,
    notes: string,
    downloadPdf: boolean
  ) => {
    // If downloadPdf requested, export PDF before clearing
    if (downloadPdf) {
      try {
        await exportDifferencesPdf({
          scope: 'counted',
          items: summaries.filter((s) => s.countedStock > 0),
          allSummaries: summaries,
          captures,
          systemStock,
          zones,
          counterName: counterName || 'Auditor',
          filterLabel: 'Solo lo Contado - Cierre Oficial',
        });
      } catch (pdfErr) {
        console.error('Error al generar PDF antes de archivar:', pdfErr);
      }
    }

    // Archive current count and reset captures + recounts
    const newSession = await archiveCurrentCountAndReset(
      sessionName,
      counterName || 'Auditor',
      captures,
      summaries,
      effectiveSystemStock,
      notes
    );

    // Update in-memory state: update historySessions so cumulative progress is maintained immediately!
    setHistorySessions((prev) => [newSession, ...prev.filter((s) => s.id !== newSession.id)]);
    setCaptures([]);
    setRecountCodes(new Set());
    setEditingSessionName(null);
    setEditingSessionSystemStock(null);
    setEditingSessionDate(null);
    setIsFinalizeModalOpen(false);

    runCloudSync(async (uid) => {
      await cloudSync.uploadCloudHistorySession(uid, newSession);
      await cloudSync.clearCloudActiveCapturesAndRecounts(uid);
    });

    setAppToast({
      text: `✓ Lote archivado en Historial. El Avance General se mantiene y acumula para tu nuevo conteo.`,
    });
  };

  const handleDeleteProductCaptures = async (code: string) => {
    const deletedCount = await deleteCapturesForProduct(code);
    setCaptures((prev) => prev.filter((c) => c.code !== code));
    runCloudSync((uid) => cloudSync.deleteCloudCapturesForProduct(uid, code));
    setAppToast({
      text: `✓ Se eliminaron ${deletedCount} registros de conteo del código ${code}.`,
    });
  };

  const handleSetProductQuantities = async (
    code: string,
    tapancoQty: number,
    autoservicioQty: number,
    notes?: string
  ) => {
    await deleteCapturesForProduct(code);

    const now = new Date().toISOString();
    const product = products.find((p) => p.code === code);
    const desc = product ? product.description : 'Artículo';
    const newCaptures: CaptureItem[] = [];

    const tapancoZone =
      zones.find((z) => isZoneBodega(z)) || zones[0];
    const autoZone =
      zones.find((z) => isZoneAutoservicio(z)) || zones[0];

    if (tapancoQty > 0) {
      const cap: CaptureItem = {
        id: `cap_man_${Date.now()}_tap_${Math.random().toString(36).slice(2, 6)}`,
        code,
        barcode: product?.barcode || code,
        description: desc,
        unit: product?.unit || 'PZA',
        quantity: tapancoQty,
        zoneId: tapancoZone?.id || 'zone-default-tapanco',
        zoneName: tapancoZone?.name || 'Tapanco / Bodega',
        counterName: counterName || 'Auditor',
        timestamp: now,
        isRecount: true,
      };
      await saveCapture(cap);
      newCaptures.push(cap);
    }

    if (autoservicioQty > 0) {
      const cap: CaptureItem = {
        id: `cap_man_${Date.now()}_auto_${Math.random().toString(36).slice(2, 6)}`,
        code,
        barcode: product?.barcode || code,
        description: desc,
        unit: product?.unit || 'PZA',
        quantity: autoservicioQty,
        zoneId: autoZone?.id || 'zone-default-auto',
        zoneName: autoZone?.name || 'Autoservicio / Piso',
        counterName: counterName || 'Auditor',
        timestamp: now,
        isRecount: true,
      };
      await saveCapture(cap);
      newCaptures.push(cap);
    }

    setCaptures((prev) => [...prev.filter((c) => c.code !== code), ...newCaptures]);

    runCloudSync(async (uid) => {
      await cloudSync.deleteCloudCapturesForProduct(uid, code);
      for (const cap of newCaptures) {
        await cloudSync.upsertCloudCapture(uid, cap);
      }
    });

    const totalQty = tapancoQty + autoservicioQty;
    setAppToast({
      text: `✓ Guardado automático: ${code} actualizado a ${totalQty} piezas (${tapancoQty} Tapanco + ${autoservicioQty} Autoservicio).`,
    });
  };

  const handleExitReopenMode = async () => {
    if (editingSessionName) {
      const archived = await archiveCurrentCountAndReset(
        editingSessionName,
        counterName || 'Auditor',
        captures,
        summaries,
        effectiveSystemStock,
        'Cierre de reconteo'
      );
      await loadAllData();
      setEditingSessionName(null);
      setEditingSessionSystemStock(null);
      setEditingSessionDate(null);
      runCloudSync(async (uid) => {
        await cloudSync.uploadCloudHistorySession(uid, archived);
        await cloudSync.clearCloudActiveCapturesAndRecounts(uid);
      });
      setAppToast({
        text: `✓ Conteo "${editingSessionName}" guardado y archivado en el Historial.`,
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col text-slate-900 font-sans selection:bg-red-500 selection:text-white">
      {/* Header */}
      <Header
        counterName={counterName}
        activeZone={activeZone}
        mode={mode}
        onOpenZoneSelector={() => setIsZoneSelectorOpen(true)}
        onOpenCounterNameModal={() => setIsCounterNameModalOpen(true)}
        onToggleMode={handleToggleMode}
        isOnline={isOnline}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        hasHardwareScanner={hasDetectedScanner}
        wakeLockActive={isWakeLockActive}
        onToggleWakeLock={handleToggleWakeLock}
        scanMethod={scanMethod}
        onToggleScanMethod={handleToggleScanMethod}
        cloudConnected={Boolean(cloudUser)}
        cloudSyncing={isCloudSyncing}
        cloudEmail={cloudUser?.email}
        onOpenCloudSync={() => setIsCloudSyncModalOpen(true)}
      />

      {/* Main Content View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <img src="/alce_mascot.jpg" alt="Alce" className="w-16 h-16 rounded-full animate-bounce mb-3" />
            <p className="font-bold text-sm">Cargando base de inventario local...</p>
          </div>
        ) : (
          <>
            {/* Quick Hero / Empty state if no products or stock loaded */}
            {products.length === 0 && (
              <div className="mb-4 bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 rounded-3xl p-5 text-slate-950 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src="/alce_mascot.jpg"
                    alt="Alce Mascota"
                    className="w-14 h-14 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                  />
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-white leading-tight">
                      ¡Bienvenido a Inventarios Construrama Alce!
                    </h2>
                    <p className="text-xs text-amber-100 font-medium mt-0.5">
                      Para comenzar, importa tu catálogo de productos y existencias o carga 28 productos de demostración ferreteros.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={async () => {
                      await seedDemoData();
                      await loadAllData();
                    }}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-950 hover:bg-slate-900 text-white text-xs font-black uppercase rounded-xl active:scale-95 transition shadow-sm flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>Cargar Demo Ferretero</span>
                  </button>

                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-white hover:bg-amber-50 text-red-700 text-xs font-black uppercase rounded-xl active:scale-95 transition shadow-sm"
                  >
                    Importar Excel
                  </button>
                </div>
              </div>
            )}

            {/* TAB 1: PENDIENTES */}
            {currentTab === 'pendientes' && (
              <PendingList
                summaries={summaries}
                zones={zones}
                activeZone={activeZone}
                mode={mode}
                onGoCountProduct={handleGoCountProduct}
                onToggleRecount={handleToggleRecount}
                captures={captures}
                onSwitchToAutoservicio={() => handleSwitchToAutoservicio(false)}
              />
            )}

            {/* TAB 2: REGISTROS & ACUMULADOS */}
            {currentTab === 'registros' && (
              <CapturesAndSummary
                captures={captures}
                zones={zones}
                counterName={counterName}
                onUpdateCaptureQuantity={async (id, qty) => {
                  const cap = captures.find((c) => c.id === id);
                  if (!cap) return;
                  const updated = { ...cap, quantity: qty };
                  await updateCapture(updated);
                  setCaptures((prev) => prev.map((c) => (c.id === id ? updated : c)));
                  runCloudSync((uid) => cloudSync.upsertCloudCapture(uid, updated));
                }}
                onDeleteCapture={async (id) => {
                  await deleteCapture(id);
                  setCaptures((prev) => prev.filter((c) => c.id !== id));
                  runCloudSync((uid) => cloudSync.deleteCloudCapture(uid, id));
                }}
                onExportSessionBackup={handleExportSessionBackup}
                onImportSessionBackup={handleImportSessionBackup}
              />
            )}

            {/* TAB 3: DIFERENCIAS & EXCEL EXPORT */}
            {currentTab === 'diferencias' && (
              <DifferencesAndRecount
                summaries={summaries}
                captures={captures}
                products={products}
                systemStock={effectiveSystemStock}
                unidentified={unidentified}
                zones={zones}
                recountCodes={recountCodes}
                onToggleRecount={handleToggleRecount}
                onStartRecountMode={handleStartRecountMode}
                counterName={counterName}
                onFinalizeCount={() => setIsFinalizeModalOpen(true)}
                onOpenHistory={() => setIsHistoryModalOpen(true)}
                onDeleteProductCaptures={handleDeleteProductCaptures}
                onSetProductQuantities={handleSetProductQuantities}
                accumulatedSummaries={accumulatedSummaries}
                accumulatedCaptures={accumulatedCaptures}
                historySessions={historySessions}
                editingSessionName={editingSessionName}
                editingSessionDate={editingSessionDate}
                onExitReopenMode={handleExitReopenMode}
              />
            )}

            {/* TAB 4: BASE DE DATOS & AJUSTES */}
            {currentTab === 'basedatos' && (
              <div className="space-y-4 pb-24">
                <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-base font-black text-slate-900">
                        Administración de Catálogo y Existencias
                      </h2>
                      <p className="text-xs text-slate-500">
                        Gestiona la base local en IndexedDB, plantillas Excel y respaldos de conteo.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      onClick={() => setIsImportModalOpen(true)}
                      className="p-4 rounded-2xl border-2 border-red-500/80 bg-red-50/50 hover:bg-red-50 text-left transition active:scale-98"
                    >
                      <span className="font-extrabold text-sm text-red-700 block">
                        Importar Base de Productos / Existencias
                      </span>
                      <span className="text-xs text-slate-600 block mt-1">
                        Carga archivos Excel o CSV con tolerancia automática a nombres de columnas y preview.
                      </span>
                    </button>

                    <button
                      onClick={() => setIsZoneSelectorOpen(true)}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-left transition active:scale-98"
                    >
                      <span className="font-extrabold text-sm text-slate-900 block">
                        Gestionar Zonas de Conteo ({zones.length})
                      </span>
                      <span className="text-xs text-slate-600 block mt-1">
                        Crea, cambia o marca como terminadas las zonas (pasillos, patio, bodega, anaqueles).
                      </span>
                    </button>

                    <button
                      onClick={() => setIsUnidentifiedOpen(true)}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-left transition active:scale-98"
                    >
                      <span className="font-extrabold text-sm text-slate-900 block">
                        Artículos No Identificados ({unidentified.length})
                      </span>
                      <span className="text-xs text-slate-600 block mt-1">
                        Revisa fotos y notas tomadas para asignarles código oficial del catálogo.
                      </span>
                    </button>

                    <button
                      onClick={() => setIsInstallModalOpen(true)}
                      className="p-4 rounded-2xl border-2 border-amber-400 bg-amber-50/70 hover:bg-amber-100/60 text-left transition active:scale-98 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm text-slate-900 block">
                          📲 Instalar App / Descargar APK
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 uppercase shadow-2xs">
                          Offline 100%
                        </span>
                      </div>
                      <span className="text-xs text-slate-600 block mt-1">
                        Descarga el archivo APK o instálala directamente en Android/iOS para contar sin internet en bodegas.
                      </span>
                    </button>

                    <button
                      onClick={() => setIsHistoryModalOpen(true)}
                      className="p-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100/70 text-left transition active:scale-98 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm text-indigo-950 block">
                          📚 Historial de Conteos y Auditorías
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-200 text-indigo-900 uppercase">
                          Archivados
                        </span>
                      </div>
                      <span className="text-xs text-slate-600 block mt-1">
                        Consulta auditorías y sesiones guardadas, re-descarga sus reportes en PDF y Excel o restaura un conteo anterior.
                      </span>
                    </button>

                    <button
                      onClick={() => setIsCloudSyncModalOpen(true)}
                      className={`p-4 rounded-2xl border-2 text-left transition active:scale-98 shadow-xs ${
                        cloudUser
                          ? 'border-emerald-400 bg-emerald-50/70 hover:bg-emerald-100/60'
                          : 'border-blue-300 bg-blue-50/60 hover:bg-blue-100/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
                          <Cloud className="w-4 h-4 text-emerald-700" />
                          <span>Sincronización en la Nube (Celular ↔ PC)</span>
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            cloudUser
                              ? 'bg-emerald-600 text-white'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          {cloudUser ? 'Activa' : 'Conectar'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-600 block mt-1">
                        {cloudUser
                          ? `Conectado como ${cloudUser.email}. Tus avances se ven en vivo en tu celular y computadora.`
                          : 'Inicia sesión con Google en tu celular y computadora para sincronizar tus conteos en tiempo real.'}
                      </span>
                    </button>

                    <button
                      onClick={() => setIsCounterNameModalOpen(true)}
                      className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-left transition active:scale-98"
                    >
                      <span className="font-extrabold text-sm text-slate-900 block">
                        Cambiar Nombre del Contador ({counterName || 'No fijado'})
                      </span>
                      <span className="text-xs text-slate-600 block mt-1">
                        Identifica quién realizó cada captura en este dispositivo.
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Floating Big Scanner Action Button (Always centered & easy to hit) */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={() => {
            if (!activeZone) {
              setIsZoneSelectorOpen(true);
            } else {
              setSelectedProductCodeForScanner(null);
              setPendingCountQueue([]);
              setPendingCurrentIndex(0);
              setIsScannerOpen(true);
            }
          }}
          aria-label={scanMethod === 'hardware' ? 'Abrir modo lector físico sin cámara' : 'Abrir escáner con cámara'}
          className={`w-16 h-16 rounded-full text-white shadow-xl border-4 border-white flex items-center justify-center active:scale-90 transition transform ${
            scanMethod === 'hardware'
              ? 'bg-gradient-to-tr from-amber-600 to-amber-400 text-slate-950 shadow-amber-500/50 ring-2 ring-amber-300'
              : 'bg-gradient-to-tr from-red-700 to-red-500 hover:from-red-600 hover:to-red-400 shadow-red-600/40'
          }`}
          title={scanMethod === 'hardware' ? 'Abrir Lector Físico (Sin Cámara)' : 'Abrir Cámara y Escanear'}
        >
          {scanMethod === 'hardware' ? (
            <Scan className="w-8 h-8 text-slate-950 drop-shadow-sm" />
          ) : (
            <Camera className="w-8 h-8 drop-shadow-sm" />
          )}
        </button>
      </div>

      {/* Bottom Mobile-First Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30 shadow-lg safe-bottom">
        <div className="max-w-md mx-auto grid grid-cols-5 text-center text-[10px] font-black uppercase text-slate-600 py-1">
          {/* Pendientes */}
          <button
            onClick={() => setCurrentTab('pendientes')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              currentTab === 'pendientes' ? 'text-red-600 font-extrabold' : 'hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-5 h-5 mb-0.5" />
            <span>Pendientes</span>
          </button>

          {/* Registros */}
          <button
            onClick={() => setCurrentTab('registros')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              currentTab === 'registros' ? 'text-red-600 font-extrabold' : 'hover:text-slate-900'
            }`}
          >
            <FileText className="w-5 h-5 mb-0.5" />
            <span>Registros</span>
          </button>

          {/* Space for the middle floating scanner button */}
          <div className="flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] font-bold text-slate-400 mt-6">
              {scanMethod === 'hardware' ? 'PISTOLA' : 'ESCANEAR'}
            </span>
          </div>

          {/* Diferencias / Excel */}
          <button
            onClick={() => setCurrentTab('diferencias')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              currentTab === 'diferencias' ? 'text-red-600 font-extrabold' : 'hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5 mb-0.5" />
            <span>Diferencias</span>
          </button>

          {/* Base de Datos / Ajustes */}
          <button
            onClick={() => setCurrentTab('basedatos')}
            className={`flex flex-col items-center justify-center py-1 transition ${
              currentTab === 'basedatos' ? 'text-red-600 font-extrabold' : 'hover:text-slate-900'
            }`}
          >
            <Database className="w-5 h-5 mb-0.5" />
            <span>Base / Más</span>
          </button>
        </div>
      </nav>

      {/* MODALS */}

      {/* Scanner View Modal */}
      <ScannerModal
        isOpen={isScannerOpen}
        onClose={() => {
          setIsScannerOpen(false);
          setSelectedProductCodeForScanner(null);
          setPendingCountQueue([]);
          setPendingCurrentIndex(0);
        }}
        activeZone={activeZone}
        zones={zones}
        products={products}
        systemStock={systemStock}
        captures={captures}
        mode={mode}
        counterName={counterName}
        onAddCapture={handleAddCapture}
        onUndoLastCapture={handleUndoLastCapture}
        onOpenAIMode={() => {
          setIsScannerOpen(false);
          setIsAIModeOpen(true);
        }}
        onOpenManualSearch={() => {
          setIsScannerOpen(false);
          setIsManualSearchOpen(true);
        }}
        onOpenUnidentifiedModal={(prefilledBarcode) => {
          setIsScannerOpen(false);
          setUnidentifiedPrefillBarcode(prefilledBarcode || null);
          setIsUnidentifiedOpen(true);
        }}
        lastCapture={lastCapture}
        initialProductCode={selectedProductCodeForScanner}
        pendingQueue={pendingCountQueue}
        pendingIndex={pendingCurrentIndex}
        onAdvancePendingQueue={(nextCode, nextIdx) => {
          setSelectedProductCodeForScanner(nextCode);
          setPendingCurrentIndex(nextIdx);
        }}
        continuousFlowMode={continuousFlowMode}
        onChangeContinuousFlowMode={setContinuousFlowMode}
      />

      {/* AI Vision Identify Modal */}
      <AIIdentifyModal
        isOpen={isAIModeOpen}
        onClose={() => setIsAIModeOpen(false)}
        activeZone={activeZone}
        products={products}
        isOnline={isOnline}
        onSelectProduct={handleSelectProductFromAI}
        onOpenManualSearch={(prefill) => {
          setManualSearchPrefill(prefill || '');
          setIsAIModeOpen(false);
          setIsManualSearchOpen(true);
        }}
        onSaveAsUnidentified={async (photo, note) => {
          if (!activeZone) return;
          await handleSaveUnidentified({
            zoneId: activeZone.id,
            zoneName: activeZone.name,
            photoBase64: photo,
            note: note || 'Capturado con cámara IA',
            quantity: 1,
            unit: 'pza',
            counterName: counterName || 'Contador',
          });
        }}
      />

      {/* Manual Search Modal */}
      <ManualSearchModal
        isOpen={isManualSearchOpen}
        onClose={() => {
          setIsManualSearchOpen(false);
          setManualSearchPrefill('');
        }}
        products={products}
        activeZone={activeZone}
        initialQuery={manualSearchPrefill}
        onSelectProduct={async (prod, qty) => {
          if (!activeZone) return;
          await handleAddCapture({
            code: prod.code,
            barcode: prod.barcode,
            description: prod.description,
            unit: prod.unit || 'pza',
            quantity: qty,
            zoneId: activeZone.id,
            zoneName: activeZone.name,
          });
        }}
      />

      {/* Unidentified Items Modal */}
      <UnidentifiedModal
        isOpen={isUnidentifiedOpen}
        onClose={() => {
          setIsUnidentifiedOpen(false);
          setUnidentifiedPrefillBarcode(null);
        }}
        activeZone={activeZone}
        counterName={counterName}
        prefilledBarcode={unidentifiedPrefillBarcode}
        onSaveUnidentified={handleSaveUnidentified}
        unidentifiedList={unidentified}
        onDeleteUnidentified={handleDeleteUnidentified}
        onResolveUnidentified={handleResolveUnidentified}
        products={products}
      />

      {/* Zone Selector Modal */}
      <ZoneSelectorModal
        isOpen={isZoneSelectorOpen}
        onClose={() => setIsZoneSelectorOpen(false)}
        zones={zones}
        activeZoneId={activeZoneId}
        onSelectZone={handleSelectZone}
        onCreateZone={handleCreateZone}
        onUpdateZoneStatus={handleUpdateZoneStatus}
        onUpdateZoneType={handleUpdateZoneType}
        onDeleteZone={handleDeleteZone}
        onStartAutoservicioAfterBodega={(bz) => {
          setIsZoneSelectorOpen(false);
          handleSwitchToAutoservicio(true);
        }}
        captures={captures}
      />

      {/* Bodega Finished Transition Modal Prompt */}
      {bodegaCompletedPromptZone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-emerald-500">
            {/* Header */}
            <div className="bg-[#122647] text-white p-4 flex items-center justify-between border-b-2 border-emerald-500">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-400/30">
                  <Warehouse className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-amber-300">
                    ¡Conteo en Bodega Finalizado!
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Zona: {bodegaCompletedPromptZone.name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBodegaCompletedPromptZone(null)}
                className="text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-3.5">
              <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
                <p className="font-extrabold text-sm text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ¿Deseas iniciar conteo en Autoservicio?
                </p>
                <p className="text-slate-600 leading-relaxed">
                  El sistema ya registró todo lo contado en Bodega. Ahora puedes buscar los productos en
                  <strong> Autoservicio / Piso de venta</strong>; el sistema te indicará en tiempo real exactamente
                  cuántas piezas te faltan encontrar de cada código en base a la existencia teórica.
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    setBodegaCompletedPromptZone(null);
                    handleSwitchToAutoservicio(true);
                  }}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-md transition active:scale-98 flex items-center justify-center gap-2"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>🛒 Iniciar Conteo en Autoservicio</span>
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </button>

                <button
                  onClick={() => {
                    setBodegaCompletedPromptZone(null);
                    setCurrentTab('pendientes');
                    handleSwitchToAutoservicio(false);
                  }}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition active:scale-98 flex items-center justify-center gap-1.5"
                >
                  <ClipboardList className="w-4 h-4 text-slate-600" />
                  <span>Ver Reporte de Faltantes para Autoservicio</span>
                </button>

                <button
                  onClick={() => setBodegaCompletedPromptZone(null)}
                  className="w-full py-2 text-center text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cerrar / Quedarme en esta zona
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supervisor PIN Modal */}
      <SupervisorPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => {
          setMode('guiado');
          saveSetting('countingMode', 'guiado');
        }}
        currentPin={supervisorPin}
      />

      {/* Counter Name Modal */}
      <CounterNameModal
        isOpen={isCounterNameModalOpen}
        onClose={() => setIsCounterNameModalOpen(false)}
        currentName={counterName}
        onSaveName={handleSaveCounterName}
      />

      {/* Import Data Modal */}
      <ImportDataModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        productsCount={products.length}
        stockCount={systemStock.length}
        stockImportDate={systemStock[0]?.importedAt}
        onSaveProducts={async (newProducts, replaceAll) => {
          await saveProducts(newProducts, replaceAll);
          await loadAllData();
          const latestProducts = await getAllProducts();
          runCloudSync(async (uid) => {
            const ver = await cloudSync.uploadCloudCatalogChunks(uid, 'products', latestProducts);
            lastCatalogVersionRef.current = ver;
            try { localStorage.setItem('alce_cloud_catalog_version', ver); } catch {}
          });
        }}
        onSaveSystemStock={async (newStock, replaceAll) => {
          await saveSystemStock(newStock, replaceAll);
          const existingCodes = new Set(products.map((p) => p.code));
          const newProductsFromStock: ProductItem[] = [];
          for (const s of newStock) {
            if (!existingCodes.has(s.code) && s.description) {
              newProductsFromStock.push({
                code: s.code,
                barcode: s.barcode || s.code,
                description: s.description,
                unit: s.unit || 'pza',
              });
              existingCodes.add(s.code);
            }
          }
          if (newProductsFromStock.length > 0) {
            await saveProducts(newProductsFromStock, false);
          }
          await loadAllData();
          const [latestStock, latestProds] = await Promise.all([
            getAllSystemStock(),
            getAllProducts(),
          ]);
          runCloudSync(async (uid) => {
            const stockVer = await cloudSync.uploadCloudCatalogChunks(uid, 'systemStock', latestStock);
            lastStockVersionRef.current = stockVer;
            try { localStorage.setItem('alce_cloud_stock_version', stockVer); } catch {}
            if (newProductsFromStock.length > 0) {
              const catVer = await cloudSync.uploadCloudCatalogChunks(uid, 'products', latestProds);
              lastCatalogVersionRef.current = catVer;
              try { localStorage.setItem('alce_cloud_catalog_version', catVer); } catch {}
            }
          });
        }}
        onSeedDemoData={async () => {
          await seedDemoData();
          await loadAllData();
          const [zns, caps, prods, stks] = await Promise.all([
            getAllZones(),
            getAllCaptures(),
            getAllProducts(),
            getAllSystemStock(),
          ]);
          runCloudSync(async (uid) => {
            await cloudSync.mergeAndUploadLocalToCloud({
              uid,
              zones: zns,
              captures: caps,
              unidentified: [],
              recountCodes: new Set(),
              historySessions: [],
              products: prods,
              systemStock: stks,
              forceOverwriteCatalog: true,
            });
          });
        }}
        onClearCounts={async () => {
          await clearAllInventoryCounts();
          await loadAllData();
          runCloudSync((uid) => cloudSync.clearCloudActiveCapturesAndRecounts(uid));
        }}
        onClearProductsOnly={async () => {
          await clearProductsOnly();
          await loadAllData();
          runCloudSync(async (uid) => {
            await cloudSync.uploadCloudCatalogChunks(uid, 'products', []);
          });
        }}
        onClearStockOnly={async () => {
          await clearStockOnly();
          await loadAllData();
          runCloudSync(async (uid) => {
            await cloudSync.uploadCloudCatalogChunks(uid, 'systemStock', []);
          });
        }}
        onResetAllData={async () => {
          await resetCompleteDatabase();
          await loadAllData();
          runCloudSync(async (uid) => {
            await cloudSync.clearCloudActiveCapturesAndRecounts(uid);
            await cloudSync.uploadCloudCatalogChunks(uid, 'products', []);
            await cloudSync.uploadCloudCatalogChunks(uid, 'systemStock', []);
          });
        }}
        existingProductCodes={existingCodesSet}
      />

      <InstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />

      <FinalizeCountModal
        isOpen={isFinalizeModalOpen}
        onClose={() => setIsFinalizeModalOpen(false)}
        captures={captures}
        summaries={summaries}
        systemStock={effectiveSystemStock}
        counterName={counterName}
        editingSessionName={editingSessionName}
        onConfirmArchiveAndReset={handleConfirmArchiveAndReset}
        onOpenHistory={() => {
          setIsFinalizeModalOpen(false);
          setIsHistoryModalOpen(true);
        }}
      />

      <HistorySessionsModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        products={products}
        systemStock={systemStock}
        currentCapturesCount={captures.length}
        onSessionRestored={async (sessionName: string) => {
          await loadAllData();
          const [restoredCaps, restoredHistory] = await Promise.all([
            getAllCaptures(),
            getAllHistorySessions(),
          ]);
          runCloudSync(async (uid) => {
            await cloudSync.clearCloudActiveCapturesAndRecounts(uid);
            for (const c of restoredCaps) {
              await cloudSync.upsertCloudCapture(uid, c);
            }
            for (const s of restoredHistory) {
              await cloudSync.uploadCloudHistorySession(uid, s);
            }
          });
          setEditingSessionName(sessionName);
          setCurrentTab('diferencias');
          setAppToast({
            text: `✓ Conteo "${sessionName}" reabierto en vivo. Ya puedes aplicar reconteo y corregir diferencias.`,
          });
        }}
      />

      {/* Cloud Sync Modal (Mobile <-> Desktop) */}
      <CloudSyncModal
        isOpen={isCloudSyncModalOpen}
        onClose={() => setIsCloudSyncModalOpen(false)}
        user={cloudUser}
        isOnline={isOnline}
        isSyncing={isCloudSyncing}
        lastSyncedAt={lastSyncedAt}
        pendingOfflineOpsCount={pendingOfflineOpsCount}
        cloudError={cloudError}
        cloudCatalogCount={cloudCatalogCount}
        cloudStockCount={cloudStockCount}
        localProductsCount={products.length}
        localCapturesCount={captures.length}
        localZonesCount={zones.length}
        onSignInGoogle={async () => {
          try {
            setIsCloudSyncing(true);
            setCloudError(null);
            await cloudSync.signInWithGoogle();
            setAppToast({
              text: '☁️ ¡Sesión de Google conectada! Sincronizando tus datos entre celular y computadora...',
            });
          } catch (err: unknown) {
            const error = err as Error;
            setCloudError(error.message || 'No se pudo iniciar sesión con Google.');
            setAppToast({
              text: 'Error al iniciar sesión con Google.',
              isError: true,
            });
          } finally {
            setIsCloudSyncing(false);
          }
        }}
        onSignOut={async () => {
          try {
            setIsCloudSyncing(true);
            await cloudSync.signOutFromCloud();
            setAppToast({
              text: 'Sesión en la nube cerrada. Tu base local sigue intacta en este dispositivo.',
            });
          } finally {
            setIsCloudSyncing(false);
          }
        }}
        onPushLocalToCloud={async (forceOverwriteCatalog) => {
          if (!cloudUser) return;
          try {
            setIsCloudSyncing(true);
            setCloudError(null);
            await cloudSync.ensureUserWorkspaceAndProfile(cloudUser, counterName);
            const res = await cloudSync.mergeAndUploadLocalToCloud({
              uid: cloudUser.uid,
              zones,
              captures,
              unidentified,
              recountCodes,
              historySessions,
              products,
              systemStock,
              forceOverwriteCatalog,
            });
            if (res.uploadedCatalog) {
              setCloudCatalogCount(products.length);
              setCloudStockCount(systemStock.length);
            }
            setLastSyncedAt(new Date().toISOString());
            setAppToast({
              text: `☁️ Subida completa: ${res.uploadedCaptures} capturas, ${res.uploadedZones} zonas${
                res.uploadedCatalog ? ' y catálogo actualizado' : ''
              }.`,
            });
          } catch (err: unknown) {
            const error = err as Error;
            setCloudError(error.message || 'Error al subir datos a la nube.');
          } finally {
            setIsCloudSyncing(false);
          }
        }}
        onPullCatalogFromCloud={async () => {
          if (!cloudUser) return;
          try {
            setIsCloudSyncing(true);
            setCloudError(null);
            await pullCatalogAndStockIfNeeded(cloudUser.uid, undefined, true);
            setLastSyncedAt(new Date().toISOString());
            setAppToast({
              text: '☁️ Catálogo y existencias actualizados desde la nube.',
            });
          } catch (err: unknown) {
            const error = err as Error;
            setCloudError(error.message || 'Error al descargar catálogo.');
          } finally {
            setIsCloudSyncing(false);
          }
        }}
      />

      {/* Floating App Toast Notification */}
      {appToast && (
        <div className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto animate-in slide-in-from-bottom-5">
          <div
            className={`p-3.5 rounded-2xl shadow-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
              appToast.isError
                ? 'bg-red-900 border-red-700 text-white'
                : 'bg-slate-900 border-slate-700 text-white'
            }`}
          >
            <span>{appToast.text}</span>
            <button
              onClick={() => setAppToast(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
