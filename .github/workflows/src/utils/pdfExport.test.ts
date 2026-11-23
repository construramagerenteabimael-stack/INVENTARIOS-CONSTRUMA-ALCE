import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDifferencesPdfBlob, getPdfFileName } from './pdfExport';
import { ProductSummary, SystemStockItem, CaptureItem } from '../types/inventory';

test('getPdfFileName generates correct format', () => {
  const d = new Date(2026, 10, 6, 14, 51);
  const name = getPdfFileName('Solo_Contado', d);
  assert.match(name, /^Reporte_Diferencias_Solo_Contado_\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('generateDifferencesPdfBlob generates a valid non-empty PDF Blob', async () => {
  const summaries: ProductSummary[] = [
    {
      code: '10235',
      barcode: '750100',
      description: 'FUMIGADOR DOMESTICO 2 LTS',
      unit: 'PZA',
      systemStock: 11,
      countedStock: 2,
      difference: -9,
      cost: 72.24,
      differenceValue: -650.16,
      status: 'faltante',
      isMarkedForRecount: false,
    },
    {
      code: '10494',
      barcode: '750101',
      description: 'JUEGO DE DESARMADOR TIPO TROMPO C/MATRACA',
      unit: 'PZA',
      systemStock: 6,
      countedStock: 5,
      difference: -1,
      cost: 50.35,
      differenceValue: -50.35,
      status: 'faltante',
      isMarkedForRecount: false,
    },
  ];

  const captures: CaptureItem[] = [
    { id: '1', zoneId: 'z1', zoneName: 'Piso', code: '10235', barcode: '750100', description: 'FUMIGADOR', unit: 'PZA', quantity: 2, timestamp: '', counterName: 'Abimael' },
    { id: '2', zoneId: 'z1', zoneName: 'Piso', code: '10494', barcode: '750101', description: 'DESARMADOR', unit: 'PZA', quantity: 5, timestamp: '', counterName: 'Abimael' },
  ];

  const stock: SystemStockItem[] = [
    { code: '10235', systemStock: 11, cost: 72.24, unit: 'PZA', importedAt: '2026-11-06' },
    { code: '10494', systemStock: 6, cost: 50.35, unit: 'PZA', importedAt: '2026-11-06' },
  ];

  const blob = await generateDifferencesPdfBlob({
    scope: 'counted',
    items: summaries,
    allSummaries: summaries,
    captures,
    systemStock: stock,
    counterName: 'Abimael',
    filterLabel: 'Faltantes (2)',
  });

  assert.ok(blob);
  assert.equal(blob.type, 'application/pdf');
  assert.ok(blob.size > 1000, `Expected PDF size > 1000 bytes, got ${blob.size}`);
});
