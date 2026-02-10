/**
 * Manufacturing Export Service
 *
 * Generates a manufacturing-ready JSON export for locked/finalised quotes.
 * Contains piece-level dimensions, edge profiles, cutout details,
 * machine assignments per operation, and lamination strip info.
 *
 * Reference: Stonehenge-v2 Machine Logic doc — Section 4
 */

import prisma from '@/lib/db';
import type {
  ManufacturingExport,
  ManufacturingPieceExport,
} from '@/lib/types/manufacturing-export';
import type { LaminationSummary } from '@/types/slab-optimization';

/** Cutout shape stored in the quote_pieces.cutouts JSON column. */
interface CutoutEntry {
  type: string;
  quantity?: number;
  count?: number;
}

/**
 * Build a complete ManufacturingExport payload for a given quote.
 *
 * @throws {Error} if the quote does not exist
 * @throws {Error} if the quote status is not LOCKED or ACCEPTED
 */
export async function generateManufacturingExport(
  quoteId: number
): Promise<ManufacturingExport> {
  // ── 1. Load the quote with all relations ────────────────────────────
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteId },
    include: {
      quote_rooms: {
        orderBy: { sort_order: 'asc' },
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
            include: {
              materials: true,
              piece_features: true,
            },
          },
        },
      },
      slab_optimizations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!quote) {
    throw new Error(`Quote ${quoteId} not found`);
  }

  const validStatuses = ['locked', 'accepted'];
  if (!validStatuses.includes(quote.status.toLowerCase())) {
    throw new Error(
      `Quote ${quoteId} is in "${quote.status}" status. Manufacturing export is only available for locked or accepted quotes.`
    );
  }

  // ── 2. Load machine-operation defaults ──────────────────────────────
  const machineDefaults = await prisma.machine_operation_defaults.findMany({
    include: { machine: true },
  });

  const machineByOp = new Map(
    machineDefaults.map((d) => [
      d.operation_type,
      {
        machineId: d.machine.id,
        machineName: d.machine.name,
        kerfMm: d.machine.kerf_width_mm,
      },
    ])
  );

  // ── 3. Extract slab optimisation metadata ───────────────────────────
  const latestOpt = quote.slab_optimizations[0] ?? null;
  const slabCount = latestOpt?.totalSlabs ?? 0;

  // Parse lamination summary from the optimisation result
  const laminationSummary = latestOpt?.laminationSummary
    ? (latestOpt.laminationSummary as unknown as LaminationSummary)
    : null;

  // ── 4. Determine primary material (from first piece with a material) ─
  const firstPieceWithMaterial = quote.quote_rooms
    .flatMap((r) => r.quote_pieces)
    .find((p) => p.materials);

  const primaryMaterial = firstPieceWithMaterial?.materials;

  // ── 5. Build per-piece export ───────────────────────────────────────
  let totalCutLm = 0;
  let totalPolishLm = 0;
  let totalMitreLm = 0;
  let totalCutouts = 0;
  let oversizePieces = 0;
  let totalJoins = 0;

  const pieces: ManufacturingPieceExport[] = [];

  for (const room of quote.quote_rooms) {
    for (const piece of room.quote_pieces) {
      const lengthMm = piece.length_mm;
      const widthMm = piece.width_mm;

      // Perimeter in linear metres (cutting is ALWAYS full perimeter)
      const perimeterMm = 2 * (lengthMm + widthMm);
      const perimeterLm = perimeterMm / 1000;
      totalCutLm += perimeterLm;

      // Parse edges
      const edgeTop = parseEdge(piece.edge_top);
      const edgeBottom = parseEdge(piece.edge_bottom);
      const edgeLeft = parseEdge(piece.edge_left);
      const edgeRight = parseEdge(piece.edge_right);

      // Polishing = only finished edges (not full perimeter)
      let polishLm = 0;
      if (edgeTop.isFinished) polishLm += lengthMm / 1000;
      if (edgeBottom.isFinished) polishLm += lengthMm / 1000;
      if (edgeLeft.isFinished) polishLm += widthMm / 1000;
      if (edgeRight.isFinished) polishLm += widthMm / 1000;
      totalPolishLm += polishLm;

      // Mitring = mitred edges only
      let mitreLm = 0;
      if (isMitred(piece.edge_top)) mitreLm += lengthMm / 1000;
      if (isMitred(piece.edge_bottom)) mitreLm += lengthMm / 1000;
      if (isMitred(piece.edge_left)) mitreLm += widthMm / 1000;
      if (isMitred(piece.edge_right)) mitreLm += widthMm / 1000;
      totalMitreLm += mitreLm;

      // Cutouts
      const cutouts = parseCutouts(piece.cutouts);
      const pieceCutoutCount = cutouts.reduce((sum, c) => sum + c.quantity, 0);
      totalCutouts += pieceCutoutCount;

      // Oversize / join info
      if (piece.isOversize) oversizePieces++;
      if (piece.joinCount > 0) totalJoins += piece.joinCount;

      // Determine which machine-operation assignments apply to this piece
      const hasMitring = mitreLm > 0;
      const hasLamination =
        piece.lamination_method !== 'NONE' && piece.lamination_method !== null;
      const hasCutouts = pieceCutoutCount > 0;
      const hasPolishing = polishLm > 0;

      const initialCutMachine = machineByOp.get('INITIAL_CUT');
      const edgePolishingMachine = machineByOp.get('EDGE_POLISHING');
      const mitringMachine = machineByOp.get('MITRING');
      const laminationMachine = machineByOp.get('LAMINATION');
      const cutoutMachine = machineByOp.get('CUTOUT');

      // Build lamination strips for this piece from optimisation data
      const pieceStrips = buildLaminationStrips(
        piece.id.toString(),
        laminationSummary
      );

      const exportPiece: ManufacturingPieceExport = {
        pieceId: piece.id.toString(),
        label: piece.description || piece.name || 'Unnamed piece',
        room: room.name,
        dimensions: {
          lengthMm,
          widthMm,
          thicknessMm: piece.thickness_mm,
        },
        material: {
          name: piece.materials?.name ?? piece.material_name ?? 'Unknown',
          fabricationCategory:
            piece.materials?.fabrication_category ?? 'ENGINEERED',
        },
        edges: {
          top: edgeTop,
          bottom: edgeBottom,
          left: edgeLeft,
          right: edgeRight,
        },
        cutouts,
        machineAssignments: {
          initialCut: initialCutMachine
            ? {
                machineId: initialCutMachine.machineId,
                machineName: initialCutMachine.machineName,
                kerfMm: initialCutMachine.kerfMm,
              }
            : { machineId: 'unassigned', machineName: 'Unassigned', kerfMm: 0 },
          edgePolishing:
            hasPolishing && edgePolishingMachine
              ? {
                  machineId: edgePolishingMachine.machineId,
                  machineName: edgePolishingMachine.machineName,
                }
              : null,
          mitring:
            hasMitring && mitringMachine
              ? {
                  machineId: mitringMachine.machineId,
                  machineName: mitringMachine.machineName,
                  kerfMm: mitringMachine.kerfMm,
                }
              : null,
          lamination:
            hasLamination && laminationMachine
              ? {
                  machineId: laminationMachine.machineId,
                  machineName: laminationMachine.machineName,
                }
              : null,
          cutouts:
            hasCutouts && cutoutMachine
              ? {
                  machineId: cutoutMachine.machineId,
                  machineName: cutoutMachine.machineName,
                  kerfMm: cutoutMachine.kerfMm,
                }
              : null,
        },
        isOversize: piece.isOversize,
        joinDetails:
          piece.joinCount > 0
            ? {
                joinCount: piece.joinCount,
                joinLengthMm: piece.joinLengthMm ?? 0,
              }
            : null,
        laminationStrips: pieceStrips,
      };

      pieces.push(exportPiece);
    }
  }

  // ── 6. Assemble final export ────────────────────────────────────────
  const exportPayload: ManufacturingExport = {
    quoteId: quote.id.toString(),
    quoteNumber: quote.quote_number,
    exportedAt: new Date().toISOString(),
    material: {
      name: primaryMaterial?.name ?? 'Unknown',
      fabricationCategory:
        primaryMaterial?.fabrication_category ?? 'ENGINEERED',
      slabDimensions: {
        lengthMm: primaryMaterial?.slab_length_mm ?? 3000,
        widthMm: primaryMaterial?.slab_width_mm ?? 1400,
      },
    },
    slabCount,
    pieces,
    summary: {
      totalPieces: pieces.length,
      totalCutLm: roundTo(totalCutLm, 3),
      totalPolishLm: roundTo(totalPolishLm, 3),
      totalMitreLm: roundTo(totalMitreLm, 3),
      totalCutouts,
      oversizePieces,
      totalJoins,
    },
  };

  return exportPayload;
}

