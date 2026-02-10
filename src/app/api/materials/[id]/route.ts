import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const material = await prisma.materials.findUnique({
      where: { id: parseInt(id) },
    });

    if (!material) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    // Add camelCase aliases for client components
    const transformed = {
      ...material,
      pricePerSqm: Number(material.price_per_sqm || 0),
      pricePerSlab: material.price_per_slab ? Number(material.price_per_slab) : null,
      isActive: material.is_active,
      slabLengthMm: material.slab_length_mm,
      slabWidthMm: material.slab_width_mm,
      fabricationCategory: material.fabrication_category,
    };

    return NextResponse.json(transformed);
  } catch (error) {
    console.error('Error fetching materials:', error);
    return NextResponse.json({ error: 'Failed to fetch material' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    const updateData: Record<string, unknown> = {
      name: data.name,
      collection: data.collection || null,
      description: data.description || null,
      price_per_sqm: data.pricePerSqm,
      is_active: data.isActive ?? true,
    };
    if (data.fabricationCategory) {
      updateData.fabrication_category = data.fabricationCategory;
    }

    const material = await prisma.materials.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    return NextResponse.json(material);
  } catch (error) {
    console.error('Error updating materials:', error);
    return NextResponse.json({ error: 'Failed to update material' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.materials.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting materials:', error);
    return NextResponse.json({ error: 'Failed to delete material' }, { status: 500 });
  }
}
