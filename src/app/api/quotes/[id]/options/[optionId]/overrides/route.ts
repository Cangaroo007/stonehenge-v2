import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { calculateOptionPricing } from '@/lib/services/quote-option-calculator';

/**
 * POST /api/quotes/[id]/options/[optionId]/overrides
 * Set overrides for pieces in this option.
 *
 * Body:
 * {
 *   overrides: [
 *     { pieceId: number, materialId?: number, thicknessMm?: number, edgeTop?: string, ... }
 *   ]
 * }
 *
 * Uses upsert — if an override already exists for a piece, it updates it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { id, optionId } = await params;
    const quoteId = parseInt(id, 10);
    const optId = parseInt(optionId, 10);
    if (isNaN(quoteId) || isNaN(optId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const option = await prisma.quote_options.findUnique({
      where: { id: optId },
    });
    if (!option || option.quoteId !== quoteId) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }
    if (option.isBase) {
      return NextResponse.json(
        { error: 'Cannot set overrides on the base option' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { overrides } = body;

    if (!Array.isArray(overrides) || overrides.length === 0) {
      return NextResponse.json(
        { error: 'overrides array is required' },
        { status: 400 }
      );
    }

    // Upsert each override
    const results = [];
    for (const override of overrides) {
      if (!override.pieceId) continue;

      const data: Record<string, unknown> = {};
      if (override.materialId !== undefined) data.materialId = override.materialId;
      if (override.thicknessMm !== undefined) data.thicknessMm = override.thicknessMm;
      if (override.edgeTop !== undefined) data.edgeTop = override.edgeTop;
      if (override.edgeBottom !== undefined) data.edgeBottom = override.edgeBottom;
      if (override.edgeLeft !== undefined) data.edgeLeft = override.edgeLeft;
      if (override.edgeRight !== undefined) data.edgeRight = override.edgeRight;
      if (override.cutouts !== undefined) data.cutouts = override.cutouts;
      if (override.lengthMm !== undefined) data.lengthMm = override.lengthMm;
      if (override.widthMm !== undefined) data.widthMm = override.widthMm;

      const result = await prisma.quote_option_overrides.upsert({
        where: {
          optionId_pieceId: {
            optionId: optId,
            pieceId: override.pieceId,
          },
        },
        create: {
          optionId: optId,
          pieceId: override.pieceId,
          ...data,
        },
        update: data,
      });
      results.push(result);
    }

    // Recalculate option pricing
    try {
      await calculateOptionPricing(quoteId, optId);
    } catch (err) {
      console.error('Failed to recalculate option pricing:', err);
    }

    // Return updated option with all overrides
    const updated = await prisma.quote_options.findUnique({
      where: { id: optId },
      include: { overrides: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error setting overrides:', error);
    return NextResponse.json(
      { error: 'Failed to set overrides' },
      { status: 500 }
    );
  }
}
