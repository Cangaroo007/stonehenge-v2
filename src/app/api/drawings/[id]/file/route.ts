import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermissionAsync, Permission } from '@/lib/permissions';
import { getFromR2 } from '@/lib/storage/r2';
import prisma from '@/lib/db';

/**
 * GET /api/drawings/[id]/file
 * Stream the actual drawing file from R2 storage.
 * This avoids presigned URL double-encoding issues with Next.js Image.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await getCurrentUser();

    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const drawing = await prisma.drawing.findUnique({
      where: { id },
      include: {
        quote: {
          select: {
            id: true,
            customerId: true,
            createdBy: true,
          },
        },
      },
    });

    if (!drawing) {
      return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
    }

    // Check access permissions
    const canViewAll = await hasPermissionAsync(
      currentUser.id,
      Permission.VIEW_ALL_QUOTES
    );

    const hasAccess =
      canViewAll ||
      drawing.quote.createdBy === currentUser.id ||
      (currentUser.customerId && drawing.quote.customerId === currentUser.customerId);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch file from R2
    const data = await getFromR2(drawing.storageKey);

    if (!data) {
      return NextResponse.json(
        { error: 'File not found in storage' },
        { status: 404 }
      );
    }

    // Determine content type from stored mimeType or filename
    const contentType = drawing.mimeType || 'application/octet-stream';

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': `inline; filename="${drawing.filename}"`,
      },
    });
  } catch (error) {
    console.error('Error serving drawing file:', error);
    return NextResponse.json(
      { error: 'Failed to serve drawing' },
      { status: 500 }
    );
  }
}
