import { NextResponse } from 'next/server';
import { getFromR2, getDownloadUrl } from '@/lib/storage/r2';

export const dynamic = 'force-dynamic';

// GET /api/company/logo/view?key=... - Serve company logo
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const storageKey = searchParams.get('key');

    if (!storageKey) {
      return NextResponse.json({ error: 'Storage key required' }, { status: 400 });
    }

    // Try to get presigned URL first (better performance)
    try {
      const url = await getDownloadUrl(storageKey, 3600);
      return NextResponse.redirect(url);
    } catch {
      // Fallback to direct fetch if presigned URL fails
      const fileData = await getFromR2(storageKey);

      if (!fileData) {
        return NextResponse.json({ error: 'Logo not found' }, { status: 404 });
      }

      // Determine content type from key
      let contentType = 'image/png';
      if (storageKey.endsWith('.jpg') || storageKey.endsWith('.jpeg')) {
        contentType = 'image/jpeg';
      } else if (storageKey.endsWith('.svg')) {
        contentType = 'image/svg+xml';
      }

      // Convert Buffer to Uint8Array for Response compatibility
      const arrayBuffer = new Uint8Array(fileData).buffer;
      
      return new Response(arrayBuffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
  } catch (error) {
    console.error('Error serving logo:', error);
    return NextResponse.json(
      { error: 'Failed to serve logo' },
      { status: 500 }
    );
  }
}
