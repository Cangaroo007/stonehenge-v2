import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET() {
  try {
    const pricingRules = await prisma.pricing_rules.findMany({
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: {
        client_types: true,
        client_tiers: true,
      },
    });
    return NextResponse.json(pricingRules);
  } catch (error) {
    console.error('Error fetching pricing rules:', error);
    return NextResponse.json({ error: 'Failed to fetch pricing rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const pricingRule = await prisma.pricing_rules.create({
      data: {
        name: data.name,
        description: data.description || null,
        priority: data.priority || 0,
        clientTypeId: data.clientTypeId || null,
        clientTierId: data.clientTierId || null,
        minQuoteValue: data.minQuoteValue || null,
        maxQuoteValue: data.maxQuoteValue || null,
        thicknessValue: data.thicknessValue || null,
        adjustmentType: data.adjustmentType || 'percentage',
        adjustmentValue: data.adjustmentValue || 0,
        appliesTo: data.appliesTo || 'all',
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json(pricingRule, { status: 201 });
  } catch (error) {
    console.error('Error creating pricing rule:', error);
    return NextResponse.json({ error: 'Failed to create pricing rule' }, { status: 500 });
  }
}
