import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const edgeType = await prisma.edge_types.findUnique({
      where: { id },
      include: {
        categoryRates: {
          select: { fabricationCategory: true, rate20mm: true, rate40mm: true },
        },
      },
    });

    if (!edgeType) {
      return NextResponse.json({ error: 'Edge type not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...edgeType,
      baseRate: Number(edgeType.baseRate),
      categoryRates: edgeType.categoryRates.map((r: { fabricationCategory: string; rate20mm: unknown; rate40mm: unknown }) => ({
        fabricationCategory: r.fabricationCategory,
        rate20mm: Number(r.rate20mm),
        rate40mm: Number(r.rate40mm),
      })),
    });
  } catch (error) {
    console.error('Error fetching edge type:', error);
    return NextResponse.json({ error: 'Failed to fetch edge type' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const data = await request.json();
    const categoryRates = data.categoryRates || [];

    // Transaction: update edge type + upsert category rates atomically
    const result = await prisma.$transaction(async (tx) => {
      const edgeType = await tx.edge_types.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description || null,
          category: data.category || 'polish',
          baseRate: data.baseRate || 0,
          sortOrder: data.sortOrder || 0,
          isActive: data.isActive ?? true,
          isMitred: data.isMitred ?? false,
          isCurved: data.isCurved ?? false,
        },
      });

      // Upsert category rates using compound unique key
      for (const cr of categoryRates) {
        await tx.edge_type_category_rates.upsert({
          where: {
            edgeTypeId_fabricationCategory_pricingSettingsId: {
              edgeTypeId: id,
              fabricationCategory: cr.fabricationCategory,
              pricingSettingsId: 'ps-org-1',
            },
          },
          update: {
            rate20mm: cr.rate20mm || 0,
            rate40mm: cr.rate40mm || 0,
          },
          create: {
            edgeTypeId: id,
            fabricationCategory: cr.fabricationCategory,
            rate20mm: cr.rate20mm || 0,
            rate40mm: cr.rate40mm || 0,
            pricingSettingsId: 'ps-org-1',
          },
        });
      }

      return edgeType;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error updating edge type:', error);
    return NextResponse.json({ error: 'Failed to update edge type' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    // Soft delete by setting isActive to false
    await prisma.edge_types.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting edge type:', error);
    return NextResponse.json({ error: 'Failed to delete edge type' }, { status: 500 });
  }
}
