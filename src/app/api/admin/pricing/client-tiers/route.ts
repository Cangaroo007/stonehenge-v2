import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientTypeId = searchParams.get('clientTypeId');
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    // Note: Tiers are universal across all client types in the current schema
    // The clientTypeId param is accepted for API consistency but doesn't filter
    const clientTiers = await prisma.client_tiers.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { priority: 'desc' }],
    });
    return NextResponse.json(clientTiers);
  } catch (error) {
    console.error('Error fetching client tiers:', error);
    return NextResponse.json({ error: 'Failed to fetch client tiers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    // Prepare the discount matrix data if provided
    let discountMatrixData: Prisma.InputJsonValue | undefined;
    if (data.discountMatrix) {
      discountMatrixData = data.discountMatrix as unknown as Prisma.InputJsonValue;
    }

    // Prepare the custom price list data if provided
    let customPriceListData: Prisma.InputJsonValue | undefined;
    if (data.customPriceList) {
      customPriceListData = data.customPriceList as unknown as Prisma.InputJsonValue;
    }

    const clientTier = await prisma.client_tiers.create({
      data: {
        id: crypto.randomUUID(),
        name: data.name,
        description: data.description || null,
        priority: data.priority || 0,
        isDefault: data.isDefault || false,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
        updatedAt: new Date(),
        ...(discountMatrixData !== undefined && { discount_matrix: discountMatrixData }),
        ...(customPriceListData !== undefined && { custom_price_list: customPriceListData }),
      },
    });

    return NextResponse.json(clientTier, { status: 201 });
  } catch (error) {
    console.error('Error creating client tier:', error);
    return NextResponse.json({ error: 'Failed to create client tier' }, { status: 500 });
  }
}
