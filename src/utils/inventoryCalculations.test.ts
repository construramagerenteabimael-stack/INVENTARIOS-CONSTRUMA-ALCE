import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCountedDifferencesMetrics,
  computeGeneralInventoryProgress,
  computeCountedDashboardData,
  buildHistorySessionRecord,
} from './inventoryCalculations';
import { ProductSummary, CaptureItem, SystemStockItem } from '../types/inventory';

test('computeCountedDifferencesMetrics calculates differences ONLY for items with countedStock > 0', () => {
  const summaries: ProductSummary[] = [
    {
      code: '001',
      barcode: 'B001',
      description: 'Martillo',
      unit: 'pza',
      countedStock: 8,
      systemStock: 10,
      difference: -2,
      differenceValue: -200, // cost 100 * -2
      status: 'faltante',
      isMarkedForRecount: false,
      cost: 100,
    },
    {
      code: '002',
      barcode: 'B002',
      description: 'Clavos',
      unit: 'kg',
      countedStock: 15,
      systemStock: 10,
      difference: 5,
      differenceValue: 250, // cost 50 * 5
      status: 'excedente',
      isMarkedForRecount: false,
      cost: 50,
    },
    {
      code: '003',
      barcode: 'B003',
      description: 'Cinta',
      unit: 'pza',
      countedStock: 5,
      systemStock: 5,
      difference: 0,
      differenceValue: 0,
      status: 'completo',
      isMarkedForRecount: false,
      cost: 20,
    },
    {
      // UNCOUNTED item in catalog: should NOT be included in counted differences
      code: '004',
      barcode: 'B004',
      description: 'Pintura',
      unit: 'bote',
      countedStock: 0,
      systemStock: 20,
      difference: -20,
      differenceValue: -6000,
      status: 'faltante',
      isMarkedForRecount: false,
      cost: 300,
    },
  ];

  const metrics = computeCountedDifferencesMetrics(summaries);

  // Total counted items is 3 (excluding uncounted '004')
  assert.equal(metrics.totalCountedProducts, 3);
  assert.equal(metrics.countedFaltantes.length, 1);
  assert.equal(metrics.countedFaltantes[0].code, '001');
  assert.equal(metrics.totalFaltantesValue, 200); // Only the $200 from '001', NOT the $6000 from uncounted '004'
  assert.equal(metrics.totalFaltantesPieces, 2);

  assert.equal(metrics.countedSobrantes.length, 1);
  assert.equal(metrics.countedSobrantes[0].code, '002');
  assert.equal(metrics.totalSobrantesValue, 250);
  assert.equal(metrics.totalSobrantesPieces, 5);

  assert.equal(metrics.countedExactos.length, 1);
  assert.equal(metrics.countedExactos[0].code, '003');

  // Net financial impact of counted: 250 (sobrante) - 200 (faltante) = +50
  assert.equal(metrics.netFinancialImpact, 50);
});

test('computeGeneralInventoryProgress calculates pieces and product percentage correctly', () => {
  const summaries: ProductSummary[] = [
    { code: '001', barcode: 'B001', description: 'A', unit: 'pza', countedStock: 10, systemStock: 20, difference: -10, differenceValue: -100, status: 'faltante', isMarkedForRecount: false, cost: 10 },
    { code: '002', barcode: 'B002', description: 'B', unit: 'pza', countedStock: 30, systemStock: 30, difference: 0, differenceValue: 0, status: 'completo', isMarkedForRecount: false, cost: 10 },
    { code: '003', barcode: 'B003', description: 'C', unit: 'pza', countedStock: 0, systemStock: 50, difference: -50, differenceValue: -500, status: 'faltante', isMarkedForRecount: false, cost: 10 },
    { code: '004', barcode: 'B004', description: 'D', unit: 'pza', countedStock: 0, systemStock: 100, difference: -100, differenceValue: -1000, status: 'faltante', isMarkedForRecount: false, cost: 10 },
  ];

  const captures: CaptureItem[] = [
    { id: '1', zoneId: 'z1', zoneName: 'P1', code: '001', barcode: '001', description: 'A', unit: 'pza', quantity: 10, timestamp: '', counterName: 'Test' },
    { id: '2', zoneId: 'z1', zoneName: 'P1', code: '002', barcode: '002', description: 'B', unit: 'pza', quantity: 30, timestamp: '', counterName: 'Test' },
  ];

  const stock: SystemStockItem[] = [
    { code: '001', systemStock: 20, cost: 10, unit: 'pza', importedAt: '2026-10-29' },
    { code: '002', systemStock: 30, cost: 10, unit: 'pza', importedAt: '2026-10-29' },
    { code: '003', systemStock: 50, cost: 10, unit: 'pza', importedAt: '2026-10-29' },
    { code: '004', systemStock: 100, cost: 10, unit: 'pza', importedAt: '2026-10-29' },
  ];

  const progress = computeGeneralInventoryProgress(summaries, captures, stock);

  // Total system pieces = 20 + 30 + 50 + 100 = 200
  assert.equal(progress.totalSystemPieces, 200);
  // Total counted pieces = 10 + 30 = 40
  assert.equal(progress.totalCountedPieces, 40);
  // % Progress in pieces = 40 / 200 = 20%
  assert.equal(progress.pctProgressPieces, 20);

  // Total catalog products = 4
  assert.equal(progress.totalCatalogProducts, 4);
  // Counted products = 2 ('001' and '002')
  assert.equal(progress.totalCountedProducts, 2);
  // % Progress in products = 2 / 4 = 50%
  assert.equal(progress.pctProgressProducts, 50);

  // Pending pieces = 200 - 40 = 160
  assert.equal(progress.totalPendingPieces, 160);
  // Pending products = 4 - 2 = 2
  assert.equal(progress.totalPendingProducts, 2);
});

