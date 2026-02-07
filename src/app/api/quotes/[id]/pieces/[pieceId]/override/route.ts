import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';
import { logActivity } from '@/lib/audit';

// POST /api/quotes/[id]/pieces/[pieceId]/override
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; pieceId: string } }
) {
  try {
    const user = await requireAuth(request);
    const quoteId = parseInt(params.id);
    const pieceId = parseInt(params.pieceId);
    
    if (isNaN(quoteId) || isNaN(pieceId)) {
      return NextResponse.json(
        { error: 'Invalid quote or piece ID' },
        { status: 400 }
      );
    }
    
    const body = await request.json();
    
    // Validate that at least one override is provided
    if (
      body.overrideMaterialCost === undefined &&
      body.overrideFeaturesCost === undefined &&
      body.overrideTotalCost === undefined
    ) {
      return NextResponse.json(
        { error: 'At least one override value must be provided' },
        { status: 400 }
      );
    }
    
    // Update piece with overrides
    const piece = await prisma.quote_pieces.update({
      where: { id: pieceId },
      data: {
        overrideMaterialCost: body.overrideMaterialCost !== undefined ? body.overrideMaterialCost : undefined,
        overrideFeaturesCost: body.overrideFeaturesCost !== undefined ? body.overrideFeaturesCost : undefined,
        overrideTotalCost: body.overrideTotalCost !== undefined ? body.overrideTotalCost : undefined,
        overrideReason: body.reason || null
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
        quote_number: piece.quote_rooms.quotes.quote_number,
        pieceName: piece.name,
        overrideMaterialCost: body.overrideMaterialCost,
        overrideFeaturesCost: body.overrideFeaturesCost,
        overrideTotalCost: body.overrideTotalCost,
        reason: body.reason,
        originalMaterialCost: Number(piece.material_cost),
        originalFeaturesCost: Number(piece.features_cost),
        originalTotalCost: Number(piece.total_cost)
      }
    });
    
    return NextResponse.json({
      success: true,
      piece: {
        id: piece.id,
        name: piece.name,
        materialCost: Number(piece.material_cost),
        featuresCost: Number(piece.features_cost),
        totalCost: Number(piece.total_cost),
        overrideMaterialCost: piece.overrideMaterialCost ? Number(piece.overrideMaterialCost) : null,
        overrideFeaturesCost: piece.overrideFeaturesCost ? Number(piece.overrideFeaturesCost) : null,
        overrideTotalCost: piece.overrideTotalCost ? Number(piece.overrideTotalCost) : null,
        overrideReason: piece.overrideReason
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
  { params }: { params: { id: string; pieceId: string } }
) {
  try {
    const user = await requireAuth(request);
    const pieceId = parseInt(params.pieceId);
    
    if (isNaN(pieceId)) {
      return NextResponse.json(
        { error: 'Invalid piece ID' },
        { status: 400 }
      );
    }
    
    const piece = await prisma.quote_pieces.update({
      where: { id: pieceId },
      data: {
        overrideMaterialCost: null,
        overrideFeaturesCost: null,
        overrideTotalCost: null,
        overrideReason: null
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
        quote_number: piece.quote_rooms.quotes.quote_number,
        pieceName: piece.name
      }
    });
    
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
