import * as XLSX from 'xlsx';
import {
  CaptureItem,
  ProductItem,
  SystemStockItem,
  UnidentifiedItem,
  ZoneItem,
  ProductSummary,
  InventoryHistorySession,
} from '../types/inventory';
import { computeGeneralInventoryProgress } from './inventoryCalculations';

export interface ExportDataPayload {
  captures: CaptureItem[];
  products: ProductItem[];
  systemStock: SystemStockItem[];
  unidentified: UnidentifiedItem[];
  zones: ZoneItem[];
  recountCodes?: Set<string>;
  counterNames?: string[];
  stockImportDate?: string;
  inventoryStartTime?: string;
  inventoryEndTime?: string;
  historySessions?: InventoryHistorySession[];
}

/**
 * Classifies a capture zone as 'tapanco' (Bodega, Tapanco, Mezzanine, Pasillo alto)
 * or 'autoservicio' (Piso de venta, Mostrador, Exhibición, Anaquel).
 */
export function classifyCaptureZoneType(
  zoneName?: string,
  zoneType?: string
): 'tapanco' | 'autoservicio' {
  if (zoneType === 'autoservicio') return 'autoservicio';
  if (zoneType === 'bodega') return 'tapanco';

  const text = (zoneName || '').toLowerCase();
  if (
    text.includes('autoservicio') ||
    text.includes('piso') ||
    text.includes('exhibicion') ||
    text.includes('exhibición') ||
    text.includes('mostrador') ||
    text.includes('anaquel') ||
    text.includes('tienda')
  ) {
    return 'autoservicio';
  }

  // Default: Tapanco, Bodega, Almacén, Mezzanine, Pasillo
  return 'tapanco';
}

/**
 * Computes consolidated product summaries comparing physical count vs system stock
 */
