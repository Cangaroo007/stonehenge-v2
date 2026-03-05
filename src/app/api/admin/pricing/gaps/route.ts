import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const FABRICATION_CATEGORIES = [
  'ENGINEERED',
  'NATURAL_HARD',
  'NATURAL_SOFT',
  'NATURAL_PREMIUM',
  'SINTERED',
] as const;

const SERVICE_TYPES = [
  'CUTTING',
  'POLISHING',
  'INSTALLATION',
  'WATERFALL_END',
  'TEMPLATING',
  'DELIVERY',
  'JOIN',
  'CURVED_CUTTING',
  'CURVED_POLISHING',
  'RADIUS_SETUP',
  'CURVED_MIN_LM',
] as const;

// GET /api/admin/pricing/gaps — Scan rate configuration for missing combinations
export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Get the active pricing settings
    const pricingSettings = await prisma.pricing_settings.findFirst();
    if (!pricingSettings) {
      return NextResponse.json(
        { error: 'No pricing settings found' },
        { status: 404 }
      );
    }

    // Fetch all existing active service rates
    const existingServiceRates = await prisma.service_rates.findMany({
      where: {
        pricing_settings_id: pricingSettings.id,
        isActive: true,
      },
      select: {
        serviceType: true,
        fabricationCategory: true,
      },
    });

    const serviceRateKeys = new Set(
      existingServiceRates.map(
        (r) => `${r.serviceType}::${r.fabricationCategory}`
      )
    );

    // Find missing service rate combinations
    const serviceRateGaps: Array<{
      serviceType: string;
      fabricationCategory: string;
      description: string;
    }> = [];

    for (const serviceType of SERVICE_TYPES) {
      for (const category of FABRICATION_CATEGORIES) {
        if (!serviceRateKeys.has(`${serviceType}::${category}`)) {
          serviceRateGaps.push({
            serviceType,
            fabricationCategory: category,
            description: `No ${serviceType.replace(/_/g, ' ').toLowerCase()} rate configured for ${category.replace(/_/g, ' ').toLowerCase()}`,
          });
        }
      }
    }

    // Fetch all active edge types
    const activeEdgeTypes = await prisma.edge_types.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    // Fetch existing edge category rates
    const existingEdgeRates = await prisma.edge_type_category_rates.findMany({
      where: {
        pricingSettingsId: pricingSettings.id,
      },
      select: {
        edgeTypeId: true,
        fabricationCategory: true,
      },
    });

    const edgeRateKeys = new Set(
      existingEdgeRates.map(
        (r) => `${r.edgeTypeId}::${r.fabricationCategory}`
      )
    );

    // Find missing edge rate combinations
    const edgeRateGaps: Array<{
      edgeTypeName: string;
      fabricationCategory: string;
      description: string;
    }> = [];

    for (const edgeType of activeEdgeTypes) {
      for (const category of FABRICATION_CATEGORIES) {
        if (!edgeRateKeys.has(`${edgeType.id}::${category}`)) {
          edgeRateGaps.push({
            edgeTypeName: edgeType.name,
            fabricationCategory: category,
            description: `No ${edgeType.name} edge rate for ${category.replace(/_/g, ' ').toLowerCase()}`,
          });
        }
      }
    }

    // Fetch all active cutout types
    const activeCutoutTypes = await prisma.cutout_types.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    // Fetch existing cutout category rates
    const existingCutoutRates = await prisma.cutout_category_rates.findMany({
      where: {
        pricingSettingsId: pricingSettings.id,
      },
      select: {
        cutoutTypeId: true,
        fabricationCategory: true,
      },
    });

    const cutoutRateKeys = new Set(
      existingCutoutRates.map(
        (r) => `${r.cutoutTypeId}::${r.fabricationCategory}`
      )
    );

    // Find missing cutout rate combinations
    const cutoutRateGaps: Array<{
      cutoutTypeName: string;
      fabricationCategory: string;
      description: string;
    }> = [];

    for (const cutoutType of activeCutoutTypes) {
      for (const category of FABRICATION_CATEGORIES) {
        if (!cutoutRateKeys.has(`${cutoutType.id}::${category}`)) {
          cutoutRateGaps.push({
            cutoutTypeName: cutoutType.name,
            fabricationCategory: category,
            description: `No ${cutoutType.name} cutout rate for ${category.replace(/_/g, ' ').toLowerCase()}`,
          });
        }
      }
    }

    const totalServiceRateCombinations =
      SERVICE_TYPES.length * FABRICATION_CATEGORIES.length;
    const totalEdgeCombinations =
      activeEdgeTypes.length * FABRICATION_CATEGORIES.length;
    const totalCutoutCombinations =
      activeCutoutTypes.length * FABRICATION_CATEGORIES.length;

    return NextResponse.json({
      gaps: {
        serviceRates: serviceRateGaps,
        edgeRates: edgeRateGaps,
        cutoutRates: cutoutRateGaps,
      },
      summary: {
        totalGaps:
          serviceRateGaps.length +
          edgeRateGaps.length +
          cutoutRateGaps.length,
        serviceRateGaps: serviceRateGaps.length,
        edgeRateGaps: edgeRateGaps.length,
        cutoutRateGaps: cutoutRateGaps.length,
      },
      coverage: {
        serviceRates: {
          configured:
            totalServiceRateCombinations - serviceRateGaps.length,
          total: totalServiceRateCombinations,
          percent:
            totalServiceRateCombinations > 0
              ? Math.round(
                  ((totalServiceRateCombinations - serviceRateGaps.length) /
                    totalServiceRateCombinations) *
                    100
                )
              : 100,
        },
        edgeRates: {
          configured: totalEdgeCombinations - edgeRateGaps.length,
          total: totalEdgeCombinations,
          percent:
            totalEdgeCombinations > 0
              ? Math.round(
                  ((totalEdgeCombinations - edgeRateGaps.length) /
                    totalEdgeCombinations) *
                    100
                )
              : 100,
        },
        cutoutRates: {
          configured: totalCutoutCombinations - cutoutRateGaps.length,
          total: totalCutoutCombinations,
          percent:
            totalCutoutCombinations > 0
              ? Math.round(
                  ((totalCutoutCombinations - cutoutRateGaps.length) /
                    totalCutoutCombinations) *
                    100
                )
              : 100,
        },
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to analyse pricing gaps';
    console.error('Error analysing pricing gaps:', error);
    return NextResponse.json(
      { error: message },
      { status: message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
