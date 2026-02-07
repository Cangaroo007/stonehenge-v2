import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createDrawing } from '@/lib/services/drawingService';
import prisma from '@/lib/db';

/**
 * GET /api/quotes/[id]/drawings
 * Get all drawings for a quote
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('[Get Drawings API] 📖 === REQUEST RECEIVED ===');
  try {
    const { id } = await params;
    const quoteId = parseInt(id, 10);
    console.log('[Get Drawings API] Quote ID:', { id, quoteId, isValid: !isNaN(quoteId) });

    if (isNaN(quoteId)) {
      console.error('[Get Drawings API] ❌ Invalid quote ID');
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const currentUser = await getCurrentUser();
    console.log('[Get Drawings API] User:', { userId: currentUser?.id, isAuth: !!currentUser });
    if (!currentUser) {
      console.error('[Get Drawings API] ❌ Unauthorized');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Get Drawings API] Fetching drawings for quoteId:', quoteId);
    const drawings = await prisma.drawings.findMany({
      where: { quoteId },
      orderBy: [
        { isPrimary: 'desc' },
        { uploadedAt: 'desc' },
      ],
      select: {
        id: true,
        filename: true,
        storageKey: true,
        mimeType: true,
        fileSize: true,
        isPrimary: true,
        uploadedAt: true,
      },
    });

    console.log('[Get Drawings API] ✅ Found drawings:', drawings.length);
    console.log('[Get Drawings API] Drawings:', JSON.stringify(drawings.map(d => ({ id: d.id, filename: d.filename })), null, 2));
    return NextResponse.json(drawings);
  } catch (error) {
    console.error('[Get Drawings API] ❌ Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch drawings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/quotes/[id]/drawings
 * Create a drawing database record after successful R2 upload
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('[Create Drawing API] 🔵 === REQUEST RECEIVED ===');
  
  try {
    const { id } = await params;
    const quoteId = parseInt(id, 10);
    console.log('[Create Drawing API] Quote ID from URL:', { id, quoteId, isValid: !isNaN(quoteId) });

    if (isNaN(quoteId)) {
      console.error('[Create Drawing API] ❌ Invalid quote ID');
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const currentUser = await getCurrentUser();
    console.log('[Create Drawing API] Current user:', { 
      userId: currentUser?.id, 
      userName: currentUser?.name,
      isAuthenticated: !!currentUser 
    });
    
    if (!currentUser) {
      console.error('[Create Drawing API] ❌ Unauthorized - no current user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[Create Drawing API] Request body received:', JSON.stringify(body, null, 2));
    
    const { storageKey, filename, mimeType, fileSize, analysisData } = body;

    if (!storageKey || !filename || !mimeType) {
      console.error('[Create Drawing API] ❌ Missing required fields:', { 
        hasStorageKey: !!storageKey,
        hasFilename: !!filename,
        hasMimeType: !!mimeType
      });
      return NextResponse.json(
        { error: 'Missing required fields: storageKey, filename, mimeType' },
        { status: 400 }
      );
    }

    // Get customerId from the quote
    console.log('[Create Drawing API] Fetching quote from database...');
    const prisma = (await import('@/lib/db')).default;
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { customer_id: true },
    });

    console.log('[Create Drawing API] Quote fetched:', {
      found: !!quote,
      customerId: quote?.customer_id
    });

    if (!quote) {
      console.error('[Create Drawing API] ❌ Quote not found');
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (!quote.customer_id) {
      console.error('[Create Drawing API] ❌ Quote has no customer assigned');
      return NextResponse.json(
        { error: 'Quote has no customer assigned' },
        { status: 400 }
      );
    }

    console.log('[Create Drawing API] Creating database record with:', {
      quoteId,
      customerId: quote.customer_id,
      storageKey,
      filename,
      mimeType,
      fileSize: fileSize || 0,
    });

    const drawing = await createDrawing({
      filename,
      storageKey,
      mimeType,
      fileSize: fileSize || 0,
      quoteId,
      customerId: quote.customer_id,
      analysisData,
      isPrimary: false,
    });

    console.log('[Create Drawing API] ✅✅ SUCCESS! Drawing record created:', {
      id: drawing.id,
      filename: drawing.filename,
      storageKey: drawing.storageKey,
    });

    return NextResponse.json(drawing);
  } catch (error) {
    console.error('[Create Drawing API] ❌❌ FATAL ERROR:', error);
    console.error('[Create Drawing API] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create drawing record' },
      { status: 500 }
    );
  }
}
