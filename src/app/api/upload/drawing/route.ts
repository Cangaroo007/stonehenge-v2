import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { uploadToR2, isR2Configured } from '@/lib/storage/r2';
import { v4 as uuidv4 } from 'uuid';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
];

/**
 * POST /api/upload/drawing
 * Upload a drawing file to R2 storage
 */
export async function POST(request: NextRequest) {
  console.log('[Upload API] >>> POST /api/upload/drawing called');

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      console.log('[Upload API] Unauthorized - no current user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check R2 configuration early
    const r2Ready = isR2Configured();
    console.log(`[Upload API] R2 configured: ${r2Ready}`);
    if (!r2Ready && process.env.NODE_ENV === 'production') {
      console.error('[Upload API] ❌ R2 storage not configured in production!');
      return NextResponse.json(
        { error: 'File storage not configured. Please contact support.' },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const customerId = formData.get('customerId') as string | null;
    const quoteId = formData.get('quoteId') as string | null;

    console.log('[Upload API] Received:', {
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      customerId,
      quoteId,
    });

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!customerId || !quoteId) {
      return NextResponse.json(
        { error: 'customerId and quoteId are required' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: PDF, PNG, JPG' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB' },
        { status: 400 }
      );
    }

    // Generate a unique storage key
    const fileExtension = file.name.split('.').pop() || 'bin';
    const uniqueId = uuidv4();
    const storageKey = `drawings/${customerId}/${quoteId}/${uniqueId}.${fileExtension}`;

    // Get file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to R2
    console.log(`[Upload API] Uploading to R2: ${storageKey} (${buffer.length} bytes, ${file.type})`);
    await uploadToR2(storageKey, buffer, file.type);
    console.log(`[Upload API] ✅ Upload successful: ${storageKey}`);

    return NextResponse.json({
      storageKey,
      filename: file.name,
      mimeType: file.type,
      fileSize: file.size,
    });
  } catch (error) {
    console.error('[Upload API] ❌ Error uploading drawing:', error);
    const message = error instanceof Error ? error.message : 'Failed to upload drawing';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
