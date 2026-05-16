import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { logActivity } from '@/lib/audit';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';

const decimalOrNull = (value: unknown) => value == null ? null : Number(value);

async function recalculateQuote(quoteId: number) {
  try {
    const calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
    await prisma.quotes.update({
      where: { id: quoteId },
      data: {
        subtotal: calcResult.subtotal,
        total: calcResult.total,
        tax_amount: calcResult.gstAmount,
        calculated_total: calcResult.total,
        calculated_at: new Date(),
        calculation_breakdown: calcResult as unknown as object,
      },
    });
  } catch (error) {
    console.error('Piece override changed but recalculation failed:', error);
  }
}

// POST /api/quotes/[id]/pieces/[pieceId]/override
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pieceId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { id, pieceId: pieceIdParam } = await params;
    const quoteId = parseInt(id);
    const pieceId = parseInt(pieceIdParam);

    if (isNaN(quoteId) || isNaN(pieceId)) {
      return NextResponse.json(
        { error: 'Invalid quote or piece ID' },
        { status: 400 }
      );
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();
    
    const overrideFabricationCost =
      body.overrideFabricationCost !== undefined
        ? body.overrideFabricationCost
        : body.overrideTotalCost !== undefined
        ? body.overrideTotalCost
        : undefined;

    // Validate that at least one override is provided
    if (
      body.overrideMaterialCost === undefined &&
      body.overrideSlabPrice === undefined &&
      overrideFabricationCost === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one override value must be provided' },
        { status: 400 }
      );
    }

    const currentPiece = await prisma.quote_pieces.findFirst({
      where: {
        id: pieceId,
        quote_rooms: { quote_id: quoteId },
      },
      include: {
        quote_rooms: {
          include: {
            quotes: {
              select: { quote_number: true },
            },
          },
        },
      },
    });

    if (!currentPiece) {
      return NextResponse.json({ error: 'Piece not found in this quote' }, { status: 404 });
    }

    // Update piece with current schema override fields.
    const piece = await prisma.quote_pieces.update({
      where: { id: pieceId },
      data: {
        override_material_cost: body.overrideMaterialCost !== undefined ? body.overrideMaterialCost : undefined,
        override_slab_price: body.overrideSlabPrice !== undefined ? body.overrideSlabPrice : undefined,
        override_fabrication_cost: overrideFabricationCost !== undefined ? overrideFabricationCost : undefined,
      },
      include: {
        quote_rooms: {
          include: {
            quotes: {
              select: {
                quote_number: true
              }
            }
          }
        },
        materials: true
      }
    });

    // Log the override action
    await logActivity({
      userId: user.id,
      action: 'PIECE_OVERRIDE_APPLIED',
      entity: 'QUOTE_PIECE',
      entityId: pieceId.toString(),
      details: {
        quote_number: (piece as any).quote_rooms?.quotes?.quote_number,
        pieceName: piece.name,
        overrideMaterialCost: body.overrideMaterialCost,
        overrideSlabPrice: body.overrideSlabPrice,
        overrideFabricationCost,
        reason: body.reason,
        // DEPRECATED: material_cost/total_cost are unreliable — use quotes.calculation_breakdown
        // Kept for override audit context. Do not read these values for display.
        originalMaterialCost: Number(piece.material_cost),
        originalFeaturesCost: Number(piece.features_cost),
        originalTotalCost: Number(piece.total_cost)
      }
    });

    await recalculateQuote(quoteId);
    
    return NextResponse.json({
      success: true,
      piece: {
        id: piece.id,
        name: piece.name,
        // DEPRECATED: material_cost/total_cost are unreliable — use quotes.calculation_breakdown
        // Kept for API response shape compatibility. Do not read these values for display.
        materialCost: Number(piece.material_cost),
        featuresCost: Number(piece.features_cost),
        totalCost: Number(piece.total_cost),
        overrideMaterialCost: decimalOrNull(piece.override_material_cost),
        overrideSlabPrice: decimalOrNull(piece.override_slab_price),
        overrideFabricationCost: decimalOrNull(piece.override_fabrication_cost),
      }
    });
  } catch (error: any) {
    console.error('Error applying piece override:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to apply override' },
      { status: 400 }
    );
  }
}

// DELETE /api/quotes/[id]/pieces/[pieceId]/override - Clear piece overrides
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pieceId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { id, pieceId: pieceIdParam } = await params;
    const quoteId = parseInt(id);
    const pieceId = parseInt(pieceIdParam);

    if (isNaN(quoteId) || isNaN(pieceId)) {
      return NextResponse.json(
        { error: 'Invalid quote or piece ID' },
        { status: 400 }
      );
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const piece = await prisma.quote_pieces.update({
      where: { id: pieceId },
      data: {
        override_material_cost: null,
        override_slab_price: null,
        override_fabrication_cost: null,
      },
      include: {
        quote_rooms: {
          include: {
            quotes: {
              select: {
                quote_number: true
              }
            }
          }
        }
      }
    });

    // Log the override removal
    await logActivity({
      userId: user.id,
      action: 'PIECE_OVERRIDE_REMOVED',
      entity: 'QUOTE_PIECE',
      entityId: pieceId.toString(),
      details: {
        quote_number: (piece as any).quote_rooms?.quotes?.quote_number,
        pieceName: piece.name
      }
    });

    await recalculateQuote(quoteId);
    
    return NextResponse.json({
      success: true,
      message: 'Piece overrides cleared'
    });
  } catch (error: any) {
    console.error('Error clearing piece overrides:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear overrides' },
      { status: 400 }
    );
  }
}
