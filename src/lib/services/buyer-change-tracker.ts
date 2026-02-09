/**
 * Buyer Change Tracker Service (9.6)
 *
 * Tracks buyer-requested changes to apartment units — material upgrades,
 * edge changes, cutout additions, thickness changes. Maintains an immutable
 * snapshot of the original quote for cost delta calculation.
 */

import prisma from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import type { BuyerChange, QuoteSnapshot } from '@/lib/types/unit-templates';
import { calculateQuotePrice } from './pricing-calculator-v2';

// ─── Snapshot Management ───

/**
 * Build a QuoteSnapshot from a unit's linked quote.
 * Returns null if the unit has no linked quote.
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
 * Take a snapshot of the unit's quote. Only saves if no snapshot exists yet
 * (the snapshot is immutable — it represents the "as generated" state).
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
}

// ─── Change Recording ───

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
 */
export async function getUnitChangeHistory(
  unitId: number
): Promise<{
  originalTotal: number;
  currentTotal: number;
  costDelta: number;
  changes: BuyerChange[];
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

  return {
    originalTotal,
    currentTotal,
    costDelta: currentTotal - originalTotal,
    changes: changes || [],
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
  }>;
  changesByType: Record<string, { count: number; totalImpact: number }>;
}> {
  const units = await prisma.unit_block_units.findMany({
    where: {
      projectId,
      changeHistory: { not: Prisma.DbNull },
    },
    include: {
      quote: {
        select: { total: true },
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
  }> = [];
  const changesByType: Record<string, { count: number; totalImpact: number }> = {};

  for (const unit of units) {
    const changes = unit.changeHistory as unknown as BuyerChange[] | null;
    if (!changes || changes.length === 0) continue;

    const snapshot = unit.originalQuoteSnapshot as unknown as QuoteSnapshot | null;
    const currentTotal = unit.quote ? Number(unit.quote.total) : 0;
    const originalTotal = snapshot?.grandTotal ?? currentTotal;
    const unitDelta = currentTotal - originalTotal;

    totalChanges += changes.length;
    totalCostImpact += unitDelta;

    changesByUnit.push({
      unitNumber: unit.unitNumber,
      unitId: unit.id,
      changeCount: changes.length,
      costDelta: unitDelta,
      changes,
    });

    for (const change of changes) {
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