test('computeCountedDashboardData generates accuracy rates and top discrepancies', () => {
  const summaries: ProductSummary[] = [
    { code: '001', barcode: '1', description: 'Martillo', unit: 'pza', countedStock: 10, systemStock: 10, difference: 0, differenceValue: 0, status: 'completo', isMarkedForRecount: false, cost: 50 },
    { code: '002', barcode: '2', description: 'Cinta', unit: 'pza', countedStock: 10, systemStock: 10, difference: 0, differenceValue: 0, status: 'completo', isMarkedForRecount: false, cost: 20 },
    { code: '003', barcode: '3', description: 'Pala', unit: 'pza', countedStock: 5, systemStock: 8, difference: -3, differenceValue: -300, status: 'faltante', isMarkedForRecount: false, cost: 100 },
    { code: '004', barcode: '4', description: 'Carretilla', unit: 'pza', countedStock: 2, systemStock: 5, difference: -3, differenceValue: -1500, status: 'faltante', isMarkedForRecount: false, cost: 500 },
    { code: '005', barcode: '5', description: 'Tornillos', unit: 'kg', countedStock: 15, systemStock: 10, difference: 5, differenceValue: 250, status: 'excedente', isMarkedForRecount: false, cost: 50 },
    { code: '006', barcode: '6', description: 'No contado', unit: 'pza', countedStock: 0, systemStock: 20, difference: -20, differenceValue: -2000, status: 'faltante', isMarkedForRecount: false, cost: 100 },
  ];

  const dashboard = computeCountedDashboardData(summaries);

  // 5 items counted (006 not counted)
  assert.equal(dashboard.totalCountedProducts, 5);
  assert.equal(dashboard.totalExactProducts, 2); // 001, 002
  assert.equal(dashboard.totalFaltantesProducts, 2); // 003, 004
  assert.equal(dashboard.totalSobrantesProducts, 1); // 005

  // Accuracy: 2 / 5 = 40%
  assert.equal(dashboard.accuracyRatePct, 40);
  // Faltantes: 2 / 5 = 40%
  assert.equal(dashboard.faltantesRatePct, 40);
  // Sobrantes: 1 / 5 = 20%
  assert.equal(dashboard.sobrantesRatePct, 20);

  // Top faltantes sorted by absolute value descending: Carretilla ($1500) before Pala ($300)
  assert.equal(dashboard.topFaltantes[0].code, '004');
  assert.equal(dashboard.topFaltantes[1].code, '003');
  assert.equal(dashboard.topSobrantes[0].code, '005');
});

test('buildHistorySessionRecord constructs an immutable snapshot with accurate metrics', () => {
  const summaries: ProductSummary[] = [
    { code: '001', barcode: '1', description: 'Martillo', unit: 'pza', countedStock: 10, systemStock: 10, difference: 0, differenceValue: 0, status: 'completo', isMarkedForRecount: false, cost: 50 },
    { code: '002', barcode: '2', description: 'Cincel', unit: 'pza', countedStock: 5, systemStock: 8, difference: -3, differenceValue: -150, status: 'faltante', isMarkedForRecount: false, cost: 50 },
  ];

  const captures: CaptureItem[] = [
    { id: 'c1', zoneId: 'z1', zoneName: 'Piso', code: '001', barcode: '1', description: 'Martillo', unit: 'pza', quantity: 10, timestamp: '2026-11-07T12:00:00Z', counterName: 'Abimael' },
    { id: 'c2', zoneId: 'z1', zoneName: 'Piso', code: '002', barcode: '2', description: 'Cincel', unit: 'pza', quantity: 5, timestamp: '2026-11-07T12:05:00Z', counterName: 'Abimael' },
  ];

  const stock: SystemStockItem[] = [
    { code: '001', systemStock: 10, cost: 50, unit: 'pza', importedAt: '2026-11-07' },
    { code: '002', systemStock: 8, cost: 50, unit: 'pza', importedAt: '2026-11-07' },
  ];

  const fixedDate = new Date(2026, 10, 7, 13, 30);
  const session = buildHistorySessionRecord({
    sessionName: 'Conteo Pasillo 1',
    counterName: 'Abimael',
    captures,
    summaries,
    systemStock: stock,
    notes: 'Primer conteo del mes',
    now: fixedDate,
    customId: 'test_session_01',
  });

  assert.equal(session.id, 'test_session_01');
  assert.equal(session.name, 'Conteo Pasillo 1');
  assert.equal(session.closedBy, 'Abimael');
  assert.equal(session.totalCapturesCount, 2);
  assert.equal(session.totalPiecesCounted, 15);
  assert.equal(session.totalCountedProducts, 2);
  assert.equal(session.totalExactProducts, 1);
  assert.equal(session.totalFaltantesProducts, 1);
  assert.equal(session.totalFaltantesPieces, 3);
  assert.equal(session.totalFaltantesValue, 150);
  assert.equal(session.accuracyRatePct, 50);
  assert.equal(session.capturesSnapshot.length, 2);
});

