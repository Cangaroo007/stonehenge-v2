/**
 * Buyer Change Tracker Service (9.6 + 9.13)
 *
 * Tracks buyer-requested changes to apartment units — material upgrades,
 * edge changes, cutout additions, thickness changes. Maintains an immutable
 * snapshot of the original quote for cost delta calculation.
 *
 * 9.13 additions:
 * - Table-based snapshots (buyer_change_snapshots)
 * - Table-based change records (buyer_change_records)
 * - Automatic snapshot comparison to detect changes
 * - Auto-recording on quote save for unit-linked quotes
 */

import prisma from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import type { BuyerChange, QuoteSnapshot } from '@/lib/types/unit-templates';
import { calculateQuotePrice } from './pricing-calculator-v2';

// ─── Rich Snapshot Type (for table-based snapshots) ───

export interface DetailedQuoteSnapshot {
  quoteId: number;
  rooms: Array<{
    name: string;
    pieces: Array<{
      name: string;
      materialId: number | null;
      materialName: string;
      length_mm: number;
      width_mm: number;
      thickness_mm: number;
      edges: Record<string, string | null>;
      cutouts: Array<{ type: string; quantity: number }>;
      totalCost: number;
    }>;
  }>;
  subtotal: number;
  gst: number;
  total: number;
}

export interface ChangeDetection {
  changeType: string;
  description: string;
  pieceName: string | null;
  roomName: string | null;
  previousValue: string | null;
  newValue: string | null;
  costDelta: number;
}

// ─── Snapshot Management (Legacy JSON) ───

/**
 * Build a QuoteSnapshot from a unit's linked quote (legacy format).
 */
async function buildQuoteSnapshot(quoteId: number): Promise<QuoteSnapshot | null> {
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteId },
    include: {
      quote_rooms: {
        include: {
          quote_pieces: {
            include: { materials: true },
          },
        },
      },
    },
  });

  if (!quote) return null;

  const pieces: QuoteSnapshot['pieces'] = [];
  for (const room of quote.quote_rooms) {
    for (const piece of room.quote_pieces) {
      const cutoutsRaw = piece.cutouts as unknown as Array<{ type: string; quantity: number }>;
      pieces.push({
        label: piece.name || 'Piece',
        material: piece.materials?.name || piece.material_name || 'Unknown',
        dimensions: `${piece.length_mm}×${piece.width_mm}×${piece.thickness_mm}mm`,
        edges: [
          piece.edge_top ? `T:${piece.edge_top}` : null,
          piece.edge_bottom ? `B:${piece.edge_bottom}` : null,
          piece.edge_left ? `L:${piece.edge_left}` : null,
          piece.edge_right ? `R:${piece.edge_right}` : null,
        ].filter(Boolean).join(', ') || 'None',
        cutouts: Array.isArray(cutoutsRaw)
          ? cutoutsRaw.map(c => `${c.type} ×${c.quantity}`)
          : [],
        // DEPRECATED: total_cost is unreliable — use quotes.calculation_breakdown
        // Kept for change snapshot data preservation. Do not read this value for display.
        lineTotal: Number(piece.total_cost),
      });
    }
  }

  return {
    snapshotDate: new Date().toISOString(),
    subtotalExGst: Number(quote.subtotal),
    gstAmount: Number(quote.tax_amount),
    grandTotal: Number(quote.total),
    pieces,
  };
}

/**
 * Take a snapshot of the unit's quote (legacy JSON field).
 * Only saves if no snapshot exists yet.
 */
export async function snapshotQuote(unitId: number): Promise<void> {
  const unit = await prisma.unit_block_units.findUnique({
    where: { id: unitId },
  });

  if (!unit || !unit.quoteId) return;

  // Don't overwrite existing snapshot
  if (unit.originalQuoteSnapshot) return;

  const snapshot = await buildQuoteSnapshot(unit.quoteId);
  if (!snapshot) return;

  await prisma.unit_block_units.update({
    where: { id: unitId },
    data: {
      originalQuoteSnapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  });

  // Also save to buyer_change_snapshots table
  await saveSnapshotToTable(unitId, unit.quoteId, 'STANDARD');
}

// ─── Table-Based Snapshot Management (9.13) ───

/**
 * Build a DetailedQuoteSnapshot from a quote — richer format for
 * table-based snapshots that enables precise change comparison.
 */
async function buildDetailedSnapshot(quoteId: number): Promise<DetailedQuoteSnapshot | null> {
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteId },
    include: {
      quote_rooms: {
        orderBy: { sort_order: 'asc' },
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
            include: { materials: true },
          },
        },
      },
    },
  });

  if (!quote) return null;

  return {
    quoteId,
    rooms: quote.quote_rooms.map(room => ({
      name: room.name,
      pieces: room.quote_pieces.map(piece => ({
        name: piece.name || 'Piece',
        materialId: piece.material_id,
        materialName: piece.materials?.name || piece.material_name || 'Unknown',
        length_mm: piece.length_mm,
        width_mm: piece.width_mm,
        thickness_mm: piece.thickness_mm,
        edges: {
          top: piece.edge_top,
          bottom: piece.edge_bottom,
          left: piece.edge_left,
          right: piece.edge_right,
        },
        cutouts: Array.isArray(piece.cutouts)
          ? (piece.cutouts as unknown as Array<{ type: string; quantity: number }>)
          : [],
        // DEPRECATED: total_cost is unreliable — use quotes.calculation_breakdown
        // Kept for change snapshot data preservation. Do not read this value for display.
        totalCost: Number(piece.total_cost),
      })),
    })),
    subtotal: Number(quote.subtotal),
    gst: Number(quote.tax_amount),
    total: Number(quote.total),
  };
}

