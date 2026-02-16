import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import {
  ensureBaseOption,
  calculateOptionPricing,
} from '@/lib/services/quote-option-calculator';

/**
 * GET /api/quotes/[id]/options
 * List all options for a quote with cached totals.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id, 10);
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const options = await prisma.quote_options.findMany({
      where: { quoteId },
      include: {
        overrides: true,
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Serialize Decimal fields to numbers for the frontend
    const serialized = options.map(opt => ({
      ...opt,
      subtotal: opt.subtotal ? Number(opt.subtotal) : null,
      discountAmount: opt.discountAmount ? Number(opt.discountAmount) : null,
      gstAmount: opt.gstAmount ? Number(opt.gstAmount) : null,
      total: opt.total ? Number(opt.total) : null,
      material_margin_adjust_percent: Number(opt.material_margin_adjust_percent ?? 0),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching quote options:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote options' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/quotes/[id]/options
 * Create a new option for a quote.
 *
 * Body:
 * {
 *   name: string;
 *   description?: string;
 *   copyFrom?: number; // optionId to clone overrides from
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id, 10);
    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    // Verify quote exists
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { id: true },
    });
    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, copyFrom } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    // Auto-create base option (Option A) if this is the first non-base option
    await ensureBaseOption(quoteId);

    // Determine sort order
    const maxSortOrder = await prisma.quote_options.aggregate({
      where: { quoteId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;

    // Create the new option
    const newOption = await prisma.quote_options.create({
      data: {
        quoteId,
        name,
        description: description || null,
        sortOrder,
        isBase: false,
        material_margin_adjust_percent: body.materialMarginAdjustPercent ?? 0,
      },
    });

    // If copying from another option, clone its overrides
    if (copyFrom) {
      const sourceOverrides = await prisma.quote_option_overrides.findMany({
        where: { optionId: copyFrom },
      });

      if (sourceOverrides.length > 0) {
        await prisma.quote_option_overrides.createMany({
          data: sourceOverrides.map(o => ({
            optionId: newOption.id,
            pieceId: o.pieceId,
            materialId: o.materialId,
            thicknessMm: o.thicknessMm,
            edgeTop: o.edgeTop,
            edgeBottom: o.edgeBottom,
            edgeLeft: o.edgeLeft,
            edgeRight: o.edgeRight,
            cutouts: o.cutouts === null
              ? Prisma.JsonNull
              : o.cutouts ?? undefined,
            lengthMm: o.lengthMm,
            widthMm: o.widthMm,
          })),
        });
      }
    }

    // Calculate pricing for the new option
    try {
      await calculateOptionPricing(quoteId, newOption.id);
    } catch (err) {
      console.error('Failed to calculate option pricing:', err);
    }

    // Return the option with overrides
    const result = await prisma.quote_options.findUnique({
      where: { id: newOption.id },
      include: { overrides: true },
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating quote option:', error);
    return NextResponse.json(
      { error: 'Failed to create quote option' },
      { status: 500 }
    );
  }
}
