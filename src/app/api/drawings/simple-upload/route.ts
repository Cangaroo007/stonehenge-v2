import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { uploadToR2, isR2Configured } from '@/lib/storage/r2';
import { createDrawing } from '@/lib/services/drawingService';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
];

/**
 * POST /api/drawings/simple-upload
 * Simple, bulletproof upload: file → R2 → database → done
 * NO AI analysis, NO complex dependencies
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      logger.error('[Simple Upload] Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Check R2 configuration
    const r2Ready = isR2Configured();
    if (!r2Ready && process.env.NODE_ENV === 'production') {
      logger.error('[Simple Upload] R2 not configured in production');
      return NextResponse.json(
        { error: 'File storage not configured' },
        { status: 503 }
      );
    }

    // 3. Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const quoteIdStr = formData.get('quoteId') as string | null;
    const customerIdStr = formData.get('customerId') as string | null;

    // 4. Validate inputs
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!quoteIdStr || !customerIdStr) {
      return NextResponse.json(
        { error: 'quoteId and customerId are required' },
        { status: 400 }
      );
    }

    const quoteId = parseInt(quoteIdStr, 10);
    const customerId = parseInt(customerIdStr, 10);

    if (isNaN(quoteId) || isNaN(customerId)) {
      return NextResponse.json(
        { error: 'Invalid quoteId or customerId' },
        { status: 400 }
      );
    }

    // 5. Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PDF, PNG, JPG' },
        { status: 400 }
      );
    }

    // 6. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB' },
        { status: 400 }
      );
    }

    // 7. Verify quote exists and belongs to customer
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { id: true, customer_id: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (quote.customer_id !== customerId) {
      return NextResponse.json({ error: 'Quote does not belong to this customer' }, { status: 400 });
    }

    // 8. Generate storage key
    const fileExtension = file.name.split('.').pop() || 'bin';
    const uniqueId = uuidv4();
    const storageKey = `drawings/${customerId}/${quoteId}/${uniqueId}.${fileExtension}`;

    // 9. Upload to R2
    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadToR2(storageKey, buffer, file.type);

    // 10. Create database record
    const drawing = await createDrawing({
      filename: file.name,
      storageKey,
      mimeType: file.type,
      fileSize: file.size,
      quoteId,
      customerId,
      isPrimary: false,
    });
    logger.info('[Simple Upload] Drawing uploaded:', drawing.id);

    return NextResponse.json({
      success: true,
      drawing: {
        id: drawing.id,
        filename: drawing.filename,
        storageKey: drawing.storageKey,
        uploadedAt: drawing.uploadedAt,
      },
    });

  } catch (error) {
    logger.error('[Simple Upload] Upload failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
