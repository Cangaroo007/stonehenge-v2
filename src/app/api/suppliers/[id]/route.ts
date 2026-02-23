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

    const supplier = await prisma.suppliers.findFirst({
      where: { id, company_id: auth.user.companyId },
      include: {
        _count: { select: { materials: true, price_list_uploads: true } },
      },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    return NextResponse.json(supplier);
  } catch (error) {
    console.error('Error fetching supplier:', error);
    return NextResponse.json({ error: 'Failed to fetch supplier' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN', 'SALES_MANAGER']);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const body = await request.json();

    // Verify supplier belongs to user's company
    const existing = await prisma.suppliers.findFirst({
      where: { id, company_id: auth.user.companyId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.contactEmail !== undefined) updateData.contact_email = body.contactEmail;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.website !== undefined) updateData.website = body.website;
    if (body.defaultMarginPercent !== undefined) updateData.default_margin_percent = body.defaultMarginPercent;
    if (body.defaultSlabLengthMm !== undefined) updateData.default_slab_length_mm = body.defaultSlabLengthMm;
    if (body.defaultSlabWidthMm !== undefined) updateData.default_slab_width_mm = body.defaultSlabWidthMm;
    if (body.defaultThicknessMm !== undefined) updateData.default_thickness_mm = body.defaultThicknessMm;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.isActive !== undefined) updateData.is_active = body.isActive;

    const supplier = await prisma.suppliers.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(supplier);
  } catch (error) {
    console.error('Error updating supplier:', error);
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    // Verify supplier belongs to user's company
    const existing = await prisma.suppliers.findFirst({
      where: { id, company_id: auth.user.companyId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Soft delete — set is_active to false instead of hard delete
    await prisma.suppliers.update({
      where: { id },
      data: { is_active: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting supplier:', error);
    return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 });
  }
}
