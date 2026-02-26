import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

// PATCH — Bulk update material or thickness on multiple pieces
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const data = await request.json();
    const { pieceIds, materialId, thicknessMm } = data as {
      pieceIds: number[];
      materialId?: number | null;
      thicknessMm?: number | null;
    };

    if (!Array.isArray(pieceIds) || pieceIds.length === 0) {
      return NextResponse.json({ error: 'pieceIds array is required' }, { status: 400 });
    }

    if (materialId === undefined && thicknessMm === undefined) {
      return NextResponse.json({ error: 'At least one of materialId or thicknessMm is required' }, { status: 400 });
    }

    // Fetch pieces to verify they belong to this quote
    const pieces = await prisma.quote_pieces.findMany({
      where: {
        id: { in: pieceIds },
        quote_rooms: { quote_id: quoteId },
      },
    });

    if (pieces.length === 0) {
      return NextResponse.json({ error: 'No matching pieces found' }, { status: 404 });
    }

    // Build the update payload
    const updateData: Record<string, unknown> = {};

    if (materialId !== undefined) {
      if (materialId !== null) {
        const material = await prisma.materials.findUnique({
          where: { id: materialId },
          select: { id: true, name: true, price_per_sqm: true },
        });

        if (!material) {
          return NextResponse.json({ error: 'Material not found' }, { status: 404 });
        }

        updateData.material_id = material.id;
        updateData.material_name = material.name;

        // Update each piece individually to recalculate costs
        let updated = 0;
        for (const piece of pieces) {
          const areaSqm = Number(piece.area_sqm);
          const materialCost = areaSqm * Number(material.price_per_sqm);
          const featuresCost = Number(piece.features_cost);

          await prisma.quote_pieces.update({
            where: { id: piece.id },
            data: {
              material_id: material.id,
              material_name: material.name,
              // DEPRECATED: material_cost is unreliable — use quotes.calculation_breakdown
              // Kept to avoid null constraint violations. Do not read this value for display.
              material_cost: materialCost,
              // DEPRECATED: total_cost is unreliable — use quotes.calculation_breakdown
              // Kept to avoid null constraint violations. Do not read this value for display.
              total_cost: materialCost + featuresCost,
              ...(thicknessMm !== undefined && thicknessMm !== null ? { thickness_mm: thicknessMm } : {}),
            },
          });
          updated++;
        }

        // Invalidate stale optimizer results — piece data has changed
        await prisma.slab_optimizations.deleteMany({
          where: { quoteId },
        });

        return NextResponse.json({ updated });
      } else {
        // Clear material
        updateData.material_id = null;
        updateData.material_name = null;
        // DEPRECATED: material_cost is unreliable — use quotes.calculation_breakdown
        // Kept to avoid null constraint violations. Do not read this value for display.
        updateData.material_cost = 0;
      }
    }

    if (thicknessMm !== undefined && thicknessMm !== null) {
      updateData.thickness_mm = thicknessMm;
    }

    // Bulk update (no per-piece cost calc needed when just clearing material or changing thickness)
    const result = await prisma.quote_pieces.updateMany({
      where: {
        id: { in: pieces.map(p => p.id) },
      },
      data: updateData,
    });

    // Invalidate stale optimizer results — piece data has changed
    await prisma.slab_optimizations.deleteMany({
      where: { quoteId },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error('Error bulk updating pieces:', error);
    return NextResponse.json({ error: 'Failed to bulk update pieces' }, { status: 500 });
  }
}
