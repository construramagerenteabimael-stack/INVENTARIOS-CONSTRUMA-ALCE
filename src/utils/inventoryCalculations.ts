import {
  ProductSummary,
  CaptureItem,
  SystemStockItem,
  InventoryHistorySession,
} from '../types/inventory';

export interface CountedDifferencesMetrics {
  totalCountedProducts: number;
  countedFaltantes: ProductSummary[];
  countedSobrantes: ProductSummary[];
  countedExactos: ProductSummary[];
  totalFaltantesValue: number;
  totalSobrantesValue: number;
  totalFaltantesPieces: number;
  totalSobrantesPieces: number;
  netFinancialImpact: number;
}

export interface GeneralInventoryProgress {
  totalCountedPieces: number;
  totalSystemPieces: number;
  pctProgressPieces: number;
  totalCountedProducts: number;
  totalCatalogProducts: number;
  pctProgressProducts: number;
  totalPendingPieces: number;
  totalPendingProducts: number;
  totalExactCountedProducts: number;
  historicalPieces: number;
  livePieces: number;
  historicalProductsCount: number;
  liveProductsCount: number;
  sessionsCount: number;
  isAccumulated: boolean;
}

/**
 * Combines all historical captures from archived sessions with current live captures.
 * Deduplicates by capture ID to prevent double counting.
 */
export function getAccumulatedCaptures(
  historySessions: InventoryHistorySession[] = [],
  liveCaptures: CaptureItem[] = [],
  excludeSessionId?: string | null
): CaptureItem[] {
  const seen = new Set<string>();
  const combined: CaptureItem[] = [];

  // 1. Historical sessions
  if (Array.isArray(historySessions)) {
    for (const session of historySessions) {
      if (excludeSessionId && session.id === excludeSessionId) {
        continue;
      }
      if (Array.isArray(session.capturesSnapshot)) {
        for (const cap of session.capturesSnapshot) {
          if (cap && cap.id && !seen.has(cap.id)) {
            seen.add(cap.id);
            combined.push(cap);
          } else if (cap && !cap.id) {
            combined.push(cap);
          }
        }
      }
    }
  }

  // 2. Current live captures
  if (Array.isArray(liveCaptures)) {
    for (const cap of liveCaptures) {
      if (cap && cap.id && !seen.has(cap.id)) {
        seen.add(cap.id);
        combined.push(cap);
      } else if (cap && !cap.id) {
        combined.push(cap);
      }
    }
  }

  return combined;
}

/**
 * Computes differences summary strictly for products that have been counted (countedStock > 0).
 * Prevents uncounted catalog items from polluting the differences report as false shortages.
 */
export function computeCountedDifferencesMetrics(
  summaries: ProductSummary[]
): CountedDifferencesMetrics {
  const countedItems = summaries.filter((s) => s.countedStock > 0);

  const countedFaltantes = countedItems.filter((s) => s.difference < 0);
  const countedSobrantes = countedItems.filter((s) => s.difference > 0);
  const countedExactos = countedItems.filter((s) => s.difference === 0);

  const totalFaltantesValue = countedFaltantes.reduce(
    (acc, s) => acc + Math.abs(s.differenceValue),
    0
  );
  const totalSobrantesValue = countedSobrantes.reduce(
    (acc, s) => acc + s.differenceValue,
    0
  );

  const totalFaltantesPieces = countedFaltantes.reduce(
    (acc, s) => acc + Math.abs(s.difference),
    0
  );
  const totalSobrantesPieces = countedSobrantes.reduce(
    (acc, s) => acc + s.difference,
    0
  );

  const netFinancialImpact = countedItems.reduce(
    (acc, s) => acc + s.differenceValue,
    0
  );

  return {
    totalCountedProducts: countedItems.length,
    countedFaltantes,
    countedSobrantes,
    countedExactos,
    totalFaltantesValue,
    totalSobrantesValue,
    totalFaltantesPieces,
    totalSobrantesPieces,
    netFinancialImpact,
  };
}

/**
 * Computes the overall progress percentage of the entire physical inventory.
 * Shows both progress by total units/pieces and by catalog products/SKUs.
 * When historySessions are provided, it maintains and accumulates all pieces and products
 * counted in past closed batches so progress never resets to 0% during an inventory campaign.
 */
