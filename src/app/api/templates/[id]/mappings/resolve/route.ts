import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type { MaterialAssignments, EdgeOverrides } from '@/lib/types/unit-templates';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    const templateId = parseInt(id, 10);
    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const finishLevel = searchParams.get('finishLevel');
    const colourScheme = searchParams.get('colourScheme');

    if (!finishLevel) {
      return NextResponse.json({ error: 'finishLevel query parameter is required' }, { status: 400 });
    }

    const template = await prisma.unit_type_templates.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Try exact match first (with colourScheme if provided)
    let mapping = colourScheme
      ? await prisma.finish_tier_mappings.findUnique({
          where: {
            templateId_finishLevel_colourScheme: {
              templateId,
              finishLevel,
              colourScheme,
            },
          },
        })
      : null;

    // Fall back to finishLevel-only match (colourScheme=null)
    if (!mapping) {
      mapping = await prisma.finish_tier_mappings.findFirst({
        where: {
          templateId,
          finishLevel,
          colourScheme: null,
        },
      });
    }

    if (!mapping) {
      // List available mappings for helpful error
      const available = await prisma.finish_tier_mappings.findMany({
        where: { templateId, isActive: true },
        select: { finishLevel: true, colourScheme: true },
      });
      return NextResponse.json(
        {
          error: `No mapping found for template ${templateId} with finishLevel="${finishLevel}"${colourScheme ? ` and colourScheme="${colourScheme}"` : ''}`,
          availableMappings: available,
        },
        { status: 404 }
      );
    }

    if (!mapping.isActive) {
      return NextResponse.json({ error: 'Mapping exists but is inactive' }, { status: 404 });
    }

    const assignments = mapping.materialAssignments as unknown as MaterialAssignments;
    const overrides = mapping.edgeOverrides as unknown as EdgeOverrides | null;

    // Resolve material names
    const materialIds = Array.from(new Set(Object.values(assignments)));
    const materials = materialIds.length > 0
      ? await prisma.materials.findMany({
          where: { id: { in: materialIds } },
          select: { id: true, name: true, collection: true, price_per_sqm: true },
        })
      : [];
    const materialMap = new Map(materials.map((m) => [m.id, m]));

    const resolvedAssignments: Record<string, {
      materialId: number;
      name: string;
      collection: string | null;
      pricePerSqm: number;
    }> = {};
    for (const [role, materialId] of Object.entries(assignments)) {
      const mat = materialMap.get(materialId);
      resolvedAssignments[role] = {
        materialId,
        name: mat?.name ?? 'Unknown',
        collection: mat?.collection ?? null,
        pricePerSqm: mat ? Number(mat.price_per_sqm) : 0,
      };
    }

    return NextResponse.json({
      mappingId: mapping.id,
      templateId: mapping.templateId,
      finishLevel: mapping.finishLevel,
      colourScheme: mapping.colourScheme,
      materialAssignments: resolvedAssignments,
      edgeOverrides: overrides,
      description: mapping.description,
    });
  } catch (error) {
    console.error('Error resolving finish tier mapping:', error);
    return NextResponse.json({ error: 'Failed to resolve mapping' }, { status: 500 });
  }
}
