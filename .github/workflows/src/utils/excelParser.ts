import * as XLSX from 'xlsx';
import { ProductItem, SystemStockItem, ImportSummary } from '../types/inventory';
import { normalizeText } from './fuzzyMatch';

export type ProductColumnKey = 'code' | 'barcode' | 'description' | 'unit';
export type StockColumnKey = 'code' | 'barcode' | 'description' | 'systemStock' | 'cost' | 'unit';

export interface ColumnMapping<T extends string> {
  [key: string]: T | undefined;
}

/**
 * Standard candidate names for product base columns
 */
const PRODUCT_HEADER_PATTERNS: Record<ProductColumnKey, string[]> = {
  code: [
    'codigo', 'cod', 'clave', 'cve', 'cve_art', 'cveart', 'clv', 'clv_art',
    'articulo', 'sku', 'id', 'item', 'referencia', 'ref', 'no_parte', 'num_parte', 'modelo'
  ],
  barcode: [
    'codigo de barras', 'cod barras', 'codigo barras', 'cod_barras', 'codbar',
    'barcode', 'upc', 'ean', 'ean13', 'gtin', 'barras', 'c_barras'
  ],
  description: [
    'descripcion', 'desc', 'descr', 'descrip', 'nombre', 'concepto',
    'producto', 'articulo', 'detalle', 'titulo', 'material', 'denominacion'
  ],
  unit: [
    'unidad', 'ud', 'u m', 'um', 'u_m', 'medida', 'tipo unidad', 'presentacion', 'u.m.'
  ],
};

/**
 * Standard candidate names for system stock columns
 */
const STOCK_HEADER_PATTERNS: Record<StockColumnKey, string[]> = {
  code: [
    'codigo', 'cod', 'clave', 'cve', 'cve_art', 'cveart', 'clv', 'clv_art',
    'articulo', 'sku', 'id', 'item', 'referencia', 'ref'
  ],
  barcode: [
    'codigo de barras', 'cod barras', 'codigo barras', 'cod_barras', 'codbar',
    'barcode', 'upc', 'ean', 'ean13', 'gtin', 'barras', 'c_barras'
  ],
  description: [
    'descripcion', 'desc', 'descr', 'descrip', 'nombre', 'concepto',
    'producto', 'articulo', 'detalle', 'titulo', 'material', 'denominacion'
  ],
  systemStock: [
    'existencia', 'existencias', 'stock', 'cantidad', 'cant', 'saldo',
    'inventario', 'teorico', 'sistema', 'actual', 'fisico', 'disponible'
  ],
  cost: [
    'costo', 'costo unitario', 'precio costo', 'cost', 'precio',
    'p u', 'pu', 'p_u', 'p.u.', 'valor', 'importe', 'costo_promedio'
  ],
  unit: [
    'unidad', 'ud', 'u m', 'um', 'u_m', 'medida', 'u.m.'
  ],
};

/**
 * Normalizes header string for comparison
 */
export function normalizeHeader(h: string): string {
  return normalizeText(String(h || ''));
}

function matchesPattern(normHeader: string, patternList: string[]): boolean {
  const compact = normHeader.replace(/\s+/g, '');
  return patternList.some((pat) => {
    const normPat = normalizeText(pat);
    const compactPat = normPat.replace(/\s+/g, '');
    return normHeader === normPat || normHeader.includes(normPat) || compact === compactPat;
  });
}

/**
 * Automatically maps raw sheet headers to target keys based on synonyms
 */
