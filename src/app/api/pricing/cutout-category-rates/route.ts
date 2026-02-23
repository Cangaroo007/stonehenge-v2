import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { FabricationCategory } from '@prisma/client';
import { requireAuth } from '@/lib/auth';

// GET /api/pricing/cutout-category-rates
// Returns all cutout category rates grouped by cutout type.
// Optional query param: ?pricingSettingsId=ps-org-1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pricingSettingsId = searchParams.get('pricingSettingsId');

    const rates = await prisma.cutout_category_rates.findMany({
      where: pricingSettingsId ? { pricingSettingsId } : undefined,
      include: {
        cutoutType: {
          select: { id: true, name: true, baseRate: true, isActive: true, sortOrder: true },
        },
      },
      orderBy: [
        { cutoutTypeId: 'asc' },
        { fabricationCategory: 'asc' },
      ],
    });

    // Group by cutout type for easier consumption
    const grouped: Record<string, {
      cutoutTypeId: string;
      cutoutTypeName: string;
      baseRate: number;
      rates: Array<{
        id: number;
        fabricationCategory: string;
        rate: number;
      }>;
    }> = {};

    for (const row of rates) {
      if (!grouped[row.cutoutTypeId]) {
        grouped[row.cutoutTypeId] = {
          cutoutTypeId: row.cutoutTypeId,
          cutoutTypeName: row.cutoutType.name,
          baseRate: Number(row.cutoutType.baseRate),
          rates: [],
        };
      }
      grouped[row.cutoutTypeId].rates.push({
        id: row.id,
        fabricationCategory: row.fabricationCategory,
        rate: Number(row.rate),
      });
    }

    return NextResponse.json(Object.values(grouped));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch cutout category rates';
    console.error('Error fetching cutout category rates:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/pricing/cutout-category-rates
// Bulk update rates. Accepts array of { cutoutTypeId, fabricationCategory, rate }.
// Uses the first pricing_settings record (single-tenant).
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Request body must be an array of { cutoutTypeId, fabricationCategory, rate }' },
        { status: 400 }
      );
    }

    // Validate entries
    const validCategories = Object.values(FabricationCategory) as string[];
    for (const entry of body) {
      if (!entry.cutoutTypeId || !entry.fabricationCategory || entry.rate === undefined) {
        return NextResponse.json(
          { error: 'Each entry must have cutoutTypeId, fabricationCategory, and rate' },
          { status: 400 }
        );
      }
      if (!validCategories.includes(entry.fabricationCategory)) {
        return NextResponse.json(
          { error: `Invalid fabricationCategory: ${entry.fabricationCategory}. Valid: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }
      if (typeof entry.rate !== 'number' || entry.rate < 0) {
        return NextResponse.json(
          { error: `Invalid rate for ${entry.cutoutTypeId}/${entry.fabricationCategory}: must be a non-negative number` },
          { status: 400 }
        );
      }
    }

    // Get pricing settings (company-scoped)
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const pricingSettings = await prisma.pricing_settings.findUnique({
      where: { organisation_id: `company-${auth.user.companyId}` },
    });
    if (!pricingSettings) {
      return NextResponse.json(
        { error: 'No pricing settings found. Configure pricing settings first.' },
        { status: 404 }
      );
    }

    // Upsert all entries
    const results = [];
    for (const entry of body) {
      const result = await prisma.cutout_category_rates.upsert({
        where: {
          cutoutTypeId_fabricationCategory_pricingSettingsId: {
            cutoutTypeId: entry.cutoutTypeId,
            fabricationCategory: entry.fabricationCategory as FabricationCategory,
            pricingSettingsId: pricingSettings.id,
          },
        },
        update: { rate: entry.rate },
        create: {
          cutoutTypeId: entry.cutoutTypeId,
          fabricationCategory: entry.fabricationCategory as FabricationCategory,
          rate: entry.rate,
          pricingSettingsId: pricingSettings.id,
        },
      });

      results.push({
        id: result.id,
        cutoutTypeId: result.cutoutTypeId,
        fabricationCategory: result.fabricationCategory,
        rate: Number(result.rate),
      });
    }

    return NextResponse.json({
      updated: results.length,
      rates: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update cutout category rates';
    console.error('Error updating cutout category rates:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
