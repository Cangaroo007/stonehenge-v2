import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const suppliers = await prisma.suppliers.findMany({
      where: { company_id: auth.user.companyId, is_active: true },
      include: { _count: { select: { materials: true } } },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(suppliers);
  } catch (error) {
    console.error('Error fetching suppliers:', error);
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN', 'SALES_MANAGER']);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();

    const supplier = await prisma.suppliers.create({
      data: {
        company_id: auth.user.companyId,
        name: body.name,
        contact_email: body.contactEmail ?? null,
        phone: body.phone ?? null,
        website: body.website ?? null,
        default_margin_percent: body.defaultMarginPercent ?? 0,
        default_slab_length_mm: body.defaultSlabLengthMm ?? null,
        default_slab_width_mm: body.defaultSlabWidthMm ?? null,
        default_thickness_mm: body.defaultThicknessMm ?? null,
        notes: body.notes ?? null,
      },
    });

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    console.error('Error creating supplier:', error);
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}
