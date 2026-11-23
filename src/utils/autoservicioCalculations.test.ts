import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isZoneBodega,
  isZoneAutoservicio,
  getCountInBodega,
  getCountInAutoservicio,
  computeProductAutoservicioBalance,
  computeAllAutoservicioBalances,
  formatAutoservicioTriplet,
  formatAutoservicioSumEquation,
} from './autoservicioCalculations';
import { ZoneItem, CaptureItem, ProductItem, SystemStockItem } from '../types/inventory';

describe('Autoservicio Calculations', () => {
  const mockZones: ZoneItem[] = [
    { id: 'z-bodega', name: 'Bodega Principal', type: 'bodega', status: 'terminada' },
    { id: 'z-piso', name: 'Anaqueles Autoservicio', type: 'autoservicio', status: 'en_conteo' },
    { id: 'z-general', name: 'Patio de Grava', type: 'general', status: 'pendiente' },
  ];

  const mockCaptures: CaptureItem[] = [
    {
      id: 'c1',
      zoneId: 'z-bodega',
      zoneName: 'Bodega Principal',
      code: '00101',
      barcode: '7501000101010',
      description: 'Martillo',
      unit: 'pza',
      quantity: 12,
      timestamp: '2026-11-03T10:00:00Z',
      counterName: 'Abimael',
    },
    {
      id: 'c2',
      zoneId: 'z-piso',
      zoneName: 'Anaqueles Autoservicio',
      code: '00101',
      barcode: '7501000101010',
      description: 'Martillo',
      unit: 'pza',
      quantity: 5,
      timestamp: '2026-11-03T11:00:00Z',
      counterName: 'Abimael',
    },
  ];

  it('correctly classifies zone types via explicit type or name heuristic', () => {
    assert.strictEqual(isZoneBodega(mockZones[0]), true);
    assert.strictEqual(isZoneBodega(mockZones[1]), false);
    assert.strictEqual(isZoneAutoservicio(mockZones[1]), true);

    // Heuristics without explicit type
    assert.strictEqual(isZoneBodega({ id: '1', name: 'Almacén general', status: 'pendiente' }), true);
    assert.strictEqual(isZoneAutoservicio({ id: '2', name: 'Exhibición y Mostrador', status: 'pendiente' }), true);
  });

  it('computes correct Bodega and Autoservicio count', () => {
    const bodegaCount = getCountInBodega('00101', mockZones, mockCaptures);
    const autoservicioCount = getCountInAutoservicio('00101', mockZones, mockCaptures);

    assert.strictEqual(bodegaCount, 12);
    assert.strictEqual(autoservicioCount, 5);
  });

  it('computes remaining to find on autoservicio based on system stock minus bodega', () => {
    const product: ProductItem = {
      code: '00101',
      barcode: '7501000101010',
      description: 'Martillo',
      unit: 'pza',
    };
    const stock: SystemStockItem = {
      code: '00101',
      systemStock: 20, // Expected: 20 total. In Bodega: 12. In Autoservicio: 5. Remaining: 3!
      cost: 150,
      unit: 'pza',
      importedAt: '2026-11-03T09:00:00Z',
    };

    const balance = computeProductAutoservicioBalance(product, stock, mockZones, mockCaptures);
    assert.strictEqual(balance.systemStock, 20);
    assert.strictEqual(balance.bodegaCount, 12);
    assert.strictEqual(balance.targetToFindInAutoservicio, 8); // 20 - 12 = 8
    assert.strictEqual(balance.autoservicioCount, 5);
    assert.strictEqual(balance.remainingToFind, 3); // 8 - 5 = 3
    assert.strictEqual(balance.totalCounted, 17);
    assert.strictEqual(balance.status, 'pendiente');
  });

  it('marks completado when remainingToFind reaches 0 and total equals system stock', () => {
    const product: ProductItem = {
      code: '00101',
      barcode: '7501000101010',
      description: 'Martillo',
      unit: 'pza',
    };
    const stock: SystemStockItem = {
      code: '00101',
      systemStock: 17, // 12 in bodega + 5 in autoservicio = 17 exact!
      cost: 150,
      unit: 'pza',
      importedAt: '2026-11-03T09:00:00Z',
    };

    const balance = computeProductAutoservicioBalance(product, stock, mockZones, mockCaptures);
    assert.strictEqual(balance.remainingToFind, 0);
    assert.strictEqual(balance.status, 'completado');
  });

  it('matches user explicit example: 3 in bodega/tapanco, 5 in system => 3 bodega, 2 pendientes, 5 total sistema', () => {
    const tapancoZone: ZoneItem = { id: 'z-tapanco', name: 'Tapanco Ferretería', status: 'terminada' };
    assert.strictEqual(isZoneBodega(tapancoZone), true);

    const autoZone: ZoneItem = { id: 'z-auto', name: 'Autoservicio Principal', type: 'autoservicio', status: 'en_conteo' };

    const product: ProductItem = {
      code: 'F001',
      barcode: '7509999001',
      description: 'Pala cuadrada Truper',
      unit: 'pza',
    };
    const stock: SystemStockItem = {
      code: 'F001',
      systemStock: 5,
      cost: 250,
      unit: 'pza',
      importedAt: '2026-11-03T09:00:00Z',
    };
    const captures: CaptureItem[] = [
      {
        id: 'c-tapanco',
        zoneId: 'z-tapanco',
        zoneName: 'Tapanco Ferretería',
        code: 'F001',
        barcode: '7509999001',
        description: 'Pala cuadrada Truper',
        unit: 'pza',
        quantity: 3,
        timestamp: '2026-11-03T09:30:00Z',
        counterName: 'Abimael',
      },
    ];

    // At start of autoservicio (0 counted in autoservicio yet)
    const initialBalance = computeProductAutoservicioBalance(product, stock, [tapancoZone, autoZone], captures);
    assert.strictEqual(initialBalance.bodegaCount, 3);
    assert.strictEqual(initialBalance.remainingToFind, 2);
    assert.strictEqual(initialBalance.systemStock, 5);

    const triplet = formatAutoservicioTriplet(initialBalance);
    assert.strictEqual(triplet.bodegaLabel, 'Tapanco Ferretería: 3');
    assert.strictEqual(triplet.pendientesLabel, 'Pendientes: 2');
    assert.strictEqual(triplet.sistemaLabel, 'Total Sistema: 5');
    assert.strictEqual(triplet.summaryText, 'Tapanco Ferretería: 3 | Pendientes: 2 | Total Sistema: 5');
    assert.strictEqual(triplet.originBadge, 'Pendiente de zona: Tapanco Ferretería');
  });

  it('correctly formats the sum equation: Bodega + Autoservicio = Total Contado vs Sistema', () => {
    const tapancoZone: ZoneItem = { id: 'z-tapanco', name: 'Tapanco', status: 'terminada' };
    const autoZone: ZoneItem = { id: 'z-auto', name: 'Autoservicio', type: 'autoservicio', status: 'en_conteo' };
    const product: ProductItem = { code: 'P01', barcode: '123', description: 'Tornillo', unit: 'pza' };
    const stock: SystemStockItem = { code: 'P01', systemStock: 5, cost: 10, unit: 'pza', importedAt: '' };

    const captures: CaptureItem[] = [
      {
        id: 'c1',
        zoneId: 'z-tapanco',
        zoneName: 'Tapanco',
        code: 'P01',
        barcode: '123',
        description: 'Tornillo',
        unit: 'pza',
        quantity: 3,
        timestamp: '',
        counterName: 'User',
      },
      {
        id: 'c2',
        zoneId: 'z-auto',
        zoneName: 'Autoservicio',
        code: 'P01',
        barcode: '123',
        description: 'Tornillo',
        unit: 'pza',
        quantity: 1,
        timestamp: '',
        counterName: 'User',
      },
    ];

    const balance = computeProductAutoservicioBalance(product, stock, [tapancoZone, autoZone], captures);
    assert.strictEqual(balance.bodegaCount, 3);
    assert.strictEqual(balance.autoservicioCount, 1);
    assert.strictEqual(balance.totalCounted, 4);
    assert.strictEqual(balance.systemStock, 5);
    assert.strictEqual(balance.difference, -1);

    const eq = formatAutoservicioSumEquation(balance);
    assert.strictEqual(eq.bodegaPart, 'Tapanco: 3');
    assert.strictEqual(eq.autoPart, 'Autoservicio: 1');
    assert.strictEqual(eq.totalPart, 'Total Contado: 4');
    assert.strictEqual(eq.sistemaPart, 'Sistema: 5');
    assert.strictEqual(eq.differencePart, 'Faltan 1');
    assert.strictEqual(eq.equationText, 'Tapanco: 3 + Autoservicio: 1 = Total Contado: 4 vs Sistema: 5 (Faltan 1)');
  });

  it('marks isUncountedInBodega as true when item has system stock but 0 counted in bodega', () => {
    const product: ProductItem = {
      code: 'UNCOUNTED-01',
      barcode: '999',
      description: 'Pintura Blanca 19L',
      unit: 'cubeta',
    };
    const stock: SystemStockItem = {
      code: 'UNCOUNTED-01',
      systemStock: 10,
      cost: 850,
      unit: 'cubeta',
      importedAt: '',
    };
    const balance = computeProductAutoservicioBalance(product, stock, mockZones, []);
    assert.strictEqual(balance.bodegaCount, 0);
    assert.strictEqual(balance.systemStock, 10);
    assert.strictEqual(balance.isUncountedInBodega, true);
    assert.strictEqual(balance.targetToFindInAutoservicio, 10);
  });

  it('sorts codes with natural numeric ordering from lowest to highest (1, 2, 10)', () => {
    const rawCodes = ['10', '2', '1', '100', '20', '3'];
    const sorted = [...rawCodes].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
    assert.deepStrictEqual(sorted, ['1', '2', '3', '10', '20', '100']);
  });
});