export function detectProductHeaders(headers: string[]): Record<ProductColumnKey, string | null> {
  const result: Record<ProductColumnKey, string | null> = {
    code: null,
    barcode: null,
    description: null,
    unit: null,
  };

  const normHeaders = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }));

  // Check barcode first because it often contains 'codigo'
  for (const item of normHeaders) {
    if (matchesPattern(item.norm, PRODUCT_HEADER_PATTERNS.barcode)) {
      result.barcode = item.original;
      break;
    }
  }

  // Check code (excluding the one matched for barcode)
  for (const item of normHeaders) {
    if (item.original === result.barcode) continue;
    if (matchesPattern(item.norm, PRODUCT_HEADER_PATTERNS.code)) {
      result.code = item.original;
      break;
    }
  }

  // Check description
  for (const item of normHeaders) {
    if (item.original === result.barcode || item.original === result.code) continue;
    if (matchesPattern(item.norm, PRODUCT_HEADER_PATTERNS.description)) {
      result.description = item.original;
      break;
    }
  }

  // Check unit
  for (const item of normHeaders) {
    if (
      item.original === result.barcode ||
      item.original === result.code ||
      item.original === result.description
    )
      continue;
    if (matchesPattern(item.norm, PRODUCT_HEADER_PATTERNS.unit)) {
      result.unit = item.original;
      break;
    }
  }

  return result;
}

/**
 * Automatically maps raw sheet headers to stock report keys
 */
export function detectStockHeaders(headers: string[]): Record<StockColumnKey, string | null> {
  const result: Record<StockColumnKey, string | null> = {
    code: null,
    barcode: null,
    description: null,
    systemStock: null,
    cost: null,
    unit: null,
  };

  const normHeaders = headers.map((h) => ({ original: h, norm: normalizeHeader(h) }));

  // Check barcode first
  for (const item of normHeaders) {
    if (matchesPattern(item.norm, STOCK_HEADER_PATTERNS.barcode)) {
      result.barcode = item.original;
      break;
    }
  }

  // Check code
  for (const item of normHeaders) {
    if (item.original === result.barcode) continue;
    if (matchesPattern(item.norm, STOCK_HEADER_PATTERNS.code)) {
      result.code = item.original;
      break;
    }
  }

  // Check description
  for (const item of normHeaders) {
    if (item.original === result.barcode || item.original === result.code) continue;
    if (matchesPattern(item.norm, STOCK_HEADER_PATTERNS.description)) {
      result.description = item.original;
      break;
    }
  }

  // Check stock
  for (const item of normHeaders) {
    if (
      item.original === result.code ||
      item.original === result.barcode ||
      item.original === result.description
    )
      continue;
    if (matchesPattern(item.norm, STOCK_HEADER_PATTERNS.systemStock)) {
      result.systemStock = item.original;
      break;
    }
  }

  // Check cost
  for (const item of normHeaders) {
    if (
      item.original === result.code ||
      item.original === result.barcode ||
      item.original === result.description ||
      item.original === result.systemStock
    )
      continue;
    if (matchesPattern(item.norm, STOCK_HEADER_PATTERNS.cost)) {
      result.cost = item.original;
      break;
    }
  }

  // Check unit
  for (const item of normHeaders) {
    if (
      item.original === result.code ||
      item.original === result.barcode ||
      item.original === result.description ||
      item.original === result.systemStock ||
      item.original === result.cost
    )
      continue;
    if (matchesPattern(item.norm, STOCK_HEADER_PATTERNS.unit)) {
      result.unit = item.original;
      break;
    }
  }

  return result;
}

/**
 * Always preserves codes and barcodes as strings, retaining leading zeroes!
 */
export function sanitizeTextValue(val: unknown): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  return str;
}

/**
 * Parses raw ArrayBuffer / binary into raw row objects and header names with:
 * - Multi-sheet detection
 * - Automatic title/header row offset detection (skipping company banners, dates, blank top rows)
 * - Trailing blank row filtering
 * - Semicolon/comma CSV single-column auto-split
 */
