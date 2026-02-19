import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { FabricationCategory } from '@prisma/client';
import { requireAuth } from '@/lib/auth';

// GET /api/pricing/edge-compatibility
// Returns all compatibility rules grouped by fabrication category.
// Optional query param: ?pricingSettingsId=ps-org-1
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pricingSettingsId = searchParams.get('pricingSettingsId');

    const rules = await prisma.material_edge_compatibility.findMany({
      where: pricingSettingsId ? { pricingSettingsId } : undefined,
      include: {
        edgeType: {
          select: { id: true, name: true, isActive: true },
        },
      },
      orderBy: [
        { fabricationCategory: 'asc' },
        { edgeTypeId: 'asc' },
      ],
    });

    // Group by fabrication category
    const grouped: Record<string, {
      fabricationCategory: string;
      rules: Array<{
        id: number;
        edgeTypeId: string;
        edgeTypeName: string;
        isAllowed: boolean;
        warningMessage: string | null;
      }>;
    }> = {};

    for (const row of rules) {
      if (!grouped[row.fabricationCategory]) {
        grouped[row.fabricationCategory] = {
          fabricationCategory: row.fabricationCategory,
          rules: [],
        };
      }
      grouped[row.fabricationCategory].rules.push({
        id: row.id,
        edgeTypeId: row.edgeTypeId,
        edgeTypeName: row.edgeType.name,
        isAllowed: row.isAllowed,
        warningMessage: row.warningMessage,
      });
    }

    return NextResponse.json(Object.values(grouped));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch edge compatibility rules';
    console.error('Error fetching edge compatibility rules:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/pricing/edge-compatibility
// Bulk update compatibility rules.
// Accepts array of { fabricationCategory, edgeTypeId, isAllowed, warningMessage }.
// Uses the first pricing_settings record (single-tenant).
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Request body must be an array of { fabricationCategory, edgeTypeId, isAllowed, warningMessage }' },
        { status: 400 }
      );
    }

    // Validate entries
    const validCategories = Object.values(FabricationCategory) as string[];
    for (const entry of body) {
      if (!entry.fabricationCategory || !entry.edgeTypeId || entry.isAllowed === undefined) {
        return NextResponse.json(
          { error: 'Each entry must have fabricationCategory, edgeTypeId, and isAllowed' },
          { status: 400 }
        );
      }
      if (!validCategories.includes(entry.fabricationCategory)) {
        return NextResponse.json(
          { error: `Invalid fabricationCategory: ${entry.fabricationCategory}. Valid: ${validCategories.join(', ')}` },
          { status: 400 }
        );
      }
      if (typeof entry.isAllowed !== 'boolean') {
        return NextResponse.json(
          { error: `Invalid isAllowed for ${entry.edgeTypeId}/${entry.fabricationCategory}: must be a boolean` },
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
      const result = await prisma.material_edge_compatibility.upsert({
        where: {
          fabricationCategory_edgeTypeId_pricingSettingsId: {
            fabricationCategory: entry.fabricationCategory as FabricationCategory,
            edgeTypeId: entry.edgeTypeId,
            pricingSettingsId: pricingSettings.id,
          },
        },
        update: {
          isAllowed: entry.isAllowed,
          warningMessage: entry.warningMessage ?? null,
        },
        create: {
          fabricationCategory: entry.fabricationCategory as FabricationCategory,
          edgeTypeId: entry.edgeTypeId,
          isAllowed: entry.isAllowed,
          warningMessage: entry.warningMessage ?? null,
          pricingSettingsId: pricingSettings.id,
        },
      });

      results.push({
        id: result.id,
        fabricationCategory: result.fabricationCategory,
        edgeTypeId: result.edgeTypeId,
        isAllowed: result.isAllowed,
        warningMessage: result.warningMessage,
      });
    }

    return NextResponse.json({
      updated: results.length,
      rules: results,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update edge compatibility rules';
    console.error('Error updating edge compatibility rules:', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
