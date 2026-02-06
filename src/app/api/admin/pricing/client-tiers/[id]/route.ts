import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { TierPriceMapping } from '@/lib/types/price-interpreter';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientTier = await prisma.clientTier.findUnique({
      where: { id },
    });

    if (!clientTier) {
      return NextResponse.json({ error: 'Client tier not found' }, { status: 404 });
    }

    // Type-safe cast for JSON fields per Critical Lessons Learned
    const responseData = {
      ...clientTier,
      customPriceList: clientTier.customPriceList
        ? (clientTier.customPriceList as unknown as TierPriceMapping[])
        : null,
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error('Error fetching client tier:', error);
    return NextResponse.json({ error: 'Failed to fetch client tier' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const clientTier = await prisma.clientTier.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description || null,
        priority: data.priority || 0,
        isDefault: data.isDefault || false,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
        ...(discountMatrixData !== undefined && { discountMatrix: discountMatrixData }),
        ...(customPriceListData !== undefined && { customPriceList: customPriceListData }),
      },
    });

    return NextResponse.json(clientTier);
  } catch (error) {
    console.error('Error updating client tier:', error);
    return NextResponse.json({ error: 'Failed to update client tier' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Soft delete by setting isActive to false
    await prisma.clientTier.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting client tier:', error);
    return NextResponse.json({ error: 'Failed to delete client tier' }, { status: 500 });
  }
}
