import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeText, diceCoefficient, calculateMatchScore, findTopMatches } from './fuzzyMatch';
import { ProductItem } from '../types/inventory';

test('normalizeText strips accents, lowercase, and trims punctuation', () => {
  assert.equal(normalizeText('  TORNILLO  CABEZA  HEXAGONAL 1/2"  '), 'tornillo cabeza hexagonal 1 2');
  assert.equal(normalizeText('CÓDIGO DE BARRAS - ELÉCTRICO'), 'codigo de barras electrico');
});

test('diceCoefficient returns 1 for identical normalized strings', () => {
  assert.equal(diceCoefficient('martillo truper', 'MARTILLO TRUPER'), 1.0);
  assert.ok(diceCoefficient('cinta metrica', 'cinta aislar') > 0.2);
});

test('calculateMatchScore prioritizes exact code or barcode', () => {
  const prod: ProductItem = {
    code: '00123',
    barcode: '7501234567890',
    description: 'Pala cuadrada mango madera Truper',
    unit: 'pza',
  };

  assert.equal(calculateMatchScore('00123', prod), 1.0);
  assert.equal(calculateMatchScore('7501234567890', prod), 1.0);
  assert.ok(calculateMatchScore('Pala cuadrada', prod) > 0.6);
});

test('findTopMatches ranks best hardware products appropriately', () => {
  const catalog: ProductItem[] = [
    { code: 'H01', barcode: '111', description: 'Martillo de uña curva 16 oz Truper', unit: 'pza' },
    { code: 'H02', barcode: '222', description: 'Cincel de punta 1 pulgada', unit: 'pza' },
    { code: 'H03', barcode: '333', description: 'Tornillo para tabla roca 1 pulgada', unit: 'caja' },
    { code: 'H04', barcode: '444', description: 'Mazo de hule negro 16 oz Pretul', unit: 'pza' },
  ];

  const results = findTopMatches('martillo 16 oz', catalog, ['herramienta', 'martillo']);
  assert.ok(results.length > 0);
  assert.equal(results[0].product.code, 'H01');
});
