import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type { Prisma } from '@prisma/client';
import type { TemplateData, TemplateRoom, TemplatePiece } from '@/lib/types/unit-templates';

/**
 * Validate that templateData matches the TemplateData interface shape.
 * Returns an error message if invalid, or null if valid.
 */
function validateTemplateData(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return 'templateData must be an object';
  }

  const td = data as Record<string, unknown>;

  if (!Array.isArray(td.rooms)) {
    return 'templateData.rooms must be an array';
  }

  if (typeof td.totalPieces !== 'number' || td.totalPieces < 0) {
    return 'templateData.totalPieces must be a non-negative number';
  }

  if (typeof td.estimatedArea_sqm !== 'number' || td.estimatedArea_sqm < 0) {
    return 'templateData.estimatedArea_sqm must be a non-negative number';
  }

  for (let i = 0; i < td.rooms.length; i++) {
    const room = td.rooms[i] as Record<string, unknown>;
    if (!room.name || typeof room.name !== 'string') {
      return `templateData.rooms[${i}].name must be a non-empty string`;
    }
    if (!room.roomType || typeof room.roomType !== 'string') {
      return `templateData.rooms[${i}].roomType must be a non-empty string`;
    }
    if (!Array.isArray(room.pieces)) {
      return `templateData.rooms[${i}].pieces must be an array`;
    }

    for (let j = 0; j < room.pieces.length; j++) {
      const piece = room.pieces[j] as Record<string, unknown>;
      if (!piece.label || typeof piece.label !== 'string') {
        return `templateData.rooms[${i}].pieces[${j}].label must be a non-empty string`;
      }
      if (typeof piece.length_mm !== 'number' || piece.length_mm <= 0) {
        return `templateData.rooms[${i}].pieces[${j}].length_mm must be a positive number`;
      }
      if (typeof piece.width_mm !== 'number' || piece.width_mm <= 0) {
        return `templateData.rooms[${i}].pieces[${j}].width_mm must be a positive number`;
      }
      if (typeof piece.thickness_mm !== 'number' || piece.thickness_mm <= 0) {
        return `templateData.rooms[${i}].pieces[${j}].thickness_mm must be a positive number`;
      }
      if (!piece.edges || typeof piece.edges !== 'object') {
        return `templateData.rooms[${i}].pieces[${j}].edges must be an object`;
      }
      if (!Array.isArray(piece.cutouts)) {
        return `templateData.rooms[${i}].pieces[${j}].cutouts must be an array`;
      }
      if (!piece.materialRole || typeof piece.materialRole !== 'string') {
        return `templateData.rooms[${i}].pieces[${j}].materialRole must be a non-empty string`;
      }
    }
  }

  return null;
}

// GET: List templates
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const unitTypeCode = searchParams.get('unitTypeCode');

    const where: Record<string, unknown> = { isActive: true };
    if (projectId) {
      where.projectId = parseInt(projectId, 10);
    }
    if (unitTypeCode) {
      where.unitTypeCode = unitTypeCode;
    }

    const templates = await prisma.unit_type_templates.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    const result = templates.map((t) => {
      const td = t.templateData as unknown as TemplateData;
      return {
        id: t.id,
        name: t.name,
        unitTypeCode: t.unitTypeCode,
        description: t.description,
        projectId: t.projectId,
        project: t.project,
        version: t.version,
        pieceCount: td.totalPieces,
        estimatedArea_sqm: td.estimatedArea_sqm,
        roomCount: td.rooms.length,
        isActive: t.isActive,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

// POST: Create template
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const data = await request.json();

    // Validate required fields
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!data.unitTypeCode || typeof data.unitTypeCode !== 'string' || data.unitTypeCode.trim().length === 0) {
      return NextResponse.json({ error: 'unitTypeCode is required' }, { status: 400 });
    }
    if (!data.templateData) {
      return NextResponse.json({ error: 'templateData is required' }, { status: 400 });
    }

    // Validate templateData shape
    const validationError = validateTemplateData(data.templateData);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Check for duplicate unitTypeCode+projectId
    const existing = await prisma.unit_type_templates.findFirst({
      where: {
        unitTypeCode: data.unitTypeCode.trim(),
        projectId: data.projectId || null,
        isActive: true,
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Template already exists for unit type "${data.unitTypeCode}" in this project` },
        { status: 409 }
      );
    }

    const template = await prisma.unit_type_templates.create({
      data: {
        name: data.name.trim(),
        unitTypeCode: data.unitTypeCode.trim(),
        description: data.description || null,
        projectId: data.projectId || null,
        sourceDrawingId: data.sourceDrawingId || null,
        templateData: data.templateData as unknown as Prisma.InputJsonValue,
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
