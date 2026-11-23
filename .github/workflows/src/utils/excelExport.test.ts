import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProductSummaries,
  generateInventoryWorkbook,
  getExportFileName,
} from './excelExport';
import { ProductItem, SystemStockItem, CaptureItem, ZoneItem } from '../types/inventory';

test('getExportFileName matches format Inventario_Construrama_Alce_AAAA-MM-DD.xlsx', () => {
  const d = new Date(2026, 9, 29); // Oct 29, 2026
  const name = getExportFileName(d);
  assert.equal(name, 'Inventario_Construrama_Alce_2026-10-29.xlsx');
});

test('buildProductSummaries correctly calculates differences, financial values and statuses', () => {
  const products: ProductItem[] = [
    { code: '001', barcode: 'B001', description: 'Martillo', unit: 'pza' },
    { code: '002', barcode: 'B002', description: 'Clavos', unit: 'kg' },
    { code: '003', barcode: 'B003', description: 'Cinta', unit: 'pza' },
  ];

  const stock: SystemStockItem[] = [
    { code: '001', systemStock: 10, cost: 100, unit: 'pza', importedAt: '2026-10-29' },
    { code: '002', systemStock: 20, cost: 50, unit: 'kg', importedAt: '2026-10-29' },
    { code: '003', systemStock: 5, cost: 20, unit: 'pza', importedAt: '2026-10-29' },
  ];

  const captures: CaptureItem[] = [
    {
      id: 'c1',
      zoneId: 'z1',
      zoneName: 'Pasillo 1',
      code: '001',
      barcode: 'B001',
      description: 'Martillo',
      unit: 'pza',
      quantity: 8, // faltan 2
      timestamp: '2026-10-29T10:00:00Z',
      counterName: 'Abimael',
    },
    {
      id: 'c2',
      zoneId: 'z1',
      zoneName: 'Pasillo 1',
      code: '002',
      barcode: 'B002',
      description: 'Clavos',
      unit: 'kg',
      quantity: 25, // sobran 5
      timestamp: '2026-10-29T10:05:00Z',
      counterName: 'Abimael',
    },
    {
      id: 'c3',
      zoneId: 'z1',
      zoneName: 'Pasillo 1',
      code: '003',
      barcode: 'B003',
      description: 'Cinta',
      unit: 'pza',
      quantity: 5, // completo
      timestamp: '2026-10-29T10:10:00Z',
      counterName: 'Abimael',
    },
  ];

  const summaries = buildProductSummaries(products, stock, captures);
  assert.equal(summaries.length, 3);

  const martillo = summaries.find((s) => s.code === '001');
  assert.equal(martillo?.status, 'faltante');
  assert.equal(martillo?.difference, -2);
  assert.equal(martillo?.differenceValue, -200);

  const clavos = summaries.find((s) => s.code === '002');
  assert.equal(clavos?.status, 'excedente');
  assert.equal(clavos?.difference, 5);
  assert.equal(clavos?.differenceValue, 250);

  const cinta = summaries.find((s) => s.code === '003');
  assert.equal(cinta?.status, 'completo');
  assert.equal(cinta?.difference, 0);
  assert.equal(cinta?.differenceValue, 0);
});

test('buildProductSummaries correctly separates tapanco and autoservicio counts', () => {
  const products: ProductItem[] = [
    { code: '001', barcode: 'B001', description: 'Martillo', unit: 'pza' },
  ];
  const stock: SystemStockItem[] = [
    { code: '001', systemStock: 10, cost: 100, unit: 'pza', importedAt: '2026-10-29' },
  ];
  const zones: ZoneItem[] = [
    { id: 'z1', name: 'Tapanco / Mezzanine', type: 'bodega', status: 'terminada' },
    { id: 'z2', name: 'Piso de Venta', type: 'autoservicio', status: 'terminada' },
  ];
  const captures: CaptureItem[] = [
    { id: 'c1', zoneId: 'z1', zoneName: 'Tapanco / Mezzanine', code: '001', barcode: 'B001', description: 'Martillo', unit: 'pza', quantity: 6, timestamp: '', counterName: 'Abimael' },
    { id: 'c2', zoneId: 'z2', zoneName: 'Piso de Venta', code: '001', barcode: 'B001', description: 'Martillo', unit: 'pza', quantity: 3, timestamp: '', counterName: 'Abimael' },
  ];

  const summaries = buildProductSummaries(products, stock, captures, new Set(), zones);
  const item = summaries.find((s) => s.code === '001');
  assert.equal(item?.tapancoCount, 6);
  assert.equal(item?.autoservicioCount, 3);
  assert.equal(item?.countedStock, 9);
  assert.equal(item?.difference, -1);
});

test('generateInventoryWorkbook creates all 7 requested sheets', () => {
  const zones: ZoneItem[] = [{ id: 'z1', name: 'Zona 1', status: 'terminada' }];
  const wb = generateInventoryWorkbook({
    captures: [],
    products: [{ code: '001', barcode: '1', description: 'Item', unit: 'pza' }],
    systemStock: [{ code: '001', systemStock: 5, cost: 10, unit: 'pza', importedAt: '' }],
    unidentified: [],
    zones,
  });

  const expectedSheets = [
    'Detalle',
    'Acumulado general',
    'Acumulado por zona',
    'Diferencias',
    'Faltantes',
    'Sobrantes',
    'No esperados',
    'No identificados',
    'Resumen',
  ];

  for (const s of expectedSheets) {
    assert.ok(wb.SheetNames.includes(s), `Missing sheet: ${s}`);
  }
});