export function computeGeneralInventoryProgress(
  summaries: ProductSummary[],
  captures: CaptureItem[],
  systemStock: SystemStockItem[],
  historySessions?: InventoryHistorySession[],
  excludeSessionId?: string | null
): GeneralInventoryProgress {
  const filteredSessions =
    excludeSessionId && Array.isArray(historySessions)
      ? historySessions.filter((s) => s.id !== excludeSessionId)
      : historySessions;

  // Combine historical sessions and current live captures
  const accumulatedCaps = getAccumulatedCaptures(filteredSessions || [], captures);

  const totalCountedPieces = accumulatedCaps.reduce((sum, c) => sum + (c.quantity || 0), 0);
  const livePieces = captures.reduce((sum, c) => sum + (c.quantity || 0), 0);
  const historicalPieces = Math.max(0, totalCountedPieces - livePieces);

  // Total theoretical pieces in system stock
  const systemPiecesFromStock = systemStock.reduce(
    (sum, s) => sum + (s.systemStock || 0),
    0
  );
  const systemPiecesFromSummaries = summaries.reduce(
    (sum, s) => sum + (s.systemStock || 0),
    0
  );
  const totalSystemPieces = Math.max(systemPiecesFromStock, systemPiecesFromSummaries);

  // Products with at least 1 count
  const countedCodes = new Set(
    accumulatedCaps.filter((c) => c.quantity > 0).map((c) => c.code)
  );
  const liveCodes = new Set(
    captures.filter((c) => c.quantity > 0).map((c) => c.code)
  );
  const historicalCodes = new Set<string>();
  if (Array.isArray(filteredSessions)) {
    for (const sess of filteredSessions) {
      if (Array.isArray(sess.capturesSnapshot)) {
        for (const cap of sess.capturesSnapshot) {
          if (cap && cap.quantity > 0) historicalCodes.add(cap.code);
        }
      }
    }
  }

  const totalCountedProducts = countedCodes.size;
  const totalCatalogProducts = summaries.length;

  const pctProgressPieces =
    totalSystemPieces > 0
      ? Math.min(100, Math.max(0, (totalCountedPieces / totalSystemPieces) * 100))
      : 0;

  const pctProgressProducts =
    totalCatalogProducts > 0
      ? Math.min(100, Math.max(0, (totalCountedProducts / totalCatalogProducts) * 100))
      : 0;

  const totalPendingPieces = Math.max(0, totalSystemPieces - totalCountedPieces);
  const totalPendingProducts = Math.max(0, totalCatalogProducts - totalCountedProducts);

  const totalExactCountedProducts = summaries.filter(
    (s) => s.countedStock > 0 && s.difference === 0
  ).length;

  const sessionsCount = historySessions?.length || 0;

  return {
    totalCountedPieces,
    totalSystemPieces,
    pctProgressPieces,
    totalCountedProducts,
    totalCatalogProducts,
    pctProgressProducts,
    totalPendingPieces,
    totalPendingProducts,
    totalExactCountedProducts,
    historicalPieces,
    livePieces,
    historicalProductsCount: historicalCodes.size,
    liveProductsCount: liveCodes.size,
    sessionsCount,
    isAccumulated: sessionsCount > 0,
  };
}

export interface CountedDashboardData {
  totalCountedProducts: number;
  totalExactProducts: number;
  totalFaltantesProducts: number;
  totalSobrantesProducts: number;
  accuracyRatePct: number;
  faltantesRatePct: number;
  sobrantesRatePct: number;
  totalCountedPieces: number;
  totalCountedValuation: number;
  totalSystemValuation: number;
  totalFaltantesValue: number;
  totalSobrantesValue: number;
  totalFaltantesPieces: number;
  totalSobrantesPieces: number;
  netFinancialImpact: number;
  topFaltantes: ProductSummary[];
  topSobrantes: ProductSummary[];
}

/**
 * Computes deep visual and executive dashboard analytics for counted products.
 */
