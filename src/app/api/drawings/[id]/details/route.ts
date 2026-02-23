import { NextRequest, NextResponse } from 'next/server';
import { getDownloadUrl } from '@/lib/storage/r2';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/drawings/[id]/details
 * Fetch full drawing details including a presigned URL for viewing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: drawingId } = await params;

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const drawing = await prisma.drawings.findUnique({
      where: { id: drawingId },
      include: {
        quotes: {
          select: {
            id: true,
            quote_number: true,
            project_name: true,
          },
        },
      },
    });

    if (!drawing) {
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
    }

    const url = await getDownloadUrl(drawing.storageKey, 3600);

    return NextResponse.json({
      id: drawing.id,
      filename: drawing.filename,
      mimeType: drawing.mimeType,
      fileSize: drawing.fileSize,
      uploadedAt: drawing.uploadedAt.toISOString(),
      isPrimary: drawing.isPrimary,
      notes: drawing.notes,
      url,
      quote: {
        id: drawing.quotes.id,
        quoteNumber: drawing.quotes.quote_number,
        projectName: drawing.quotes.project_name,
      },
    });
  } catch (error) {
    logger.error('[Drawing Details API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch drawing details' },
      { status: 500 }
    );
  }
}
