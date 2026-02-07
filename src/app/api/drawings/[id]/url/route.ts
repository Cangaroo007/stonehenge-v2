import { NextRequest, NextResponse } from 'next/server';
import { getDownloadUrl } from '@/lib/storage/r2';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/drawings/[id]/url
 * Generate a presigned URL for viewing a drawing
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('[Drawing URL API] 📸 === REQUEST RECEIVED ===');
  
  try {
    const { id: drawingId } = await params;
    console.log('[Drawing URL API] Drawing ID:', drawingId);

    // Check authentication
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      console.error('[Drawing URL API] ❌ Unauthorized');
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
      console.error('[Drawing URL API] ❌ Drawing not found:', drawingId);
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
    }

    console.log('[Drawing URL API] Generating presigned URL for drawing:', { 
      drawingId,
      filename: drawing.filename,
      storageKey: drawing.storageKey,
      quoteId: drawing.quoteId,
    });

    // Generate presigned URL (valid for 1 hour)
    const presignedUrl = await getDownloadUrl(drawing.storageKey, 3600);
    
    console.log('[Drawing URL API] ✅ Presigned URL generated successfully');

    return NextResponse.json({
      url: presignedUrl,
      filename: drawing.filename,
      mimeType: drawing.mimeType,
      hasThumbnail: !!drawing.thumbnailKey,
    });
  } catch (error) {
    console.error('[Drawing URL API] ❌ Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate URL' },
      { status: 500 }
    );
  }
}
