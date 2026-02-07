import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/settings - Get current pricing settings or return defaults
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['ADMIN', 'SALES_MANAGER']);
    
    // For now, use a hardcoded org ID - in a real multi-tenant system this would come from the session
    const organisationId = 'default-org';
    
    let settings = await prisma.pricingSettings.findUnique({
      where: { organisationId },
      include: {
        serviceRates: {
          orderBy: { serviceType: 'asc' }
        },
        cutoutRates: {
          orderBy: { cutout_types: 'asc' }
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
      organisationId: settings.organisationId,
      materialPricingBasis: settings.materialPricingBasis,
      cuttingUnit: settings.cuttingUnit,
      polishingUnit: settings.polishingUnit,
      installationUnit: settings.installationUnit,
      unitSystem: settings.unitSystem,
      currency: settings.currency,
      gstRate: Number(settings.gstRate).toFixed(4),
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
      serviceRates: settings.serviceRates.map(sr => ({
        ...sr,
        rate20mm: Number(sr.rate20mm),
        rate40mm: Number(sr.rate40mm),
        minimumCharge: sr.minimumCharge ? Number(sr.minimumCharge) : null
      })),
      cutoutRates: settings.cutoutRates.map(cr => ({
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
    const existingSettings = await prisma.pricingSettings.findUnique({
      where: { organisationId }
    });
    
    let settings;
    
    if (existingSettings) {
      // Update existing settings
      settings = await prisma.pricingSettings.update({
        where: { organisationId },
        data: {
          materialPricingBasis: body.materialPricingBasis,
          cuttingUnit: body.cuttingUnit,
          polishingUnit: body.polishingUnit,
          installationUnit: body.installationUnit,
          unitSystem: body.unitSystem,
          currency: body.currency,
          gstRate: body.gstRate ? parseFloat(body.gstRate) : undefined
        }
      });
    } else {
      // Create new settings
      settings = await prisma.pricingSettings.create({
        data: {
          organisationId,
          materialPricingBasis: body.materialPricingBasis || 'PER_SLAB',
          cuttingUnit: body.cuttingUnit || 'LINEAR_METRE',
          polishingUnit: body.polishingUnit || 'LINEAR_METRE',
          installationUnit: body.installationUnit || 'SQUARE_METRE',
          unitSystem: body.unitSystem || 'METRIC',
          currency: body.currency || 'AUD',
          gstRate: body.gstRate ? parseFloat(body.gstRate) : 0.1
        }
      });
    }
    
    // Serialize response
    const serialized = {
      id: settings.id,
      organisationId: settings.organisationId,
      materialPricingBasis: settings.materialPricingBasis,
      cuttingUnit: settings.cuttingUnit,
      polishingUnit: settings.polishingUnit,
      installationUnit: settings.installationUnit,
      unitSystem: settings.unitSystem,
      currency: settings.currency,
      gstRate: Number(settings.gstRate).toFixed(4),
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString()
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