export function computeCountedDashboardData(
  summaries: ProductSummary[]
): CountedDashboardData {
  const base = computeCountedDifferencesMetrics(summaries);
  const total = base.totalCountedProducts;

  const totalExactProducts = base.countedExactos.length;
  const totalFaltantesProducts = base.countedFaltantes.length;
  const totalSobrantesProducts = base.countedSobrantes.length;

  const accuracyRatePct = total > 0 ? (totalExactProducts / total) * 100 : 0;
  const faltantesRatePct = total > 0 ? (totalFaltantesProducts / total) * 100 : 0;
  const sobrantesRatePct = total > 0 ? (totalSobrantesProducts / total) * 100 : 0;

  const countedItems = summaries.filter((s) => s.countedStock > 0);
  const totalCountedPieces = countedItems.reduce((acc, s) => acc + s.countedStock, 0);
  const totalCountedValuation = countedItems.reduce(
    (acc, s) => acc + s.countedStock * (s.cost || 0),
    0
  );
  const totalSystemValuation = countedItems.reduce(
    (acc, s) => acc + s.systemStock * (s.cost || 0),
    0
  );

  const topFaltantes = [...base.countedFaltantes]
    .sort((a, b) => Math.abs(b.differenceValue) - Math.abs(a.differenceValue))
    .slice(0, 5);

  const topSobrantes = [...base.countedSobrantes]
    .sort((a, b) => b.differenceValue - a.differenceValue)
    .slice(0, 5);

  return {
    totalCountedProducts: total,
    totalExactProducts,
    totalFaltantesProducts,
    totalSobrantesProducts,
    accuracyRatePct,
    faltantesRatePct,
    sobrantesRatePct,
    totalCountedPieces,
    totalCountedValuation,
    totalSystemValuation,
    totalFaltantesValue: base.totalFaltantesValue,
    totalSobrantesValue: base.totalSobrantesValue,
    totalFaltantesPieces: base.totalFaltantesPieces,
    totalSobrantesPieces: base.totalSobrantesPieces,
    netFinancialImpact: base.netFinancialImpact,
    topFaltantes,
    topSobrantes,
  };
}

/**
 * Builds an immutable InventoryHistorySession object from active session state
 */
export function buildHistorySessionRecord(params: {
  sessionName: string;
  counterName: string;
  captures: CaptureItem[];
  summaries: ProductSummary[];
  systemStock: SystemStockItem[];
  notes?: string;
  now?: Date;
  customId?: string;
}): InventoryHistorySession {
  const dateObj = params.now || new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const sessionId =
    params.customId ||
    `inv_${dateObj.getFullYear()}${pad(dateObj.getMonth() + 1)}${pad(dateObj.getDate())}_${pad(dateObj.getHours())}${pad(dateObj.getMinutes())}${pad(dateObj.getSeconds())}`;

  const countedMetrics = computeCountedDifferencesMetrics(params.summaries);
  const totalPiecesCounted = params.captures.reduce(
    (sum, c) => sum + (c.quantity || 0),
    0
  );
  const totalCounted = countedMetrics.totalCountedProducts;
  const accuracyRatePct =
    totalCounted > 0
      ? (countedMetrics.countedExactos.length / totalCounted) * 100
      : 0;

  return {
    id: sessionId,
    name:
      params.sessionName.trim() ||
      `Inventario del ${dateObj.toLocaleDateString('es-MX')} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}`,
    createdAt: params.captures[0]?.timestamp || dateObj.toISOString(),
    closedAt: dateObj.toISOString(),
    closedBy: params.counterName || 'No especificado',
    notes: params.notes?.trim() || '',
    totalCapturesCount: params.captures.length,
    totalPiecesCounted,
    totalCountedProducts: totalCounted,
    totalExactProducts: countedMetrics.countedExactos.length,
    totalFaltantesProducts: countedMetrics.countedFaltantes.length,
    totalSobrantesProducts: countedMetrics.countedSobrantes.length,
    totalFaltantesPieces: countedMetrics.totalFaltantesPieces,
    totalSobrantesPieces: countedMetrics.totalSobrantesPieces,
    totalFaltantesValue: countedMetrics.totalFaltantesValue,
    totalSobrantesValue: countedMetrics.totalSobrantesValue,
    netFinancialImpact: countedMetrics.netFinancialImpact,
    accuracyRatePct,
    capturesSnapshot: [...params.captures],
    summariesSnapshot: [...params.summaries],
    systemStockSnapshot: [...params.systemStock],
  };
}