export function readWorkbookRaw(buffer: ArrayBuffer, selectedSheet?: string): {
  headers: string[];
  rawRows: Record<string, string>[];
  sheetNames: string[];
  currentSheet: string;
} {
  const wb = XLSX.read(buffer, { type: 'array', raw: false, cellText: true });
  const sheetNames = wb.SheetNames || [];
  if (sheetNames.length === 0) {
    return { headers: [], rawRows: [], sheetNames: [], currentSheet: '' };
  }

  // Find target sheet: either selected by user, or sheet with most data rows
  let targetSheetName = selectedSheet && sheetNames.includes(selectedSheet) ? selectedSheet : '';
  if (!targetSheetName) {
    let maxRows = -1;
    for (const name of sheetNames) {
      const s = wb.Sheets[name];
      if (!s) continue;
      const ref = s['!ref'];
      if (!ref) {
        if (maxRows === -1) {
          targetSheetName = name;
        }
        continue;
      }
      const range = XLSX.utils.decode_range(ref);
      const rowCount = range.e.r - range.s.r + 1;
      if (rowCount > maxRows) {
        maxRows = rowCount;
        targetSheetName = name;
      }
    }
  }

  if (!targetSheetName) {
    targetSheetName = sheetNames[0];
  }

  const ws = wb.Sheets[targetSheetName];
  if (!ws) {
    return { headers: [], rawRows: [], sheetNames, currentSheet: targetSheetName };
  }

  // Read as 2D array of strings to find real header row
  let matrix: string[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: '',
  });

  if (matrix.length === 0) {
    return { headers: [], rawRows: [], sheetNames, currentSheet: targetSheetName };
  }

  // Check if CSV with semicolons was parsed as single columns
  if (matrix.length > 0 && matrix[0] && matrix[0].length === 1 && matrix[0][0].includes(';')) {
    matrix = matrix.map((row) => (row[0] || '').split(';'));
  }

  // Known keywords that indicate a header row
  const headerClues = [
    'codigo', 'cod', 'clave', 'cve', 'clv', 'articulo', 'art', 'sku', 'barras',
    'barcode', 'upc', 'ean', 'descripcion', 'desc', 'descr', 'concepto', 'producto',
    'nom', 'nombre', 'unidad', 'medida', 'existencia', 'stock', 'cantidad', 'cant',
    'saldo', 'costo', 'precio', 'pu', 'p.u', 'valor'
  ];

  let bestHeaderRowIdx = 0;
  let bestClueMatches = -1;

  // Scan first 30 rows to find the row that has the most column header clues
  const scanLimit = Math.min(matrix.length, 30);
  for (let r = 0; r < scanLimit; r++) {
    const row = matrix[r];
    if (!row || row.length === 0) continue;

    let matches = 0;
    for (const cell of row) {
      const normCell = normalizeHeader(cell);
      if (normCell && headerClues.some((clue) => normCell === clue || normCell.includes(clue))) {
        matches++;
      }
    }

    if (matches > bestClueMatches && matches >= 1) {
      bestClueMatches = matches;
      bestHeaderRowIdx = r;
    }
  }

  // Calculate max columns to avoid dropping right-hand columns
  const headerRow = matrix[bestHeaderRowIdx] || [];
  const sampleScan = matrix.slice(bestHeaderRowIdx, bestHeaderRowIdx + 50);
  const maxCols = Math.max(headerRow.length, ...sampleScan.map((r) => r?.length || 0));

  const headers: string[] = [];
  const headerMap: { index: number; name: string }[] = [];

  for (let colIdx = 0; colIdx < maxCols; colIdx++) {
    const cell = headerRow[colIdx];
    const trimmed = String(cell || '').trim();
    if (trimmed) {
      headers.push(trimmed);
      headerMap.push({ index: colIdx, name: trimmed });
    } else {
      const colLetter = XLSX.utils.encode_col(colIdx);
      const fallbackName = `Columna_${colLetter}`;
      headers.push(fallbackName);
      headerMap.push({ index: colIdx, name: fallbackName });
    }
  }

  // Extract data rows below the header row
  const rawRows: Record<string, string>[] = [];
  for (let r = bestHeaderRowIdx + 1; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    // Check if row is completely empty
    const hasAnyValue = row.some((val) => String(val || '').trim().length > 0);
    if (!hasAnyValue) continue;

    const rowObj: Record<string, string> = {};
    for (const { index, name } of headerMap) {
      rowObj[name] = String(row[index] || '').trim();
    }
    rawRows.push(rowObj);
  }

  return { headers, rawRows, sheetNames, currentSheet: targetSheetName };
}

