import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/settings - Get current pricing settings or return defaults
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['ADMIN', 'SALES_MANAGER']);

    // For now, use a hardcoded org ID - in a real multi-tenant system this would come from the session
    const organisationId = 'default-org';

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
    await requireAuth(request, ['ADMIN']);

    const body = await request.json();

    // For now, use a hardcoded org ID
    const organisationId = body.organisationId || 'default-org';

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

    // Check if settings already exist
    const existingSettings = await prisma.pricing_settings.findUnique({
      where: { organisation_id: organisationId }
    });

    let settings;

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