/**
 * Save a snapshot to the buyer_change_snapshots table.
 */
async function saveSnapshotToTable(
  unitId: number,
  quoteId: number,
  snapshotType: 'STANDARD' | 'BUYER_CHANGE'
): Promise<number> {
  const snapshot = await buildDetailedSnapshot(quoteId);
  if (!snapshot) throw new Error(`Quote ${quoteId} not found for snapshot`);

  const record = await prisma.buyer_change_snapshots.create({
    data: {
      unitId,
      quoteId,
      snapshotData: snapshot as unknown as Prisma.InputJsonValue,
      snapshotType,
    },
  });

  return record.id;
}

/**
 * Take a snapshot of a quote's current state and save to table.
 * Called automatically after bulk generation (STANDARD) and
 * before/after buyer changes (BUYER_CHANGE).
 */
export async function snapshotQuoteToTable(
  unitId: number,
  quoteId: number,
  snapshotType: 'STANDARD' | 'BUYER_CHANGE'
): Promise<number> {
  return saveSnapshotToTable(unitId, quoteId, snapshotType);
}

/**
 * Ensure a STANDARD snapshot exists for a unit.
 * Creates one if missing (both legacy JSON and table-based).
 */
export async function ensureStandardSnapshot(unitId: number): Promise<void> {
  const unit = await prisma.unit_block_units.findUnique({
    where: { id: unitId },
  });

  if (!unit || !unit.quoteId) return;

  // Ensure legacy JSON snapshot
  if (!unit.originalQuoteSnapshot) {
    const snapshot = await buildQuoteSnapshot(unit.quoteId);
    if (snapshot) {
      await prisma.unit_block_units.update({
        where: { id: unitId },
        data: {
          originalQuoteSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  // Ensure table-based STANDARD snapshot
  const existingTableSnapshot = await prisma.buyer_change_snapshots.findFirst({
    where: { unitId, snapshotType: 'STANDARD' },
  });

  if (!existingTableSnapshot) {
    await saveSnapshotToTable(unitId, unit.quoteId, 'STANDARD');
  }
}

// ─── Snapshot Comparison (9.13) ───

/**
 * Compare two detailed snapshots and generate change records.
 * Detects material, edge, cutout, dimension, and piece add/remove changes.
 */
export function compareSnapshots(
  before: DetailedQuoteSnapshot,
  after: DetailedQuoteSnapshot
): ChangeDetection[] {
  const changes: ChangeDetection[] = [];

  // Build lookup maps by room name → piece name
  type PieceWithRoom = DetailedQuoteSnapshot['rooms'][0]['pieces'][0] & { roomName: string };
  const beforePieces: Record<string, PieceWithRoom> = {};
  const afterPieces: Record<string, PieceWithRoom> = {};

  for (const room of before.rooms) {
    for (const piece of room.pieces) {
      const key = `${room.name}::${piece.name}`;
      beforePieces[key] = { ...piece, roomName: room.name };
    }
  }

  for (const room of after.rooms) {
    for (const piece of room.pieces) {
      const key = `${room.name}::${piece.name}`;
      afterPieces[key] = { ...piece, roomName: room.name };
    }
  }

  // Check for removed pieces
  for (const key of Object.keys(beforePieces)) {
    const beforePiece = beforePieces[key];
    if (!afterPieces[key]) {
      changes.push({
        changeType: 'PIECE_REMOVE',
        description: `Removed ${beforePiece.name} from ${beforePiece.roomName}`,
        pieceName: beforePiece.name,
        roomName: beforePiece.roomName,
        previousValue: `${beforePiece.materialName} (${beforePiece.length_mm}×${beforePiece.width_mm}mm)`,
        newValue: null,
        costDelta: -beforePiece.totalCost,
      });
    }
  }

  // Check for added pieces and modifications
  for (const key of Object.keys(afterPieces)) {
    const afterPiece = afterPieces[key];
    const beforePiece = beforePieces[key];

    if (!beforePiece) {
      changes.push({
        changeType: 'PIECE_ADD',
        description: `Added ${afterPiece.name} to ${afterPiece.roomName}`,
        pieceName: afterPiece.name,
        roomName: afterPiece.roomName,
        previousValue: null,
        newValue: `${afterPiece.materialName} (${afterPiece.length_mm}×${afterPiece.width_mm}mm)`,
        costDelta: afterPiece.totalCost,
      });
      continue;
    }

    // Material change
    if (beforePiece.materialName !== afterPiece.materialName) {
      const isUpgrade = afterPiece.totalCost >= beforePiece.totalCost;
      changes.push({
        changeType: isUpgrade ? 'MATERIAL_UPGRADE' : 'MATERIAL_DOWNGRADE',
        description: `Changed ${afterPiece.name} material from ${beforePiece.materialName} to ${afterPiece.materialName}`,
        pieceName: afterPiece.name,
        roomName: afterPiece.roomName,
        previousValue: beforePiece.materialName,
        newValue: afterPiece.materialName,
        costDelta: afterPiece.totalCost - beforePiece.totalCost,
      });
    }

    // Edge changes
    const edgeNames = ['top', 'bottom', 'left', 'right'] as const;
    for (const edgeName of edgeNames) {
      const oldEdge = beforePiece.edges[edgeName] || null;
      const newEdge = afterPiece.edges[edgeName] || null;
      if (oldEdge !== newEdge) {
        changes.push({
          changeType: 'EDGE_CHANGE',
          description: `Changed ${edgeName} edge on ${afterPiece.name} from ${oldEdge || 'RAW'} to ${newEdge || 'RAW'}`,
          pieceName: afterPiece.name,
          roomName: afterPiece.roomName,
          previousValue: oldEdge || 'RAW',
          newValue: newEdge || 'RAW',
          costDelta: 0, // Edge cost is baked into piece totalCost
        });
      }
    }

    // Dimension changes
    if (
      beforePiece.length_mm !== afterPiece.length_mm ||
      beforePiece.width_mm !== afterPiece.width_mm ||
      beforePiece.thickness_mm !== afterPiece.thickness_mm
    ) {
      changes.push({
        changeType: 'DIMENSION_CHANGE',
        description: `Changed dimensions on ${afterPiece.name} from ${beforePiece.length_mm}×${beforePiece.width_mm}×${beforePiece.thickness_mm}mm to ${afterPiece.length_mm}×${afterPiece.width_mm}×${afterPiece.thickness_mm}mm`,
        pieceName: afterPiece.name,
        roomName: afterPiece.roomName,
        previousValue: `${beforePiece.length_mm}×${beforePiece.width_mm}×${beforePiece.thickness_mm}mm`,
        newValue: `${afterPiece.length_mm}×${afterPiece.width_mm}×${afterPiece.thickness_mm}mm`,
        costDelta: afterPiece.totalCost - beforePiece.totalCost,
      });
    }

    // Cutout changes
    const beforeCutouts: Record<string, number> = {};
    const afterCutouts: Record<string, number> = {};
    for (const c of beforePiece.cutouts) { beforeCutouts[c.type] = c.quantity; }
    for (const c of afterPiece.cutouts) { afterCutouts[c.type] = c.quantity; }

    // Removed cutouts
    for (const type of Object.keys(beforeCutouts)) {
      const qty = beforeCutouts[type];
      if (afterCutouts[type] === undefined) {
        changes.push({
          changeType: 'CUTOUT_REMOVE',
          description: `Removed ${qty}× ${type} from ${afterPiece.name}`,
          pieceName: afterPiece.name,
          roomName: afterPiece.roomName,
          previousValue: `${type} ×${qty}`,
          newValue: null,
          costDelta: 0,
        });
      } else if (afterCutouts[type] < qty) {
        const removed = qty - afterCutouts[type];
        changes.push({
          changeType: 'CUTOUT_REMOVE',
          description: `Removed ${removed}× ${type} from ${afterPiece.name}`,
          pieceName: afterPiece.name,
          roomName: afterPiece.roomName,
          previousValue: `${type} ×${qty}`,
          newValue: `${type} ×${afterCutouts[type]}`,
          costDelta: 0,
        });
      }
    }

    // Added cutouts
    for (const type of Object.keys(afterCutouts)) {
      const qty = afterCutouts[type];
      if (beforeCutouts[type] === undefined) {
        changes.push({
          changeType: 'CUTOUT_ADD',
          description: `Added ${qty}× ${type} to ${afterPiece.name}`,
          pieceName: afterPiece.name,
          roomName: afterPiece.roomName,
          previousValue: null,
          newValue: `${type} ×${qty}`,
          costDelta: 0,
        });
      } else if (beforeCutouts[type] < qty) {
        const added = qty - beforeCutouts[type];
        changes.push({
          changeType: 'CUTOUT_ADD',
          description: `Added ${added}× ${type} to ${afterPiece.name}`,
          pieceName: afterPiece.name,
          roomName: afterPiece.roomName,
          previousValue: `${type} ×${beforeCutouts[type]}`,
          newValue: `${type} ×${qty}`,
          costDelta: 0,
        });
      }
    }
  }

  // Distribute total cost delta across changes if edge/cutout changes exist
  // but individual cost deltas are 0
  const totalDelta = after.total - before.total;
  const changeCostSum = changes.reduce((sum, c) => sum + c.costDelta, 0);
  if (totalDelta !== 0 && changeCostSum === 0 && changes.length > 0) {
    // Distribute evenly when we can't determine per-change cost
    const perChange = totalDelta / changes.length;
    for (const change of changes) {
      change.costDelta = Math.round(perChange * 100) / 100;
    }
  }

  return changes;
}

/**
 * Record buyer changes by comparing current quote state against the STANDARD snapshot.
 * Creates change records in the buyer_change_records table.
 */
export async function recordBuyerChangeFromSnapshot(
  unitId: number,
  quoteId: number,
  changedBy?: string
): Promise<{
  changesRecorded: number;
  totalDelta: number;
}> {
  // Ensure a STANDARD snapshot exists
  await ensureStandardSnapshot(unitId);

  // Load the STANDARD snapshot
  const standardSnapshot = await prisma.buyer_change_snapshots.findFirst({
    where: { unitId, snapshotType: 'STANDARD' },
    orderBy: { createdAt: 'asc' },
  });

  if (!standardSnapshot) {
    return { changesRecorded: 0, totalDelta: 0 };
  }

  const beforeData = standardSnapshot.snapshotData as unknown as DetailedQuoteSnapshot;

  // Build current snapshot
  const afterData = await buildDetailedSnapshot(quoteId);
  if (!afterData) {
    return { changesRecorded: 0, totalDelta: 0 };
  }

  // Compare
  const detectedChanges = compareSnapshots(beforeData, afterData);

  if (detectedChanges.length === 0) {
    return { changesRecorded: 0, totalDelta: 0 };
  }

  // Save BUYER_CHANGE snapshot
  await saveSnapshotToTable(unitId, quoteId, 'BUYER_CHANGE');

  // Delete old change records for this unit (replace with fresh comparison)
  await prisma.buyer_change_records.deleteMany({
    where: { unitId },
  });

  // Create new change records
  await prisma.buyer_change_records.createMany({
    data: detectedChanges.map(change => ({
      unitId,
      changeType: change.changeType,
      description: change.description,
      pieceName: change.pieceName,
      roomName: change.roomName,
      previousValue: change.previousValue,
      newValue: change.newValue,
      costDelta: change.costDelta,
      createdBy: changedBy || null,
    })),
  });

  const totalDelta = afterData.total - beforeData.total;

  // Also update the legacy JSON fields on the unit
  const unit = await prisma.unit_block_units.findUnique({
    where: { id: unitId },
  });

  if (unit) {
    // Build legacy BuyerChange records from detected changes
    const legacyChanges: BuyerChange[] = detectedChanges.map(c => ({
      id: uuidv4(),
      unitId,
      unitNumber: unit.unitNumber,
      changeType: mapChangeTypeToLegacy(c.changeType),
      description: c.description,
      originalValue: c.previousValue || '',
      newValue: c.newValue || '',
      costImpact: c.costDelta,
      timestamp: new Date().toISOString(),
      recordedBy: changedBy,
    }));

    await prisma.unit_block_units.update({
      where: { id: unitId },
      data: {
        changeHistory: legacyChanges as unknown as Prisma.InputJsonValue,
        costDelta: totalDelta,
        lastChangeAt: new Date(),
        status: 'BUYER_CHANGE',
        changeNotes: detectedChanges.map(c => c.description).join('; '),
      },
    });
  }

  return {
    changesRecorded: detectedChanges.length,
    totalDelta,
  };
}

function mapChangeTypeToLegacy(changeType: string): BuyerChange['changeType'] {
  switch (changeType) {
    case 'MATERIAL_UPGRADE':
    case 'MATERIAL_DOWNGRADE':
      return 'MATERIAL_UPGRADE';
    case 'EDGE_CHANGE':
      return 'EDGE_CHANGE';
    case 'CUTOUT_ADD':
    case 'CUTOUT_REMOVE':
      return 'CUTOUT_CHANGE';
    case 'DIMENSION_CHANGE':
      return 'THICKNESS_CHANGE';
    case 'PIECE_ADD':
    case 'PIECE_REMOVE':
      return 'LAYOUT_CHANGE';
    default:
      return 'OTHER';
  }
}

// ─── Change Recording (Legacy) ───

/**
 * Record a buyer change for a unit. Ensures a snapshot exists before the first
 * change, appends to changeHistory, recalculates costDelta, and updates status.
 */
export async function recordBuyerChange(
  unitId: number,
  change: Omit<BuyerChange, 'id' | 'timestamp'>
): Promise<BuyerChange> {
  const unit = await prisma.unit_block_units.findUnique({
    where: { id: unitId },
  });

  if (!unit) throw new Error(`Unit ${unitId} not found`);
  if (!unit.quoteId) throw new Error(`Unit ${unitId} has no linked quote`);

  // Ensure we have an original snapshot before recording changes
  if (!unit.originalQuoteSnapshot) {
    await snapshotQuote(unitId);
  }

  // Build the full change record
  const changeRecord: BuyerChange = {
    ...change,
    id: uuidv4(),
    timestamp: new Date().toISOString(),
  };

  // Get existing change history
  const existingHistory = unit.changeHistory as unknown as BuyerChange[] | null;
  const history = existingHistory ? [...existingHistory, changeRecord] : [changeRecord];

  // Recalculate cost delta: current quote total - original snapshot total
  const originalSnapshot = unit.originalQuoteSnapshot as unknown as QuoteSnapshot | null;
  const originalTotal = originalSnapshot?.grandTotal ?? 0;

  const currentQuote = await prisma.quotes.findUnique({
    where: { id: unit.quoteId },
    select: { total: true },
  });
  const currentTotal = currentQuote ? Number(currentQuote.total) : 0;
  const costDelta = currentTotal - originalTotal;

  // Update unit
  await prisma.unit_block_units.update({
    where: { id: unitId },
    data: {
      changeHistory: history as unknown as Prisma.InputJsonValue,
      costDelta,
      lastChangeAt: new Date(),
      status: 'BUYER_CHANGE',
      changeNotes: change.description,
    },
  });

  // Also save to buyer_change_records table
  await prisma.buyer_change_records.create({
    data: {
      unitId,
      changeType: change.changeType,
      description: change.description,
      pieceName: null,
      roomName: null,
      previousValue: change.originalValue,
      newValue: change.newValue,
      costDelta: change.costImpact,
      createdBy: change.recordedBy || null,
    },
  });

  return changeRecord;
}

// ─── Change Application ───

/**
 * Apply a material change to a specific piece in a unit's quote.
 * Updates the piece's material, re-runs pricing, and records the change.
 */
export async function applyMaterialChange(
  unitId: number,
  pieceIndex: number,
  newMaterialId: number
): Promise<BuyerChange> {
  const unit = await prisma.unit_block_units.findUnique({
    where: { id: unitId },
  });
  if (!unit || !unit.quoteId) throw new Error(`Unit ${unitId} has no linked quote`);

  // Load quote with pieces
  const quote = await prisma.quotes.findUnique({
    where: { id: unit.quoteId },
    include: {
      quote_rooms: {
        include: {
          quote_pieces: {
            include: { materials: true },
            orderBy: { sort_order: 'asc' },
          },
        },
      },
    },
  });
  if (!quote) throw new Error(`Quote ${unit.quoteId} not found`);

  // Flatten pieces in order
  const allPieces = quote.quote_rooms.flatMap(room => room.quote_pieces);
  if (pieceIndex < 0 || pieceIndex >= allPieces.length) {
    throw new Error(`Piece index ${pieceIndex} out of range (0-${allPieces.length - 1})`);
  }

  const piece = allPieces[pieceIndex];
  const oldMaterialName = piece.materials?.name || piece.material_name || 'Unknown';

  // Get new material
  const newMaterial = await prisma.materials.findUnique({ where: { id: newMaterialId } });
  if (!newMaterial) throw new Error(`Material ${newMaterialId} not found`);

  // Update the piece's material
  await prisma.quote_pieces.update({
    where: { id: piece.id },
    data: {
      material_id: newMaterialId,
      material_name: newMaterial.name,
    },
  });

  // Re-run pricing calculator
  const result = await calculateQuotePrice(String(unit.quoteId));

  // Update quote totals
  await prisma.quotes.update({
    where: { id: unit.quoteId },
    data: {
      subtotal: result.subtotal,
      total: result.total,
      calculated_at: new Date(),
      calculation_breakdown: result as unknown as Prisma.InputJsonValue,
    },
  });

  // Record the change
  return recordBuyerChange(unitId, {
    unitId,
    unitNumber: unit.unitNumber,
    changeType: 'MATERIAL_UPGRADE',
    description: `Changed material on ${piece.name || 'piece'} from ${oldMaterialName} to ${newMaterial.name}`,
    originalValue: oldMaterialName,
    newValue: newMaterial.name,
    costImpact: result.total - Number(quote.total),
  });
}

/**
 * Apply an edge change to a specific piece in a unit's quote.
 */
export async function applyEdgeChange(
  unitId: number,
  pieceIndex: number,
  edge: 'top' | 'bottom' | 'left' | 'right',
  newFinish: string,
  newProfile?: string
): Promise<BuyerChange> {
  const unit = await prisma.unit_block_units.findUnique({
    where: { id: unitId },
  });
  if (!unit || !unit.quoteId) throw new Error(`Unit ${unitId} has no linked quote`);

  const quote = await prisma.quotes.findUnique({
    where: { id: unit.quoteId },
    include: {
      quote_rooms: {
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
          },
        },
      },
    },
  });
  if (!quote) throw new Error(`Quote ${unit.quoteId} not found`);

  const allPieces = quote.quote_rooms.flatMap(room => room.quote_pieces);
  if (pieceIndex < 0 || pieceIndex >= allPieces.length) {
    throw new Error(`Piece index ${pieceIndex} out of range`);
  }

  const piece = allPieces[pieceIndex];
  const edgeField = `edge_${edge}` as const;
  const oldEdge = piece[edgeField] || 'RAW';
  const newEdgeValue = newProfile ? `${newFinish}:${newProfile}` : newFinish;

  // Update the piece's edge
  await prisma.quote_pieces.update({
    where: { id: piece.id },
    data: { [edgeField]: newEdgeValue },
  });

  // Re-run pricing calculator
  const result = await calculateQuotePrice(String(unit.quoteId));

  // Update quote totals
  await prisma.quotes.update({
    where: { id: unit.quoteId },
    data: {
      subtotal: result.subtotal,
      total: result.total,
      calculated_at: new Date(),
      calculation_breakdown: result as unknown as Prisma.InputJsonValue,
    },
  });

  return recordBuyerChange(unitId, {
    unitId,
    unitNumber: unit.unitNumber,
    changeType: 'EDGE_CHANGE',
    description: `Changed ${edge} edge on ${piece.name || 'piece'} from ${oldEdge} to ${newEdgeValue}`,
    originalValue: oldEdge,
    newValue: newEdgeValue,
    costImpact: result.total - Number(quote.total),
  });
}

/**
 * Apply a thickness change to a specific piece in a unit's quote.
 */
export async function applyThicknessChange(
  unitId: number,
  pieceIndex: number,
  newThickness: number
): Promise<BuyerChange> {
  const unit = await prisma.unit_block_units.findUnique({
    where: { id: unitId },
  });
  if (!unit || !unit.quoteId) throw new Error(`Unit ${unitId} has no linked quote`);

  const quote = await prisma.quotes.findUnique({
    where: { id: unit.quoteId },
    include: {
      quote_rooms: {
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
          },
        },
      },
    },
  });
  if (!quote) throw new Error(`Quote ${unit.quoteId} not found`);

  const allPieces = quote.quote_rooms.flatMap(room => room.quote_pieces);
  if (pieceIndex < 0 || pieceIndex >= allPieces.length) {
    throw new Error(`Piece index ${pieceIndex} out of range`);
  }

  const piece = allPieces[pieceIndex];
  const oldThickness = piece.thickness_mm;

  // Determine lamination method based on thickness
  const laminationMethod = newThickness >= 40 ? 'LAMINATED' : 'NONE';

  // Update thickness and lamination
  await prisma.quote_pieces.update({
    where: { id: piece.id },
    data: {
      thickness_mm: newThickness,
      lamination_method: laminationMethod,
    },
  });

  // Re-run pricing calculator
  const result = await calculateQuotePrice(String(unit.quoteId));

  // Update quote totals
  await prisma.quotes.update({
    where: { id: unit.quoteId },
    data: {
      subtotal: result.subtotal,
      total: result.total,
      calculated_at: new Date(),
      calculation_breakdown: result as unknown as Prisma.InputJsonValue,
    },
  });

  return recordBuyerChange(unitId, {
    unitId,
    unitNumber: unit.unitNumber,
    changeType: 'THICKNESS_CHANGE',
    description: `Changed thickness on ${piece.name || 'piece'} from ${oldThickness}mm to ${newThickness}mm`,
    originalValue: `${oldThickness}mm`,
    newValue: `${newThickness}mm`,
    costImpact: result.total - Number(quote.total),
  });
}

/**
 * Add a cutout to a specific piece in a unit's quote.
 */
export async function addCutout(
  unitId: number,
  pieceIndex: number,
  cutoutType: string,
  quantity: number
): Promise<BuyerChange> {
  const unit = await prisma.unit_block_units.findUnique({
    where: { id: unitId },
  });
  if (!unit || !unit.quoteId) throw new Error(`Unit ${unitId} has no linked quote`);

  const quote = await prisma.quotes.findUnique({
    where: { id: unit.quoteId },
    include: {
      quote_rooms: {
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
          },
        },
      },
    },
  });
  if (!quote) throw new Error(`Quote ${unit.quoteId} not found`);

  const allPieces = quote.quote_rooms.flatMap(room => room.quote_pieces);
  if (pieceIndex < 0 || pieceIndex >= allPieces.length) {
    throw new Error(`Piece index ${pieceIndex} out of range`);
  }

  const piece = allPieces[pieceIndex];
  const existingCutouts = piece.cutouts as unknown as Array<{ type: string; quantity: number }>;
  const cutoutsArray = Array.isArray(existingCutouts) ? [...existingCutouts] : [];

  // Add or increment the cutout
  const existingIdx = cutoutsArray.findIndex(c => c.type === cutoutType);
  if (existingIdx >= 0) {
    cutoutsArray[existingIdx] = {
      ...cutoutsArray[existingIdx],
      quantity: cutoutsArray[existingIdx].quantity + quantity,
    };
  } else {
    cutoutsArray.push({ type: cutoutType, quantity });
  }

  // Update piece cutouts
  await prisma.quote_pieces.update({
    where: { id: piece.id },
    data: {
      cutouts: cutoutsArray as unknown as Prisma.InputJsonValue,
    },
  });

  // Re-run pricing calculator
  const result = await calculateQuotePrice(String(unit.quoteId));

  // Update quote totals
  await prisma.quotes.update({
    where: { id: unit.quoteId },
    data: {
      subtotal: result.subtotal,
      total: result.total,
      calculated_at: new Date(),
      calculation_breakdown: result as unknown as Prisma.InputJsonValue,
    },
  });

  return recordBuyerChange(unitId, {
    unitId,
    unitNumber: unit.unitNumber,
    changeType: 'CUTOUT_CHANGE',
    description: `Added ${quantity}× ${cutoutType} cutout to ${piece.name || 'piece'}`,
    originalValue: 'None',
    newValue: `${cutoutType} ×${quantity}`,
    costImpact: result.total - Number(quote.total),
  });
}

