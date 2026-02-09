import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type { MaterialAssignments, EdgeOverrides } from '@/lib/types/unit-templates';
import type { Prisma } from '@prisma/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mappingId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id, mappingId } = await params;
    const templateId = parseInt(id, 10);
    const mappingIdNum = parseInt(mappingId, 10);
    if (isNaN(templateId) || isNaN(mappingIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const mapping = await prisma.finish_tier_mappings.findFirst({
      where: { id: mappingIdNum, templateId },
    });
    if (!mapping) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
    }

    // Resolve material names
    const assignments = mapping.materialAssignments as unknown as MaterialAssignments;
    const materialIds = Array.from(new Set(Object.values(assignments)));
    const materials = materialIds.length > 0
      ? await prisma.materials.findMany({
          where: { id: { in: materialIds } },
          select: { id: true, name: true, collection: true },
        })
      : [];
    const materialMap = new Map(materials.map((m) => [m.id, m]));

    const resolvedAssignments: Record<string, { materialId: number; name: string; collection: string | null }> = {};
    for (const [role, materialId] of Object.entries(assignments)) {
      const mat = materialMap.get(materialId);
      resolvedAssignments[role] = {
        materialId,
        name: mat?.name ?? 'Unknown',
        collection: mat?.collection ?? null,
      };
    }

    return NextResponse.json({
      id: mapping.id,
      templateId: mapping.templateId,
      finishLevel: mapping.finishLevel,
      colourScheme: mapping.colourScheme,
      materialAssignments: resolvedAssignments,
      edgeOverrides: mapping.edgeOverrides as unknown as EdgeOverrides | null,
      description: mapping.description,
      isActive: mapping.isActive,
      createdAt: mapping.createdAt,
      updatedAt: mapping.updatedAt,
    });
  } catch (error) {
    console.error('Error fetching finish tier mapping:', error);
    return NextResponse.json({ error: 'Failed to fetch mapping' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mappingId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id, mappingId } = await params;
    const templateId = parseInt(id, 10);
    const mappingIdNum = parseInt(mappingId, 10);
    if (isNaN(templateId) || isNaN(mappingIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existing = await prisma.finish_tier_mappings.findFirst({
      where: { id: mappingIdNum, templateId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
    }

    const data = await request.json();

    // If materialAssignments are being updated, validate them
    if (data.materialAssignments) {
      const assignments = data.materialAssignments as MaterialAssignments;
      const materialIds = Array.from(new Set(Object.values(assignments)));
      if (materialIds.length > 0) {
        const existingMaterials = await prisma.materials.findMany({
          where: { id: { in: materialIds } },
          select: { id: true },
        });
        const existingIds = new Set(existingMaterials.map((m) => m.id));
        const missingIds = materialIds.filter((mid) => !existingIds.has(mid));
        if (missingIds.length > 0) {
          return NextResponse.json(
            { error: `Material IDs not found: ${missingIds.join(', ')}` },
            { status: 400 }
          );
        }
      }
    }

    // Check for unique constraint conflict if finishLevel or colourScheme is changing
    if (data.finishLevel !== undefined || data.colourScheme !== undefined) {
      const newFinishLevel = data.finishLevel ?? existing.finishLevel;
      const newColourScheme = data.colourScheme !== undefined ? (data.colourScheme ?? null) : existing.colourScheme;
      const conflict = await prisma.finish_tier_mappings.findFirst({
        where: {
          templateId,
          finishLevel: newFinishLevel,
          colourScheme: newColourScheme,
          NOT: { id: mappingIdNum },
        },
      });
      if (conflict) {
        return NextResponse.json(
          { error: 'A mapping for this template + finishLevel + colourScheme already exists' },
          { status: 409 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.finishLevel !== undefined) updateData.finishLevel = data.finishLevel;
    if (data.colourScheme !== undefined) updateData.colourScheme = data.colourScheme ?? null;
    if (data.materialAssignments !== undefined) {
      updateData.materialAssignments = data.materialAssignments as unknown as Prisma.InputJsonValue;
    }
    if (data.edgeOverrides !== undefined) {
      updateData.edgeOverrides = data.edgeOverrides
        ? (data.edgeOverrides as unknown as Prisma.InputJsonValue)
        : null;
    }
    if (data.description !== undefined) updateData.description = data.description ?? null;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.finish_tier_mappings.update({
      where: { id: mappingIdNum },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating finish tier mapping:', error);
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mappingId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id, mappingId } = await params;
    const templateId = parseInt(id, 10);
    const mappingIdNum = parseInt(mappingId, 10);
    if (isNaN(templateId) || isNaN(mappingIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const existing = await prisma.finish_tier_mappings.findFirst({
      where: { id: mappingIdNum, templateId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
    }

    await prisma.finish_tier_mappings.delete({
      where: { id: mappingIdNum },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting finish tier mapping:', error);
    return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 });
  }
}
