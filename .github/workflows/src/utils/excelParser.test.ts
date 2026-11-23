import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectProductHeaders,
  detectStockHeaders,
  sanitizeTextValue,
  processProductImport,
  processStockImport,
} from './excelParser';

test('detectProductHeaders identifies various casings, accents and abbreviations', () => {
  const headers = ['CÓDIGO', 'Código De Barras', 'DESCRIPCIÓN', 'U.M.'];
  const mapping = detectProductHeaders(headers);

  assert.equal(mapping.code, 'CÓDIGO');
  assert.equal(mapping.barcode, 'Código De Barras');
  assert.equal(mapping.description, 'DESCRIPCIÓN');
  assert.equal(mapping.unit, 'U.M.');
});

test('detectStockHeaders identifies stock and cost variants', () => {
  const headers = ['Clave', 'STOCK_SISTEMA', 'P.U.', 'Medida'];
  const mapping = detectStockHeaders(headers);

  assert.equal(mapping.code, 'Clave');
  assert.equal(mapping.systemStock, 'STOCK_SISTEMA');
  assert.equal(mapping.cost, 'P.U.');
  assert.equal(mapping.unit, 'Medida');
});

test('sanitizeTextValue preserves leading zeroes and trims properly', () => {
  assert.equal(sanitizeTextValue(' 00459 '), '00459');
  assert.equal(sanitizeTextValue(459), '459');
  assert.equal(sanitizeTextValue(null), '');
});

test('processProductImport extracts valid products and identifies missing fields', () => {
  const rawRows = [
    { Codigo: '001', Barcode: '75001', Desc: 'Tornillo 1"', Um: 'pza' },
    { Codigo: '', Barcode: '75002', Desc: 'Sin codigo', Um: 'pza' }, // invalid
    { Codigo: '002', Barcode: '', Desc: 'Tuerca 1/2"', Um: 'pza' }, // valid, fallback barcode to code
  ];

  const mapping = {
    code: 'Codigo',
    barcode: 'Barcode',
    description: 'Desc',
    unit: 'Um',
  };

  const { validProducts, summary } = processProductImport(rawRows, mapping);
  assert.equal(validProducts.length, 2);
  assert.equal(summary.errorRows, 1);
  assert.equal(validProducts[1].barcode, '002');
});

test('processStockImport flags codes missing from catalog', () => {
  const rawRows = [
    { Codigo: '001', Stock: '10', Costo: '15.5' },
    { Codigo: '999', Stock: '5', Costo: '20' }, // missing from catalog
  ];

  const mapping = {
    code: 'Codigo',
    systemStock: 'Stock',
    cost: 'Costo',
    unit: null,
    barcode: null,
    description: null,
  };

  const catalogCodes = new Set(['001', '002', '003']);
  const { validStock, unmatchedCodes } = processStockImport(rawRows, mapping, catalogCodes);

  assert.equal(validStock.length, 2);
  assert.deepEqual(unmatchedCodes, ['999']);
});
