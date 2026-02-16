import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

/**
 * PUT /api/quotes/[id]/options/[optionId]
 * Update an option's name and/or description.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { id, optionId } = await params;
    const quoteId = parseInt(id, 10);
    const optId = parseInt(optionId, 10);
    if (isNaN(quoteId) || isNaN(optId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const option = await prisma.quote_options.findUnique({
      where: { id: optId },
    });
    if (!option || option.quoteId !== quoteId) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;

    const updated = await prisma.quote_options.update({
      where: { id: optId },
      data: updates,
      include: { overrides: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating quote option:', error);
    return NextResponse.json(
      { error: 'Failed to update quote option' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/quotes/[id]/options/[optionId]
 * Delete an option. Cannot delete the base option.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { id, optionId } = await params;
    const quoteId = parseInt(id, 10);
    const optId = parseInt(optionId, 10);
    if (isNaN(quoteId) || isNaN(optId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const option = await prisma.quote_options.findUnique({
      where: { id: optId },
    });
    if (!option || option.quoteId !== quoteId) {
      return NextResponse.json({ error: 'Option not found' }, { status: 404 });
    }

    if (option.isBase) {
      return NextResponse.json(
        { error: 'Cannot delete the base option (Option A)' },
        { status: 400 }
      );
    }

    await prisma.quote_options.delete({ where: { id: optId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting quote option:', error);
    return NextResponse.json(
      { error: 'Failed to delete quote option' },
      { status: 500 }
    );
  }
}
