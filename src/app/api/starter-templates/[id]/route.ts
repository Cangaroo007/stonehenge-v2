import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type { StarterTemplateData } from '@/lib/types/starter-templates';

// GET — Full template with templateData
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;
    const { id } = await params;

    const template = await prisma.starter_templates.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Check access: built-in, shared in same company, or own template
    if (
      !template.isBuiltIn &&
      template.companyId !== user.companyId
    ) {
      return NextResponse.json({ error: 'Not authorised to view this template' }, { status: 403 });
    }

    const data = template.templateData as unknown as StarterTemplateData;
    const rooms = data.rooms || [];
    let pieceCount = 0;
    let estimatedAreaSqm = 0;

    for (const room of rooms) {
      for (const piece of room.pieces) {
        pieceCount++;
        estimatedAreaSqm += (piece.lengthMm * piece.widthMm) / 1_000_000;
      }
    }

    return NextResponse.json({
      ...template,
      templateData: data,
      roomCount: rooms.length,
      pieceCount,
      estimatedAreaSqm: Math.round(estimatedAreaSqm * 100) / 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH — Update template
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;
    const { id } = await params;

    const existing = await prisma.starter_templates.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (existing.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot modify built-in templates' }, { status: 403 });
    }

    if (existing.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Not authorised to modify this template' }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Prisma.starter_templatesUpdateInput = {};

    if (body.name !== undefined) {
      updateData.name = body.name;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    if (body.category !== undefined) {
      updateData.category = body.category;
    }
    if (body.isShared !== undefined) {
      updateData.isShared = body.isShared;
    }
    if (body.templateData !== undefined) {
      updateData.templateData = body.templateData as unknown as Prisma.InputJsonValue;
    }

    const updated = await prisma.starter_templates.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A template with this name already exists' },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to update template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — Soft delete (set isShared = false for non-built-in)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;
    const { id } = await params;

    const existing = await prisma.starter_templates.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (existing.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot delete built-in templates' }, { status: 403 });
    }

    if (existing.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Not authorised to delete this template' }, { status: 403 });
    }

    // Soft delete: mark as not shared (effectively hidden)
    await prisma.starter_templates.update({
      where: { id },
      data: { isShared: false },
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
