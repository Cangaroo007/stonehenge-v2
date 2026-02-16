import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { calculateOptionPricing } from '@/lib/services/quote-option-calculator';

/**
 * PUT /api/quotes/[id]/options/[optionId]/overrides/[overrideId]
 * Update a specific override.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string; overrideId: string }> }
) {
  try {
    const { id, optionId, overrideId } = await params;
    const quoteId = parseInt(id, 10);
    const optId = parseInt(optionId, 10);
    const ovrId = parseInt(overrideId, 10);
    if (isNaN(quoteId) || isNaN(optId) || isNaN(ovrId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const override = await prisma.quote_option_overrides.findUnique({
      where: { id: ovrId },
      include: { option: true },
    });
    if (!override || override.optionId !== optId || override.option.quoteId !== quoteId) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.materialId !== undefined) updates.materialId = body.materialId;
    if (body.thicknessMm !== undefined) updates.thicknessMm = body.thicknessMm;
    if (body.edgeTop !== undefined) updates.edgeTop = body.edgeTop;
    if (body.edgeBottom !== undefined) updates.edgeBottom = body.edgeBottom;
    if (body.edgeLeft !== undefined) updates.edgeLeft = body.edgeLeft;
    if (body.edgeRight !== undefined) updates.edgeRight = body.edgeRight;
    if (body.cutouts !== undefined) updates.cutouts = body.cutouts;
    if (body.lengthMm !== undefined) updates.lengthMm = body.lengthMm;
    if (body.widthMm !== undefined) updates.widthMm = body.widthMm;

    const updated = await prisma.quote_option_overrides.update({
      where: { id: ovrId },
      data: updates,
    });

    // Recalculate option pricing
    try {
      await calculateOptionPricing(quoteId, optId);
    } catch (err) {
      console.error('Failed to recalculate option pricing:', err);
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating override:', error);
    return NextResponse.json(
      { error: 'Failed to update override' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/quotes/[id]/options/[optionId]/overrides/[overrideId]
 * Remove an override (revert piece to base values for this option).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string; overrideId: string }> }
) {
  try {
    const { id, optionId, overrideId } = await params;
    const quoteId = parseInt(id, 10);
    const optId = parseInt(optionId, 10);
    const ovrId = parseInt(overrideId, 10);
    if (isNaN(quoteId) || isNaN(optId) || isNaN(ovrId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const override = await prisma.quote_option_overrides.findUnique({
      where: { id: ovrId },
      include: { option: true },
    });
    if (!override || override.optionId !== optId || override.option.quoteId !== quoteId) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }

    await prisma.quote_option_overrides.delete({ where: { id: ovrId } });

    // Recalculate option pricing
    try {
      await calculateOptionPricing(quoteId, optId);
    } catch (err) {
      console.error('Failed to recalculate option pricing:', err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting override:', error);
    return NextResponse.json(
      { error: 'Failed to delete override' },
      { status: 500 }
    );
  }
}
