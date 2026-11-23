import {
  CaptureItem,
  ProductItem,
  SystemStockItem,
  UnidentifiedItem,
  ZoneItem,
  CountingMode,
  InventoryHistorySession,
} from '../types/inventory';
import {
  computeCountedDifferencesMetrics,
  buildHistorySessionRecord,
} from './inventoryCalculations';

const DB_NAME = 'ConstruramaAlceInventoryDB';
const DB_VERSION = 5;

let dbInstance: IDBDatabase | null = null;

export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (db.objectStoreNames.contains('products')) {
        db.deleteObjectStore('products');
      }
      const prodStore = db.createObjectStore('products', { keyPath: '_storageId', autoIncrement: true });
      prodStore.createIndex('code', 'code', { unique: false });
      prodStore.createIndex('barcode', 'barcode', { unique: false });

      if (!db.objectStoreNames.contains('systemStock')) {
        db.createObjectStore('systemStock', { keyPath: 'code' });
      }

      if (!db.objectStoreNames.contains('zones')) {
        db.createObjectStore('zones', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('captures')) {
        const capStore = db.createObjectStore('captures', { keyPath: 'id' });
        capStore.createIndex('zoneId', 'zoneId', { unique: false });
        capStore.createIndex('code', 'code', { unique: false });
      }

      if (!db.objectStoreNames.contains('unidentified')) {
        db.createObjectStore('unidentified', { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains('recounts')) {
        db.createObjectStore('recounts', { keyPath: 'code' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// ---------------- PRODUCTS ----------------

export async function getAllProducts(): Promise<ProductItem[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as ProductItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearProductsOnly(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveProducts(products: ProductItem[], replaceAll = true): Promise<void> {
  const db = await getDB();

  if (replaceAll) {
    await clearProductsOnly();
  }

  // Batch insert in chunks of 500 to handle large catalogs smoothly
  const CHUNK_SIZE = 500;
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('products', 'readwrite');
      const store = tx.objectStore('products');

      for (const p of chunk) {
        store.put({
          code: String(p.code || '').trim(),
          barcode: String(p.barcode || p.code || '').trim(),
          description: String(p.description || '').trim(),
          unit: String(p.unit || 'pza').trim(),
        });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Error al guardar lote de productos'));
      tx.onabort = () => reject(tx.error || new Error('Transacción de productos abortada'));
    });
  }
}

export async function findProductByBarcodeOrCode(term: string): Promise<ProductItem | null> {
  const trimmed = term.trim();
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('products', 'readonly');
    const store = tx.objectStore('products');

    // Check barcode index
    const bcIndex = store.index('barcode');
    const bcReq = bcIndex.get(trimmed);

    bcReq.onsuccess = () => {
      if (bcReq.result) {
        resolve(bcReq.result as ProductItem);
      } else {
        // Check code index
        const codeIndex = store.index('code');
        const codeReq = codeIndex.get(trimmed);
        codeReq.onsuccess = () => {
          resolve((codeReq.result as ProductItem) || null);
        };
        codeReq.onerror = () => reject(codeReq.error);
      }
    };
    bcReq.onerror = () => reject(bcReq.error);
  });
}

// ---------------- SYSTEM STOCK ----------------

export async function getAllSystemStock(): Promise<SystemStockItem[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('systemStock', 'readonly');
    const store = tx.objectStore('systemStock');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as SystemStockItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function clearStockOnly(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('systemStock', 'readwrite');
    const store = tx.objectStore('systemStock');
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveSystemStock(items: SystemStockItem[], replaceAll = true): Promise<void> {
  const db = await getDB();

  if (replaceAll) {
    await clearStockOnly();
  }

  const CHUNK_SIZE = 500;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('systemStock', 'readwrite');
      const store = tx.objectStore('systemStock');

      for (const item of chunk) {
        store.put(item);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Error al guardar existencias'));
      tx.onabort = () => reject(tx.error || new Error('Transacción de existencias abortada'));
    });
  }
}

// ---------------- ZONES ----------------

export async function getAllZones(): Promise<ZoneItem[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('zones', 'readonly');
    const store = tx.objectStore('zones');
    const req = store.getAll();
    req.onsuccess = () => {
      const zones = req.result as ZoneItem[];
      resolve(zones);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveZone(zone: ZoneItem): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('zones', 'readwrite');
    const store = tx.objectStore('zones');
    store.put(zone);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteZone(zoneId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['zones', 'captures'], 'readwrite');
    tx.objectStore('zones').delete(zoneId);

    // Optionally keep or reassign captures; here we delete zone's captures
    const capStore = tx.objectStore('captures');
    const index = capStore.index('zoneId');
    const req = index.openCursor(IDBKeyRange.only(zoneId));

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result as IDBCursorWithValue;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- CAPTURES ----------------

export async function getAllCaptures(): Promise<CaptureItem[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readonly');
    const store = tx.objectStore('captures');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as CaptureItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function addCapture(capture: CaptureItem): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readwrite');
    const store = tx.objectStore('captures');
    store.put(capture);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const saveCapture = addCapture;

export async function updateCapture(capture: CaptureItem): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readwrite');
    const store = tx.objectStore('captures');
    store.put(capture);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCapture(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readwrite');
    const store = tx.objectStore('captures');
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteCapturesForProduct(code: string): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readwrite');
    const store = tx.objectStore('captures');
    const codeIndex = store.index('code');
    const req = codeIndex.getAllKeys(code);

    req.onsuccess = () => {
      const keys = req.result;
      for (const key of keys) {
        store.delete(key);
      }
    };

    tx.oncomplete = () => resolve(req.result ? req.result.length : 0);
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- UNIDENTIFIED ----------------

export async function getAllUnidentified(): Promise<UnidentifiedItem[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('unidentified', 'readonly');
    const store = tx.objectStore('unidentified');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as UnidentifiedItem[]);
    req.onerror = () => reject(req.error);
  });
}

export async function addUnidentified(item: UnidentifiedItem): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('unidentified', 'readwrite');
    const store = tx.objectStore('unidentified');
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateUnidentified(item: UnidentifiedItem): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('unidentified', 'readwrite');
    const store = tx.objectStore('unidentified');
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteUnidentified(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('unidentified', 'readwrite');
    const store = tx.objectStore('unidentified');
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- RECOUNTS ----------------

export async function getAllRecountCodes(): Promise<Set<string>> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recounts', 'readonly');
    const store = tx.objectStore('recounts');
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(new Set(req.result.map(String)));
    req.onerror = () => reject(req.error);
  });
}

export async function toggleRecountCode(code: string, isMarked: boolean): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recounts', 'readwrite');
    const store = tx.objectStore('recounts');
    if (isMarked) {
      store.put({ code, markedAt: new Date().toISOString() });
    } else {
      store.delete(code);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- SETTINGS & STATE ----------------

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const db = await getDB();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('settings', 'readonly');
      const store = tx.objectStore('settings');
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result !== undefined && req.result.value !== undefined) {
          resolve(req.result.value as T);
        } else {
          resolve(defaultValue);
        }
      };
      req.onerror = () => resolve(defaultValue);
    } catch {
      resolve(defaultValue);
    }
  });
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- CLEAR / RESET DATA ----------------