test('computeGeneralInventoryProgress maintains and accumulates progress from history sessions when active captures reset', () => {
  const summaries: ProductSummary[] = [
    { code: '001', barcode: '1', description: 'Martillo', unit: 'pza', countedStock: 10, systemStock: 20, difference: -10, differenceValue: -500, status: 'faltante', isMarkedForRecount: false, cost: 50 },
    { code: '002', barcode: '2', description: 'Cinta', unit: 'pza', countedStock: 30, systemStock: 30, difference: 0, differenceValue: 0, status: 'completo', isMarkedForRecount: false, cost: 10 },
    { code: '003', barcode: '3', description: 'Clavos', unit: 'kg', countedStock: 0, systemStock: 50, difference: -50, differenceValue: -1000, status: 'faltante', isMarkedForRecount: false, cost: 20 },
  ];

  const stock: SystemStockItem[] = [
    { code: '001', systemStock: 20, cost: 50, unit: 'pza', importedAt: '2026-10-29' },
    { code: '002', systemStock: 30, cost: 10, unit: 'pza', importedAt: '2026-10-29' },
    { code: '003', systemStock: 50, cost: 20, unit: 'pza', importedAt: '2026-10-29' },
  ];

  const historySessions = [
    {
      id: 'sess-1',
      name: 'Lote 1 Pasillos',
      createdAt: '2026-11-08T10:00:00Z',
      closedAt: '2026-11-08T11:00:00Z',
      closedBy: 'Abimael',
      totalCapturesCount: 2,
      totalPiecesCounted: 40,
      totalCountedProducts: 2,
      totalExactProducts: 1,
      totalFaltantesProducts: 1,
      totalSobrantesProducts: 0,
      totalFaltantesPieces: 10,
      totalSobrantesPieces: 0,
      totalFaltantesValue: 500,
      totalSobrantesValue: 0,
      netFinancialImpact: -500,
      accuracyRatePct: 50,
      capturesSnapshot: [
        { id: 'c1', zoneId: 'z1', zoneName: 'Pasillo 1', code: '001', barcode: '1', description: 'Martillo', unit: 'pza', quantity: 10, timestamp: '2026-11-08T10:10:00Z', counterName: 'Abimael' },
        { id: 'c2', zoneId: 'z1', zoneName: 'Pasillo 1', code: '002', barcode: '2', description: 'Cinta', unit: 'pza', quantity: 30, timestamp: '2026-11-08T10:20:00Z', counterName: 'Abimael' },
      ],
      summariesSnapshot: [],
    },
  ];

  const liveCaptures: CaptureItem[] = [];

  const progressAfterReset = computeGeneralInventoryProgress(summaries, liveCaptures, stock, historySessions as any);

  assert.equal(progressAfterReset.totalSystemPieces, 100);
  // Total counted pieces maintains the 40 pieces from the history session instead of resetting to 0!
  assert.equal(progressAfterReset.totalCountedPieces, 40);
  assert.equal(progressAfterReset.pctProgressPieces, 40);
  assert.equal(progressAfterReset.historicalPieces, 40);
  assert.equal(progressAfterReset.livePieces, 0);
  assert.equal(progressAfterReset.totalCountedProducts, 2);
  assert.equal(progressAfterReset.isAccumulated, true);

  // When live captures add 10 pieces in the new count:
  const newLiveCaptures: CaptureItem[] = [
    { id: 'c3', zoneId: 'z2', zoneName: 'Patio', code: '003', barcode: '3', description: 'Clavos', unit: 'kg', quantity: 10, timestamp: '2026-11-09T08:00:00Z', counterName: 'Abimael' },
  ];

  const progressWithNewCount = computeGeneralInventoryProgress(summaries, newLiveCaptures, stock, historySessions as any);

  // Accumulated pieces = 40 + 10 = 50
  assert.equal(progressWithNewCount.totalCountedPieces, 50);
  assert.equal(progressWithNewCount.pctProgressPieces, 50);
  assert.equal(progressWithNewCount.historicalPieces, 40);
  assert.equal(progressWithNewCount.livePieces, 10);
  // Distinct counted products increases from 2 to 3
  assert.equal(progressWithNewCount.totalCountedProducts, 3);
  assert.equal(progressWithNewCount.pctProgressProducts, 100);
});

