import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireAuth } from '@/lib/auth';
import { extractElevationAreas } from '@/lib/services/spatial-extractor';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

async function compressImage(buffer: Buffer): Promise<{ data: Buffer; mediaType: string }> {
  const metadata = await sharp(buffer).metadata();
  let sharpInstance = sharp(buffer);

  const maxDimension = 4096;
  if (metadata.width && metadata.height) {
    const longestSide = Math.max(metadata.width, metadata.height);
    if (longestSide > maxDimension) {
      sharpInstance = sharpInstance.resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
  }

  const outputBuffer = await sharpInstance
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  return { data: outputBuffer, mediaType: 'image/jpeg' };
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth();
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(bytes);
    let mimeType = file.type || 'image/png';

    // PDFs not supported for elevation analysis — images only
    if (mimeType === 'application/pdf') {
      return NextResponse.json(
        { error: 'PDF files are not supported for elevation analysis. Please upload an image.' },
        { status: 400 }
      );
    }

    // Compress if needed
    if (buffer.length > MAX_IMAGE_SIZE * 0.8) {
      try {
        const compressed = await compressImage(buffer);
        buffer = compressed.data;
        mimeType = compressed.mediaType;
      } catch {
        return NextResponse.json(
          { error: 'Image too large and compression failed. Please upload a smaller image.' },
          { status: 400 }
        );
      }
    }

    if (buffer.length > MAX_IMAGE_SIZE) {
      return NextResponse.json(
        { error: 'Image too large after compression. Please upload a lower resolution image.' },
        { status: 400 }
      );
    }

    const imageBase64 = buffer.toString('base64');
    const analysis = await extractElevationAreas(imageBase64, mimeType);

    return NextResponse.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Elevation analysis error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        error: 'Failed to analyse elevation drawing',
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
