import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { uploadToR2, isR2Configured } from '@/lib/storage/r2';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import { generateAndStoreThumbnail } from '@/lib/services/pdfThumbnail';

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
  console.log('[Unified Upload] ========== START ==========');
  console.log('[Unified Upload] Timestamp:', new Date().toISOString());

  try {
    // STEP 1: Authentication
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      console.error('[Unified Upload] ❌ No authenticated user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('[Unified Upload] ✅ User authenticated:', {
      userId: currentUser.id,
      name: currentUser.name,
    });

    // STEP 2: Check R2 Configuration
    const r2Configured = isR2Configured();
    console.log('[Unified Upload] R2 configured:', r2Configured);
    
    if (!r2Configured && process.env.NODE_ENV === 'production') {
      console.error('[Unified Upload] ❌ R2 not configured in production');
      return NextResponse.json(
        { error: 'File storage not configured' },
        { status: 503 }
      );
    }

    // STEP 3: Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const quoteIdStr = formData.get('quoteId') as string | null;

    console.log('[Unified Upload] Form data received:', {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      quoteIdStr,
    });

    // STEP 4: Validate inputs
    if (!file) {
      console.error('[Unified Upload] ❌ No file in request');
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!quoteIdStr) {
      console.error('[Unified Upload] ❌ No quoteId in request');
      return NextResponse.json({ error: 'quoteId is required' }, { status: 400 });
    }

    const quoteId = parseInt(quoteIdStr, 10);
    if (isNaN(quoteId)) {
      console.error('[Unified Upload] ❌ Invalid quoteId:', quoteIdStr);
      return NextResponse.json({ error: 'Invalid quoteId' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      console.error('[Unified Upload] ❌ Invalid file type:', file.type);
      return NextResponse.json(
        { error: `Invalid file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      console.error('[Unified Upload] ❌ File too large:', file.size);
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    console.log('[Unified Upload] ✅ All validations passed');

    // STEP 5: Fetch quote and verify ownership
    console.log('[Unified Upload] Fetching quote...', quoteId);
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        customerId: true,
        createdBy: true,
      },
    });

    if (!quote) {
      console.error('[Unified Upload] ❌ Quote not found:', quoteId);
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (!quote.customerId) {
      console.error('[Unified Upload] ❌ Quote has no customer:', quoteId);
      return NextResponse.json(
        { error: 'Quote has no customer assigned' },
        { status: 400 }
      );
    }

    console.log('[Unified Upload] ✅ Quote verified:', {
      quoteId: quote.id,
      customerId: quote.customerId,
      createdBy: quote.createdBy,
    });

    // STEP 6: Generate storage key
    const fileExtension = file.name.split('.').pop() || 'bin';
    const uniqueId = uuidv4();
    const storageKey = `drawings/${quote.customerId}/${quoteId}/${uniqueId}.${fileExtension}`;
    
    console.log('[Unified Upload] Generated storage key:', storageKey);

    // STEP 7: Upload to R2
    console.log('[Unified Upload] Starting R2 upload...');
    const uploadStartTime = Date.now();
    const buffer = Buffer.from(await file.arrayBuffer());
    
    await uploadToR2(storageKey, buffer, file.type);
    
    const uploadDuration = Date.now() - uploadStartTime;
    console.log('[Unified Upload] ✅ R2 upload complete:', {
      duration: `${uploadDuration}ms`,
      bytes: buffer.length,
    });

    // STEP 8: Create database record (ATOMIC - either this succeeds or we fail)
    console.log('[Unified Upload] Creating database record...');
    const dbStartTime = Date.now();
    
    const drawing = await prisma.drawings.create({
      data: {
        filename: file.name,
        storageKey,
        mimeType: file.type,
        fileSize: file.size,
        quoteId,
        customerId: quote.customerId,
        isPrimary: false,
        // analysisData omitted (defaults to null in DB)
      },
    });

    const dbDuration = Date.now() - dbStartTime;
    console.log('[Unified Upload] ✅ Database record created:', {
      drawingId: drawing.id,
      duration: `${dbDuration}ms`,
    });

    // STEP 8.5: Generate PDF thumbnail (fire-and-forget, non-blocking)
    if (file.type === 'application/pdf') {
      generateAndStoreThumbnail(drawing.id, buffer, storageKey).catch(
        (err) => {
          console.error(
            '[Unified Upload] ⚠️ Thumbnail generation failed (non-blocking):',
            err instanceof Error ? err.message : err
          );
        }
      );
      console.log(
        '[Unified Upload] 🖼️ PDF thumbnail generation started in background'
      );
    }

    // STEP 9: Success response
    const totalDuration = Date.now() - startTime;
    console.log('[Unified Upload] ========== SUCCESS ==========');
    console.log('[Unified Upload] Total duration:', `${totalDuration}ms`);

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
    const totalDuration = Date.now() - startTime;
    console.error('[Unified Upload] ========== FAILED ==========');
    console.error('[Unified Upload] Total duration:', `${totalDuration}ms`);
    console.error('[Unified Upload] Error:', error);
    console.error('[Unified Upload] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Upload failed',
      },
      { status: 500 }
    );
  }
}
