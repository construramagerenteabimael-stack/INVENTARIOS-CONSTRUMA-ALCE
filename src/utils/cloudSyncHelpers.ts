import {
  CaptureItem,
  InventoryHistorySession,
  ProductItem,
  ProductSummary,
  RecountItem,
  SystemStockItem,
  UnidentifiedItem,
  ZoneItem,
} from '../types/inventory';

export const CLOUD_CHUNK_SIZE = 1000;
export const MAX_PHOTO_BASE64_LEN = 440000;

/**
 * Normalizes any string into a valid Firestore document ID matching ^[a-zA-Z0-9_\-]+$ (max 128 chars).
 */
export function toSafeFirestoreId(raw: string, prefix = 'id'): string {
  const clean = String(raw || '').trim();
  if (/^[a-zA-Z0-9_\-]+$/.test(clean) && clean.length >= 1 && clean.length <= 128) {
    return clean;
  }

  // Encode arbitrary characters cleanly using deterministic hex/alphanumeric mapping
  let safeBody = '';
  for (let i = 0; i < clean.length && safeBody.length < 96; i++) {
    const ch = clean[i];
    if (/[a-zA-Z0-9_\-]/.test(ch)) {
      safeBody += ch;
    } else {
      safeBody += `_${ch.charCodeAt(0).toString(16)}`;
    }
  }

  // Append simple deterministic 32-bit FNV-1a hash to avoid collisions
  let hash = 2166136261;
  for (let i = 0; i < clean.length; i++) {
    hash ^= clean.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hashSuffix = (hash >>> 0).toString(36);
  const combined = `${prefix}_${safeBody || 'item'}_${hashSuffix}`;
  return combined.slice(0, 128);
}

export function toSafeRecountDocId(code: string): string {
  return toSafeFirestoreId(code, 'rec');
}

export function getWorkspaceIdForUser(uid: string): string {
  return toSafeFirestoreId(`ws_${uid}`, 'ws');
}

export function clampString(value: unknown, maxLen: number, fallback = ''): string {
  const str = typeof value === 'string' ? value : String(value ?? fallback);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

export function stripUndefinedFields<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export function truncatePhotoForCloud(photoBase64?: string): string | undefined {
  if (!photoBase64 || typeof photoBase64 !== 'string') return undefined;
  if (photoBase64.length > MAX_PHOTO_BASE64_LEN) {
    return undefined;
  }
  return photoBase64;
}

/**
 * Splits an array into chunks of up to `chunkSize` (default 1000) items.
 */
export function chunkArray<T>(items: T[], chunkSize = CLOUD_CHUNK_SIZE): T[][] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const size = Math.max(1, Math.min(chunkSize, CLOUD_CHUNK_SIZE));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function reassembleChunks<T>(
  chunks: Array<{ index: number; items: T[] }>
): T[] {
  if (!Array.isArray(chunks) || chunks.length === 0) return [];
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  const result: T[] = [];
  for (const ch of sorted) {
    if (Array.isArray(ch.items)) {
      for (const item of ch.items) {
        result.push(item);
      }
    }
  }
  return result;
}

export function sanitizeProductForChunk(p: ProductItem): ProductItem {
  return {
    code: clampString(p.code, 128).trim(),
    barcode: clampString(p.barcode || p.code, 128).trim(),
    description: clampString(p.description || 'Sin descripción', 300).trim(),
    unit: clampString(p.unit || 'pza', 40).trim(),
  };
}

export function sanitizeSystemStockForChunk(s: SystemStockItem): SystemStockItem {
  return stripUndefinedFields({
    code: clampString(s.code, 128).trim(),
    barcode: s.barcode ? clampString(s.barcode, 128).trim() : undefined,
    description: s.description ? clampString(s.description, 300).trim() : undefined,
    systemStock: Number.isFinite(Number(s.systemStock)) ? Number(s.systemStock) : 0,
    cost: Number.isFinite(Number(s.cost)) ? Number(s.cost) : 0,
    unit: clampString(s.unit || 'pza', 40).trim(),
    importedAt: clampString(s.importedAt || new Date().toISOString(), 64),
  }) as unknown as SystemStockItem;
}

export function prepareZonePayload(zone: ZoneItem, ownerId: string) {
  const safeId = toSafeFirestoreId(zone.id, 'zone');
  const rawType = zone.type;
  const validType =
    rawType === 'bodega' || rawType === 'autoservicio' || rawType === 'general'
      ? rawType
      : undefined;
  const validStatus =
    zone.status === 'pendiente' || zone.status === 'en_conteo' || zone.status === 'terminada'
      ? zone.status
      : 'pendiente';

  return stripUndefinedFields({
    id: safeId,
    ownerId,
    name: clampString(zone.name || 'Zona', 150).trim() || 'Zona',
    type: validType,
    status: validStatus,
    startTime: zone.startTime ? clampString(zone.startTime, 64) : undefined,
    endTime: zone.endTime ? clampString(zone.endTime, 64) : undefined,
    notes: zone.notes ? clampString(zone.notes, 500) : undefined,
  });
}

export function prepareCapturePayload(
  cap: CaptureItem,
  ownerId: string,
  deviceName?: string
) {
  const safeId = toSafeFirestoreId(cap.id, 'cap');
  return stripUndefinedFields({
    id: safeId,
    ownerId,
    zoneId: clampString(cap.zoneId || 'zone-default-1', 128).trim() || 'zone-default-1',
    zoneName: clampString(cap.zoneName || 'Zona General', 150).trim() || 'Zona General',
    code: clampString(cap.code, 128).trim() || 'SIN_CODIGO',
    barcode: cap.barcode && cap.barcode.trim() ? clampString(cap.barcode.trim(), 128) : undefined,
    description: clampString(cap.description || 'Producto', 300).trim() || 'Producto',
    unit: clampString(cap.unit || 'pza', 40).trim() || 'pza',
    quantity: Math.max(0, Number(cap.quantity) || 0),
    timestamp: clampString(cap.timestamp || new Date().toISOString(), 64).trim() || new Date().toISOString(),
    counterName: clampString(cap.counterName || 'Contador', 80).trim() || 'Contador',
    isRecount: typeof cap.isRecount === 'boolean' ? cap.isRecount : undefined,
    deviceName: deviceName ? clampString(deviceName, 80).trim() : undefined,
  });
}

export function prepareUnidentifiedPayload(item: UnidentifiedItem, ownerId: string) {
  const safeId = toSafeFirestoreId(item.id, 'unid');
  return stripUndefinedFields({
    id: safeId,
    ownerId,
    zoneId: clampString(item.zoneId || 'zone-default-1', 128).trim() || 'zone-default-1',
    zoneName: clampString(item.zoneName || 'Zona General', 150).trim() || 'Zona General',
    photoBase64: truncatePhotoForCloud(item.photoBase64),
    note: clampString(item.note || 'Artículo sin identificar', 500).trim() || 'Artículo sin identificar',
    quantity: Math.max(0, Number(item.quantity) || 0),
    unit: clampString(item.unit || 'pza', 40).trim() || 'pza',
    timestamp: clampString(item.timestamp || new Date().toISOString(), 64).trim() || new Date().toISOString(),
    counterName: clampString(item.counterName || 'Contador', 80).trim() || 'Contador',
    resolvedCode: item.resolvedCode && item.resolvedCode.trim() ? clampString(item.resolvedCode.trim(), 128) : undefined,
  });
}

export function prepareRecountPayload(recount: RecountItem, ownerId: string) {
  const safeId = toSafeRecountDocId(recount.code);
  return stripUndefinedFields({
    id: safeId,
    ownerId,
    code: clampString(recount.code, 128).trim(),
    markedAt: clampString(recount.markedAt || new Date().toISOString(), 64),
    reason: recount.reason ? clampString(recount.reason, 300) : undefined,
    resolved: typeof recount.resolved === 'boolean' ? recount.resolved : undefined,
  });
}

export function prepareHistorySessionMetadataPayload(
  session: InventoryHistorySession,
  ownerId: string,
  snapshotChunksCount: number
) {
  const safeId = toSafeFirestoreId(session.id, 'inv');
  return stripUndefinedFields({
    id: safeId,
    ownerId,
    name: clampString(session.name || 'Inventario', 200) || 'Inventario',
    createdAtIso: session.createdAt ? clampString(session.createdAt, 64) : undefined,
    closedAt: clampString(session.closedAt || new Date().toISOString(), 64),
    closedBy: clampString(session.closedBy || 'Auditor', 100) || 'Auditor',
    notes: session.notes ? clampString(session.notes, 1000) : undefined,
    totalCapturesCount: Number(session.totalCapturesCount) || 0,
    totalPiecesCounted: Number(session.totalPiecesCounted) || 0,
    totalCountedProducts: Number(session.totalCountedProducts) || 0,
    totalExactProducts: Number(session.totalExactProducts) || 0,
    totalFaltantesProducts: Number(session.totalFaltantesProducts) || 0,
    totalSobrantesProducts: Number(session.totalSobrantesProducts) || 0,
    totalFaltantesPieces: Number(session.totalFaltantesPieces) || 0,
    totalSobrantesPieces: Number(session.totalSobrantesPieces) || 0,
    totalFaltantesValue: Number(session.totalFaltantesValue) || 0,
    totalSobrantesValue: Number(session.totalSobrantesValue) || 0,
    netFinancialImpact: Number(session.netFinancialImpact) || 0,
    accuracyRatePct: Number(session.accuracyRatePct) || 0,
    snapshotChunksCount,
  });
}

/**
 * Extracts compact history chunks so even a 15,000-product session fits cleanly in Firestore docs.
 * For `summaries`, stores only rows where `countedStock > 0` or `isMarkedForRecount` if large,
 * or full summaries if compact, plus chunked `capturesSnapshot` and `systemStockSnapshot`.
 */
export function buildHistorySessionChunkPayloads(
  session: InventoryHistorySession,
  ownerId: string
): Array<{
  id: string;
  ownerId: string;
  sessionId: string;
  kind: 'captures' | 'summaries' | 'systemStock';
  index: number;
  items: Record<string, unknown>[];
}> {
  const safeSessionId = toSafeFirestoreId(session.id, 'inv');
  const result: Array<{
    id: string;
    ownerId: string;
    sessionId: string;
    kind: 'captures' | 'summaries' | 'systemStock';
    index: number;
    items: Record<string, unknown>[];
  }> = [];

  const captureChunks = chunkArray(
    (session.capturesSnapshot || []).map((c) => stripUndefinedFields({ ...c })),
    CLOUD_CHUNK_SIZE
  );
  captureChunks.forEach((items, index) => {
    result.push({
      id: toSafeFirestoreId(`${safeSessionId}_cap_${index}`, 'hchk'),
      ownerId,
      sessionId: safeSessionId,
      kind: 'captures',
      index,
      items,
    });
  });

  // Only persist non-zero counted or marked summaries to keep cloud storage compact & fast
  const relevantSummaries: ProductSummary[] = (session.summariesSnapshot || []).filter(
    (s) => s.countedStock > 0 || s.isMarkedForRecount
  );
  const summaryChunks = chunkArray(
    relevantSummaries.map((s) => stripUndefinedFields({ ...s })),
    CLOUD_CHUNK_SIZE
  );
  summaryChunks.forEach((items, index) => {
    result.push({
      id: toSafeFirestoreId(`${safeSessionId}_sum_${index}`, 'hchk'),
      ownerId,
      sessionId: safeSessionId,
      kind: 'summaries',
      index,
      items,
    });
  });

  // Persist frozen system stock for counted items (or full list if <= 2000)
  const rawStock = session.systemStockSnapshot || [];
  const countedCodeSet = new Set(relevantSummaries.map((s) => s.code));
  const stockToStore =
    rawStock.length <= 2000
      ? rawStock
      : rawStock.filter((st) => countedCodeSet.has(st.code));

  const stockChunks = chunkArray(
    stockToStore.map((st) => stripUndefinedFields({ ...st })),
    CLOUD_CHUNK_SIZE
  );
  stockChunks.forEach((items, index) => {
    result.push({
      id: toSafeFirestoreId(`${safeSessionId}_stk_${index}`, 'hchk'),
      ownerId,
      sessionId: safeSessionId,
      kind: 'systemStock',
      index,
      items,
    });
  });

  return result;
}

/**
 * Merges local offline records with cloud records without duplicating IDs.
 * Cloud items win on matching IDs; local-only items remain preserved until uploaded.
 */
export function mergeUniqueById<T extends { id: string }>(
  cloudItems: T[],
  localItems: T[]
): T[] {
  const byId = new Map<string, T>();
  for (const item of localItems) {
    if (item && item.id) byId.set(item.id, item);
  }
  for (const item of cloudItems) {
    if (item && item.id) byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

export function getShortDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo';
  const ua = navigator.userAgent || '';
  if (/Android/i.test(ua)) return 'Celular Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iPhone / iPad';
  if (/Windows/i.test(ua)) return 'PC Windows';
  if (/Macintosh|Mac OS/i.test(ua)) return 'Mac';
  if (/Linux/i.test(ua)) return 'PC Linux';
  return 'Navegador Web';
}
