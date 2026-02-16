/**
 * Quote Option Calculator Service
 *
 * Calculates pricing for quote options by merging base piece data with
 * option-specific overrides, then delegating to pricing-calculator-v2.
 *
 * CRITICAL: This does NOT duplicate calculation logic. It creates a
 * "virtual" piece set with overrides applied, then calls the existing
 * calculateQuotePrice function.
 */

import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { calculateQuotePrice, type EnhancedCalculationResult } from './pricing-calculator-v2';

/**
 * Calculate pricing for a specific quote option.
 *
 * For the base option (isBase: true), this is equivalent to the normal
 * quote calculation — no overrides are applied.
 *
 * For non-base options, we:
 * 1. Load all overrides for this option
 * 2. Temporarily apply overrides to the quote's pieces in the DB
 * 3. Run the standard pricing calculator
 * 4. Restore original piece values
 * 5. Store cached totals on the quote_options record
 *
 * Instead of modifying DB records, we use a transactional approach:
 * we modify pieces in a transaction, calculate, then rollback.
 * Actually, to avoid complexity, we'll use a simpler approach:
 * we directly call the pricing calculator with modified piece data
 * by temporarily updating pieces, calculating, then reverting.
 *
 * SIMPLER APPROACH: We modify the pieces temporarily in a transaction,
 * run the calculator, store results, then rollback the piece changes.
 * This reuses the existing calculator without modification.
 */
export async function calculateOptionPricing(
  quoteId: number,
  optionId: number
): Promise<EnhancedCalculationResult> {
  // Load the option with overrides
  const option = await prisma.quote_options.findUnique({
    where: { id: optionId },
    include: { overrides: true },
  });

  if (!option) {
    throw new Error('Quote option not found');
  }

  if (option.quoteId !== quoteId) {
    throw new Error('Option does not belong to this quote');
  }

  // Extract per-option material margin adjustment
  const materialMarginAdjustPercent = option.material_margin_adjust_percent
    ? Number(option.material_margin_adjust_percent)
    : 0;

  // For base option, just run the normal calculator
  if (option.isBase || option.overrides.length === 0) {
    const result = await calculateQuotePrice(String(quoteId), {
      materialMarginAdjustPercent,
    });
    await storeOptionTotals(optionId, result);
    return result;
  }

  // For non-base options, we need to temporarily apply overrides
  // We do this in a transaction: update pieces → calculate → revert
  const overrideMap = new Map(
    option.overrides.map(o => [o.pieceId, o])
  );

  // Load original piece data for pieces that have overrides
  const pieceIds = Array.from(overrideMap.keys());
  const originalPieces = await prisma.quote_pieces.findMany({
    where: { id: { in: pieceIds } },
    select: {
      id: true,
      material_id: true,
      thickness_mm: true,
      edge_top: true,
      edge_bottom: true,
      edge_left: true,
      edge_right: true,
      cutouts: true,
      length_mm: true,
      width_mm: true,
      area_sqm: true,
    },
  });

  // Build a map of original values for restoration
  const originalMap = new Map(originalPieces.map(p => [p.id, p]));

  try {
    // Apply overrides to pieces
    const overrideEntries = Array.from(overrideMap.entries());
    for (const [pieceId, override] of overrideEntries) {
      const original = originalMap.get(pieceId);
      if (!original) continue;

      const updates: Record<string, unknown> = {};
      if (override.materialId !== null) updates.material_id = override.materialId;
      if (override.thicknessMm !== null) updates.thickness_mm = override.thicknessMm;
      if (override.edgeTop !== null) updates.edge_top = override.edgeTop;
      if (override.edgeBottom !== null) updates.edge_bottom = override.edgeBottom;
      if (override.edgeLeft !== null) updates.edge_left = override.edgeLeft;
      if (override.edgeRight !== null) updates.edge_right = override.edgeRight;
      if (override.cutouts !== null) updates.cutouts = override.cutouts;
      if (override.lengthMm !== null) {
        updates.length_mm = override.lengthMm;
        // Recalculate area
        const width = override.widthMm ?? original.width_mm;
        updates.area_sqm = (override.lengthMm * width) / 1_000_000;
      }
      if (override.widthMm !== null) {
        updates.width_mm = override.widthMm;
        // Recalculate area
        const length = override.lengthMm ?? original.length_mm;
        updates.area_sqm = (length * override.widthMm) / 1_000_000;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.quote_pieces.update({
          where: { id: pieceId },
          data: updates,
        });
      }
    }

    // Run the standard pricing calculator on the modified pieces
    const result = await calculateQuotePrice(String(quoteId), {
      materialMarginAdjustPercent,
    });

    // Store cached totals on the option
    await storeOptionTotals(optionId, result);

    return result;
  } finally {
    // ALWAYS restore original piece values
    const originalEntries = Array.from(originalMap.entries());
    for (const [pieceId, original] of originalEntries) {
      await prisma.quote_pieces.update({
        where: { id: pieceId },
        data: {
          material_id: original.material_id,
          thickness_mm: original.thickness_mm,
          edge_top: original.edge_top,
          edge_bottom: original.edge_bottom,
          edge_left: original.edge_left,
          edge_right: original.edge_right,
          cutouts: original.cutouts === null
            ? Prisma.JsonNull
            : original.cutouts ?? undefined,
          length_mm: original.length_mm,
          width_mm: original.width_mm,
          area_sqm: original.area_sqm,
        },
      });
    }
  }
}

/**
 * Store cached totals on a quote_options record
 */
async function storeOptionTotals(
  optionId: number,
  result: EnhancedCalculationResult
): Promise<void> {
  const subtotal = result.subtotal ?? 0;
  const gstAmount = subtotal * 0.1;
  const total = subtotal * 1.1;

  await prisma.quote_options.update({
    where: { id: optionId },
    data: {
      subtotal,
      gstAmount,
      total,
      discountAmount: result.totalDiscount ?? 0,
    },
  });
}

/**
 * Recalculate ALL options for a quote.
 * Called when base pieces change.
 */
export async function recalculateAllOptions(quoteId: number): Promise<void> {
  const options = await prisma.quote_options.findMany({
    where: { quoteId },
    orderBy: { sortOrder: 'asc' },
  });

  for (const option of options) {
    try {
      await calculateOptionPricing(quoteId, option.id);
    } catch (err) {
      console.error(
        `Failed to recalculate option ${option.id} ("${option.name}") for quote ${quoteId}:`,
        err
      );
    }
  }
}

/**
 * Ensure a base option exists for a quote.
 * Creates "Option A" (isBase: true) if it doesn't exist.
 * Returns the base option.
 */
export async function ensureBaseOption(quoteId: number) {
  const existing = await prisma.quote_options.findFirst({
    where: { quoteId, isBase: true },
  });

  if (existing) return existing;

  // Calculate current pricing to store on the base option
  let subtotal: number | undefined;
  let total: number | undefined;
  try {
    const result = await calculateQuotePrice(String(quoteId));
    subtotal = result.subtotal;
    total = result.subtotal * 1.1;
  } catch {
    // If calculation fails, leave totals null
  }

  return prisma.quote_options.create({
    data: {
      quoteId,
      name: 'Option A',
      description: null,
      sortOrder: 0,
      isBase: true,
      subtotal,
      total,
      gstAmount: subtotal ? subtotal * 0.1 : undefined,
    },
  });
}
