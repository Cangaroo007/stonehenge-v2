import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { FabricationCategory } from '@prisma/client';
import { requireAuth } from '@/lib/auth';

// GET /api/pricing/edge-category-rates
// Returns all edge category rates grouped by edge type.
// Optional query param: ?pricingSettingsId=ps-org-1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pricingSettingsId = searchParams.get('pricingSettingsId');

    const rates = await prisma.edge_type_category_rates.findMany({
      where: pricingSettingsId ? { pricingSettingsId } : undefined,
      include: {
        edgeType: {
          select: { id: true, name: true, baseRate: true, rate20mm: true, rate40mm: true, isActive: true, sortOrder: true },
        },
      },
      orderBy: [
        { edgeTypeId: 'asc' },
        { fabricationCategory: 'asc' },
      ],
    });

    // Group by edge type for easier consumption
    const grouped: Record<string, {
      edgeTypeId: string;
      edgeTypeName: string;
      baseRate: number;
      rate20mm: number | null;
      rate40mm: number | null;
      rates: Array<{
        id: number;
        fabricationCategory: string;
        rate20mm: number;
        rate40mm: number;
      }>;
    }> = {};

    for (const row of rates) {
      if (!grouped[row.edgeTypeId]) {
        grouped[row.edgeTypeId] = {
          edgeTypeId: row.edgeTypeId,
          edgeTypeName: row.edgeType.name,
          baseRate: Number(row.edgeType.baseRate),
          rate20mm: row.edgeType.rate20mm ? Number(row.edgeType.rate20mm) : null,
          rate40mm: row.edgeType.rate40mm ? Number(row.edgeType.rate40mm) : null,
          rates: [],
        };
      }
      grouped[row.edgeTypeId].rates.push({
        id: row.id,
        fabricationCategory: row.fabricationCategory,
        rate20mm: Number(row.rate20mm),
        rate40mm: Number(row.rate40mm),
      });
    }

    return NextResponse.json(Object.values(grouped));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch edge category rates';
    console.error('Error fetching edge category rates:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/pricing/edge-category-rates
// Bulk update rates. Accepts array of { edgeTypeId, fabricationCategory, rate20mm, rate40mm }.
// Uses the first pricing_settings record (single-tenant).
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Request body must be an array of { edgeTypeId, fabricationCategory, rate20mm, rate40mm }' },
        { status: 400 }
      );
    }

    // Validate entries
    const validCategories = Object.values(FabricationCategory) as string[];
    for (const entry of body) {
      if (!entry.edgeTypeId || !entry.fabricationCategory || entry.rate20mm === undefined || entry.rate40mm === undefined) {
        return NextResponse.json(
          { error: 'Each entry must have edgeTypeId, fabricationCategory, rate20mm, and rate40mm' },
          { status: 400 }
        );
      }
      if (!validCategories.includes(entry.fabricationCategory)) {
        return NextResponse.json(
          { error: `Invalid fabricationCategory: ${entry.fabricationCategory}. Valid: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }
      if (typeof entry.rate20mm !== 'number' || entry.rate20mm < 0) {
        return NextResponse.json(
          { error: `Invalid rate20mm for ${entry.edgeTypeId}/${entry.fabricationCategory}: must be a non-negative number` },
          { status: 400 }
        );
      }
      if (typeof entry.rate40mm !== 'number' || entry.rate40mm < 0) {
        return NextResponse.json(
          { error: `Invalid rate40mm for ${entry.edgeTypeId}/${entry.fabricationCategory}: must be a non-negative number` },
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
      const result = await prisma.edge_type_category_rates.upsert({
        where: {
          edgeTypeId_fabricationCategory_pricingSettingsId: {
            edgeTypeId: entry.edgeTypeId,
            fabricationCategory: entry.fabricationCategory as FabricationCategory,
            pricingSettingsId: pricingSettings.id,
          },
        },
        update: { rate20mm: entry.rate20mm, rate40mm: entry.rate40mm },
        create: {
          edgeTypeId: entry.edgeTypeId,
          fabricationCategory: entry.fabricationCategory as FabricationCategory,
          rate20mm: entry.rate20mm,
          rate40mm: entry.rate40mm,
          pricingSettingsId: pricingSettings.id,
        },
      });

      results.push({
        id: result.id,
        edgeTypeId: result.edgeTypeId,
        fabricationCategory: result.fabricationCategory,
        rate20mm: Number(result.rate20mm),
        rate40mm: Number(result.rate40mm),
      });
    }

    return NextResponse.json({
      updated: results.length,
      rates: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update edge category rates';
    console.error('Error updating edge category rates:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