export async function clearAllInventoryCounts(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['captures', 'unidentified', 'recounts'], 'readwrite');
    tx.objectStore('captures').clear();
    tx.objectStore('unidentified').clear();
    tx.objectStore('recounts').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- INVENTORY SESSIONS / HISTORY ----------------

export async function getAllHistorySessions(): Promise<InventoryHistorySession[]> {
  return getSetting<InventoryHistorySession[]>('inventory_history_sessions', []);
}

export async function saveHistorySession(session: InventoryHistorySession): Promise<void> {
  const current = await getAllHistorySessions();
  const updated = [session, ...current.filter((s) => s.id !== session.id)];
  await saveSetting('inventory_history_sessions', updated);
}

export async function deleteHistorySession(sessionId: string): Promise<void> {
  const current = await getAllHistorySessions();
  const updated = current.filter((s) => s.id !== sessionId);
  await saveSetting('inventory_history_sessions', updated);
}

export async function clearAllHistorySessions(): Promise<void> {
  await saveSetting('inventory_history_sessions', []);
}

export async function replaceAllZonesLocal(zones: ZoneItem[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('zones', 'readwrite');
    const store = tx.objectStore('zones');
    store.clear();
    for (const z of zones) store.put(z);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceAllCapturesLocal(captures: CaptureItem[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readwrite');
    const store = tx.objectStore('captures');
    store.clear();
    for (const c of captures) store.put(c);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceAllUnidentifiedLocal(items: UnidentifiedItem[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('unidentified', 'readwrite');
    const store = tx.objectStore('unidentified');
    store.clear();
    for (const item of items) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceAllRecountsLocal(codes: Set<string>): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('recounts', 'readwrite');
    const store = tx.objectStore('recounts');
    store.clear();
    const now = new Date().toISOString();
    for (const code of codes) store.put({ code, markedAt: now });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function replaceAllHistorySessionsLocal(
  sessions: InventoryHistorySession[]
): Promise<void> {
  await saveSetting('inventory_history_sessions', sessions);
}

export async function clearEditingSessionFlags(): Promise<void> {
  await saveSetting('editingSessionId', null);
  await saveSetting('editingSessionName', null);
  await saveSetting('editingSessionDate', null);
  await saveSetting('editingSessionSystemStock', null);
}

/**
 * Archives current inventory count to history and resets captures, unidentified & recounts.
 * Leaves catalog (products), system stock and zones intact for the new count.
 */
export async function archiveCurrentCountAndReset(
  sessionName: string,
  counterName: string,
  captures: CaptureItem[],
  summaries: any[],
  systemStock: SystemStockItem[],
  notes?: string
): Promise<InventoryHistorySession> {
  const currentEditingId = await getSetting<string | null>('editingSessionId', null);

  const session = buildHistorySessionRecord({
    sessionName,
    counterName,
    captures,
    summaries,
    systemStock,
    notes,
    customId: currentEditingId || undefined,
  });

  // 1. Save to History Archive (updates if customId matches, or prepends new)
  await saveHistorySession(session);

  // 2. Clear editing session flags
  await clearEditingSessionFlags();

  // 3. Clear active counts
  await clearAllInventoryCounts();

  return session;
}

/**
 * Restores a historical session back to active status (re-populating captures).
 * Automatically backs up any live captures in progress to history so no data is ever lost.
 * Retains the session in history so it remains accessible.
 */
export async function restoreHistorySession(
  session: InventoryHistorySession,
  activeContext?: {
    currentCaptures?: CaptureItem[];
    currentSummaries?: any[];
    currentSystemStock?: SystemStockItem[];
    counterName?: string;
  }
): Promise<{ draftSavedName?: string }> {
  // 1. SAFETY AUTO-BACKUP: Check if user has active captures in progress before clearing
  const liveCaps = activeContext?.currentCaptures || (await getAllCaptures());
  const currentEditingId = await getSetting<string | null>('editingSessionId', null);
  const currentEditingName = await getSetting<string | null>('editingSessionName', null);

  let draftSavedName: string | undefined = undefined;

  if (liveCaps.length > 0 && currentEditingId !== session.id) {
    if (currentEditingId && currentEditingName) {
      // User was re-counting another session. Save its latest changes before switching!
      const allSessions = await getAllHistorySessions();
      const existing = allSessions.find((s) => s.id === currentEditingId);
      const updated = buildHistorySessionRecord({
        sessionName: currentEditingName,
        counterName: activeContext?.counterName || existing?.closedBy || 'Auditor',
        captures: liveCaps,
        summaries: activeContext?.currentSummaries || existing?.summariesSnapshot || [],
        systemStock: activeContext?.currentSystemStock || existing?.systemStockSnapshot || [],
        notes: existing?.notes || 'Actualización de reconteo',
        customId: currentEditingId,
      });
      await saveHistorySession(updated);
      draftSavedName = currentEditingName;
    } else {
      // User was doing a new / live count! Auto-archive it as a safety draft in history so ZERO PIECES ARE EVER LOST!
      const draftDate = new Date();
      const draftName = `Borrador en Curso (${draftDate.toLocaleDateString('es-MX')} ${draftDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })})`;
      const draftSession = buildHistorySessionRecord({
        sessionName: draftName,
        counterName: activeContext?.counterName || 'Auditor',
        captures: liveCaps,
        summaries: activeContext?.currentSummaries || [],
        systemStock: activeContext?.currentSystemStock || [],
        notes: `Respaldo automático de seguridad antes de abrir "${session.name}"`,
      });
      await saveHistorySession(draftSession);
      await saveSetting('last_safety_draft_session_id', draftSession.id);
      draftSavedName = draftName;
    }
  }

  // 2. Clear current active counts table for clean loading
  await clearAllInventoryCounts();

  // 3. Mark the active editing session (Do NOT delete session from history!)
  await saveSetting('editingSessionId', session.id);
  await saveSetting('editingSessionName', session.name);
  await saveSetting('editingSessionDate', session.closedAt || session.createdAt || null);

  // 4. Extract frozen system stock snapshot from the session
  const stockSnapshot: SystemStockItem[] =
    Array.isArray(session.systemStockSnapshot) && session.systemStockSnapshot.length > 0
      ? session.systemStockSnapshot
      : Array.isArray(session.summariesSnapshot)
      ? session.summariesSnapshot.map((s) => ({
          code: s.code,
          barcode: s.barcode,
          description: s.description,
          systemStock: s.systemStock,
          cost: s.cost || 0,
          unit: s.unit || 'PZA',
          importedAt: session.closedAt || session.createdAt || new Date().toISOString(),
        }))
      : [];

  await saveSetting('editingSessionSystemStock', stockSnapshot);

  // 5. Populate captures
  const db = await getDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction('captures', 'readwrite');
      const store = tx.objectStore('captures');
      const rawList = Array.isArray(session.capturesSnapshot) ? session.capturesSnapshot : [];
      if (rawList.length > 0) {
        for (let i = 0; i < rawList.length; i++) {
          const item = rawList[i];
          if (item) {
            const cap = { ...item };
            if (!cap.id) {
              cap.id = `cap_restored_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
            }
            store.put(cap);
          }
        }
      } else if (Array.isArray(session.summariesSnapshot)) {
        for (let i = 0; i < session.summariesSnapshot.length; i++) {
          const s = session.summariesSnapshot[i];
          if (s && s.countedStock > 0) {
            store.put({
              id: `cap_synth_${Date.now()}_${i}`,
              code: s.code,
              description: s.description,
              quantity: s.countedStock,
              scannedAt: session.closedAt || new Date().toISOString(),
              zoneId: 'zone-default-1',
              zoneName: 'Área General',
              counterName: session.closedBy || 'Auditor',
            });
          }
        }
      }
      tx.oncomplete = () => resolve({ draftSavedName });
      tx.onerror = () => reject(tx.error);
    } catch (err) {
      reject(err);
    }
  });
}


export async function resetCompleteDatabase(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ['products', 'systemStock', 'zones', 'captures', 'unidentified', 'settings', 'recounts'],
      'readwrite'
    );
    tx.objectStore('products').clear();
    tx.objectStore('systemStock').clear();
    tx.objectStore('zones').clear();
    tx.objectStore('captures').clear();
    tx.objectStore('unidentified').clear();
    tx.objectStore('settings').clear();
    tx.objectStore('recounts').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------- DEMO SEED DATA ----------------

export async function seedDemoData(): Promise<{
  productsCount: number;
  stockCount: number;
  zonesCount: number;
}> {
  const demoProducts: ProductItem[] = [
    { code: '00101', barcode: '7501000101010', description: 'Martillo de uña curva 16 oz mango fibra Truper', unit: 'pza' },
    { code: '00102', barcode: '7501000101027', description: 'Cincel de corte frío 3/4 pulg x 8 pulg Urrea', unit: 'pza' },
    { code: '00103', barcode: '7501000101034', description: 'Flexómetro 5 metros cinta ancha Grip Truper', unit: 'pza' },
    { code: '00104', barcode: '7501000101041', description: 'Pinza de chofer 8 pulgadas mango vinil Pretul', unit: 'pza' },
    { code: '00105', barcode: '7501000101058', description: 'Juego de desarmadores 6 piezas mango comfort Truper', unit: 'jgo' },
    { code: '00201', barcode: '7502000202011', description: 'Cemento Gris Tolteca 50 kg uso general', unit: 'bulto' },
    { code: '00202', barcode: '7502000202028', description: 'Mortero Óptimo gris 50 kg Construrama', unit: 'bulto' },
    { code: '00203', barcode: '7502000202035', description: 'Calhidra Calidra bolsa 25 kg para albañilería', unit: 'bulto' },
    { code: '00204', barcode: '7502000202042', description: 'Yeso construcción bolsa 20 kg San Luis', unit: 'bulto' },
    { code: '00301', barcode: '7503000303012', description: 'Varilla corrugada 3/8 pulgada grado 42 tramo 12m', unit: 'tramo' },
    { code: '00302', barcode: '7503000303029', description: 'Alambrón 1/4 pulgada para estribos rollo', unit: 'kg' },
    { code: '00303', barcode: '7503000303036', description: 'Alambre recocido calibre 16 rollo suave', unit: 'kg' },
    { code: '00304', barcode: '7503000303043', description: 'Clavo estándar con cabeza 2 1/2 pulg bolsa 1 kg', unit: 'kg' },
    { code: '00305', barcode: '7503000303050', description: 'Clavo para concreto negro 2 pulgadas caja 100', unit: 'caja' },
    { code: '00401', barcode: '7504000404013', description: 'Tubo PVC hidráulico 1/2 pulgada tramo 6m presión', unit: 'tramo' },
    { code: '00402', barcode: '7504000404020', description: 'Codo PVC hidráulico 90 grados 1/2 pulg liso', unit: 'pza' },
    { code: '00403', barcode: '7504000404037', description: 'Tee PVC hidráulica 1/2 pulgada campana', unit: 'pza' },
    { code: '00404', barcode: '7504000404044', description: 'Pegamento para PVC bote 125 ml con aplicador', unit: 'bote' },
    { code: '00405', barcode: '7504000404051', description: 'Cinta teflón selladora 3/4 pulg x 10m blanca', unit: 'pza' },
    { code: '00501', barcode: '7505000505014', description: 'Cable eléctrico antiflama calibre 12 AWG rojo Iusa', unit: 'metro' },
    { code: '00502', barcode: '7505000505021', description: 'Cable eléctrico antiflama calibre 12 AWG negro Iusa', unit: 'metro' },
    { code: '00503', barcode: '7505000505038', description: 'Cinta de aislar vinil 18 metros negra Temflex 3M', unit: 'pza' },
    { code: '00504', barcode: '7505000505045', description: 'Caja chalupa galvanizada 1/2 pulgada eléctrica', unit: 'pza' },
    { code: '00505', barcode: '7505000505052', description: 'Contacto duplex polarizado marfil Leviton', unit: 'pza' },
    { code: '00601', barcode: '7506000606015', description: 'Cerradura de pomo entrada principal latón Phillips', unit: 'pza' },
    { code: '00602', barcode: '7506000606022', description: 'Candado de latón sólido 40 mm arco standard Hermex', unit: 'pza' },
    { code: '00603', barcode: '7506000606039', description: 'Broca para concreto 1/4 pulg zanco recto Truper', unit: 'pza' },
    { code: '00604', barcode: '7506000606046', description: 'Disco de corte para metal 4 1/2 pulg x 1 mm Austromex', unit: 'pza' },
  ];

  const now = new Date().toISOString();
  const demoStock: SystemStockItem[] = [
    { code: '00101', systemStock: 12, cost: 215.0, unit: 'pza', importedAt: now },
    { code: '00102', systemStock: 8, cost: 95.5, unit: 'pza', importedAt: now },
    { code: '00103', systemStock: 25, cost: 89.0, unit: 'pza', importedAt: now },
    { code: '00104', systemStock: 15, cost: 65.0, unit: 'pza', importedAt: now },
    { code: '00105', systemStock: 10, cost: 145.0, unit: 'jgo', importedAt: now },
    { code: '00201', systemStock: 120, cost: 235.0, unit: 'bulto', importedAt: now },
    { code: '00202', systemStock: 80, cost: 195.0, unit: 'bulto', importedAt: now },
    { code: '00203', systemStock: 50, cost: 85.0, unit: 'bulto', importedAt: now },
    { code: '00204', systemStock: 40, cost: 90.0, unit: 'bulto', importedAt: now },
    { code: '00301', systemStock: 60, cost: 185.0, unit: 'tramo', importedAt: now },
    { code: '00302', systemStock: 150, cost: 28.5, unit: 'kg', importedAt: now },
    { code: '00303', systemStock: 100, cost: 32.0, unit: 'kg', importedAt: now },
    { code: '00304', systemStock: 75, cost: 42.0, unit: 'kg', importedAt: now },
    { code: '00305', systemStock: 30, cost: 48.0, unit: 'caja', importedAt: now },
    { code: '00401', systemStock: 45, cost: 72.0, unit: 'tramo', importedAt: now },
    { code: '00402', systemStock: 120, cost: 8.5, unit: 'pza', importedAt: now },
    { code: '00403', systemStock: 80, cost: 12.0, unit: 'pza', importedAt: now },
    { code: '00404', systemStock: 25, cost: 45.0, unit: 'bote', importedAt: now },
    { code: '00405', systemStock: 90, cost: 14.0, unit: 'pza', importedAt: now },
    { code: '00501', systemStock: 200, cost: 11.5, unit: 'metro', importedAt: now },
    { code: '00502', systemStock: 200, cost: 11.5, unit: 'metro', importedAt: now },
    { code: '00503', systemStock: 40, cost: 22.0, unit: 'pza', importedAt: now },
    { code: '00504', systemStock: 60, cost: 16.0, unit: 'pza', importedAt: now },
    { code: '00505', systemStock: 50, cost: 38.0, unit: 'pza', importedAt: now },
    { code: '00601', systemStock: 14, cost: 380.0, unit: 'pza', importedAt: now },
    { code: '00602', systemStock: 20, cost: 125.0, unit: 'pza', importedAt: now },
    { code: '00603', systemStock: 35, cost: 45.0, unit: 'pza', importedAt: now },
    { code: '00604', systemStock: 100, cost: 24.0, unit: 'pza', importedAt: now },
  ];

  const demoZones: ZoneItem[] = [
    { id: 'zone-1', name: 'Pasillo 1 - Herramienta Manual', status: 'en_conteo', startTime: now },
    { id: 'zone-2', name: 'Patio de Materiales y Aceros', status: 'pendiente' },
    { id: 'zone-3', name: 'Anaquel Plomería y Eléctrico', status: 'pendiente' },
    { id: 'zone-4', name: 'Mostrador y Mostrario', status: 'terminada', startTime: now, endTime: now },
  ];

  await saveProducts(demoProducts, true);
  await saveSystemStock(demoStock, true);

  for (const z of demoZones) {
    await saveZone(z);
  }

  // Pre-seed a few captures so progress bars and semaphores display immediately!
  const demoCaptures: CaptureItem[] = [
    {
      id: 'cap-seed-1',
      zoneId: 'zone-1',
      zoneName: 'Pasillo 1 - Herramienta Manual',
      code: '00101',
      barcode: '7501000101010',
      description: 'Martillo de uña curva 16 oz mango fibra Truper',
      unit: 'pza',
      quantity: 12, // Exact match (completo)
      timestamp: now,
      counterName: 'Ing Abimael',
    },
    {
      id: 'cap-seed-2',
      zoneId: 'zone-1',
      zoneName: 'Pasillo 1 - Herramienta Manual',
      code: '00102',
      barcode: '7501000101027',
      description: 'Cincel de corte frío 3/4 pulg x 8 pulg Urrea',
      unit: 'pza',
      quantity: 5, // Faltan 3 (faltante)
      timestamp: now,
      counterName: 'Ing Abimael',
    },
    {
      id: 'cap-seed-3',
      zoneId: 'zone-1',
      zoneName: 'Pasillo 1 - Herramienta Manual',
      code: '00103',
      barcode: '7501000101034',
      description: 'Flexómetro 5 metros cinta ancha Grip Truper',
      unit: 'pza',
      quantity: 30, // Excede el sistema (excedente)
      timestamp: now,
      counterName: 'Ing Abimael',
    },
  ];

  for (const cap of demoCaptures) {
    await addCapture(cap);
  }

  await saveSetting('activeZoneId', 'zone-1');
  await saveSetting('counterName', 'Ing Abimael');
  await saveSetting('countingMode', 'guiado');

  return {
    productsCount: demoProducts.length,
    stockCount: demoStock.length,
    zonesCount: demoZones.length,
  };
}
