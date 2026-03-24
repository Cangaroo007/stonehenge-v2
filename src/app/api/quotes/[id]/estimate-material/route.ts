/**
 * POST /api/quotes/[id]/estimate-material
 *
 * Estimates the quote total if all pieces were swapped to a given material.
 * Does NOT permanently modify the quote — pieces are restored after calculation.
 * Saves result to quotes.comparison_slots JSONB for persistence across reloads.
 *
 * Uses the same update-calculate-restore pattern as quote-option-calculator.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';

export const dynamic = 'force-dynamic';

const MAX_SLOTS = 3;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { companyId } = auth.user;
  const { id } = await params;
  const quoteId = parseInt(id, 10);
  if (isNaN(quoteId)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  const body = await request.json();
  const { slotIndex, materialId, useCollectionAvg = false, collectionId } = body;

  if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex >= MAX_SLOTS) {
    return NextResponse.json(
      { error: `slotIndex must be 0–${MAX_SLOTS - 1}` },
      { status: 400 }
    );
  }
  if (!materialId) {
    return NextResponse.json({ error: 'materialId is required' }, { status: 400 });
  }

  // Verify quote belongs to this company
  const quote = await prisma.quotes.findFirst({
    where: { id: quoteId, company_id: companyId },
    include: {
      quote_rooms: {
        include: { quote_pieces: { select: { id: true, material_id: true, material_name: true } } },
      },
    },
  });
  if (!quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Fetch the alternative material
  const material = await prisma.materials.findFirst({
    where: { id: Number(materialId), company_id: companyId },
  });
  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }

  // Flatten pieces from rooms and save originals for restoration
  const allPieces = quote.quote_rooms.flatMap(r => r.quote_pieces);
  const originalMap = new Map(
    allPieces.map(p => [p.id, { material_id: p.material_id, material_name: p.material_name }])
  );

  let estimateResult;
  try {
    // Temporarily swap all pieces to alternative material
    const pieceIds = allPieces.map(p => p.id);
    await prisma.quote_pieces.updateMany({
      where: { id: { in: pieceIds } },
      data: {
        material_id: Number(materialId),
        material_name: material.name,
      },
    });

    // Run fresh calculation with swapped materials
    const calc = await calculateQuotePrice(String(quoteId));

    estimateResult = {
      subtotal: calc.subtotal,
      gstAmount: calc.gstAmount,
      totalIncGst: calc.totalIncGst,
      materialCost: calc.breakdown?.materials?.subtotal ?? 0,
      fabricationCost: calc.breakdown?.services?.subtotal ?? 0,
      slabCount: calc.breakdown?.materials?.slabCount ?? 0,
    };
  } finally {
    // ALWAYS restore original material values — same pattern as quote-option-calculator
    const entries = Array.from(originalMap.entries());
    for (const [pieceId, original] of entries) {
      await prisma.quote_pieces.update({
        where: { id: pieceId },
        data: {
          material_id: original.material_id,
          material_name: original.material_name,
        },
      });
    }
  }

  if (!estimateResult) {
    return NextResponse.json(
      { error: 'Estimate calculation failed' },
      { status: 500 }
    );
  }

  // Build the slot result
  const slotResult = {
    slotIndex,
    materialId: Number(materialId),
    materialName: material.name,
    collectionId: collectionId ?? null,
    useCollectionAvg,
    ...estimateResult,
    calculatedAt: new Date().toISOString(),
  };

  // Persist to comparison_slots on the quote
  const currentSlots = (quote.comparison_slots as unknown as Array<typeof slotResult>) ?? [];
  const updatedSlots = [...currentSlots];
  updatedSlots[slotIndex] = slotResult;

  await prisma.quotes.update({
    where: { id: quoteId },
    data: {
      comparison_slots: updatedSlots as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json(slotResult);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { companyId } = auth.user;
  const { id } = await params;
  const quoteId = parseInt(id, 10);
  if (isNaN(quoteId)) {
    return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
  }

  const { slotIndex } = await request.json();

  const quote = await prisma.quotes.findFirst({
    where: { id: quoteId, company_id: companyId },
  });
  if (!quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  const currentSlots = (quote.comparison_slots as unknown as unknown[]) ?? [];
  const updatedSlots = [...currentSlots];
  updatedSlots[slotIndex] = null;

  await prisma.quotes.update({
    where: { id: quoteId },
    data: {
      comparison_slots: updatedSlots as unknown as Prisma.InputJsonValue,
    },
  });

  return NextResponse.json({ success: true });
}
