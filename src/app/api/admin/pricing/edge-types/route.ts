import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const edgeTypes = await prisma.edge_types.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        categoryRates: {
          select: { fabricationCategory: true, rate20mm: true, rate40mm: true },
        },
      },
    });

    // Serialize Decimal fields to numbers
    const serialized = edgeTypes.map((et: typeof edgeTypes[number]) => ({
      id: et.id,
      name: et.name,
      description: et.description,
      category: et.category,
      baseRate: Number(et.baseRate),
      isActive: et.isActive ?? true,
      isMitred: et.isMitred ?? false,
      isCurved: et.isCurved ?? false,
      sortOrder: et.sortOrder,
      categoryRates: et.categoryRates.map((r: { fabricationCategory: string; rate20mm: unknown; rate40mm: unknown }) => ({
        fabricationCategory: r.fabricationCategory,
        rate20mm: Number(r.rate20mm),
        rate40mm: Number(r.rate40mm),
      })),
      configuredCategories: et.categoryRates
        .filter((r: { rate20mm: unknown; rate40mm: unknown }) => Number(r.rate20mm) > 0 || Number(r.rate40mm) > 0)
        .map((r: { fabricationCategory: string }) => r.fabricationCategory),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching edge types:', error);
    return NextResponse.json({ error: 'Failed to fetch edge types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await request.json();

    // Check for duplicate edge type names (case-insensitive)
    const existingEdgeType = await prisma.edge_types.findFirst({
      where: {
        name: {
          equals: data.name,
          mode: 'insensitive'
        }
      }
    });

    if (existingEdgeType) {
      return NextResponse.json(
        { error: `Edge type "${data.name}" already exists` },
        { status: 409 }
      );
    }

    const edgeTypeId = crypto.randomUUID();
    const categoryRates = data.categoryRates || [];

    // Transaction: create edge type + category rates atomically
    const result = await prisma.$transaction(async (tx) => {
      const edgeType = await tx.edge_types.create({
        data: {
          id: edgeTypeId,
          name: data.name,
          description: data.description || null,
          category: data.category || 'polish',
          baseRate: data.baseRate || 0,
          sortOrder: data.sortOrder || 0,
          isActive: data.isActive ?? true,
          isMitred: data.isMitred ?? false,
          isCurved: data.isCurved ?? false,
          updatedAt: new Date(),
        },
      });

      // Create category rates
      for (const cr of categoryRates) {
        await tx.edge_type_category_rates.create({
          data: {
            edgeTypeId: edgeTypeId,
            fabricationCategory: cr.fabricationCategory,
            rate20mm: cr.rate20mm || 0,
            rate40mm: cr.rate40mm || 0,
            pricingSettingsId: 'ps-org-1',
          },
        });
      }

      return edgeType;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating edge type:', error);
    return NextResponse.json({ error: 'Failed to create edge type' }, { status: 500 });
  }
}
