import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/quotes/[id]/machine-operations
 *
 * Returns machine operation assignments for every piece in the quote.
 * For each piece, resolves which machine handles each operation type
 * (INITIAL_CUT, EDGE_POLISHING, MITRING, LAMINATION, CUTOUT) based on
 * the piece's edges, thickness, and cutouts.
 *
 * Uses MachineOperationDefault table for default machine assignments.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json(
        { error: 'Invalid quote ID' },
        { status: 400 }
      );
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Load quote with all pieces
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      include: {
        quote_rooms: {
          orderBy: { sort_order: 'asc' },
          include: {
            quote_pieces: {
              orderBy: { sort_order: 'asc' },
            },
          },
        },
      },
    });

    if (!quote) {
      return NextResponse.json(
        { error: 'Quote not found' },
        { status: 404 }
      );
    }

    // Load machine-operation defaults
    const machineDefaults = await prisma.machine_operation_defaults.findMany({
      include: { machine: true },
    });

    const machineByOp = new Map<string, MachineInfo>(
      machineDefaults.map((d: any) => [
        d.operation_type,
        {
          machineId: d.machine.id,
          machineName: d.machine.name,
          kerfMm: d.machine.kerf_width_mm,
        },
      ])
    );

    // Build per-piece operation assignments
    const pieces = quote.quote_rooms.flatMap((room: any) =>
      room.quote_pieces.map((piece: any) => {
        const hasPolishedEdges = [
          piece.edge_top,
          piece.edge_bottom,
          piece.edge_left,
          piece.edge_right,
        ].some(isFinishedEdge);

        const hasMitredEdges = [
          piece.edge_top,
          piece.edge_bottom,
          piece.edge_left,
          piece.edge_right,
        ].some(isMitredEdge);

        const hasLamination =
          piece.lamination_method !== 'NONE' && piece.lamination_method !== null;

        const cutouts = parseCutouts(piece.cutouts);
        const cutoutCount = cutouts.reduce((sum, c) => sum + c.quantity, 0);
        const hasCutouts = cutoutCount > 0;

        const operations = buildOperations({
          hasPolishedEdges,
          hasMitredEdges,
          hasLamination,
          hasCutouts,
          cutoutCount,
          thicknessMm: piece.thickness_mm,
          machineByOp,
        });

        return {
          pieceId: piece.id.toString(),
          label: piece.description || piece.name || 'Unnamed piece',
          room: room.name,
          thicknessMm: piece.thickness_mm,
          operations,
        };
      })
    );

    return NextResponse.json({
      quoteId,
      pieces,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to fetch machine operations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface MachineInfo {
  machineId: string;
  machineName: string;
  kerfMm: number;
}

interface BuildOperationsArgs {
  hasPolishedEdges: boolean;
  hasMitredEdges: boolean;
  hasLamination: boolean;
  hasCutouts: boolean;
  cutoutCount: number;
  thicknessMm: number;
  machineByOp: Map<string, MachineInfo>;
}

interface PieceOperation {
  operationType: string;
  machineName: string;
  machineId: string;
  kerfMm: number;
  isApplicable: boolean;
  reason?: string;
  cutoutCount?: number;
}

function buildOperations({
  hasPolishedEdges,
  hasMitredEdges,
  hasLamination,
  hasCutouts,
  cutoutCount,
  thicknessMm,
  machineByOp,
}: BuildOperationsArgs): PieceOperation[] {
  const ops: PieceOperation[] = [];

  // INITIAL_CUT — always applies
  const cutMachine = machineByOp.get('INITIAL_CUT');
  ops.push({
    operationType: 'INITIAL_CUT',
    machineName: cutMachine?.machineName ?? 'Unassigned',
    machineId: cutMachine?.machineId ?? '',
    kerfMm: cutMachine?.kerfMm ?? 0,
    isApplicable: true,
  });

  // EDGE_POLISHING
  const polishMachine = machineByOp.get('EDGE_POLISHING');
  ops.push({
    operationType: 'EDGE_POLISHING',
    machineName: polishMachine?.machineName ?? 'Unassigned',
    machineId: polishMachine?.machineId ?? '',
    kerfMm: polishMachine?.kerfMm ?? 0,
    isApplicable: hasPolishedEdges,
    ...(!hasPolishedEdges && { reason: 'No polished edges' }),
  });

  // MITRING
  const mitreMachine = machineByOp.get('MITRING');
  ops.push({
    operationType: 'MITRING',
    machineName: mitreMachine?.machineName ?? 'Unassigned',
    machineId: mitreMachine?.machineId ?? '',
    kerfMm: mitreMachine?.kerfMm ?? 0,
    isApplicable: hasMitredEdges,
    ...(!hasMitredEdges && { reason: 'No mitred edges' }),
  });

  // LAMINATION
  const lamMachine = machineByOp.get('LAMINATION');
  ops.push({
    operationType: 'LAMINATION',
    machineName: lamMachine?.machineName ?? 'Unassigned',
    machineId: lamMachine?.machineId ?? '',
    kerfMm: lamMachine?.kerfMm ?? 0,
    isApplicable: hasLamination,
    ...(!hasLamination && {
      reason: thicknessMm < 40
        ? `${thicknessMm}mm — no lamination`
        : 'No lamination method set',
    }),
  });

  // CUTOUT
  const cutoutMachine = machineByOp.get('CUTOUT');
  ops.push({
    operationType: 'CUTOUT',
    machineName: cutoutMachine?.machineName ?? 'Unassigned',
    machineId: cutoutMachine?.machineId ?? '',
    kerfMm: cutoutMachine?.kerfMm ?? 0,
    isApplicable: hasCutouts,
    ...(hasCutouts && { cutoutCount }),
    ...(!hasCutouts && { reason: 'No cutouts' }),
  });

  return ops;
}

function isFinishedEdge(edgeValue: string | null | undefined): boolean {
  if (!edgeValue) return false;
  const lower = edgeValue.toLowerCase();
  return lower !== 'raw' && lower !== 'none';
}

function isMitredEdge(edgeValue: string | null | undefined): boolean {
  if (!edgeValue) return false;
  return edgeValue.toLowerCase().includes('mitre');
}

interface CutoutEntry {
  type: string;
  quantity?: number;
  count?: number;
}

function parseCutouts(
  cutoutsJson: unknown
): Array<{ type: string; quantity: number }> {
  if (!cutoutsJson || !Array.isArray(cutoutsJson)) return [];
  return (cutoutsJson as CutoutEntry[]).map((c) => ({
    type: c.type ?? 'Unknown',
    quantity: c.quantity ?? c.count ?? 1,
  }));
}
