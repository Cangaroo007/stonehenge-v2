import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type { Prisma } from '@prisma/client';
import type { TemplateData } from '@/lib/types/unit-templates';

// GET: Full template with templateData
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
      include: {
        project: {
          select: { id: true, name: true },
        },
        units: {
          select: { id: true, unitNumber: true, status: true },
        },
      },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const templateData = template.templateData as unknown as TemplateData;

    return NextResponse.json({
      ...template,
      templateData,
      pieceCount: templateData.totalPieces,
      estimatedArea_sqm: templateData.estimatedArea_sqm,
      roomCount: templateData.rooms.length,
    });
  } catch (error) {
    console.error('Error fetching template:', error);
    return NextResponse.json({ error: 'Failed to fetch template' }, { status: 500 });
  }
}

// PATCH: Update template
export async function PATCH(
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

    const existing = await prisma.unit_type_templates.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const data = await request.json();

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.unitTypeCode !== undefined) {
      updateData.unitTypeCode = data.unitTypeCode;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }

    // If templateData is being updated, auto-increment version
    if (data.templateData !== undefined) {
      updateData.templateData = data.templateData as unknown as Prisma.InputJsonValue;
      updateData.version = existing.version + 1;
    }

    const template = await prisma.unit_type_templates.update({
      where: { id: templateId },
      data: updateData,
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    const templateData = template.templateData as unknown as TemplateData;

    return NextResponse.json({
      ...template,
      templateData,
      pieceCount: templateData.totalPieces,
      estimatedArea_sqm: templateData.estimatedArea_sqm,
      roomCount: templateData.rooms.length,
    });
  } catch (error) {
    console.error('Error updating template:', error);
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 });
  }
}

// DELETE: Soft delete (set isActive = false)
export async function DELETE(
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

    const existing = await prisma.unit_type_templates.findUnique({
      where: { id: templateId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    await prisma.unit_type_templates.update({
      where: { id: templateId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, message: 'Template deactivated' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}
