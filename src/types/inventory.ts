export type CountingMode = 'guiado' | 'ciego';

export type ZoneStatus = 'pendiente' | 'en_conteo' | 'terminada';

export interface ProductItem {
  code: string;
  barcode: string;
  description: string;
  unit: string;
}

export interface SystemStockItem {
  code: string;
  barcode?: string;
  description?: string;
  systemStock: number;
  cost: number;
  unit: string;
  importedAt: string;
}

export type ZoneType = 'bodega' | 'autoservicio' | 'general';

export interface ZoneItem {
  id: string;
  name: string;
  type?: ZoneType;
  status: ZoneStatus;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export interface BodegaOriginInfo {
  zoneId: string;
  zoneName: string;
  quantity: number;
}

export interface AutoservicioBalance {
  code: string;
  barcode: string;
  description: string;
  unit: string;
  systemStock: number;
  bodegaCount: number;
  autoservicioCount: number;
  targetToFindInAutoservicio: number; // systemStock - bodegaCount (min 0)
  remainingToFind: number; // target - autoservicioCount (min 0)
  totalCounted: number; // bodegaCount + autoservicioCount
  difference: number; // totalCounted - systemStock
  status: 'bodega_completa' | 'pendiente' | 'completado' | 'excedente';
  sourceZones?: BodegaOriginInfo[];
  primarySourceZoneName?: string;
  isCountedInBodega?: boolean;
}


export interface CaptureItem {
  id: string; // Unique UUID
  zoneId: string;
  zoneName: string;
  code: string;
  barcode: string;
  description: string;
  unit: string;
  quantity: number;
  timestamp: string;
  counterName: string;
  isRecount?: boolean;
}

export interface UnidentifiedItem {
  id: string;
  zoneId: string;
  zoneName: string;
  photoBase64?: string;
  note: string;
  quantity: number;
  unit: string;
  timestamp: string;
  counterName: string;
  resolvedCode?: string;
}

export interface RecountItem {
  code: string;
  markedAt: string;
  reason?: string;
  resolved?: boolean;
}

export interface ProductSummary {
  code: string;
  barcode: string;
  description: string;
  unit: string;
  systemStock: number;
  countedStock: number;
  difference: number;
  cost: number;
  differenceValue: number;
  status: 'sin_contar' | 'faltante' | 'completo' | 'excedente' | 'no_esperado';
  isMarkedForRecount: boolean;
  tapancoCount?: number;
  autoservicioCount?: number;
}

export interface ImportPreviewRow {
  rowNumber: number;
  data: Record<string, string>;
  isValid: boolean;
  errors: string[];
}

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateCodes: number;
  sampleRows: ImportPreviewRow[];
  errorList: { rowNumber: number; raw: Record<string, string>; errors: string[] }[];
}

export interface AIIdentificationResult {
  nombre: string;
  marca: string;
  medida: string;
  tipo: string;
  descripcionSugerida: string;
  palabrasClave: string[];
}

export interface BodegaOriginInfo {
  zoneId: string;
  zoneName: string;
  quantity: number;
}

export interface AutoservicioBalance {
  code: string;
  barcode: string;
  description: string;
  unit: string;
  systemStock: number;
  bodegaCount: number;
  autoservicioCount: number;
  targetToFindInAutoservicio: number;
  remainingToFind: number;
  totalCounted: number;
  difference: number;
  status: 'pendiente' | 'completado' | 'excedente' | 'bodega_completa';
  sourceZones?: BodegaOriginInfo[];
  primarySourceZoneName?: string;
  isCountedInBodega?: boolean;
  isUncountedInBodega?: boolean;
  isFullInBodega?: boolean;
  isCompletedInAuto?: boolean;
  isPendingInAuto?: boolean;
}

export interface InventoryHistorySession {
  id: string;
  name: string;
  createdAt: string;
  closedAt: string;
  closedBy: string;
  notes?: string;
  totalCapturesCount: number;
  totalPiecesCounted: number;
  totalCountedProducts: number;
  totalExactProducts: number;
  totalFaltantesProducts: number;
  totalSobrantesProducts: number;
  totalFaltantesPieces: number;
  totalSobrantesPieces: number;
  totalFaltantesValue: number;
  totalSobrantesValue: number;
  netFinancialImpact: number;
  accuracyRatePct: number;
  capturesSnapshot: CaptureItem[];
  summariesSnapshot: ProductSummary[];
  systemStockSnapshot?: SystemStockItem[];
}
