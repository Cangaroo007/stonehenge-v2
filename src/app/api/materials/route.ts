import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const materials = await prisma.materials.findMany({
      where: { company_id: companyId },
      orderBy: [{ collection: 'asc' }, { name: 'asc' }],
      include: {
        supplier: {
          select: { id: true, name: true, default_margin_percent: true },
        },
      },
    });
    // Add camelCase aliases for client components
    const transformed = materials.map((m: any) => ({
      ...m,
      pricePerSqm: Number(m.price_per_sqm || 0),
      pricePerSlab: m.price_per_slab ? Number(m.price_per_slab) : null,
      isActive: m.is_active,
      slabLengthMm: m.slab_length_mm,
      slabWidthMm: m.slab_width_mm,
      fabricationCategory: m.fabrication_category,
    }));
    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Error fetching materials:', error);
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const data = await request.json();

    const material = await prisma.materials.create({
      data: {
        name: data.name,
        company_id: companyId,
        collection: data.collection || null,
        description: data.description || null,
        price_per_sqm: data.pricePerSqm,
        is_active: data.isActive ?? true,
        fabrication_category: data.fabricationCategory || 'ENGINEERED',
        slab_length_mm: data.slabLengthMm != null ? parseInt(String(data.slabLengthMm)) : null,
        slab_width_mm: data.slabWidthMm != null ? parseInt(String(data.slabWidthMm)) : null,
        updated_at: new Date(),
      },
    });

    return NextResponse.json(material, { status: 201 });
  } catch (error) {
    console.error('Error creating materials:', error);
    return NextResponse.json({ error: 'Failed to create material' }, { status: 500 });
  }
}
