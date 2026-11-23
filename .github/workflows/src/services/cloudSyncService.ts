import {
  User,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  Unsubscribe,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import {
  CaptureItem,
  InventoryHistorySession,
  ProductItem,
  ProductSummary,
  SystemStockItem,
  UnidentifiedItem,
  ZoneItem,
} from '../types/inventory';
import {
  buildHistorySessionChunkPayloads,
  chunkArray,
  CLOUD_CHUNK_SIZE,
  getShortDeviceLabel,
  getWorkspaceIdForUser,
  prepareCapturePayload,
  prepareHistorySessionMetadataPayload,
  prepareRecountPayload,
  prepareUnidentifiedPayload,
  prepareZonePayload,
  reassembleChunks,
  sanitizeProductForChunk,
  sanitizeSystemStockForChunk,
  toSafeFirestoreId,
  toSafeRecountDocId,
} from '../utils/cloudSyncHelpers';

export interface WorkspaceMetadata {
  id: string;
  ownerId: string;
  name: string;
  activeZoneId?: string;
  catalogVersion?: string;
  stockVersion?: string;
  catalogCount?: number;
  stockCount?: number;
}

export interface WorkspaceSnapshotCallbacks {
  onWorkspaceMeta: (meta: WorkspaceMetadata) => void;
  onZones: (zones: ZoneItem[]) => void;
  onCaptures: (captures: CaptureItem[]) => void;
  onUnidentified: (items: UnidentifiedItem[]) => void;
  onRecounts: (codes: Set<string>) => void;
  onHistorySessions: (sessions: InventoryHistorySession[]) => void;
  onSyncError?: (err: Error) => void;
}

export function subscribeToAuth(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFromCloud(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserWorkspaceAndProfile(
  user: User,
  counterName?: string
): Promise<WorkspaceMetadata> {
  const uid = user.uid;
  const workspaceId = getWorkspaceIdForUser(uid);
  const profilePath = `users/${uid}/private/profile`;
  const profileRef = doc(db, 'users', uid, 'private', 'profile');

  try {
    const profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        uid,
        email: (user.email || 'usuario@construrama.local').slice(0, 256),
        displayName: (user.displayName || 'Contador Alce').slice(0, 120),
        counterName: (counterName || user.displayName || 'Contador').slice(0, 80),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (counterName) {
      await updateDoc(profileRef, {
        displayName: (user.displayName || 'Contador Alce').slice(0, 120),
        counterName: counterName.slice(0, 80),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, profilePath);
  }

  const wsPath = `workspaces/${workspaceId}`;
  const wsRef = doc(db, 'workspaces', workspaceId);
  let wsSnap;
  try {
    wsSnap = await getDoc(wsRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, wsPath);
  }

  try {
    if (!wsSnap.exists()) {
      const payload = {
        id: workspaceId,
        ownerId: uid,
        name: 'Inventario Construrama Alce',
        catalogCount: 0,
        stockCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(wsRef, payload);
      return {
        id: workspaceId,
        ownerId: uid,
        name: 'Inventario Construrama Alce',
        catalogCount: 0,
        stockCount: 0,
      };
    }
    return wsSnap.data() as WorkspaceMetadata;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, wsPath);
  }
}

export async function updateWorkspaceActiveZone(
  uid: string,
  activeZoneId: string
): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const wsPath = `workspaces/${workspaceId}`;
  try {
    await updateDoc(doc(db, 'workspaces', workspaceId), {
      activeZoneId: activeZoneId.slice(0, 128),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, wsPath);
  }
}

// ==================== REAL-TIME LISTENERS ====================

export function subscribeToWorkspaceCollections(
  uid: string,
  callbacks: WorkspaceSnapshotCallbacks
): () => void {
  const workspaceId = getWorkspaceIdForUser(uid);
  const unsubs: Unsubscribe[] = [];

  // Cache for session snapshot chunks to avoid re-reading unchanged closed batches
  const sessionChunksCache = new Map<
    string,
    {
      capturesSnapshot: CaptureItem[];
      summariesSnapshot: ProductSummary[];
      systemStockSnapshot: SystemStockItem[];
    }
  >();

  // 1. Workspace document
  const wsPath = `workspaces/${workspaceId}`;
  unsubs.push(
    onSnapshot(
      doc(db, 'workspaces', workspaceId),
      (snap) => {
        if (snap.exists()) {
          callbacks.onWorkspaceMeta(snap.data() as WorkspaceMetadata);
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, wsPath);
        } catch (err) {
          callbacks.onSyncError?.(err as Error);
        }
      }
    )
  );

  // 2. Zones
  const zonesPath = `workspaces/${workspaceId}/zones`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'workspaces', workspaceId, 'zones'), where('ownerId', '==', uid)),
      (snap) => {
        const zones: ZoneItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            name: String(data.name || 'Zona'),
            type: data.type,
            status: data.status || 'pendiente',
            startTime: data.startTime,
            endTime: data.endTime,
            notes: data.notes,
          };
        });
        callbacks.onZones(zones);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, zonesPath);
        } catch (err) {
          callbacks.onSyncError?.(err as Error);
        }
      }
    )
  );

  // 3. Captures (real-time count updates between mobile & desktop)
  const capturesPath = `workspaces/${workspaceId}/captures`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'workspaces', workspaceId, 'captures'), where('ownerId', '==', uid)),
      (snap) => {
        const caps: CaptureItem[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: String(data.id || d.id),
              zoneId: String(data.zoneId || ''),
              zoneName: String(data.zoneName || ''),
              code: String(data.code || ''),
              barcode: String(data.barcode || data.code || ''),
              description: String(data.description || ''),
              unit: String(data.unit || 'pza'),
              quantity: Number(data.quantity) || 0,
              timestamp: String(data.timestamp || new Date().toISOString()),
              counterName: String(data.counterName || 'Contador'),
              isRecount: Boolean(data.isRecount),
            };
          })
          .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        callbacks.onCaptures(caps);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, capturesPath);
        } catch (err) {
          callbacks.onSyncError?.(err as Error);
        }
      }
    )
  );

  // 4. Unidentified items
  const unidPath = `workspaces/${workspaceId}/unidentified`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'workspaces', workspaceId, 'unidentified'), where('ownerId', '==', uid)),
      (snap) => {
        const items: UnidentifiedItem[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            zoneId: String(data.zoneId || ''),
            zoneName: String(data.zoneName || ''),
            photoBase64: data.photoBase64,
            note: String(data.note || ''),
            quantity: Number(data.quantity) || 0,
            unit: String(data.unit || 'pza'),
            timestamp: String(data.timestamp || ''),
            counterName: String(data.counterName || ''),
            resolvedCode: data.resolvedCode,
          };
        });
        callbacks.onUnidentified(items);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, unidPath);
        } catch (err) {
          callbacks.onSyncError?.(err as Error);
        }
      }
    )
  );

  // 5. Recounts
  const recountsPath = `workspaces/${workspaceId}/recounts`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'workspaces', workspaceId, 'recounts'), where('ownerId', '==', uid)),
      (snap) => {
        const codes = new Set<string>();
        for (const d of snap.docs) {
          const data = d.data();
          if (data.code) codes.add(String(data.code));
        }
        callbacks.onRecounts(codes);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, recountsPath);
        } catch (err) {
          callbacks.onSyncError?.(err as Error);
        }
      }
    )
  );

  // 6. History sessions (hydrating chunked snapshots as needed)
  const histPath = `workspaces/${workspaceId}/historySessions`;
  unsubs.push(
    onSnapshot(
      query(collection(db, 'workspaces', workspaceId, 'historySessions'), where('ownerId', '==', uid)),
      async (snap) => {
        try {
          const hydrated: InventoryHistorySession[] = [];
          for (const d of snap.docs) {
            const data = d.data();
            const sessionId = String(data.id || d.id);
            const cacheKey = `${sessionId}_${data.snapshotChunksCount || 0}_${data.totalCapturesCount || 0}`;
            let snapshots = sessionChunksCache.get(cacheKey);
            if (!snapshots) {
              snapshots = await fetchCloudHistorySessionChunks(uid, sessionId);
              sessionChunksCache.set(cacheKey, snapshots);
            }

            hydrated.push({
              id: sessionId,
              name: String(data.name || 'Inventario'),
              createdAt: String(data.createdAtIso || data.closedAt || ''),
              closedAt: String(data.closedAt || ''),
              closedBy: String(data.closedBy || 'Auditor'),
              notes: data.notes ? String(data.notes) : '',
              totalCapturesCount: Number(data.totalCapturesCount) || 0,
              totalPiecesCounted: Number(data.totalPiecesCounted) || 0,
              totalCountedProducts: Number(data.totalCountedProducts) || 0,
              totalExactProducts: Number(data.totalExactProducts) || 0,
              totalFaltantesProducts: Number(data.totalFaltantesProducts) || 0,
              totalSobrantesProducts: Number(data.totalSobrantesProducts) || 0,
              totalFaltantesPieces: Number(data.totalFaltantesPieces) || 0,
              totalSobrantesPieces: Number(data.totalSobrantesPieces) || 0,
              totalFaltantesValue: Number(data.totalFaltantesValue) || 0,
              totalSobrantesValue: Number(data.totalSobrantesValue) || 0,
              netFinancialImpact: Number(data.netFinancialImpact) || 0,
              accuracyRatePct: Number(data.accuracyRatePct) || 0,
              capturesSnapshot: snapshots.capturesSnapshot,
              summariesSnapshot: snapshots.summariesSnapshot,
              systemStockSnapshot: snapshots.systemStockSnapshot,
            });
          }

          hydrated.sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
          callbacks.onHistorySessions(hydrated);
        } catch (err) {
          callbacks.onSyncError?.(err as Error);
        }
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, histPath);
        } catch (err) {
          callbacks.onSyncError?.(err as Error);
        }
      }
    )
  );

  return () => {
    for (const u of unsubs) {
      try {
        u();
      } catch {}
    }
  };
}