export function buildProductSummaries(
  products: ProductItem[],
  systemStock: SystemStockItem[],
  captures: CaptureItem[],
  recountCodes: Set<string> = new Set(),
  zones: ZoneItem[] = []
): ProductSummary[] {
  const zoneMap = new Map<string, ZoneItem>();
  if (Array.isArray(zones)) {
    for (const z of zones) {
      zoneMap.set(z.id, z);
    }
  }

  // Aggregate physical count per product code, broken down by Tapanco and Autoservicio
  const countedByCode = new Map<string, number>();
  const tapancoByCode = new Map<string, number>();
  const autoByCode = new Map<string, number>();

  for (const cap of captures) {
    const qty = cap.quantity || 0;
    const curr = countedByCode.get(cap.code) || 0;
    countedByCode.set(cap.code, curr + qty);

    const zone = zoneMap.get(cap.zoneId);
    const zType = zone?.type;
    const zName = cap.zoneName || zone?.name || '';
    const zoneCategory = classifyCaptureZoneType(zName, zType);

    if (zoneCategory === 'autoservicio') {
      autoByCode.set(cap.code, (autoByCode.get(cap.code) || 0) + qty);
    } else {
      tapancoByCode.set(cap.code, (tapancoByCode.get(cap.code) || 0) + qty);
    }
  }

  const stockMap = new Map<string, SystemStockItem>();
  for (const st of systemStock) {
    stockMap.set(st.code, st);
  }

  // Group catalog products by code (one product can have multiple barcodes)
  const productMap = new Map<string, ProductItem>();
  for (const p of products) {
    if (!productMap.has(p.code)) {
      productMap.set(p.code, p);
    }
  }

  // Collect all unique codes across catalog, system stock, and captures
  const allCodes = new Set<string>([
    ...products.map((p) => p.code),
    ...systemStock.map((s) => s.code),
    ...captures.map((c) => c.code),
  ]);

  const summaries: ProductSummary[] = [];

  for (const code of allCodes) {
    const prod = productMap.get(code);
    const stock = stockMap.get(code);
    const counted = countedByCode.get(code) || 0;
    const tapanco = tapancoByCode.get(code) || 0;
    const auto = autoByCode.get(code) || 0;
    const system = stock ? stock.systemStock : 0;
    const cost = stock ? stock.cost : 0;
    const diff = counted - system;
    const diffValue = diff * cost;
    const capItem = captures.find((c) => c.code === code && (c.description || c.barcode));
    const unit = prod?.unit || stock?.unit || capItem?.unit || 'pza';
    const barcode = prod?.barcode || stock?.barcode || capItem?.barcode || code;
    const description = prod?.description || stock?.description || capItem?.description || `Artículo ${code}`;

    let status: ProductSummary['status'] = 'sin_contar';

    if (!stock) {
      status = 'no_esperado';
    } else if (counted === 0) {
      status = 'sin_contar';
    } else if (counted === system) {
      status = 'completo';
    } else if (counted < system) {
      status = 'faltante';
    } else {
      status = 'excedente';
    }

    summaries.push({
      code,
      barcode,
      description,
      unit,
      systemStock: system,
      countedStock: counted,
      tapancoCount: tapanco,
      autoservicioCount: auto,
      difference: diff,
      cost,
      differenceValue: diffValue,
      status,
      isMarkedForRecount: recountCodes.has(code),
    });
  }

  return summaries.sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Builds the complete 7-sheet workbook requested by Construrama Alce
 */
export function generateInventoryWorkbook(payload: ExportDataPayload): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const summaries = buildProductSummaries(
    payload.products,
    payload.systemStock,
    payload.captures,
    payload.recountCodes,
    payload.zones
  );

  // a) "Detalle"
  const detalleRows = payload.captures.map((cap) => ({
    Zona: cap.zoneName,
    Código: cap.code,
    'Código de barras': cap.barcode,
    Descripción: cap.description,
    Unidad: cap.unit,
    Cantidad: cap.quantity,
    'Fecha y hora de captura': cap.timestamp,
    'Nombre de quien contó': cap.counterName,
    Reconteo: cap.isRecount ? 'Sí' : 'No',
  }));
  const wsDetalle = XLSX.utils.json_to_sheet(detalleRows);
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle');

  // b) "Acumulado general"
  const generalMap = new Map<
    string,
    { code: string; barcode: string; description: string; tapanco: number; autoservicio: number; total: number; unit: string }
  >();
  for (const cap of payload.captures) {
    const zone = payload.zones?.find((z) => z.id === cap.zoneId);
    const zCat = classifyCaptureZoneType(cap.zoneName || zone?.name, zone?.type);
    const existing = generalMap.get(cap.code);
    const qty = cap.quantity || 0;
    if (existing) {
      existing.total += qty;
      if (zCat === 'autoservicio') {
        existing.autoservicio += qty;
      } else {
        existing.tapanco += qty;
      }
    } else {
      generalMap.set(cap.code, {
        code: cap.code,
        barcode: cap.barcode,
        description: cap.description,
        tapanco: zCat === 'tapanco' ? qty : 0,
        autoservicio: zCat === 'autoservicio' ? qty : 0,
        total: qty,
        unit: cap.unit,
      });
    }
  }
  const generalRows = Array.from(generalMap.values())
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((g) => ({
      Código: g.code,
      'Código de barras': g.barcode,
      Descripción: g.description,
      'Contado Tapanco / Bodega': g.tapanco,
      'Contado Autoservicio / Piso': g.autoservicio,
      'Cantidad total': g.total,
      Unidad: g.unit,
    }));
  const wsGeneral = XLSX.utils.json_to_sheet(generalRows);
  XLSX.utils.book_append_sheet(wb, wsGeneral, 'Acumulado general');

  // c) "Acumulado por zona"
  const zoneMap = new Map<string, { zoneName: string; code: string; description: string; quantity: number; unit: string }>();
  for (const cap of payload.captures) {
    const key = `${cap.zoneId}_${cap.code}`;
    const existing = zoneMap.get(key);
    if (existing) {
      existing.quantity += cap.quantity;
    } else {
      zoneMap.set(key, {
        zoneName: cap.zoneName,
        code: cap.code,
        description: cap.description,
        quantity: cap.quantity,
        unit: cap.unit,
      });
    }
  }
  const zoneRows = Array.from(zoneMap.values())
    .sort((a, b) => a.zoneName.localeCompare(b.zoneName) || a.code.localeCompare(b.code))
    .map((z) => ({
      Zona: z.zoneName,
      Código: z.code,
      Descripción: z.description,
      Cantidad: z.quantity,
      Unidad: z.unit,
    }));
  const wsZone = XLSX.utils.json_to_sheet(zoneRows);
  XLSX.utils.book_append_sheet(wb, wsZone, 'Acumulado por zona');

  // d) "Diferencias"
  const diffRows = summaries.map((s) => ({
    Código: s.code,
    'Código de barras': s.barcode,
    Descripción: s.description,
    'Existencia sistema': s.systemStock,
    'Contado Tapanco / Bodega': s.tapancoCount || 0,
    'Contado Autoservicio / Piso': s.autoservicioCount || 0,
    'Total Contado': s.countedStock,
    Diferencia: s.difference,
    Costo: s.cost,
    'Valor de la diferencia': s.differenceValue,
    Estado: s.status,
    Reconteo: s.isMarkedForRecount ? 'Requerido' : 'Normal',
  }));
  const wsDiff = XLSX.utils.json_to_sheet(diffRows);
  XLSX.utils.book_append_sheet(wb, wsDiff, 'Diferencias');

  // e) "Faltantes", "Sobrantes" y "No esperados"
  const faltantesRows = summaries
    .filter((s) => s.status === 'faltante')
    .map((s) => ({
      Código: s.code,
      Descripción: s.description,
      'Existencia sistema': s.systemStock,
      'Contado Tapanco / Bodega': s.tapancoCount || 0,
      'Contado Autoservicio / Piso': s.autoservicioCount || 0,
      'Total Contado': s.countedStock,
      'Faltante (piezas)': Math.abs(s.difference),
      Costo: s.cost,
      'Valor del faltante': Math.abs(s.differenceValue),
    }));
  const wsFaltantes = XLSX.utils.json_to_sheet(faltantesRows);
  XLSX.utils.book_append_sheet(wb, wsFaltantes, 'Faltantes');

  const sobrantesRows = summaries
    .filter((s) => s.status === 'excedente')
    .map((s) => ({
      Código: s.code,
      Descripción: s.description,
      'Existencia sistema': s.systemStock,
      'Contado Tapanco / Bodega': s.tapancoCount || 0,
      'Contado Autoservicio / Piso': s.autoservicioCount || 0,
      'Total Contado': s.countedStock,
      'Sobrante (piezas)': s.difference,
      Costo: s.cost,
      'Valor del sobrante': s.differenceValue,
    }));
  const wsSobrantes = XLSX.utils.json_to_sheet(sobrantesRows);
  XLSX.utils.book_append_sheet(wb, wsSobrantes, 'Sobrantes');

  const noEsperadosRows = summaries
    .filter((s) => s.status === 'no_esperado')
    .map((s) => ({
      Código: s.code,
      Descripción: s.description,
      Contado: s.countedStock,
      Unidad: s.unit,
      Costo: s.cost,
      Nota: 'Producto contado sin existencia registrada en sistema',
    }));
  const wsNoEsperados = XLSX.utils.json_to_sheet(noEsperadosRows);
  XLSX.utils.book_append_sheet(wb, wsNoEsperados, 'No esperados');

  // f) "No identificados"
  const unidRows = payload.unidentified.map((u) => ({
    ID: u.id,
    Zona: u.zoneName,
    Nota: u.note,
    'Foto asociada': u.photoBase64 ? 'Foto capturada (ver en app)' : 'Sin foto',
    Cantidad: u.quantity,
    Unidad: u.unit,
    'Fecha y hora': u.timestamp,
    Contador: u.counterName,
    'Código resuelto': u.resolvedCode || 'Pendiente',
  }));
  const wsUnid = XLSX.utils.json_to_sheet(unidRows);
  XLSX.utils.book_append_sheet(wb, wsUnid, 'No identificados');

  // g) "Resumen"
  const counters = Array.from(
    new Set([
      ...payload.captures.map((c) => c.counterName),
      ...payload.unidentified.map((u) => u.counterName),
      ...(payload.counterNames || []),
    ].filter(Boolean))
  );

  const zonesList = payload.zones.map((z) => `${z.name} (${z.status})`).join('; ');
  const totalCountedPieces = payload.captures.reduce((acc, c) => acc + c.quantity, 0);
  const totalSystemPieces = payload.systemStock.reduce((acc, s) => acc + s.systemStock, 0);

  const totalFaltantesVal = summaries
    .filter((s) => s.status === 'faltante')
    .reduce((acc, s) => acc + Math.abs(s.differenceValue), 0);

  const totalSobrantesVal = summaries
    .filter((s) => s.status === 'excedente')
    .reduce((acc, s) => acc + s.differenceValue, 0);

  const totalNetDiffVal = summaries.reduce((acc, s) => acc + s.differenceValue, 0);

  const completedCount = summaries.filter((s) => s.status === 'completo').length;
  const totalProducts = summaries.length;
  const pctComplete = totalProducts > 0 ? ((completedCount / totalProducts) * 100).toFixed(1) : '0';

  const globalProgress = computeGeneralInventoryProgress(
    summaries,
    payload.captures,
    payload.systemStock,
    payload.historySessions
  );

  const resumenData = [
    { Métrica: 'Empresa', Valor: 'Construrama Alce' },
    { Métrica: 'Responsable', Valor: 'Ing Abimael' },
    { Métrica: 'Contadores participantes', Valor: counters.join(', ') || 'N/A' },
    { Métrica: 'Zonas registradas', Valor: zonesList || 'N/A' },
    { Métrica: 'Avance global acumulado (% piezas)', Valor: `${globalProgress.pctProgressPieces.toFixed(1)}%` },
    { Métrica: 'Avance global acumulado (piezas contadas)', Valor: `${globalProgress.totalCountedPieces.toLocaleString()} / ${globalProgress.totalSystemPieces.toLocaleString()}` },
    { Métrica: 'Avance global acumulado (% catálogo)', Valor: `${globalProgress.pctProgressProducts.toFixed(1)}% (${globalProgress.totalCountedProducts} de ${globalProgress.totalCatalogProducts} artículos)` },
    { Métrica: 'Lotes / Sesiones en historial', Valor: payload.historySessions ? payload.historySessions.length : 0 },
    { Métrica: 'Total de capturas en este archivo', Valor: payload.captures.length },
    { Métrica: 'Total de piezas contadas en este lote', Valor: totalCountedPieces },
    { Métrica: 'Total de piezas teóricas (sistema)', Valor: totalSystemPieces },
    { Métrica: 'Diferencia neta en piezas', Valor: totalCountedPieces - totalSystemPieces },
    { Métrica: 'Total de productos catalogados', Valor: totalProducts },
    { Métrica: 'Productos completos (% exacto)', Valor: `${completedCount} (${pctComplete}%)` },
    { Métrica: 'Productos con faltante', Valor: summaries.filter((s) => s.status === 'faltante').length },
    { Métrica: 'Productos con sobrante', Valor: summaries.filter((s) => s.status === 'excedente').length },
    { Métrica: 'Productos no esperados', Valor: summaries.filter((s) => s.status === 'no_esperado').length },
    { Métrica: 'Artículos no identificados', Valor: payload.unidentified.length },
    { Métrica: 'Artículos marcados para reconteo', Valor: payload.recountCodes?.size || 0 },
    { Métrica: 'Valor económico de faltantes ($ MXN)', Valor: `$${totalFaltantesVal.toFixed(2)}` },
    { Métrica: 'Valor económico de sobrantes ($ MXN)', Valor: `$${totalSobrantesVal.toFixed(2)}` },
    { Métrica: 'Impacto financiero neto ($ MXN)', Valor: `$${totalNetDiffVal.toFixed(2)}` },
    { Métrica: 'Fecha reporte de existencias', Valor: payload.stockImportDate || 'N/A' },
    { Métrica: 'Inicio de toma física', Valor: payload.inventoryStartTime || 'N/A' },
    { Métrica: 'Cierre de toma física', Valor: payload.inventoryEndTime || 'N/A' },
    { Métrica: 'Fecha de generación de archivo', Valor: new Date().toLocaleString('es-MX') },
  ];

  const wsResumen = XLSX.utils.json_to_sheet(resumenData);
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  return wb;
}

/**
 * Returns formatted file name: Inventario_Construrama_Alce_AAAA-MM-DD.xlsx
 */
export function getExportFileName(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  return `Inventario_Construrama_Alce_${yyyy}-${mm}-${dd}.xlsx`;
}

/**
 * Writes workbook to binary Uint8Array
 */
export function exportToBuffer(wb: XLSX.WorkBook): Uint8Array {
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
