import { NextRequest, NextResponse } from 'next/server';
import { getDownloadUrl, getFromR2 } from '@/lib/storage/r2';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateAndStoreThumbnail } from '@/lib/services/pdfThumbnail';

/**
 * GET /api/drawings/[id]/thumbnail
 *
 * Returns a presigned URL for the cached thumbnail, or generates one on-the-fly
 * for PDF drawings that don't yet have a thumbnail.
 *
 * Query params:
 *   ?generate=true - Force regeneration of the thumbnail
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: drawingId } = await params;
    const forceGenerate =
      request.nextUrl.searchParams.get('generate') === 'true';

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const drawing = await prisma.drawing.findUnique({
      where: { id: drawingId },
      select: {
        storageKey: true,
        filename: true,
        mimeType: true,
        thumbnailKey: true,
      },
    });

    if (!drawing) {
      return NextResponse.json(
        { error: 'Drawing not found' },
        { status: 404 }
      );
    }

    // Only PDFs need thumbnails; images are their own thumbnail
    const isPdf = drawing.mimeType === 'application/pdf';
    if (!isPdf) {
      // For images, return the original file URL
      const url = await getDownloadUrl(drawing.storageKey, 3600);
      return NextResponse.json({ url, source: 'original' });
    }

    // If we already have a cached thumbnail, return its presigned URL
    if (drawing.thumbnailKey && !forceGenerate) {
      const url = await getDownloadUrl(drawing.thumbnailKey, 3600);
      return NextResponse.json({ url, source: 'cached' });
    }

    // Generate thumbnail on-the-fly
    const pdfBuffer = await getFromR2(drawing.storageKey);
    if (!pdfBuffer) {
      return NextResponse.json(
        { error: 'PDF file not found in storage' },
        { status: 404 }
      );
    }

    const thumbnailKey = await generateAndStoreThumbnail(
      drawingId,
      pdfBuffer,
      drawing.storageKey
    );

    const url = await getDownloadUrl(thumbnailKey, 3600);
    return NextResponse.json({ url, source: 'generated' });
  } catch (error) {
    console.error('[Thumbnail API] Error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate thumbnail',
      },
      { status: 500 }
    );
  }
}
