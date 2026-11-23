import { ZoneItem, CaptureItem, ProductItem, SystemStockItem, AutoservicioBalance } from '../types/inventory';

/**
 * Determines if a zone represents a Bodega (Warehouse/Backroom)
 */
export function isZoneBodega(zone: ZoneItem | null | undefined): boolean {
  if (!zone) return false;
  if (zone.type === 'bodega') return true;
  if (zone.type === 'autoservicio') return false;
  const lower = (zone.name || '').toLowerCase();
  return (
    lower.includes('bodega') ||
    lower.includes('tapanco') ||
    lower.includes('almacen') ||
    lower.includes('almacén') ||
    lower.includes('mezzanine') ||
    lower.includes('trastienda')
  );
}

/**
 * Determines if a zone represents Autoservicio (Showroom / Display / Sales floor)
 */
export function isZoneAutoservicio(zone: ZoneItem | null | undefined): boolean {
  if (!zone) return false;
  if (zone.type === 'autoservicio') return true;
  if (zone.type === 'bodega') return false;
  const lower = (zone.name || '').toLowerCase();
  return (
    lower.includes('autoservicio') ||
    lower.includes('exhibicion') ||
    lower.includes('exhibición') ||
    lower.includes('piso') ||
    lower.includes('mostrador') ||
    lower.includes('anaquel') ||
    lower.includes('tienda')
  );
}

/**
 * Calculates how many items for a given code were counted in Bodega zones
 */
export function getCountInBodega(
  code: string,
  zones: ZoneItem[],
  captures: CaptureItem[]
): number {
  const bodegaZoneIds = new Set(zones.filter(isZoneBodega).map((z) => z.id));
  return captures
    .filter((c) => c.code === code && bodegaZoneIds.has(c.zoneId))
    .reduce((sum, c) => sum + c.quantity, 0);
}

/**
 * Calculates how many items for a given code were counted in Autoservicio zones
 */
export function getCountInAutoservicio(
  code: string,
  zones: ZoneItem[],
  captures: CaptureItem[]
): number {
  const autoZoneIds = new Set(zones.filter(isZoneAutoservicio).map((z) => z.id));
  return captures
    .filter((c) => c.code === code && autoZoneIds.has(c.zoneId))
    .reduce((sum, c) => sum + c.quantity, 0);
}

/**
 * Computes Autoservicio balance for a specific product
 */
export function computeProductAutoservicioBalance(
  product:
    | ProductItem
    | { code: string; barcode?: string; description?: string; unit?: string }
    | string,
  systemStockItem: SystemStockItem | number | undefined,
  zones: ZoneItem[],
  captures: CaptureItem[]
): AutoservicioBalance {
  const code = typeof product === 'string' ? product : product.code;
  let barcode = typeof product === 'string' ? '' : product.barcode || '';
  let description = typeof product === 'string' ? '' : product.description || '';
  let unit = typeof product === 'string' ? 'pza' : product.unit || 'pza';

  // If description or barcode are missing, look them up from captures
  if (!description || !barcode) {
    const matchCapture = captures.find((c) => c.code === code && (c.description || c.barcode));
    if (matchCapture) {
      if (!description && matchCapture.description) description = matchCapture.description;
      if (!barcode && matchCapture.barcode) barcode = matchCapture.barcode;
      if (unit === 'pza' && matchCapture.unit) unit = matchCapture.unit;
    }
  }

  // Look up from systemStockItem if available
  if (typeof systemStockItem === 'object' && systemStockItem) {
    if (!description && systemStockItem.description) description = systemStockItem.description;
    if (!barcode && systemStockItem.barcode) barcode = systemStockItem.barcode;
    if (unit === 'pza' && systemStockItem.unit) unit = systemStockItem.unit;
  }

  if (!description) {
    description = `Artículo ${code}`;
  }
  if (!barcode) {
    barcode = code;
  }

  const systemStock =
    typeof systemStockItem === 'number'
      ? systemStockItem
      : systemStockItem
      ? systemStockItem.systemStock
      : 0;

  // Track specific Bodega/Tapanco zones where product was counted
  const bodegaZones = zones.filter(isZoneBodega);
  const bodegaZoneIds = new Set(bodegaZones.map((z) => z.id));

  const zoneCountMap = new Map<string, { zoneName: string; quantity: number }>();
  let bodegaCount = 0;

  for (const c of captures) {
    if (c.code === code && bodegaZoneIds.has(c.zoneId)) {
      bodegaCount += c.quantity;
      const existing = zoneCountMap.get(c.zoneId);
      const zoneName = c.zoneName || bodegaZones.find((z) => z.id === c.zoneId)?.name || 'Bodega/Tapanco';
      if (existing) {
        existing.quantity += c.quantity;
      } else {
        zoneCountMap.set(c.zoneId, { zoneName, quantity: c.quantity });
      }
    }
  }

  const sourceZones = Array.from(zoneCountMap.entries()).map(([zoneId, data]) => ({
    zoneId,
    zoneName: data.zoneName,
    quantity: data.quantity,
  }));

  const primarySourceZoneName =
    sourceZones.length > 0 ? sourceZones.map((sz) => sz.zoneName).join(', ') : undefined;

  const autoservicioCount = getCountInAutoservicio(code, zones, captures);

  const targetToFindInAutoservicio = Math.max(0, systemStock - bodegaCount);
  const remainingToFind = Math.max(0, targetToFindInAutoservicio - autoservicioCount);
  const totalCounted = bodegaCount + autoservicioCount;
  const difference = totalCounted - systemStock;

  const isFullInBodega = bodegaCount >= systemStock && systemStock > 0;
  const isCompletedInAuto =
    !isFullInBodega && targetToFindInAutoservicio > 0 && remainingToFind === 0;
  const isPendingInAuto = targetToFindInAutoservicio > 0 && remainingToFind > 0;

  let status: AutoservicioBalance['status'] = 'pendiente';
  if (isFullInBodega && autoservicioCount === 0) {
    status = 'bodega_completa';
  } else if (remainingToFind === 0 && totalCounted === systemStock) {
    status = 'completado';
  } else if (totalCounted > systemStock) {
    status = 'excedente';
  } else {
    status = 'pendiente';
  }

  return {
    code,
    barcode,
    description,
    unit,
    systemStock,
    bodegaCount,
    autoservicioCount,
    targetToFindInAutoservicio,
    remainingToFind,
    totalCounted,
    difference,
    status,
    sourceZones,
    primarySourceZoneName,
    isCountedInBodega: bodegaCount > 0,
    isUncountedInBodega: bodegaCount === 0 && systemStock > 0,
    isFullInBodega,
    isCompletedInAuto,
    isPendingInAuto,
  };
}

