import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET — List all templates (built-in + company shared + user personal)
export async function GET() {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;

    const templates = await prisma.edge_profile_templates.findMany({
      where: {
        OR: [
          { isBuiltIn: true },
          { companyId: user.companyId, isShared: true },
          { companyId: user.companyId, createdById: user.id },
        ],
      },
      orderBy: [
        { isBuiltIn: 'desc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json(templates);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch edge templates';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — Create a new edge profile template
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;

    const data = await request.json();
    const { name, description, edgeTop, edgeBottom, edgeLeft, edgeRight, isShared, suggestedPieceType } = data;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    const template = await prisma.edge_profile_templates.create({
      data: {
        companyId: user.companyId,
        name: name.trim(),
        description: description || null,
        edgeTop: edgeTop || null,
        edgeBottom: edgeBottom || null,
        edgeLeft: edgeLeft || null,
        edgeRight: edgeRight || null,
        isBuiltIn: false,
        isShared: isShared !== false,
        createdById: user.id,
        suggestedPieceType: suggestedPieceType || null,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create edge template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — Delete a user-created template (cannot delete built-in)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 });
    }

    const template = await prisma.edge_profile_templates.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (template.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot delete built-in templates' }, { status: 403 });
    }

    if (template.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Not authorised to delete this template' }, { status: 403 });
    }

    await prisma.edge_profile_templates.delete({
      where: { id: templateId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete edge template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
