import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  toSafeFirestoreId,
  toSafeRecountDocId,
  getWorkspaceIdForUser,
  chunkArray,
  reassembleChunks,
  truncatePhotoForCloud,
  MAX_PHOTO_BASE64_LEN,
  prepareCapturePayload,
  prepareZonePayload,
  buildHistorySessionChunkPayloads,
  mergeUniqueById,
  stripUndefinedFields,
} from './cloudSyncHelpers';
import { CaptureItem, InventoryHistorySession, ZoneItem } from '../types/inventory';

describe('Cloud Sync Helpers', () => {
  it('sanitizes arbitrary product codes into valid Firestore IDs matching ^[a-zA-Z0-9_\\-]+$', () => {
    const id1 = toSafeFirestoreId('cap_12345_abc');
    assert.equal(id1, 'cap_12345_abc');

    const unsafeCode = 'TORN/12.5 A*B';
    const safeRecId = toSafeRecountDocId(unsafeCode);
    assert.match(safeRecId, /^[a-zA-Z0-9_\-]+$/);
    assert.ok(safeRecId.length <= 128);

    const wsId = getWorkspaceIdForUser('uid_Abc123');
    assert.equal(wsId, 'ws_uid_Abc123');
  });

  it('chunks large 15,000-item catalogs into 15 chunks of <=1,000 items and reassembles cleanly', () => {
    const items = Array.from({ length: 15000 }, (_, idx) => ({
      code: `C${idx}`,
      description: `Producto ${idx}`,
    }));
    const chunks = chunkArray(items, 1000);
    assert.equal(chunks.length, 15);
    assert.equal(chunks[0].length, 1000);
    assert.equal(chunks[14].length, 1000);

    // Shuffle chunk order and verify reassemble restores exact order
    const chunkDocs = chunks
      .map((chunkItems, index) => ({ index, items: chunkItems }))
      .reverse();
    const reassembled = reassembleChunks(chunkDocs);
    assert.equal(reassembled.length, 15000);
    assert.equal(reassembled[0].code, 'C0');
    assert.equal(reassembled[14999].code, 'C14999');
  });

  it('omits oversized photoBase64 exceeding Firestore safety limit', () => {
    const smallPhoto = 'data:image/jpeg;base64,abc123';
    assert.equal(truncatePhotoForCloud(smallPhoto), smallPhoto);

    const hugePhoto = 'x'.repeat(MAX_PHOTO_BASE64_LEN + 100);
    assert.equal(truncatePhotoForCloud(hugePhoto), undefined);
  });

  it('strips undefined fields from capture and zone payloads', () => {
    const cap: CaptureItem = {
      id: 'cap-1',
      zoneId: 'zone-1',
      zoneName: 'Tapanco',
      code: '00101',
      barcode: '750100',
      description: 'Martillo',
      unit: 'pza',
      quantity: 4,
      timestamp: '2026-11-18T12:00:00Z',
      counterName: 'Abimael',
      isRecount: undefined,
    };

    const preparedCap = prepareCapturePayload(cap, 'user_1', 'Celular Android');
    assert.equal('isRecount' in preparedCap, false);
    assert.equal(preparedCap.ownerId, 'user_1');
    assert.equal(preparedCap.deviceName, 'Celular Android');

    const zone: ZoneItem = {
      id: 'z-1',
      name: 'Bodega',
      type: 'bodega',
      status: 'en_conteo',
      notes: undefined,
    };
    const preparedZone = prepareZonePayload(zone, 'user_1');
    assert.equal('notes' in preparedZone, false);
    assert.equal(preparedZone.type, 'bodega');
  });

  it('builds compact history session chunks without undefined values', () => {
    const session: InventoryHistorySession = {
      id: 'inv_20261118_120000',
      name: 'Cierre Tapanco',
      createdAt: '2026-11-18T10:00:00Z',
      closedAt: '2026-11-18T12:00:00Z',
      closedBy: 'Abimael',
      totalCapturesCount: 1,
      totalPiecesCounted: 5,
      totalCountedProducts: 1,
      totalExactProducts: 1,
      totalFaltantesProducts: 0,
      totalSobrantesProducts: 0,
      totalFaltantesPieces: 0,
      totalSobrantesPieces: 0,
      totalFaltantesValue: 0,
      totalSobrantesValue: 0,
      netFinancialImpact: 0,
      accuracyRatePct: 100,
      capturesSnapshot: [
        {
          id: 'c1',
          zoneId: 'z1',
          zoneName: 'Tapanco',
          code: '00101',
          barcode: '750',
          description: 'Martillo',
          unit: 'pza',
          quantity: 5,
          timestamp: '2026-11-18T10:00:00Z',
          counterName: 'Abimael',
        },
      ],
      summariesSnapshot: [
        {
          code: '00101',
          barcode: '750',
          description: 'Martillo',
          unit: 'pza',
          systemStock: 5,
          countedStock: 5,
          difference: 0,
          cost: 100,
          differenceValue: 0,
          status: 'completo',
          isMarkedForRecount: false,
        },
        {
          code: '00102',
          barcode: '751',
          description: 'Sin contar',
          unit: 'pza',
          systemStock: 10,
          countedStock: 0,
          difference: -10,
          cost: 50,
          differenceValue: -500,
          status: 'sin_contar',
          isMarkedForRecount: false,
        },
      ],
      systemStockSnapshot: [
        { code: '00101', systemStock: 5, cost: 100, unit: 'pza', importedAt: '2026-11-18T09:00:00Z' },
      ],
    };

    const chunks = buildHistorySessionChunkPayloads(session, 'user_1');
    assert.equal(chunks.length, 3);
    assert.equal(chunks.find((c) => c.kind === 'summaries')?.items.length, 1);
    assert.deepStrictEqual(stripUndefinedFields({ a: 1, b: undefined }), { a: 1 });
  });

  it('merges local and cloud items cleanly without duplicates', () => {
    const cloud = [
      { id: 'c1', quantity: 10 },
      { id: 'c2', quantity: 5 },
    ];
    const local = [
      { id: 'c1', quantity: 8 }, // stale local, cloud wins
      { id: 'c3', quantity: 2 }, // offline local-only, preserved
    ];
    const merged = mergeUniqueById(cloud, local);
    assert.equal(merged.length, 3);
    assert.equal(merged.find((x) => x.id === 'c1')?.quantity, 10);
    assert.equal(merged.find((x) => x.id === 'c3')?.quantity, 2);
  });
});
