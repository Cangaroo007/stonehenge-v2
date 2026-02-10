import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/admin/pricing/service-rates - List all service rates
// Optional query param: ?fabricationCategory=ENGINEERED (filter by category)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fabricationCategory = searchParams.get('fabricationCategory');

    const rates = await prisma.service_rates.findMany({
      where: fabricationCategory
        ? { fabricationCategory: fabricationCategory as any }
        : undefined,
      include: { pricing_settings: true },
      orderBy: [
        { fabricationCategory: 'asc' },
        { serviceType: 'asc' },
      ],
    });

    return NextResponse.json(rates);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch service rates';
    console.error('Error fetching service rates:', error);
    return NextResponse.json(
      { error: message },
      { status: message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

// POST /api/admin/pricing/service-rates - Create new service rate
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.serviceType || !body.name || !body.rate20mm || !body.rate40mm || !body.pricingSettingsId) {
      return NextResponse.json(
        { error: 'Missing required fields: serviceType, name, rate20mm, rate40mm, pricingSettingsId' },
        { status: 400 }
      );
    }

    const rate = await prisma.service_rates.create({
      data: {
        id: crypto.randomUUID(),
        pricing_settings_id: body.pricingSettingsId,
        serviceType: body.serviceType,
        fabricationCategory: body.fabricationCategory || 'ENGINEERED',
        name: body.name,
        description: body.description || null,
        rate20mm: body.rate20mm,
        rate40mm: body.rate40mm,
        minimumCharge: body.minimumCharge || null,
        isActive: body.isActive !== undefined ? body.isActive : true,
        updated_at: new Date(),
      }
    });

    return NextResponse.json(rate, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create service rate';
    console.error('Error creating service rate:', error);
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
