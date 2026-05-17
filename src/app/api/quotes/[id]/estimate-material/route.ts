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
import { withoutSavedSlabOptimizations } from '@/lib/services/temporary-slab-optimization';

export const dynamic = 'force-dynamic';

const MAX_SLOTS = 3;

type MaterialForCollectionPricing = {
  id: number;
  name: string;
  collection: string | null;
  price_per_slab: Prisma.Decimal | null;
  price_per_sqm: Prisma.Decimal;
  price_per_square_metre: Prisma.Decimal | null;
  supplier_id: string | null;
};

function decimalToNumber(value: Prisma.Decimal | null | undefined): number {
  return value ? value.toNumber() : 0;
}

function conservativeMaterialPrice(material: MaterialForCollectionPricing): number {
  const slabPrice = decimalToNumber(material.price_per_slab);
  if (slabPrice > 0) return slabPrice;
  return decimalToNumber(material.price_per_square_metre) || decimalToNumber(material.price_per_sqm);
}

function pickCollectionMaxMaterial(
  materials: MaterialForCollectionPricing[]
): MaterialForCollectionPricing | null {
  if (materials.length === 0) return null;
  return materials.reduce((max, material) =>
    conservativeMaterialPrice(material) > conservativeMaterialPrice(max) ? material : max
  );
}

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
  const {
    slotIndex,
    materialId,
    useCollectionAvg = false,
    useCollectionMax: requestedUseCollectionMax,
    collectionId,
    collectionOnly = false,
    collectionName = null,
    displayName = null,
  } = body;
  const useCollectionMax = Boolean(requestedUseCollectionMax ?? useCollectionAvg ?? collectionOnly);

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
        include: {
          quote_pieces: {
            select: {
              id: true,
              material_id: true,
              material_name: true,
              material_collection_only: true,
              material_collection_name: true,
            },
          },
        },
      },
    },
  });
  if (!quote) {
    return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
  }

  // Fetch the alternative material
  let material = await prisma.materials.findFirst({
    where: { id: Number(materialId), company_id: companyId },
  });
  if (!material) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }

  // Collection-only pricing is intentionally conservative: price from the most
  // expensive colour in that supplier/collection, but keep the quote label as
  // supplier + collection until the user confirms an exact colour.
  if (collectionOnly && typeof collectionName === 'string' && collectionName.trim()) {
    const collectionMaterials = await prisma.materials.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        collection: collectionName.trim(),
        ...(material.supplier_id ? { supplier_id: material.supplier_id } : {}),
      },
      select: {
        id: true,
        name: true,
        collection: true,
        price_per_slab: true,
        price_per_sqm: true,
        price_per_square_metre: true,
        supplier_id: true,
      },
    });
    const maxMaterial = pickCollectionMaxMaterial(collectionMaterials);
    if (maxMaterial && maxMaterial.id !== material.id) {
      material = await prisma.materials.findFirst({
        where: { id: maxMaterial.id, company_id: companyId },
      }) ?? material;
    }
  }

  // Flatten pieces from rooms and save originals for restoration
  const allPieces = quote.quote_rooms.flatMap(r => r.quote_pieces);
  const originalMap = new Map(
    allPieces.map(p => [p.id, {
      material_id: p.material_id,
      material_name: p.material_name,
      material_collection_only: p.material_collection_only,
      material_collection_name: p.material_collection_name,
    }])
  );
  const displayMaterialName = collectionOnly && typeof displayName === 'string' && displayName.trim()
    ? displayName.trim()
    : material.name;

  let estimateResult;
  let calcError: string | null = null;
  try {
    // Temporarily swap all pieces to alternative material
    const pieceIds = allPieces.map(p => p.id);
    await prisma.quote_pieces.updateMany({
      where: { id: { in: pieceIds } },
      data: {
        material_id: material.id,
        material_name: displayMaterialName,
        material_collection_only: Boolean(collectionOnly),
        material_collection_name: collectionOnly && typeof collectionName === 'string'
          ? collectionName
          : null,
      },
    });

    // Run fresh calculation with swapped materials. The saved optimiser result
    // belongs to the real quote, not this temporary material comparison.
    const calc = await withoutSavedSlabOptimizations(quoteId, () =>
      calculateQuotePrice(String(quoteId))
    );

    const materialCost = calc.breakdown.materials.subtotal;
    const fabricationCost = calc.breakdown.services?.subtotal ?? 0;
    const slabCount = calc.breakdown.materials.slabCount ?? 0;

    // Defensive: warn if materialCost is 0 for a material with pricing data
    if (materialCost === 0 && allPieces.length > 0) {
      console.warn(
        `[estimate-material] materialCost is $0 for material ${material.name} (id=${material.id}) ` +
        `on quote ${quoteId} with ${allPieces.length} pieces. ` +
        `price_per_slab=${material.price_per_slab}, price_per_sqm=${material.price_per_sqm}`
      );
    }

    estimateResult = {
      subtotal: calc.subtotal,
      gstAmount: calc.gstAmount,
      totalIncGst: calc.totalIncGst,
      materialCost,
      fabricationCost,
      slabCount,
    };
  } catch (err) {
    calcError = err instanceof Error ? err.message : String(err);
    console.error(`[estimate-material] Calculation failed for quote ${quoteId}:`, calcError);
  } finally {
    // ALWAYS restore original material values — same pattern as quote-option-calculator
    const entries = Array.from(originalMap.entries());
    for (const [pieceId, original] of entries) {
      await prisma.quote_pieces.update({
        where: { id: pieceId },
        data: {
          material_id: original.material_id,
          material_name: original.material_name,
          material_collection_only: original.material_collection_only,
          material_collection_name: original.material_collection_name,
        },
      });
    }
  }

  if (!estimateResult) {
    return NextResponse.json(
      { error: calcError ?? 'Estimate calculation failed' },
      { status: 500 }
    );
  }

  // Build the slot result
  const slotResult = {
    slotIndex,
    materialId: material.id,
    materialName: displayMaterialName,
    collectionId: collectionId ?? collectionName ?? null,
    collectionName: typeof collectionName === 'string' ? collectionName : null,
    collectionOnly: Boolean(collectionOnly),
    useCollectionMax,
    useCollectionAvg: false,
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
