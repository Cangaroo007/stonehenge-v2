import { NextRequest, NextResponse } from 'next/server';
import { DrawingClass } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_CLASSES = new Set<string>(Object.values(DrawingClass));

/**
 * PATCH /api/drawings/[id]/classify
 *
 * Override the mechanical classification of a drawing import. Logs the
 * correction as an `ai_events` row (kind: 'drawing_class_correction')
 * for the AI flywheel, then updates the drawing's `drawing_class`.
 *
 * The `[id]` segment refers to a `drawing_imports.id` (integer). Calls
 * with non-integer ids return 400.
 *
 * Body: { drawingClass: DrawingClass }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    const companyId = currentUser.companyId;
    if (!companyId) {
      return NextResponse.json(
        { error: 'No company associated with user' },
        { status: 403 },
      );
    }

    const { id: idStr } = await params;
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid drawing id' }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const newClassRaw = (body as { drawingClass?: unknown })?.drawingClass;
    if (typeof newClassRaw !== 'string' || !VALID_CLASSES.has(newClassRaw)) {
      return NextResponse.json(
        {
          error: `Invalid drawingClass. Must be one of: ${Array.from(VALID_CLASSES).join(', ')}`,
        },
        { status: 400 },
      );
    }
    const newClass = newClassRaw as DrawingClass;

    const existing = await prisma.drawing_imports.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
    }

    if (existing.drawingClass === newClass) {
      // No-op: classification already matches. Don't log a non-correction.
      return NextResponse.json({ drawing: existing });
    }

    const oldClass = existing.drawingClass;
    const meta = existing.metadata as unknown as
      | { classification?: { confidence?: number } }
      | null;
    const oldConfidence = meta?.classification?.confidence ?? null;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.ai_events.create({
        data: {
          companyId,
          kind: 'drawing_class_correction',
          drawingImportId: id,
          quoteId: existing.quoteId,
          inputJson: {
            originalClass: oldClass,
            confidence: oldConfidence,
          },
          outputJson: {
            correctedClass: newClass,
          },
          diffJson: {
            ai: oldClass,
            user: newClass,
          },
          drawingClass: newClass,
        },
      });
      return tx.drawing_imports.update({
        where: { id },
        data: { drawingClass: newClass },
      });
    });

    return NextResponse.json({ drawing: updated });
  } catch (err) {
    logger.error('[Drawing classify] Unexpected error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to update classification';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