// ==================== CRUD OPERATIONS ====================

export async function upsertCloudZone(uid: string, zone: ZoneItem): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const payload = prepareZonePayload(zone, uid);
  const docId = String(payload.id);
  const path = `workspaces/${workspaceId}/zones/${docId}`;
  const ref = doc(db, 'workspaces', workspaceId, 'zones', docId);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        name: payload.name,
        ...(payload.type !== undefined ? { type: payload.type } : {}),
        status: payload.status,
        ...(payload.startTime !== undefined ? { startTime: payload.startTime } : {}),
        ...(payload.endTime !== undefined ? { endTime: payload.endTime } : {}),
        ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudZone(uid: string, zoneId: string): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const safeId = toSafeFirestoreId(zoneId, 'zone');
  const path = `workspaces/${workspaceId}/zones/${safeId}`;
  try {
    await deleteDoc(doc(db, 'workspaces', workspaceId, 'zones', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertCloudCapture(uid: string, capture: CaptureItem): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const payload = prepareCapturePayload(capture, uid, getShortDeviceLabel());
  const docId = String(payload.id);
  const path = `workspaces/${workspaceId}/captures/${docId}`;
  const ref = doc(db, 'workspaces', workspaceId, 'captures', docId);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        quantity: payload.quantity,
        zoneId: payload.zoneId,
        zoneName: payload.zoneName,
        ...(payload.isRecount !== undefined ? { isRecount: payload.isRecount } : {}),
        counterName: payload.counterName,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudCapture(uid: string, captureId: string): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const safeId = toSafeFirestoreId(captureId, 'cap');
  const path = `workspaces/${workspaceId}/captures/${safeId}`;
  try {
    await deleteDoc(doc(db, 'workspaces', workspaceId, 'captures', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function deleteCloudCapturesForProduct(uid: string, code: string): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const path = `workspaces/${workspaceId}/captures`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'workspaces', workspaceId, 'captures'),
        where('ownerId', '==', uid),
        where('code', '==', code)
      )
    );
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + 400)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearCloudActiveCapturesAndRecounts(uid: string): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const capPath = `workspaces/${workspaceId}/captures`;
  try {
    const [capSnap, recSnap] = await Promise.all([
      getDocs(query(collection(db, 'workspaces', workspaceId, 'captures'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'workspaces', workspaceId, 'recounts'), where('ownerId', '==', uid))),
    ]);
    const allRefs = [...capSnap.docs.map((d) => d.ref), ...recSnap.docs.map((d) => d.ref)];
    for (let i = 0; i < allRefs.length; i += 400) {
      const batch = writeBatch(db);
      for (const ref of allRefs.slice(i, i + 400)) {
        batch.delete(ref);
      }
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, capPath);
  }
}

export async function upsertCloudUnidentified(
  uid: string,
  item: UnidentifiedItem
): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const payload = prepareUnidentifiedPayload(item, uid);
  const docId = String(payload.id);
  const path = `workspaces/${workspaceId}/unidentified/${docId}`;
  const ref = doc(db, 'workspaces', workspaceId, 'unidentified', docId);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        note: payload.note,
        quantity: payload.quantity,
        ...(payload.resolvedCode !== undefined ? { resolvedCode: payload.resolvedCode } : {}),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCloudUnidentified(uid: string, itemId: string): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const safeId = toSafeFirestoreId(itemId, 'unid');
  const path = `workspaces/${workspaceId}/unidentified/${safeId}`;
  try {
    await deleteDoc(doc(db, 'workspaces', workspaceId, 'unidentified', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function toggleCloudRecountCode(
  uid: string,
  code: string,
  isMarked: boolean
): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const safeId = toSafeRecountDocId(code);
  const path = `workspaces/${workspaceId}/recounts/${safeId}`;
  const ref = doc(db, 'workspaces', workspaceId, 'recounts', safeId);
  try {
    if (!isMarked) {
      await deleteDoc(ref);
    } else {
      const payload = prepareRecountPayload(
        { code, markedAt: new Date().toISOString(), resolved: false },
        uid
      );
      const existing = await getDoc(ref);
      if (existing.exists()) {
        await updateDoc(ref, {
          markedAt: payload.markedAt,
          resolved: false,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// ==================== CHUNKED CATALOG & SYSTEM STOCK SYNC ====================

export async function uploadCloudCatalogChunks(
  uid: string,
  kind: 'products' | 'systemStock',
  items: ProductItem[] | SystemStockItem[]
): Promise<string> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const version = `v_${Date.now()}`;
  const path = `workspaces/${workspaceId}/catalogChunks`;

  try {
    // Delete previous chunks of this kind
    const prevSnap = await getDocs(
      query(
        collection(db, 'workspaces', workspaceId, 'catalogChunks'),
        where('ownerId', '==', uid),
        where('kind', '==', kind)
      )
    );
    if (prevSnap.docs.length > 0) {
      for (let i = 0; i < prevSnap.docs.length; i += 400) {
        const delBatch = writeBatch(db);
        for (const d of prevSnap.docs.slice(i, i + 400)) {
          delBatch.delete(d.ref);
        }
        await delBatch.commit();
      }
    }

    const sanitizedItems: Array<ProductItem | SystemStockItem> =
      kind === 'products'
        ? (items as ProductItem[]).map(sanitizeProductForChunk)
        : (items as SystemStockItem[]).map(sanitizeSystemStockForChunk);

    const chunkGroups = chunkArray<ProductItem | SystemStockItem>(sanitizedItems, CLOUD_CHUNK_SIZE);
    const totalChunks = Math.max(1, chunkGroups.length);

    const docsToWrite =
      chunkGroups.length === 0
        ? [
            {
              id: toSafeFirestoreId(`${kind}_0`, 'cat'),
              index: 0,
              items: [],
            },
          ]
        : chunkGroups.map((chunkItems, index) => ({
            id: toSafeFirestoreId(`${kind}_${index}`, 'cat'),
            index,
            items: chunkItems,
          }));

    for (let i = 0; i < docsToWrite.length; i += 5) {
      const batch = writeBatch(db);
      for (const ch of docsToWrite.slice(i, i + 5)) {
        const ref = doc(db, 'workspaces', workspaceId, 'catalogChunks', ch.id);
        batch.set(ref, {
          id: ch.id,
          ownerId: uid,
          kind,
          version,
          index: ch.index,
          totalChunks,
          items: ch.items,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    // Update workspace metadata version so other devices auto-pull the new catalog/stock
    const wsRef = doc(db, 'workspaces', workspaceId);
    if (kind === 'products') {
      await updateDoc(wsRef, {
        catalogVersion: version,
        catalogCount: sanitizedItems.length,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(wsRef, {
        stockVersion: version,
        stockCount: sanitizedItems.length,
        updatedAt: serverTimestamp(),
      });
    }

    return version;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchCloudCatalogChunks<T>(
  uid: string,
  kind: 'products' | 'systemStock'
): Promise<{ items: T[]; version?: string }> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const path = `workspaces/${workspaceId}/catalogChunks`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'workspaces', workspaceId, 'catalogChunks'),
        where('ownerId', '==', uid),
        where('kind', '==', kind)
      )
    );
    if (snap.empty) {
      return { items: [] };
    }
    const rawChunks = snap.docs.map((d) => {
      const data = d.data();
      return {
        index: Number(data.index) || 0,
        items: (Array.isArray(data.items) ? data.items : []) as T[],
        version: data.version ? String(data.version) : undefined,
      };
    });
    const version = rawChunks[0]?.version;
    return {
      items: reassembleChunks(rawChunks),
      version,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ==================== HISTORY SESSIONS ====================

export async function uploadCloudHistorySession(
  uid: string,
  session: InventoryHistorySession
): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const safeSessionId = toSafeFirestoreId(session.id, 'inv');
  const sessionPath = `workspaces/${workspaceId}/historySessions/${safeSessionId}`;
  try {
    const chunks = buildHistorySessionChunkPayloads(session, uid);
    const metaPayload = prepareHistorySessionMetadataPayload(
      session,
      uid,
      chunks.length
    );

    // Delete any existing chunks for this session first so re-uploads perform clean creates
    const oldChunksSnap = await getDocs(
      query(
        collection(db, 'workspaces', workspaceId, 'historySessionChunks'),
        where('ownerId', '==', uid),
        where('sessionId', '==', safeSessionId)
      )
    );
    if (oldChunksSnap.docs.length > 0) {
      for (let i = 0; i < oldChunksSnap.docs.length; i += 400) {
        const delBatch = writeBatch(db);
        for (const d of oldChunksSnap.docs.slice(i, i + 400)) {
          delBatch.delete(d.ref);
        }
        await delBatch.commit();
      }
    }

    // Upload chunks first
    for (let i = 0; i < chunks.length; i += 5) {
      const batch = writeBatch(db);
      for (const ch of chunks.slice(i, i + 5)) {
        const chRef = doc(db, 'workspaces', workspaceId, 'historySessionChunks', ch.id);
        batch.set(chRef, {
          ...ch,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    }

    const sessionRef = doc(db, 'workspaces', workspaceId, 'historySessions', safeSessionId);
    const existing = await getDoc(sessionRef);
    if (existing.exists()) {
      const { id: _i, ownerId: _o, createdAtIso: _c, ...updatable } = metaPayload as Record<string, unknown>;
      await updateDoc(sessionRef, {
        ...updatable,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(sessionRef, {
        ...metaPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, sessionPath);
  }
}

export async function fetchCloudHistorySessionChunks(
  uid: string,
  sessionId: string
): Promise<{
  capturesSnapshot: CaptureItem[];
  summariesSnapshot: ProductSummary[];
  systemStockSnapshot: SystemStockItem[];
}> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const safeSessionId = toSafeFirestoreId(sessionId, 'inv');
  const path = `workspaces/${workspaceId}/historySessionChunks`;
  try {
    const snap = await getDocs(
      query(
        collection(db, 'workspaces', workspaceId, 'historySessionChunks'),
        where('ownerId', '==', uid),
        where('sessionId', '==', safeSessionId)
      )
    );
    const captureChunks: Array<{ index: number; items: CaptureItem[] }> = [];
    const summaryChunks: Array<{ index: number; items: ProductSummary[] }> = [];
    const stockChunks: Array<{ index: number; items: SystemStockItem[] }> = [];

    for (const d of snap.docs) {
      const data = d.data();
      const idx = Number(data.index) || 0;
      const items = Array.isArray(data.items) ? data.items : [];
      if (data.kind === 'captures') captureChunks.push({ index: idx, items });
      else if (data.kind === 'summaries') summaryChunks.push({ index: idx, items });
      else if (data.kind === 'systemStock') stockChunks.push({ index: idx, items });
    }

    return {
      capturesSnapshot: reassembleChunks(captureChunks),
      summariesSnapshot: reassembleChunks(summaryChunks),
      systemStockSnapshot: reassembleChunks(stockChunks),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function deleteCloudHistorySessions(uid: string): Promise<void> {
  const workspaceId = getWorkspaceIdForUser(uid);
  const path = `workspaces/${workspaceId}/historySessions`;
  try {
    const [sessSnap, chunkSnap] = await Promise.all([
      getDocs(query(collection(db, 'workspaces', workspaceId, 'historySessions'), where('ownerId', '==', uid))),
      getDocs(query(collection(db, 'workspaces', workspaceId, 'historySessionChunks'), where('ownerId', '==', uid))),
    ]);
    const refs = [...sessSnap.docs.map((d) => d.ref), ...chunkSnap.docs.map((d) => d.ref)];
    for (let i = 0; i < refs.length; i += 400) {
      const batch = writeBatch(db);
      for (const r of refs.slice(i, i + 400)) batch.delete(r);
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ==================== INITIAL MERGE & UPLOAD ====================

export async function mergeAndUploadLocalToCloud(params: {
  uid: string;
  zones: ZoneItem[];
  captures: CaptureItem[];
  unidentified: UnidentifiedItem[];
  recountCodes: Set<string>;
  historySessions: InventoryHistorySession[];
  products: ProductItem[];
  systemStock: SystemStockItem[];
  forceOverwriteCatalog?: boolean;
}): Promise<{
  uploadedZones: number;
  uploadedCaptures: number;
  uploadedHistory: number;
  uploadedCatalog: boolean;
}> {
  const { uid } = params;
  const workspaceId = getWorkspaceIdForUser(uid);
  const wsRef = doc(db, 'workspaces', workspaceId);
  const wsPath = `workspaces/${workspaceId}`;

  try {
    // Ensure workspace doc exists before querying/writing subcollections
    let wsSnap = await getDoc(wsRef);
    if (!wsSnap.exists()) {
      await setDoc(wsRef, {
        id: workspaceId,
        ownerId: uid,
        name: 'Inventario Construrama Alce',
        catalogCount: 0,
        stockCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      wsSnap = await getDoc(wsRef);
    }

    const [cloudZonesSnap, cloudCapsSnap, cloudUnidSnap, cloudHistSnap] =
      await Promise.all([
        getDocs(query(collection(db, 'workspaces', workspaceId, 'zones'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'workspaces', workspaceId, 'captures'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'workspaces', workspaceId, 'unidentified'), where('ownerId', '==', uid))),
        getDocs(query(collection(db, 'workspaces', workspaceId, 'historySessions'), where('ownerId', '==', uid))),
      ]);

    const existingZoneIds = new Set(cloudZonesSnap.docs.map((d) => d.id));
    const existingCapIds = new Set(cloudCapsSnap.docs.map((d) => d.id));
    const existingUnidIds = new Set(cloudUnidSnap.docs.map((d) => d.id));
    const existingHistIds = new Set(cloudHistSnap.docs.map((d) => d.id));

    let uploadedZones = 0;
    for (const z of params.zones) {
      const safeId = toSafeFirestoreId(z.id, 'zone');
      if (!existingZoneIds.has(safeId)) {
        existingZoneIds.add(safeId);
        await upsertCloudZone(uid, z);
        uploadedZones++;
      }
    }

    let uploadedCaptures = 0;
    const seenCapDocIds = new Set(existingCapIds);
    const missingCaps: CaptureItem[] = [];
    for (const c of params.captures) {
      const safeId = toSafeFirestoreId(c.id, 'cap');
      if (!seenCapDocIds.has(safeId)) {
        seenCapDocIds.add(safeId);
        missingCaps.push(c);
      }
    }

    const deviceLabel = getShortDeviceLabel();
    for (let i = 0; i < missingCaps.length; i += 400) {
      const batch = writeBatch(db);
      for (const c of missingCaps.slice(i, i + 400)) {
        const payload = prepareCapturePayload(c, uid, deviceLabel);
        const docId = String(payload.id);
        batch.set(doc(db, 'workspaces', workspaceId, 'captures', docId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        uploadedCaptures++;
      }
      await batch.commit();
    }

    for (const u of params.unidentified) {
      const safeId = toSafeFirestoreId(u.id, 'unid');
      if (!existingUnidIds.has(safeId)) {
        existingUnidIds.add(safeId);
        await upsertCloudUnidentified(uid, u);
      }
    }

    for (const code of params.recountCodes) {
      await toggleCloudRecountCode(uid, code, true);
    }

    let uploadedHistory = 0;
    for (const sess of params.historySessions) {
      const safeId = toSafeFirestoreId(sess.id, 'inv');
      if (!existingHistIds.has(safeId)) {
        existingHistIds.add(safeId);
        await uploadCloudHistorySession(uid, sess);
        uploadedHistory++;
      }
    }

    let uploadedCatalog = false;
    const wsData = wsSnap.data() as WorkspaceMetadata | undefined;
    const cloudHasCatalog = (wsData?.catalogCount || 0) > 0;
    const cloudHasStock = (wsData?.stockCount || 0) > 0;

    if ((params.forceOverwriteCatalog || !cloudHasCatalog) && params.products.length > 0) {
      await uploadCloudCatalogChunks(uid, 'products', params.products);
      uploadedCatalog = true;
    }
    if ((params.forceOverwriteCatalog || !cloudHasStock) && params.systemStock.length > 0) {
      await uploadCloudCatalogChunks(uid, 'systemStock', params.systemStock);
      uploadedCatalog = true;
    }

    return { uploadedZones, uploadedCaptures, uploadedHistory, uploadedCatalog };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, wsPath);
  }
}
