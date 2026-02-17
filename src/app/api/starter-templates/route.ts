import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type { StarterTemplateData } from '@/lib/types/starter-templates';

// GET — List starter templates (summary only, no full templateData)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const isActive = searchParams.get('isActive');

    const where: Prisma.starter_templatesWhereInput = {
      OR: [
        { isBuiltIn: true },
        { companyId: user.companyId, isShared: true },
        { companyId: user.companyId, createdById: user.id },
      ],
    };

    if (category) {
      where.category = category;
    }

    // isActive filter: built-in templates are always "active"
    if (isActive === 'false') {
      where.isBuiltIn = false;
    }

    const templates = await prisma.starter_templates.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });

    // Return summary fields only (no full templateData — too large for list)
    const summaries = templates.map((t) => {
      const data = t.templateData as unknown as StarterTemplateData;
      const rooms = data.rooms || [];
      let pieceCount = 0;
      let estimatedAreaSqm = 0;

      for (const room of rooms) {
        for (const piece of room.pieces) {
          pieceCount++;
          estimatedAreaSqm += (piece.lengthMm * piece.widthMm) / 1_000_000;
        }
      }

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        isBuiltIn: t.isBuiltIn,
        isShared: t.isShared,
        roomCount: rooms.length,
        pieceCount,
        estimatedAreaSqm: Math.round(estimatedAreaSqm * 100) / 100,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });

    return NextResponse.json(summaries);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch starter templates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — Create a new starter template
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;

    const body = await request.json();
    const { name, description, category, templateData, isShared } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    if (!category || typeof category !== 'string') {
      return NextResponse.json({ error: 'Template category is required' }, { status: 400 });
    }

    if (!templateData || typeof templateData !== 'object') {
      return NextResponse.json({ error: 'templateData is required' }, { status: 400 });
    }

    // Validate templateData has rooms array
    const data = templateData as StarterTemplateData;
    if (!data.rooms || !Array.isArray(data.rooms)) {
      return NextResponse.json({ error: 'templateData must contain a rooms array' }, { status: 400 });
    }

    const template = await prisma.starter_templates.create({
      data: {
        companyId: user.companyId,
        name: name.trim(),
        description: description || null,
        category,
        isBuiltIn: false,
        isShared: isShared !== false,
        templateData: templateData as unknown as Prisma.InputJsonValue,
        createdById: user.id,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A template with this name already exists' },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to create starter template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