/**
 * Computes balances for all products, specifically tailored for Autoservicio phase
 */
export function computeAllAutoservicioBalances(
  products: ProductItem[],
  systemStock: SystemStockItem[],
  zones: ZoneItem[],
  captures: CaptureItem[]
): AutoservicioBalance[] {
  const stockMap = new Map<string, SystemStockItem>();
  for (const s of systemStock) {
    stockMap.set(s.code.trim(), s);
  }

  return products.map((p) => {
    const sItem = stockMap.get(p.code.trim());
    return computeProductAutoservicioBalance(p, sItem, zones, captures);
  });
}

/**
 * Formats user's requested 3-part comparison:
 * e.g. "Bodega/Tapanco: 3 | Pendientes: 2 | Total Sistema: 5"
 */
export function formatAutoservicioTriplet(balance: AutoservicioBalance): {
  bodegaLabel: string;
  pendientesLabel: string;
  sistemaLabel: string;
  summaryText: string;
  originBadge: string;
} {
  const zoneName = balance.primarySourceZoneName || 'Bodega';
  const bodegaLabel = `${zoneName}: ${balance.bodegaCount}`;
  const pendientesLabel = `Pendientes: ${balance.remainingToFind}`;
  const sistemaLabel = `Total Sistema: ${balance.systemStock}`;
  const summaryText = `${bodegaLabel} | ${pendientesLabel} | ${sistemaLabel}`;
  const originBadge = balance.isCountedInBodega
    ? `Pendiente de zona: ${zoneName}`
    : 'Sin conteo en bodega/tapanco';
  return { bodegaLabel, pendientesLabel, sistemaLabel, summaryText, originBadge };
}

/**
 * Formats user's requested sum comparison equation:
 * Bodega (3) + Autoservicio (1) = Total Contado (4) vs Sistema (5) -> Faltan 1
 */
export function formatAutoservicioSumEquation(balance: AutoservicioBalance): {
  equationText: string;
  bodegaPart: string;
  autoPart: string;
  totalPart: string;
  sistemaPart: string;
  differencePart: string;
} {
  const zoneName = balance.primarySourceZoneName || 'Bodega';
  const bodegaPart = `${zoneName}: ${balance.bodegaCount}`;
  const autoPart = `Autoservicio: ${balance.autoservicioCount}`;
  const totalPart = `Total Contado: ${balance.totalCounted}`;
  const sistemaPart = `Sistema: ${balance.systemStock}`;
  const diff = balance.difference;
  const differencePart =
    diff === 0
      ? '¡Cuadrado al 100%!'
      : diff < 0
      ? `Faltan ${Math.abs(diff)}`
      : `Sobrante +${diff}`;

  const equationText = `${bodegaPart} + ${autoPart} = ${totalPart} vs ${sistemaPart} (${differencePart})`;
  return { equationText, bodegaPart, autoPart, totalPart, sistemaPart, differencePart };
}

