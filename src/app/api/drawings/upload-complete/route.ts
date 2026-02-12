import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { uploadToR2, isR2Configured } from '@/lib/storage/r2';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import { generateAndStoreThumbnail } from '@/lib/services/pdfThumbnail';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
];

/**
 * POST /api/drawings/upload-complete
 *
 * UNIFIED UPLOAD ENDPOINT - Does EVERYTHING atomically:
 * 1. Validates user & inputs
 * 2. Uploads to R2
 * 3. Creates database record
 * 4. Returns complete drawing object
 *
 * This is the ONLY endpoint you should use for drawing uploads.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // STEP 1: Authentication
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      logger.error('[Unified Upload] No authenticated user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // STEP 2: Check R2 Configuration
    const r2Configured = isR2Configured();

    if (!r2Configured && process.env.NODE_ENV === 'production') {
      logger.error('[Unified Upload] R2 not configured in production');
      return NextResponse.json(
        { error: 'File storage not configured' },
        { status: 503 }
      );
    }

    // STEP 3: Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const quoteIdStr = formData.get('quoteId') as string | null;

    // STEP 4: Validate inputs
    if (!file) {
      logger.error('[Unified Upload] No file in request');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!quoteIdStr) {
      logger.error('[Unified Upload] No quoteId in request');
      return NextResponse.json({ error: 'quoteId is required' }, { status: 400 });
    }

    const quoteId = parseInt(quoteIdStr, 10);
    if (isNaN(quoteId)) {
      logger.error('[Unified Upload] Invalid quoteId:', quoteIdStr);
      return NextResponse.json({ error: 'Invalid quoteId' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      logger.error('[Unified Upload] Invalid file type:', file.type);
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      logger.error('[Unified Upload] File too large:', file.size);
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // STEP 5: Fetch quote and verify ownership
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        customer_id: true,
        created_by: true,
      },
    });

    if (!quote) {
      logger.error('[Unified Upload] Quote not found:', quoteId);
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (!quote.customer_id) {
      logger.error('[Unified Upload] Quote has no customer:', quoteId);
      return NextResponse.json(
        { error: 'Quote has no customer assigned' },
        { status: 400 }
      );
    }

    // STEP 6: Generate storage key
    const fileExtension = file.name.split('.').pop() || 'bin';
    const uniqueId = uuidv4();
    const storageKey = `drawings/${quote.customer_id}/${quoteId}/${uniqueId}.${fileExtension}`;

    // STEP 7: Upload to R2
    const buffer = Buffer.from(await file.arrayBuffer());

    await uploadToR2(storageKey, buffer, file.type);

    // STEP 8: Create database record (ATOMIC - either this succeeds or we fail)
    const drawing = await prisma.drawings.create({
      data: {
        id: uniqueId,
        filename: file.name,
        storageKey,
        mimeType: file.type,
        fileSize: file.size,
        quoteId,
        customerId: quote.customer_id,
        isPrimary: false,
        // analysisData omitted (defaults to null in DB)
      },
    });

    logger.info('[Unified Upload] Drawing uploaded:', drawing.id);

    // STEP 8.5: Generate PDF thumbnail (fire-and-forget, non-blocking)
    if (file.type === 'application/pdf') {
      generateAndStoreThumbnail(drawing.id, buffer, storageKey).catch(
        (err) => {
          logger.error(
            '[Unified Upload] Thumbnail generation failed (non-blocking):',
            err instanceof Error ? err.message : err
          );
        }
      );
    }

    // STEP 9: Success response
    const totalDuration = Date.now() - startTime;
    logger.info('[Unified Upload] Complete:', totalDuration + 'ms');

    return NextResponse.json({
      success: true,
      drawing: {
        id: drawing.id,
        filename: drawing.filename,
        storageKey: drawing.storageKey,
        mimeType: drawing.mimeType,
        fileSize: drawing.fileSize,
        uploadedAt: drawing.uploadedAt,
        quoteId: drawing.quoteId,
      },
    });

  } catch (error) {
    logger.error('[Unified Upload] Failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      },
      { status: 500 }
    );
  }
}
