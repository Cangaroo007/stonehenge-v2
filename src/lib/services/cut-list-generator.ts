import { OptimizationResult } from '@/types/slab-optimization';

export interface CutListData {
  summary: {
    totalSlabs: number;
    totalPieces: number;
    totalArea: number;
    wastePercent: number;
    generatedAt: Date;
  };
  slabs: Array<{
    slabNumber: number;
    dimensions: string;
    pieceCount: number;
    wastePercent: number;
    pieces: Array<{
      label: string;
      width: number;
      height: number;
      x: number;
      y: number;
      rotated: boolean;
    }>;
  }>;
}

/**
 * Generate CSV string from optimization result
 */
export function generateCutListCSV(
  result: OptimizationResult,
  slabWidth: number,
  slabHeight: number
): string {
  const headers = [
    'Slab #',
    'Piece ID',
    'Piece Label',
    'Type',
    'Parent Piece',
    'Width (mm)',
    'Height (mm)',
    'X Position',
    'Y Position',
    'Rotated',
  ];

  // Sort placements: main pieces first, then their strips grouped together
  const sortedPlacements = Array.from(result.placements).sort((a, b) => {
    // Sort by slab first
    if (a.slabIndex !== b.slabIndex) return a.slabIndex - b.slabIndex;
    
    // Within slab: main pieces before strips
    if (!a.isLaminationStrip && b.isLaminationStrip) return -1;
    if (a.isLaminationStrip && !b.isLaminationStrip) return 1;
    
    // Group strips with their parent
    const aParent = a.parentPieceId || a.pieceId;
    const bParent = b.parentPieceId || b.pieceId;
    if (aParent !== bParent) return aParent.localeCompare(bParent);
    
    // Main piece before its strips
    if (!a.isLaminationStrip) return -1;
    if (!b.isLaminationStrip) return 1;
    
    return 0;
  });

  const rows = sortedPlacements.map(p => {
    // Find parent piece name for strips
    let parentName = '';
    if (p.isLaminationStrip && p.parentPieceId) {
      const parent = result.placements.find(pl => pl.pieceId === p.parentPieceId);
      parentName = parent?.label || p.parentPieceId;
    }
    
    return [
      p.slabIndex + 1,
      p.pieceId,
      `"${p.label.replace(/"/g, '""')}"`,
      p.isLaminationStrip ? 'Lamination' : 'Main',
      parentName ? `"${parentName.replace(/"/g, '""')}"` : '',
      p.width,
      p.height,
      Math.round(p.x),
      Math.round(p.y),
      p.rotated ? 'Yes' : 'No',
    ];
  });

  // Add summary rows
  const summaryRows = [
    Array(headers.length).fill(''),
    ['--- SUMMARY ---', ...Array(headers.length - 1).fill('')],
    ['Total Slabs', result.totalSlabs, ...Array(headers.length - 2).fill('')],
    ['Total Pieces', result.placements.length, ...Array(headers.length - 2).fill('')],
    ['Slab Size', `${slabWidth} x ${slabHeight} mm`, ...Array(headers.length - 2).fill('')],
    ['Total Area', `${result.totalUsedArea.toFixed(2)} mm²`, ...Array(headers.length - 2).fill('')],
    ['Waste', `${result.totalWasteArea.toFixed(2)} mm²`, ...Array(headers.length - 2).fill('')],
    ['Waste %', `${result.wastePercent.toFixed(1)}%`, ...Array(headers.length - 2).fill('')],
    ['Generated', new Date().toISOString(), ...Array(headers.length - 2).fill('')],
  ];

  // Add lamination summary if present
  if (result.laminationSummary && result.laminationSummary.totalStrips > 0) {
    const laminationRows = [
      Array(headers.length).fill(''),
      ['--- LAMINATION STRIPS ---', ...Array(headers.length - 1).fill('')],
      ['Total Strips', result.laminationSummary.totalStrips, ...Array(headers.length - 2).fill('')],
      ['Total Strip Area', `${result.laminationSummary.totalStripArea.toFixed(4)} m²`, ...Array(headers.length - 2).fill('')],
      Array(headers.length).fill(''),
      ['Strip Breakdown:', ...Array(headers.length - 1).fill('')],
    ];
    
    // Add details for each parent piece
    for (const parent of result.laminationSummary.stripsByParent) {
      laminationRows.push([
        `"${parent.parentLabel.replace(/"/g, '""')}"`,
        ...Array(headers.length - 1).fill('')
      ]);
      for (const strip of parent.strips) {
        laminationRows.push([
          '',
          `${strip.position}:`,
          `${strip.lengthMm}mm x ${strip.widthMm}mm`,
          ...Array(headers.length - 3).fill('')
        ]);
      }
    }
    
    summaryRows.push(...laminationRows);
  }

  return [
    headers.join(','),
    ...rows.map(row => row.join(',')),
    ...summaryRows.map(row => row.join(',')),
  ].join('\n');
}

/**
 * Generate structured data for PDF/display
 */
export function generateCutListData(
  result: OptimizationResult,
  slabWidth: number,
  slabHeight: number
): CutListData {
  return {
    summary: {
      totalSlabs: result.totalSlabs,
      totalPieces: result.placements.length,
      totalArea: result.totalUsedArea,
      wastePercent: result.wastePercent,
      generatedAt: new Date(),
    },
    slabs: result.slabs.map((slab, index) => ({
      slabNumber: index + 1,
      dimensions: `${slabWidth} × ${slabHeight} mm`,
      pieceCount: slab.placements.length,
      wastePercent: slab.wastePercent,
      pieces: slab.placements.map(p => ({
        label: p.label,
        width: p.width,
        height: p.height,
        x: p.x,
        y: p.y,
        rotated: p.rotated,
      })),
    })),
  };
}

/**
 * Trigger CSV download in browser
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
