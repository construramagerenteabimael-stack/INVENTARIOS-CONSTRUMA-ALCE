import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ProductSummary,
  SystemStockItem,
  CaptureItem,
  ZoneItem,
  InventoryHistorySession,
} from '../types/inventory';
import {
  computeCountedDifferencesMetrics,
  computeGeneralInventoryProgress,
  computeCountedDashboardData,
} from './inventoryCalculations';

export interface DifferencesPdfOptions {
  scope: 'counted' | 'catalog';
  items: ProductSummary[];
  allSummaries: ProductSummary[];
  captures: CaptureItem[];
  systemStock: SystemStockItem[];
  zones?: ZoneItem[];
  counterName?: string;
  filterLabel?: string;
  generatedDate?: Date;
  historySessions?: InventoryHistorySession[];
}

/**
 * Generates a standard file name for the Differences PDF
 */
export function getPdfFileName(scopeLabel: string = 'Solo_Contado', d: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const cleanScope = scopeLabel.replace(/\s+/g, '_');
  return `Reporte_Diferencias_${cleanScope}_${year}-${month}-${day}.pdf`;
}

/**
 * Creates the formatted jsPDF instance with the executive differences report
 */
export function buildDifferencesPdfDocument(options: DifferencesPdfOptions): jsPDF {
  const {
    scope,
    items,
    allSummaries,
    captures,
    systemStock,
    counterName = 'No especificado',
    filterLabel = 'Todos',
    generatedDate = new Date(),
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10; // Optimized margin to 10mm for max table width
  const contentWidth = pageWidth - margin * 2; // 190mm on A4

  // Compute metrics with accumulated history sessions
  const progress = computeGeneralInventoryProgress(
    allSummaries,
    captures,
    systemStock,
    options.historySessions
  );
  const countedMetrics = computeCountedDifferencesMetrics(allSummaries);
  const countedDashboard = computeCountedDashboardData(allSummaries);

  // Active scope metrics
  const isCountedScope = scope === 'counted';
  const totalFaltantesCount = isCountedScope
    ? countedMetrics.countedFaltantes.length
    : allSummaries.filter((s) => s.difference < 0).length;

  const totalFaltantesValue = isCountedScope
    ? countedMetrics.totalFaltantesValue
    : allSummaries
        .filter((s) => s.difference < 0)
        .reduce((sum, s) => sum + Math.abs(s.differenceValue), 0);

  const totalFaltantesPieces = isCountedScope
    ? countedMetrics.totalFaltantesPieces
    : allSummaries
        .filter((s) => s.difference < 0)
        .reduce((sum, s) => sum + Math.abs(s.difference), 0);

  const totalSobrantesCount = isCountedScope
    ? countedMetrics.countedSobrantes.length
    : allSummaries.filter((s) => s.difference > 0).length;

  const totalSobrantesValue = isCountedScope
    ? countedMetrics.totalSobrantesValue
    : allSummaries
        .filter((s) => s.difference > 0)
        .reduce((sum, s) => sum + s.differenceValue, 0);

  const totalSobrantesPieces = isCountedScope
    ? countedMetrics.totalSobrantesPieces
    : allSummaries
        .filter((s) => s.difference > 0)
        .reduce((sum, s) => sum + s.difference, 0);

  const totalCuadradosCount = isCountedScope
    ? countedMetrics.countedExactos.length
    : allSummaries.filter((s) => s.difference === 0).length;

  const netImpact = isCountedScope
    ? countedMetrics.netFinancialImpact
    : allSummaries.reduce((sum, s) => sum + s.differenceValue, 0);

  // -------------------------------------------------------------
  // 1. TOP HEADER BANNER (Compact 16mm height)
  // -------------------------------------------------------------
  doc.setFillColor(222, 28, 36); // #DE1C24 Construrama Red
  doc.rect(margin, margin, contentWidth, 16, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('CONSTRURAMA ALCE', margin + 4, margin + 6.5);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 235, 235);
  doc.text('CONTROL Y TOMA DE INVENTARIOS FÍSICOS', margin + 4, margin + 11.5);

  // Right side of top banner: Scope badge
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  const scopeBadgeText = isCountedScope
    ? 'RESUMEN: SOLO LO CONTADO'
    : 'RESUMEN: TODO EL CATÁLOGO';
  doc.text(scopeBadgeText, pageWidth - margin - 4, margin + 9.5, { align: 'right' });

  let cursorY = margin + 19;

  // -------------------------------------------------------------
  // 2. METADATA ROW
  // -------------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(70, 70, 70);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const dateFormatted = `${pad(generatedDate.getDate())}/${pad(generatedDate.getMonth() + 1)}/${generatedDate.getFullYear()} ${pad(generatedDate.getHours())}:${pad(generatedDate.getMinutes())}`;

  doc.text(`Fecha y Hora: ${dateFormatted}`, margin, cursorY);
  doc.text(`Responsable / Contador: ${counterName}`, margin + 65, cursorY);
  doc.text(`Filtro: ${filterLabel}`, margin + 130, cursorY);

  cursorY += 4;

  // -------------------------------------------------------------
  // 3. OVERALL PROGRESS BAR & BANNER (Compact 13mm height)
  // -------------------------------------------------------------
  doc.setFillColor(18, 38, 71); // Navy #122647
  doc.roundedRect(margin, cursorY, contentWidth, 13, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(252, 211, 77); // Amber 300
  doc.text('AVANCE GENERAL DE TODO EL INVENTARIO', margin + 4, cursorY + 4.5);

  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `${progress.pctProgressPieces.toFixed(1)}%`,
    pageWidth - margin - 4,
    cursorY + 5,
    { align: 'right' }
  );

  // Progress Bar Line
  const barX = margin + 4;
  const barY = cursorY + 6.5;
  const barW = contentWidth - 8;
  const barH = 2.2;

  doc.setFillColor(15, 23, 42); // dark background
  doc.roundedRect(barX, barY, barW, barH, 1, 1, 'F');

  const progressW = (Math.max(2, Math.min(100, progress.pctProgressPieces)) / 100) * barW;
  doc.setFillColor(16, 185, 129); // emerald
  doc.roundedRect(barX, barY, progressW, barH, 1, 1, 'F');

  // Subtext below progress bar
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(226, 232, 240);
  const totalTapancoPieces = allSummaries.reduce((sum, s) => sum + (s.tapancoCount || 0), 0);
  const totalAutoPieces = allSummaries.reduce((sum, s) => sum + (s.autoservicioCount || 0), 0);
  const progressSubtext = `Contado: ${progress.totalCountedPieces.toLocaleString()} pzs (Tapanco: ${totalTapancoPieces.toLocaleString()} • Autoservicio: ${totalAutoPieces.toLocaleString()})   •   Arts con conteo: ${progress.totalCountedProducts.toLocaleString()} de ${progress.totalCatalogProducts.toLocaleString()} (${progress.pctProgressProducts.toFixed(1)}%)   •   Restantes: ~${progress.totalPendingPieces.toLocaleString()} pzs`;
  doc.text(progressSubtext, margin + 4, cursorY + 11.2);

  cursorY += 16;

  // -------------------------------------------------------------
  // 4. THE 4 VALUATION SUMMARY CARDS (MATCHING SCREENSHOT)
  // -------------------------------------------------------------
  const cardGap = 2;
  const cardWidth = (contentWidth - cardGap * 3) / 4;
  const cardHeight = 17;

  // CARD 1: Faltantes (Red)
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(252, 165, 165);
  doc.roundedRect(margin, cursorY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(185, 28, 28);
  doc.text(`Faltantes (${totalFaltantesCount})`, margin + 2.5, cursorY + 4.5);

  doc.setFontSize(9.5);
  doc.text(`-$${totalFaltantesValue.toFixed(2)}`, margin + 2.5, cursorY + 10);

  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(`-${totalFaltantesPieces} piezas faltantes`, margin + 2.5, cursorY + 14.5);

  // CARD 2: Sobrantes (Green)
  const card2X = margin + cardWidth + cardGap;
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(110, 231, 183);
  doc.roundedRect(card2X, cursorY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(4, 120, 87);
  doc.text(`Sobrantes (${totalSobrantesCount})`, card2X + 2.5, cursorY + 4.5);

  doc.setFontSize(9.5);
  doc.text(`+$${totalSobrantesValue.toFixed(2)}`, card2X + 2.5, cursorY + 10);

  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text(`+${totalSobrantesPieces} piezas excedentes`, card2X + 2.5, cursorY + 14.5);

  // CARD 3: Cuadrados (Blue)
  const card3X = card2X + cardWidth + cardGap;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(147, 197, 253);
  doc.roundedRect(card3X, cursorY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(30, 64, 175);
  doc.text(`Cuadrados (${totalCuadradosCount})`, card3X + 2.5, cursorY + 4.5);

  doc.setFontSize(9.5);
  doc.text(`${totalCuadradosCount} arts.`, card3X + 2.5, cursorY + 10);

  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.text('Coinciden con sistema', card3X + 2.5, cursorY + 14.5);

  // CARD 4: Impacto Financiero Neto
  const card4X = card3X + cardWidth + cardGap;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(card4X, cursorY, cardWidth, cardHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(51, 65, 85);
  doc.text('Impacto Neto', card4X + 2.5, cursorY + 4.5);

  doc.setFontSize(9.5);
  if (netImpact < 0) {
    doc.setTextColor(185, 28, 28);
    doc.text(`-$${Math.abs(netImpact).toFixed(2)}`, card4X + 2.5, cursorY + 10);
  } else if (netImpact > 0) {
    doc.setTextColor(4, 120, 87);
    doc.text(`+$${netImpact.toFixed(2)}`, card4X + 2.5, cursorY + 10);
  } else {
    doc.setTextColor(15, 23, 42);
    doc.text(`$0.00`, card4X + 2.5, cursorY + 10);
  }

  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Balance financiero neto', card4X + 2.5, cursorY + 14.5);

  cursorY += cardHeight + 3;

  // -------------------------------------------------------------
  // 5. DASHBOARD ANALÍTICO DE LO CONTADO (VISUAL CHARTS SECTION)
  // -------------------------------------------------------------
  const totalCounted = countedDashboard.totalCountedProducts;

  if (totalCounted > 0) {
    const dashBoxHeight = 24.5;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(margin, cursorY, contentWidth, dashBoxHeight, 2, 2, 'FD');

    // Title of dashboard
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(
      `DASHBOARD ANALÍTICO: SOLO LO CONTADO (${totalCounted} Artículos Verificados)`,
      margin + 3.5,
      cursorY + 4
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(37, 99, 235); // blue-600
    doc.text(
      `EXACTITUD DE INVENTARIO: ${countedDashboard.accuracyRatePct.toFixed(1)}%`,
      pageWidth - margin - 3.5,
      cursorY + 4,
      { align: 'right' }
    );

    // Left column: Segmented distribution bar (Artículos cuadrados vs faltantes vs sobrantes)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(71, 85, 105);
    doc.text('DISTRIBUCIÓN DEL CONTEO:', margin + 3.5, cursorY + 8);

    const distBarX = margin + 3.5;
    const distBarY = cursorY + 9.8;
    const distBarW = 86;
    const distBarH = 3.6;

    const wExact = (countedDashboard.totalExactProducts / totalCounted) * distBarW;
    const wFalt = (countedDashboard.totalFaltantesProducts / totalCounted) * distBarW;
    const wSobr = (countedDashboard.totalSobrantesProducts / totalCounted) * distBarW;

    // Draw background
    doc.setFillColor(226, 232, 240);
    doc.rect(distBarX, distBarY, distBarW, distBarH, 'F');

    let curX = distBarX;
    if (wExact > 0) {
      doc.setFillColor(37, 99, 235); // Blue
      doc.rect(curX, distBarY, wExact, distBarH, 'F');
      curX += wExact;
    }
    if (wFalt > 0) {
      doc.setFillColor(220, 38, 38); // Red
      doc.rect(curX, distBarY, wFalt, distBarH, 'F');
      curX += wFalt;
    }
    if (wSobr > 0) {
      doc.setFillColor(5, 150, 105); // Green
      doc.rect(curX, distBarY, wSobr, distBarH, 'F');
    }

    // Legend below bar
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);

    // Blue dot
    doc.setFillColor(37, 99, 235);
    doc.circle(distBarX + 1.8, cursorY + 16.5, 1.1, 'F');
    doc.setTextColor(30, 41, 59);
    doc.text(
      `Cuadrados: ${countedDashboard.totalExactProducts} (${countedDashboard.accuracyRatePct.toFixed(1)}%)`,
      distBarX + 4.2,
      cursorY + 17.5
    );

    // Red dot
    doc.setFillColor(220, 38, 38);
    doc.circle(distBarX + 32, cursorY + 16.5, 1.1, 'F');
    doc.text(
      `Faltan: ${countedDashboard.totalFaltantesProducts} (${countedDashboard.faltantesRatePct.toFixed(1)}%)`,
      distBarX + 34.5,
      cursorY + 17.5
    );

    // Green dot
    doc.setFillColor(5, 150, 105);
    doc.circle(distBarX + 61, cursorY + 16.5, 1.1, 'F');
    doc.text(
      `Sobran: ${countedDashboard.totalSobrantesProducts} (${countedDashboard.sobrantesRatePct.toFixed(1)}%)`,
      distBarX + 63.5,
      cursorY + 17.5
    );

    // Ratio subtext
    doc.setFontSize(5.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Piezas Físicas Contadas: ${countedDashboard.totalCountedPieces.toLocaleString()} | Tasa de Discrepancia: ${(100 - countedDashboard.accuracyRatePct).toFixed(1)}%`,
      distBarX,
      cursorY + 22
    );

    // Divider line between left & right columns
    doc.setDrawColor(226, 232, 240);
    doc.line(margin + 94, cursorY + 6.5, margin + 94, cursorY + dashBoxHeight - 2);

    // Right column: Top Faltantes Críticos ($) (Pareto)
    const rightX = margin + 98;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(185, 28, 28); // red-700
    doc.text('TOP FALTANTES DE MAYOR IMPACTO ECONÓMICO:', rightX, cursorY + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    if (countedDashboard.topFaltantes.length > 0) {
      countedDashboard.topFaltantes.slice(0, 3).forEach((item, idx) => {
        const itemY = cursorY + 12.8 + idx * 3.8;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(185, 28, 28);
        doc.text(`-${Math.abs(item.difference)} ${item.unit || 'pza'}`, rightX, itemY);
        doc.text(
          `-$${Math.abs(item.differenceValue).toFixed(2)}`,
          pageWidth - margin - 3.5,
          itemY,
          { align: 'right' }
        );

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        const descTrunc =
          item.description.length > 34
            ? item.description.substring(0, 32) + '...'
            : item.description;
        doc.text(`${item.code} • ${descTrunc}`, rightX + 16, itemY);
      });
    } else {
      doc.setTextColor(5, 150, 105);
      doc.text('✓ Conteo perfecto: 0 faltantes detectados en lo verificado.', rightX, cursorY + 14);
    }

    cursorY += dashBoxHeight + 3;
  }

  // -------------------------------------------------------------
  // 6. TABLE OF DIFFERENCES (autoTable with 1-Line Description)
  // -------------------------------------------------------------
  const tableData = items.map((item) => {
    const isFaltante = item.difference < 0;
    const isSobrante = item.difference > 0;
    const estatusText = isFaltante
      ? `Faltan ${Math.abs(item.difference)}`
      : isSobrante
      ? `+${item.difference} Sob.`
      : 'Cuadrado';

    const diffSign = item.difference > 0 ? `+${item.difference}` : `${item.difference}`;
    const diffValFormatted = `${item.differenceValue < 0 ? '-' : item.differenceValue > 0 ? '+' : ''}$${Math.abs(item.differenceValue).toFixed(2)}`;

    const tapancoQty = item.tapancoCount ?? 0;
    const autoQty = item.autoservicioCount ?? 0;
    const totalQty = item.countedStock;

    return [
      item.code,
      item.description,
      item.unit || 'PZA',
      item.systemStock.toString(),
      tapancoQty.toString(),
      autoQty.toString(),
      totalQty.toString(),
      diffSign,
      estatusText,
      `$${(item.cost || 0).toFixed(2)}`,
      diffValFormatted,
    ];
  });

  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin, bottom: 12 },
    head: [
      [
        'Código',
        'Descripción del Producto',
        'Unid.',
        'Sistema',
        'Tapanco',
        'Autoserv.',
        'Total Cont.',
        'Diferencia',
        'Estatus',
        'Costo Unit.',
        'Valor Dif. ($)',
      ],
    ],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 6.8,
      cellPadding: { top: 0.9, bottom: 0.9, left: 0.8, right: 0.8 },
      minCellHeight: 3.8,
      overflow: 'ellipsize',
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [18, 38, 71], // Navy Blue #122647
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.8,
      cellPadding: { top: 1.2, bottom: 1.2, left: 0.8, right: 0.8 },
      halign: 'center',
    },
    // WIDE Description column (67mm) with others compactly deduced (sum = 190mm)
    columnStyles: {
      0: { cellWidth: 13, fontStyle: 'bold', halign: 'center' }, // Código (13mm)
      1: { cellWidth: 67, fontStyle: 'normal', overflow: 'ellipsize' }, // Descripción (67mm - fits single line!)
      2: { cellWidth: 7, halign: 'center' }, // Unidad (7mm)
      3: { cellWidth: 10, halign: 'right' }, // Sistema (10mm)
      4: { cellWidth: 11, halign: 'right', fontStyle: 'bold' }, // Tapanco (11mm)
      5: { cellWidth: 11, halign: 'right', fontStyle: 'bold' }, // Autoserv. (11mm)
      6: { cellWidth: 11, halign: 'right', fontStyle: 'bold' }, // Total Cont. (11mm)
      7: { cellWidth: 11, halign: 'right', fontStyle: 'bold' }, // Diferencia (11mm)
      8: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }, // Estatus (16mm)
      9: { cellWidth: 14, halign: 'right' }, // Costo Unit. (14mm)
      10: { cellWidth: 19, halign: 'right', fontStyle: 'bold' }, // Valor Dif (19mm)
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        const rowItem = items[data.row.index];
        if (rowItem) {
          // Highlight Tapanco column text when > 0
          if (data.column.index === 4 && (rowItem.tapancoCount || 0) > 0) {
            data.cell.styles.textColor = [30, 58, 138]; // Deep Indigo
          }
          // Highlight Autoservicio column text when > 0
          if (data.column.index === 5 && (rowItem.autoservicioCount || 0) > 0) {
            data.cell.styles.textColor = [4, 120, 87]; // Emerald
          }
          // Highlight Total Contado column
          if (data.column.index === 6) {
            data.cell.styles.fillColor = [254, 252, 232]; // Subtle Amber tint
          }
          // Color-code Difference (col 7), Status (col 8) and Financial Value (col 10)
          if (data.column.index === 7 || data.column.index === 8 || data.column.index === 10) {
            if (rowItem.difference < 0) {
              data.cell.styles.textColor = [185, 28, 28]; // Red
              if (data.column.index === 8) {
                data.cell.styles.fillColor = [254, 242, 242];
              }
            } else if (rowItem.difference > 0) {
              data.cell.styles.textColor = [4, 120, 87]; // Green
              if (data.column.index === 8) {
                data.cell.styles.fillColor = [236, 253, 245];
              }
            } else {
              data.cell.styles.textColor = [30, 64, 175]; // Blue
              if (data.column.index === 8) {
                data.cell.styles.fillColor = [239, 246, 255];
              }
            }
          }
        }
      }
    },
    didDrawPage: (data) => {
      // Footer on every page
      const pageNumber = (doc as unknown as { internal: { getNumberOfPages: () => number } })
        .internal.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184);

      const footerText = `Página ${data.pageNumber} • Inventarios Construrama Alce • Reporte Oficial de Diferencias`;
      doc.text(footerText, pageWidth / 2, pageHeight - 5, { align: 'center' });
    },
  });

  return doc;
}

/**
 * Builds and returns a downloadable / shareable PDF Blob
 */
export async function generateDifferencesPdfBlob(
  options: DifferencesPdfOptions
): Promise<Blob> {
  const doc = buildDifferencesPdfDocument(options);
  const blob = doc.output('blob');
  return blob;
}

/**
 * Exports the Differences PDF: downloads file or triggers native share dialog
 */
export async function exportDifferencesPdf(
  options: DifferencesPdfOptions,
  shouldShare: boolean = false
): Promise<{ success: boolean; message: string; fileName: string }> {
  const scopeLabel = options.scope === 'counted' ? 'Solo_Contado' : 'Catalogo_Completo';
  const fileName = getPdfFileName(scopeLabel, options.generatedDate || new Date());
  const blob = await generateDifferencesPdfBlob(options);

  if (shouldShare && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Reporte de Diferencias - Construrama Alce',
          text: `Reporte de diferencias de inventario (${options.scope === 'counted' ? 'Solo lo contado' : 'Catálogo completo'}) - ${new Date().toLocaleDateString('es-MX')}`,
          files: [file],
        });
        return {
          success: true,
          message: 'Reporte PDF compartido exitosamente por WhatsApp / Correo.',
          fileName,
        };
      }
    } catch (shareErr: unknown) {
      const err = shareErr as Error;
      if (err.name !== 'AbortError') {
        console.warn('Error en navigator.share, descargando directamente...', err);
      }
    }
  }

  // Direct download in browser
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return {
    success: true,
    message: `Archivo PDF descargado: ${fileName}`,
    fileName,
  };
}
