import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const cutoutTypes = await prisma.cutout_types.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        categoryRates: {
          select: { fabricationCategory: true, rate: true },
        },
      },
    });

    // Serialize Decimal fields to numbers
    const serialized = cutoutTypes.map((ct: typeof cutoutTypes[number]) => ({
      id: ct.id,
      name: ct.name,
      description: ct.description,
      baseRate: Number(ct.baseRate),
      isActive: ct.isActive ?? true,
      sortOrder: ct.sortOrder,
      categoryRates: ct.categoryRates.map((r: { fabricationCategory: string; rate: unknown }) => ({
        fabricationCategory: r.fabricationCategory,
        rate: Number(r.rate),
      })),
      configuredCategories: ct.categoryRates
        .filter((r: { rate: unknown }) => Number(r.rate) > 0)
        .map((r: { fabricationCategory: string }) => r.fabricationCategory),
    }));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error fetching cutout types:', error);
    return NextResponse.json({ error: 'Failed to fetch cutout types' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const data = await request.json();

    // Check for duplicate cutout type names (case-insensitive)
    const existingCutoutType = await prisma.cutout_types.findFirst({
      where: {
        name: {
          equals: data.name,
          mode: 'insensitive'
        }
      }
    });

    if (existingCutoutType) {
      return NextResponse.json(
        { error: `Cutout type "${data.name}" already exists` },
        { status: 409 }
      );
    }

    const cutoutTypeId = crypto.randomUUID();
    const categoryRates = data.categoryRates || [];

    // Transaction: create cutout type + category rates atomically
    const result = await prisma.$transaction(async (tx) => {
      const cutoutType = await tx.cutout_types.create({
        data: {
          id: cutoutTypeId,
          name: data.name,
          description: data.description || null,
          baseRate: data.baseRate || 0,
          sortOrder: data.sortOrder || 0,
          isActive: data.isActive ?? true,
          updatedAt: new Date(),
        },
      });

      // Create category rates
      for (const cr of categoryRates) {
        await tx.cutout_category_rates.create({
          data: {
            cutoutTypeId: cutoutTypeId,
            fabricationCategory: cr.fabricationCategory,
            rate: cr.rate || 0,
            pricingSettingsId: 'ps-org-1',
          },
        });
      }

      return cutoutType;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating cutout type:', error);
    return NextResponse.json({ error: 'Failed to create cutout type' }, { status: 500 });
  }
}
