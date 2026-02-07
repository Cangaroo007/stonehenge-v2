import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pricingRule = await prisma.pricing_rules.findUnique({
      where: { id },
      include: {
        clientType: true,
        clientTier: true,
        edgeOverrides: {
          include: { edge_types: true },
        },
        cutoutOverrides: {
          include: { cutout_types: true },
        },
        materialOverrides: {
          include: { material: true },
        },
      },
    });

    if (!pricingRule) {
      return NextResponse.json({ error: 'Pricing rule not found' }, { status: 404 });
    }

    return NextResponse.json(pricingRule);
  } catch (error) {
    console.error('Error fetching pricing rule:', error);
    return NextResponse.json({ error: 'Failed to fetch pricing rule' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const pricingRule = await prisma.pricing_rules.update({
      where: { id },
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

    return NextResponse.json(pricingRule);
  } catch (error) {
    console.error('Error updating pricing rule:', error);
    return NextResponse.json({ error: 'Failed to update pricing rule' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Soft delete by setting isActive to false
    await prisma.pricing_rules.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pricing rule:', error);
    return NextResponse.json({ error: 'Failed to delete pricing rule' }, { status: 500 });
  }
}
