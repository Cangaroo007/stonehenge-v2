import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/settings - Get current pricing settings or return defaults
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    // Use company-scoped organisation ID
    const organisationId = `company-${companyId}`;

    let settings = await prisma.pricing_settings.findUnique({
      where: { organisation_id: organisationId },
      include: {
        service_rates: {
          orderBy: { serviceType: 'asc' }
        },
        cutout_rates: {
          orderBy: { cutout_type: 'asc' }
        }
      }
    });

    // If no settings exist, return defaults
    if (!settings) {
      return NextResponse.json({
        materialPricingBasis: 'PER_SLAB',
        cuttingUnit: 'LINEAR_METRE',
        polishingUnit: 'LINEAR_METRE',
        installationUnit: 'SQUARE_METRE',
        unitSystem: 'METRIC',
        currency: 'AUD',
        gstRate: '0.1000',
        wasteFactorPercent: '15.00',
        grainMatchingSurchargePercent: '15.00',
        cutoutThicknessMultiplier: '1.00',
        waterfallPricingMethod: 'FIXED_PER_END',
        slabEdgeAllowanceMm: null,
        organisationId
      });
    }

    // Serialize Decimal fields
    const serialized = {
      id: settings.id,
      organisationId: settings.organisation_id,
      materialPricingBasis: settings.material_pricing_basis,
      cuttingUnit: settings.cutting_unit,
      polishingUnit: settings.polishing_unit,
      installationUnit: settings.installation_unit,
      unitSystem: settings.unit_system,
      currency: settings.currency,
      gstRate: Number(settings.gst_rate).toFixed(4),
      wasteFactorPercent: Number(settings.waste_factor_percent).toFixed(2),
      grainMatchingSurchargePercent: Number(settings.grain_matching_surcharge_percent).toFixed(2),
      cutoutThicknessMultiplier: Number(settings.cutout_thickness_multiplier).toFixed(2),
      waterfallPricingMethod: settings.waterfall_pricing_method,
      slabEdgeAllowanceMm: settings.slab_edge_allowance_mm ?? null,
      createdAt: settings.created_at.toISOString(),
      updatedAt: settings.updated_at.toISOString(),
      service_rates: settings.service_rates.map(sr => ({
        ...sr,
        rate20mm: Number(sr.rate20mm),
        rate40mm: Number(sr.rate40mm),
        minimumCharge: sr.minimumCharge ? Number(sr.minimumCharge) : null
      })),
      cutoutRates: settings.cutout_rates.map(cr => ({
        ...cr,
        rate: Number(cr.rate)
      }))
    };

    return NextResponse.json(serialized);
  } catch (error: unknown) {
    console.error('Error fetching pricing settings:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || 'Failed to fetch pricing settings' },
      { status: err.message?.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

// PUT /api/admin/pricing/settings - Update pricing settings
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const body = await request.json();

    // Use company-scoped organisation ID
    const organisationId = `company-${companyId}`;

    // Validate enum values
    const validMaterialBasis = ['PER_SLAB', 'PER_SQUARE_METRE'];
    const validServiceUnits = ['LINEAR_METRE', 'SQUARE_METRE', 'FIXED', 'PER_SLAB', 'PER_KILOMETRE'];
    const validUnitSystems = ['METRIC', 'IMPERIAL'];

    if (body.materialPricingBasis && !validMaterialBasis.includes(body.materialPricingBasis)) {
      return NextResponse.json(
        { error: 'Invalid materialPricingBasis value' },
        { status: 400 }
      );
    }

    if (body.cuttingUnit && !validServiceUnits.includes(body.cuttingUnit)) {
      return NextResponse.json(
        { error: 'Invalid cuttingUnit value' },
        { status: 400 }
      );
    }

    if (body.polishingUnit && !validServiceUnits.includes(body.polishingUnit)) {
      return NextResponse.json(
        { error: 'Invalid polishingUnit value' },
        { status: 400 }
      );
    }

    if (body.installationUnit && !validServiceUnits.includes(body.installationUnit)) {
      return NextResponse.json(
        { error: 'Invalid installationUnit value' },
        { status: 400 }
      );
    }

    if (body.unitSystem && !validUnitSystems.includes(body.unitSystem)) {
      return NextResponse.json(
        { error: 'Invalid unitSystem value' },
        { status: 400 }
      );
    }

    if (body.wasteFactorPercent !== undefined) {
      const wf = Number(body.wasteFactorPercent);
      if (isNaN(wf) || wf < 0 || wf > 50) {
        return NextResponse.json(
          { error: 'Waste factor must be between 0 and 50 percent' },
          { status: 400 }
        );
      }
    }

    if (body.grainMatchingSurchargePercent !== undefined) {
      const gm = Number(body.grainMatchingSurchargePercent);
      if (isNaN(gm) || gm < 0 || gm > 100) {
        return NextResponse.json(
          { error: 'Grain matching surcharge must be between 0 and 100 percent' },
          { status: 400 }
        );
      }
    }

    if (body.slabEdgeAllowanceMm !== undefined && body.slabEdgeAllowanceMm !== null) {
      const val = Number(body.slabEdgeAllowanceMm);
      if (isNaN(val) || val < 0 || val > 50) {
        return NextResponse.json(
          { error: 'Slab edge allowance must be between 0 and 50mm' },
          { status: 400 }
        );
      }
    }

    // Check if settings already exist
    const existingSettings = await prisma.pricing_settings.findUnique({
      where: { organisation_id: organisationId }
    });

    let settings;

    const validWaterfallMethods = ['FIXED_PER_END', 'PER_LINEAR_METRE', 'INCLUDED_IN_SLAB'];
    if (body.waterfallPricingMethod && !validWaterfallMethods.includes(body.waterfallPricingMethod)) {
      return NextResponse.json(
        { error: 'Invalid waterfallPricingMethod value' },
        { status: 400 }
      );
    }

    if (existingSettings) {
      // Update existing settings
      settings = await prisma.pricing_settings.update({
        where: { organisation_id: organisationId },
        data: {
          material_pricing_basis: body.materialPricingBasis,
          cutting_unit: body.cuttingUnit,
          polishing_unit: body.polishingUnit,
          installation_unit: body.installationUnit,
          unit_system: body.unitSystem,
          currency: body.currency,
          gst_rate: body.gstRate ? parseFloat(body.gstRate) : undefined,
          waste_factor_percent: body.wasteFactorPercent !== undefined ? parseFloat(body.wasteFactorPercent) : undefined,
          grain_matching_surcharge_percent: body.grainMatchingSurchargePercent !== undefined ? parseFloat(body.grainMatchingSurchargePercent) : undefined,
          cutout_thickness_multiplier: body.cutoutThicknessMultiplier !== undefined ? parseFloat(body.cutoutThicknessMultiplier) : undefined,
          waterfall_pricing_method: body.waterfallPricingMethod || undefined,
          slab_edge_allowance_mm: body.slabEdgeAllowanceMm !== undefined
            ? (body.slabEdgeAllowanceMm === null ? null : parseInt(String(body.slabEdgeAllowanceMm), 10))
            : undefined,
          updated_at: new Date(),
        }
      });
    } else {
      // Create new settings
      settings = await prisma.pricing_settings.create({
        data: {
          id: crypto.randomUUID(),
          organisation_id: organisationId,
          material_pricing_basis: body.materialPricingBasis || 'PER_SLAB',
          cutting_unit: body.cuttingUnit || 'LINEAR_METRE',
          polishing_unit: body.polishingUnit || 'LINEAR_METRE',
          installation_unit: body.installationUnit || 'SQUARE_METRE',
          unit_system: body.unitSystem || 'METRIC',
          currency: body.currency || 'AUD',
          gst_rate: body.gstRate ? parseFloat(body.gstRate) : 0.1,
          waste_factor_percent: body.wasteFactorPercent ? parseFloat(body.wasteFactorPercent) : 15.0,
          grain_matching_surcharge_percent: body.grainMatchingSurchargePercent ? parseFloat(body.grainMatchingSurchargePercent) : 15.0,
          cutout_thickness_multiplier: body.cutoutThicknessMultiplier ? parseFloat(body.cutoutThicknessMultiplier) : 1.0,
          waterfall_pricing_method: body.waterfallPricingMethod || 'FIXED_PER_END',
          slab_edge_allowance_mm: body.slabEdgeAllowanceMm !== undefined && body.slabEdgeAllowanceMm !== null
            ? parseInt(String(body.slabEdgeAllowanceMm), 10)
            : null,
          updated_at: new Date(),
        }
      });
    }

    // Serialize response
    const serialized = {
      id: settings.id,
      organisationId: settings.organisation_id,
      materialPricingBasis: settings.material_pricing_basis,
      cuttingUnit: settings.cutting_unit,
      polishingUnit: settings.polishing_unit,
      installationUnit: settings.installation_unit,
      unitSystem: settings.unit_system,
      currency: settings.currency,
      gstRate: Number(settings.gst_rate).toFixed(4),
      wasteFactorPercent: Number(settings.waste_factor_percent).toFixed(2),
      grainMatchingSurchargePercent: Number(settings.grain_matching_surcharge_percent).toFixed(2),
      cutoutThicknessMultiplier: Number(settings.cutout_thickness_multiplier).toFixed(2),
      waterfallPricingMethod: settings.waterfall_pricing_method,
      slabEdgeAllowanceMm: settings.slab_edge_allowance_mm ?? null,
      createdAt: settings.created_at.toISOString(),
      updatedAt: settings.updated_at.toISOString()
    };

    return NextResponse.json(serialized);
  } catch (error: unknown) {
    console.error('Error updating pricing settings:', error);
    const err = error as { message?: string };
    return NextResponse.json(
      { error: err.message || 'Failed to update pricing settings' },
      { status: 400 }
    );
  }
}