/**
 * Validates and transforms raw product rows according to resolved mapping
 */
export function processProductImport(
  rawRows: Record<string, string>[],
  mapping: Record<ProductColumnKey, string | null>
): {
  summary: ImportSummary;
  validProducts: ProductItem[];
} {
  const validProducts: ProductItem[] = [];
  const sampleRows: ImportSummary['sampleRows'] = [];
  const errorList: ImportSummary['errorList'] = [];
  const seenCodes = new Set<string>();
  let duplicateCodes = 0;

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2; // assuming row 1 is header
    const rawCode = mapping.code ? sanitizeTextValue(row[mapping.code]) : '';
    const rawBarcode = mapping.barcode ? sanitizeTextValue(row[mapping.barcode]) : '';
    const rawDescription = mapping.description ? sanitizeTextValue(row[mapping.description]) : '';
    const rawUnit = mapping.unit ? sanitizeTextValue(row[mapping.unit]) : '';

    const errors: string[] = [];
    if (!rawCode) {
      errors.push('Falta el Código del producto');
    }
    if (!rawDescription) {
      errors.push('Falta la Descripción del producto');
    }

    if (rawCode && seenCodes.has(rawCode)) {
      duplicateCodes++;
    } else if (rawCode) {
      seenCodes.add(rawCode);
    }

    const isValid = errors.length === 0;

    if (isValid) {
      validProducts.push({
        code: rawCode,
        barcode: rawBarcode || rawCode, // fallback to code if no barcode provided
        description: rawDescription,
        unit: rawUnit || 'pza',
      });
    } else {
      errorList.push({
        rowNumber,
        raw: row,
        errors,
      });
    }

    if (idx < 5) {
      sampleRows.push({
        rowNumber,
        data: {
          Código: rawCode,
          'Código de barras': rawBarcode,
          Descripción: rawDescription,
          Unidad: rawUnit || 'pza',
        },
        isValid,
        errors,
      });
    }
  });

  return {
    summary: {
      totalRows: rawRows.length,
      validRows: validProducts.length,
      errorRows: errorList.length,
      duplicateCodes,
      sampleRows,
      errorList,
    },
    validProducts,
  };
}

/**
 * Validates and transforms raw stock report rows
 */