// ─── Reporting ───

/**
 * Get the full change history for a unit.
 * Returns both legacy JSON changes and table-based records.
 */
export async function getUnitChangeHistory(
  unitId: number
): Promise<{
  originalTotal: number;
  currentTotal: number;
  costDelta: number;
  changes: BuyerChange[];
  records: Array<{
    id: number;
    changeType: string;
    description: string;
    pieceName: string | null;
    roomName: string | null;
    previousValue: string | null;
    newValue: string | null;
    costDelta: number;
    createdAt: string;
    createdBy: string | null;
  }>;
}> {
  const unit = await prisma.unit_block_units.findUnique({
    where: { id: unitId },
    include: {
      quote: {
        select: { total: true },
      },
    },
  });

  if (!unit) throw new Error(`Unit ${unitId} not found`);

  const snapshot = unit.originalQuoteSnapshot as unknown as QuoteSnapshot | null;
  const changes = unit.changeHistory as unknown as BuyerChange[] | null;
  const currentTotal = unit.quote ? Number(unit.quote.total) : 0;
  const originalTotal = snapshot?.grandTotal ?? currentTotal;

  // Also load table-based records
  const tableRecords = await prisma.buyer_change_records.findMany({
    where: { unitId },
    orderBy: { createdAt: 'asc' },
  });

  return {
    originalTotal,
    currentTotal,
    costDelta: currentTotal - originalTotal,
    changes: changes || [],
    records: tableRecords.map(r => ({
      id: r.id,
      changeType: r.changeType,
      description: r.description,
      pieceName: r.pieceName,
      roomName: r.roomName,
      previousValue: r.previousValue,
      newValue: r.newValue,
      costDelta: Number(r.costDelta),
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy,
    })),
  };
}

