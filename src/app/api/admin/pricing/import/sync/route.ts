import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import type { Proposal, ProposedMaterial } from '@/lib/services/material-ingestor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcPricePerSqm(slabPrice: number, lengthMm: number, widthMm: number): number {
  const areaSqm = (lengthMm * widthMm) / 1_000_000;
  if (areaSqm <= 0) return 0;
  return Math.round((slabPrice / areaSqm) * 100) / 100;
}

/**
 * Deterministic slug used as product_code when the supplier hasn't provided one.
 * Format: [supplier-name]-[collection]-[material-name] (lower-kebab).
 */
function makeSlug(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .map((p) => p!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
    .join('-');
}

function variantName(name: string, index: number): string {
  return `${name} (variant ${index})`;
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json() as {
      proposal: Proposal;
      supplierId: string;
      fabricationCategory?: string;
    };

    if (!body.proposal || !body.supplierId) {
      return NextResponse.json(
        { error: 'proposal and supplierId are required' },
        { status: 400 },
      );
    }

    // Verify supplier belongs to this company
    const supplier = await prisma.suppliers.findFirst({
      where: { id: body.supplierId, company_id: auth.user.companyId },
    });
    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const fabricationCategory =
      (body.fabricationCategory as
        | 'ENGINEERED'
        | 'NATURAL_HARD'
        | 'NATURAL_SOFT'
        | 'NATURAL_PREMIUM'
        | 'SINTERED') ?? 'ENGINEERED';

    const toProcess = body.proposal.extractedData.filter(
      (m): m is ProposedMaterial => m.action !== 'skip',
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const m of toProcess) {
      const costPrice = m.costPrice ?? m.wholesalePrice ?? 0;
      const pricePerSqm =
        m.slabLengthMm && m.slabWidthMm
          ? calcPricePerSqm(costPrice, m.slabLengthMm, m.slabWidthMm)
          : 0;

      // Resolve product_code: use provided code, or generate a deterministic slug
      const productCode =
        m.productCode ??
        makeSlug(supplier.name, m.collection, m.name);

      if (m.action === 'create' || m.action === 'create_variant') {
        const nameToUse =
          m.action === 'create_variant'
            ? variantName(m.name, Date.now() % 1000) // unique enough for a variant
            : m.name;

        await prisma.materials.create({
          data: {
            name: nameToUse,
            company_id: auth.user.companyId,
            supplier_id: body.supplierId,
            product_code: productCode,
            supplier_range: m.collection,
            collection: m.collection,
            surface_finish: m.surfaceFinish,
            wholesale_price: m.wholesalePrice ?? costPrice,
            price_per_slab: costPrice,
            price_per_sqm: pricePerSqm,
            price_per_square_metre: pricePerSqm,
            slab_length_mm: m.slabLengthMm,
            slab_width_mm: m.slabWidthMm,
            is_discontinued: m.isDiscontinued,
            fabrication_category: fabricationCategory,
            is_active: !m.isDiscontinued,
            requires_grain_match: m.requiresGrainMatch ?? false,
            updated_at: new Date(),
          },
        });
        created++;
        continue;
      }

      if (m.action === 'update' && m.existingMaterialId) {
        await prisma.materials.update({
          where: { id: m.existingMaterialId },
          data: {
            wholesale_price: m.wholesalePrice ?? costPrice,
            price_per_slab: costPrice,
            price_per_sqm: pricePerSqm,
            price_per_square_metre: pricePerSqm,
            supplier_range: m.collection,
            collection: m.collection,
            surface_finish: m.surfaceFinish,
            slab_length_mm: m.slabLengthMm,
            slab_width_mm: m.slabWidthMm,
            is_discontinued: m.isDiscontinued,
            discontinued_at: m.isDiscontinued ? new Date() : null,
            is_active: !m.isDiscontinued,
            requires_grain_match: m.requiresGrainMatch ?? false,
            updated_at: new Date(),
          },
        });
        updated++;
        continue;
      }

      skipped++;
    }

    // Skipped rows (action === 'skip') are already excluded from toProcess
    const explicitSkips = body.proposal.extractedData.filter((m) => m.action === 'skip').length;

    // Record the import in price_list_uploads for audit trail
    await prisma.price_list_uploads.create({
      data: {
        supplier_id: body.supplierId,
        company_id: auth.user.companyId,
        file_name: `AI Import – ${body.proposal.supplierName ?? 'Unknown'} ${new Date().toISOString().slice(0, 10)}`,
        file_url: '',
        extracted_data: body.proposal as unknown as Prisma.InputJsonValue,
        status: 'APPLIED',
        processed_at: new Date(),
        materials_created: created,
        materials_updated: updated,
        materials_discontinued: 0,
        materials_skipped: explicitSkips + skipped,
      },
    });

    return NextResponse.json({ created, updated, skipped: explicitSkips + skipped });
  } catch (error) {
    console.error('Import sync error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 },
    );
  }
}
