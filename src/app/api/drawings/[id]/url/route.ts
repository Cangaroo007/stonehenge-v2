import { NextRequest, NextResponse } from 'next/server';
import { getDownloadUrl } from '@/lib/storage/r2';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * GET /api/drawings/[id]/url
 * Generate a presigned URL for viewing a drawing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: drawingId } = await params;

    // Check authentication
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      logger.error('[Drawing URL API] Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get drawing from database
    const drawing = await prisma.drawings.findUnique({
      where: { id: drawingId },
      select: {
        storageKey: true,
        filename: true,
        mimeType: true,
        quoteId: true,
        thumbnailKey: true,
      },
    });

    if (!drawing) {
      logger.error('[Drawing URL API] Drawing not found:', drawingId);
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
    }

    // Generate presigned URL (valid for 1 hour)
    const presignedUrl = await getDownloadUrl(drawing.storageKey, 3600);

    return NextResponse.json({
      url: presignedUrl,
      filename: drawing.filename,
      mimeType: drawing.mimeType,
      hasThumbnail: !!drawing.thumbnailKey,
    });
  } catch (error) {
    logger.error('[Drawing URL API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate URL' },
      { status: 500 }
    );
  }
}