/**
 * Get a project-level change report aggregating all buyer changes across units.
 */
export async function getProjectChangeReport(
  projectId: number
): Promise<{
  totalChanges: number;
  unitsWithChanges: number;
  totalCostImpact: number;
  changesByUnit: Array<{
    unitNumber: string;
    unitId: number;
    changeCount: number;
    costDelta: number;
    changes: BuyerChange[];
    records: Array<{
      id: number;
      changeType: string;
      description: string;
      pieceName: string | null;
      roomName: string | null;
      previousValue: string | null;
      newValue: string | null;
      costDelta: number;
      createdAt: string;
      createdBy: string | null;
    }>;
  }>;
  changesByType: Record<string, { count: number; totalImpact: number }>;
}> {
  const units = await prisma.unit_block_units.findMany({
    where: { projectId },
    include: {
      quote: {
        select: { total: true },
      },
      buyerChangeRecords: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { unitNumber: 'asc' },
  });

  let totalChanges = 0;
  let totalCostImpact = 0;
  const changesByUnit: Array<{
    unitNumber: string;
    unitId: number;
    changeCount: number;
    costDelta: number;
    changes: BuyerChange[];
    records: Array<{
      id: number;
      changeType: string;
      description: string;
      pieceName: string | null;
      roomName: string | null;
      previousValue: string | null;
      newValue: string | null;
      costDelta: number;
      createdAt: string;
      createdBy: string | null;
    }>;
  }> = [];
  const changesByType: Record<string, { count: number; totalImpact: number }> = {};

  for (const unit of units) {
    const legacyChanges = unit.changeHistory as unknown as BuyerChange[] | null;
    const tableRecords = unit.buyerChangeRecords;

    // Use table records if available, fall back to legacy
    const hasTableRecords = tableRecords.length > 0;
    const hasLegacyChanges = legacyChanges && legacyChanges.length > 0;

    if (!hasTableRecords && !hasLegacyChanges) continue;

    const snapshot = unit.originalQuoteSnapshot as unknown as QuoteSnapshot | null;
    const currentTotal = unit.quote ? Number(unit.quote.total) : 0;
    const originalTotal = snapshot?.grandTotal ?? currentTotal;
    const unitDelta = currentTotal - originalTotal;

    const records = tableRecords.map(r => ({
      id: r.id,
      changeType: r.changeType,
      description: r.description,
      pieceName: r.pieceName,
      roomName: r.roomName,
      previousValue: r.previousValue,
      newValue: r.newValue,
      costDelta: Number(r.costDelta),
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy,
    }));

    const changeCount = hasTableRecords ? tableRecords.length : (legacyChanges?.length ?? 0);
    totalChanges += changeCount;
    totalCostImpact += unitDelta;

    changesByUnit.push({
      unitNumber: unit.unitNumber,
      unitId: unit.id,
      changeCount,
      costDelta: unitDelta,
      changes: legacyChanges || [],
      records,
    });

    // Aggregate by type — prefer table records
    const changesToAggregate = hasTableRecords
      ? tableRecords.map(r => ({ changeType: r.changeType, costImpact: Number(r.costDelta) }))
      : (legacyChanges || []).map(c => ({ changeType: c.changeType, costImpact: c.costImpact }));

    for (const change of changesToAggregate) {
      if (!changesByType[change.changeType]) {
        changesByType[change.changeType] = { count: 0, totalImpact: 0 };
      }
      changesByType[change.changeType].count += 1;
      changesByType[change.changeType].totalImpact += change.costImpact;
    }
  }

  return {
    totalChanges,
    unitsWithChanges: changesByUnit.length,
    totalCostImpact,
    changesByUnit,
    changesByType,
  };
}

// ─── Auto-trigger for Quote Save (9.13c) ───

/**
 * Check if a quote is linked to a unit_block_unit and auto-record changes.
 * Call this after any quote save/update.
 */
export async function checkAndRecordQuoteChanges(
  quoteId: number,
  changedBy?: string
): Promise<{ triggered: boolean; changesRecorded: number; totalDelta: number }> {
  // Find the unit linked to this quote
  const unit = await prisma.unit_block_units.findUnique({
    where: { quoteId },
  });

  if (!unit) {
    return { triggered: false, changesRecorded: 0, totalDelta: 0 };
  }

  // Check if a STANDARD snapshot exists — if not, this is the first save
  // after generation, so create the snapshot but don't record changes
  const standardSnapshot = await prisma.buyer_change_snapshots.findFirst({
    where: { unitId: unit.id, snapshotType: 'STANDARD' },
  });

  if (!standardSnapshot) {
    // First time — just create the STANDARD snapshot
    await ensureStandardSnapshot(unit.id);
    return { triggered: true, changesRecorded: 0, totalDelta: 0 };
  }

  // Compare and record
  const result = await recordBuyerChangeFromSnapshot(unit.id, quoteId, changedBy);

  return {
    triggered: true,
    changesRecorded: result.changesRecorded,
    totalDelta: result.totalDelta,
  };
}
