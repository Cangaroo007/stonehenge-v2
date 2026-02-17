import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET — Full edge profile template
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

    const template = await prisma.edge_profile_templates.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: 'Edge template not found' }, { status: 404 });
    }

    // Check access: built-in, shared in same company, or own template
    if (
      !template.isBuiltIn &&
      template.companyId !== user.companyId
    ) {
      return NextResponse.json({ error: 'Not authorised to view this template' }, { status: 403 });
    }

    return NextResponse.json(template);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch edge template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH — Update edge profile template (user-created only)
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

    const existing = await prisma.edge_profile_templates.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Edge template not found' }, { status: 404 });
    }

    if (existing.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot modify built-in templates' }, { status: 403 });
    }

    if (existing.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Not authorised to modify this template' }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.edgeTop !== undefined) updateData.edgeTop = body.edgeTop;
    if (body.edgeBottom !== undefined) updateData.edgeBottom = body.edgeBottom;
    if (body.edgeLeft !== undefined) updateData.edgeLeft = body.edgeLeft;
    if (body.edgeRight !== undefined) updateData.edgeRight = body.edgeRight;
    if (body.isShared !== undefined) updateData.isShared = body.isShared;
    if (body.suggestedPieceType !== undefined) updateData.suggestedPieceType = body.suggestedPieceType;

    const updated = await prisma.edge_profile_templates.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update edge template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — Soft delete edge profile template (user-created only)
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

    const existing = await prisma.edge_profile_templates.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Edge template not found' }, { status: 404 });
    }

    if (existing.isBuiltIn) {
      return NextResponse.json({ error: 'Cannot delete built-in templates' }, { status: 403 });
    }

    if (existing.companyId !== user.companyId) {
      return NextResponse.json({ error: 'Not authorised to delete this template' }, { status: 403 });
    }

    // Soft delete: mark as not shared
    await prisma.edge_profile_templates.update({
      where: { id },
      data: { isShared: false },
    });

    return NextResponse.json({ success: true, id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete edge template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