export function processStockImport(
  rawRows: Record<string, string>[],
  mapping: Record<StockColumnKey, string | null>,
  existingProductCodes: Set<string>
): {
  summary: ImportSummary;
  validStock: SystemStockItem[];
  unmatchedCodes: string[];
} {
  const validStock: SystemStockItem[] = [];
  const sampleRows: ImportSummary['sampleRows'] = [];
  const errorList: ImportSummary['errorList'] = [];
  const unmatchedCodes: string[] = [];
  const seenCodes = new Set<string>();
  let duplicateCodes = 0;
  const now = new Date().toISOString();

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const rawCode = mapping.code ? sanitizeTextValue(row[mapping.code]) : '';
    const rawStockStr = mapping.systemStock ? sanitizeTextValue(row[mapping.systemStock]) : '0';
    const rawCostStr = mapping.cost ? sanitizeTextValue(row[mapping.cost]) : '0';
    const rawUnit = mapping.unit ? sanitizeTextValue(row[mapping.unit]) : '';

    const errors: string[] = [];
    if (!rawCode) {
      errors.push('Falta el Código del producto');
    }

    const parsedStock = parseFloat(rawStockStr.replace(/[^0-9.-]/g, ''));
    if (isNaN(parsedStock)) {
      errors.push(`Existencia inválida: "${rawStockStr}"`);
    }

    const parsedCost = parseFloat(rawCostStr.replace(/[^0-9.-]/g, '')) || 0;

    if (rawCode && seenCodes.has(rawCode)) {
      duplicateCodes++;
    } else if (rawCode) {
      seenCodes.add(rawCode);
    }

    if (rawCode && existingProductCodes.size > 0 && !existingProductCodes.has(rawCode)) {
      unmatchedCodes.push(rawCode);
    }

    const rawBarcode = mapping.barcode
      ? sanitizeTextValue(row[mapping.barcode])
      : sanitizeTextValue(row['Codigo de barras'] || row['codigo de barras'] || row['barcode'] || row['barras'] || '');
    const rawDescription = mapping.description
      ? sanitizeTextValue(row[mapping.description])
      : sanitizeTextValue(row['Descripcion'] || row['descripcion'] || row['nombre'] || row['concepto'] || '');

    const isValid = errors.length === 0;

    if (isValid) {
      validStock.push({
        code: rawCode,
        barcode: rawBarcode || rawCode,
        description: rawDescription,
        systemStock: isNaN(parsedStock) ? 0 : parsedStock,
        cost: parsedCost,
        unit: rawUnit || 'pza',
        importedAt: now,
      });
    } else {
      errorList.push({
        rowNumber,
        raw: row,
        errors,
      });
    }

    if (idx < 5) {
      sampleRows.push({
        rowNumber,
        data: {
          Código: rawCode,
          Descripción: rawDescription || '(Sin descripción)',
          Existencia: rawStockStr,
          Costo: rawCostStr,
          Unidad: rawUnit || 'pza',
        },
        isValid,
        errors,
      });
    }
  });

  return {
    summary: {
      totalRows: rawRows.length,
      validRows: validStock.length,
      errorRows: errorList.length,
      duplicateCodes,
      sampleRows,
      errorList,
    },
    validStock,
    unmatchedCodes,
  };
}

/**
 * Creates empty Excel template for "Base de productos"
 */
export function generateProductTemplateWorkbook(): Uint8Array {
  const wb = XLSX.utils.book_new();
  const sampleData = [
    {
      Código: '00101',
      'Código de barras': '7501234567890',
      Descripción: 'Martillo de uña curva 16 oz Truper',
      Unidad: 'pza',
    },
    {
      Código: '00102',
      'Código de barras': '7501234567891',
      Descripción: 'Clavo con cabeza 2 1/2 pulgada',
      Unidad: 'kg',
    },
    {
      Código: '00103',
      'Código de barras': '7501234567892',
      Descripción: 'Tubo PVC hidráulico 1/2 pulg 6m',
      Unidad: 'tramo',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sampleData);
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Base Productos');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

/**
 * Creates empty Excel template for "Existencias del sistema"
 */
export function generateStockTemplateWorkbook(): Uint8Array {
  const wb = XLSX.utils.book_new();
  const sampleData = [
    {
      Código: '00101',
      Existencia: 24,
      Costo: 185.5,
      Unidad: 'pza',
    },
    {
      Código: '00102',
      Existencia: 50,
      Costo: 38.0,
      Unidad: 'kg',
    },
    {
      Código: '00103',
      Existencia: 15,
      Costo: 95.0,
      Unidad: 'tramo',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(sampleData);
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Existencias');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

/**
 * Generates an Excel file containing all error rows for download
 */
export function generateErrorReportWorkbook(
  errors: ImportSummary['errorList'],
  reportName = 'Errores_Importacion'
): Uint8Array {
  const wb = XLSX.utils.book_new();
  const flatData = errors.map((item) => ({
    'Fila Original': item.rowNumber,
    'Errores Detectados': item.errors.join('; '),
    ...item.raw,
  }));
  const ws = XLSX.utils.json_to_sheet(flatData);
  XLSX.utils.book_append_sheet(wb, ws, reportName);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
