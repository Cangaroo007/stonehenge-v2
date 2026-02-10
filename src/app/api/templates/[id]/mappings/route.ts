import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type { MaterialAssignments, EdgeOverrides } from '@/lib/types/unit-templates';
import type { Prisma } from '@prisma/client';

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

    const template = await prisma.unit_type_templates.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const finishLevel = searchParams.get('finishLevel');
    const colourScheme = searchParams.get('colourScheme');
    const activeOnly = searchParams.get('activeOnly') !== 'false';

    const where: Record<string, unknown> = { templateId };
    if (finishLevel) {
      where.finishLevel = finishLevel;
    }
    if (colourScheme) {
      where.colourScheme = colourScheme;
    }
    if (activeOnly) {
      where.isActive = true;
    }

    const mappings = await prisma.finish_tier_mappings.findMany({
      where,
      orderBy: [{ finishLevel: 'asc' }, { colourScheme: 'asc' }],
    });

    // Resolve material names by collecting all materialIds
    const allMaterialIds = new Set<number>();
    for (const mapping of mappings) {
      const assignments = mapping.materialAssignments as unknown as MaterialAssignments;
      for (const materialId of Object.values(assignments)) {
        allMaterialIds.add(materialId);
      }
    }

    const materials = allMaterialIds.size > 0
      ? await prisma.materials.findMany({
          where: { id: { in: Array.from(allMaterialIds) } },
          select: { id: true, name: true, collection: true },
        })
      : [];

    const materialMap = new Map<number, { id: number; name: string; collection: string | null }>();
    for (const m of materials) {
      materialMap.set(m.id, m);
    }

    const result = mappings.map((mapping) => {
      const assignments = mapping.materialAssignments as unknown as MaterialAssignments;
      const resolvedAssignments: Record<string, { materialId: number; name: string; collection: string | null }> = {};
      for (const [role, materialId] of Object.entries(assignments)) {
        const mat = materialMap.get(materialId);
        resolvedAssignments[role] = {
          materialId,
          name: mat?.name ?? 'Unknown',
          collection: mat?.collection ?? null,
        };
      }

      return {
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
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching finish tier mappings:', error);
    return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
  }
}

/**
 * POST: Create or upsert finish tier mappings.
 *
 * Supports two modes:
 * 1. Standard create — requires finishLevel + materialAssignments
 * 2. Upsert mode — set upsert:true to update existing mapping or create new one
 *
 * Body:
 * {
 *   finishLevel: string,
 *   colourScheme?: string,
 *   materialAssignments: { [materialRole]: materialId },
 *   edgeOverrides?: EdgeOverrides,
 *   description?: string,
 *   upsert?: boolean  // if true, updates existing mapping instead of returning 409
 * }
 */
export async function POST(
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

    const template = await prisma.unit_type_templates.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const data = await request.json();

    // Validate required fields
    if (!data.finishLevel || typeof data.finishLevel !== 'string') {
      return NextResponse.json({ error: 'finishLevel is required' }, { status: 400 });
    }
    if (!data.materialAssignments || typeof data.materialAssignments !== 'object') {
      return NextResponse.json({ error: 'materialAssignments is required and must be an object' }, { status: 400 });
    }

    const assignments = data.materialAssignments as MaterialAssignments;

    // Validate all materialIds exist
    const materialIds = Array.from(new Set(Object.values(assignments)));
    if (materialIds.length > 0) {
      const existingMaterials = await prisma.materials.findMany({
        where: { id: { in: materialIds } },
        select: { id: true },
      });
      const existingIds = new Set(existingMaterials.map((m: { id: number }) => m.id));
      const missingIds = materialIds.filter((mid) => !existingIds.has(mid));
      if (missingIds.length > 0) {
        return NextResponse.json(
          { error: `Material IDs not found: ${missingIds.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Check for existing mapping
    const existing = await prisma.finish_tier_mappings.findFirst({
      where: {
        templateId,
        finishLevel: data.finishLevel,
        colourScheme: data.colourScheme ?? null,
      },
    });

    // Upsert mode: update if exists, create if not
    if (data.upsert && existing) {
      const updated = await prisma.finish_tier_mappings.update({
        where: { id: existing.id },
        data: {
          materialAssignments: assignments as unknown as Prisma.InputJsonValue,
          edgeOverrides: data.edgeOverrides !== undefined
            ? (data.edgeOverrides as unknown as Prisma.InputJsonValue) ?? null
            : undefined,
          description: data.description !== undefined ? (data.description ?? null) : undefined,
          isActive: data.isActive ?? existing.isActive,
        },
      });
      return NextResponse.json({ ...updated, _action: 'updated' });
    }

    if (existing) {
      return NextResponse.json(
        { error: 'A mapping for this template + finishLevel + colourScheme already exists', existingId: existing.id },
        { status: 409 }
      );
    }

    const mapping = await prisma.finish_tier_mappings.create({
      data: {
        templateId,
        finishLevel: data.finishLevel,
        colourScheme: data.colourScheme ?? null,
        materialAssignments: assignments as unknown as Prisma.InputJsonValue,
        edgeOverrides: data.edgeOverrides
          ? (data.edgeOverrides as unknown as Prisma.InputJsonValue)
          : undefined,
        description: data.description ?? null,
        isActive: data.isActive ?? true,
      },
    });

    return NextResponse.json({ ...mapping, _action: 'created' }, { status: 201 });
  } catch (error) {
    console.error('Error creating finish tier mapping:', error);
    return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 });
  }
}