// ── Helper functions ────────────────────────────────────────────────────

/**
 * Parse an edge field value into a profile name and whether it's finished.
 * Edge values are stored as strings like "Pencil Round", "Mitre", "Raw", etc.
 * A null/empty/raw edge means it is NOT finished.
 */
function parseEdge(edgeValue: string | null | undefined): {
  profile: string;
  isFinished: boolean;
} {
  if (!edgeValue || edgeValue.toLowerCase() === 'raw' || edgeValue.toLowerCase() === 'none') {
    return { profile: 'Raw', isFinished: false };
  }
  return { profile: edgeValue, isFinished: true };
}

/** Check whether an edge value represents a mitred edge. */
function isMitred(edgeValue: string | null | undefined): boolean {
  if (!edgeValue) return false;
  return edgeValue.toLowerCase().includes('mitre');
}

/** Parse the cutouts JSON column into a typed array. */
function parseCutouts(
  cutoutsJson: unknown
): Array<{ type: string; quantity: number }> {
  if (!cutoutsJson || !Array.isArray(cutoutsJson)) return [];
  return (cutoutsJson as CutoutEntry[]).map((c) => ({
    type: c.type ?? 'Unknown',
    quantity: c.quantity ?? c.count ?? 1,
  }));
}

/**
 * Extract lamination strips for a specific piece from the optimisation summary.
 */
function buildLaminationStrips(
  pieceId: string,
  summary: LaminationSummary | null
): ManufacturingPieceExport['laminationStrips'] {
  if (!summary?.stripsByParent) return [];

  const parentEntry = summary.stripsByParent.find(
    (p) => p.parentPieceId === pieceId
  );
  if (!parentEntry) return [];

  return parentEntry.strips.map((s) => ({
    widthMm: s.widthMm,
    lengthMm: s.lengthMm,
    type: s.widthMm <= 40 ? ('MITRE' as const) : ('STANDARD' as const),
  }));
}

/** Round a number to a given number of decimal places. */
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
