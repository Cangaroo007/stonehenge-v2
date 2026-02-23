import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { createDrawing } from '@/lib/services/drawingService';
import prisma from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * GET /api/quotes/[id]/drawings
 * Get all drawings for a quote
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      logger.error('[Get Drawings API] Invalid quote ID');
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

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

    return NextResponse.json(drawings);
  } catch (error) {
    logger.error('[Get Drawings API] Error:', error);
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
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      logger.error('[Create Drawing API] Invalid quote ID');
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();

    const { storageKey, filename, mimeType, fileSize, analysisData } = body;

    if (!storageKey || !filename || !mimeType) {
      logger.error('[Create Drawing API] Missing required fields');
      return NextResponse.json(
        { error: 'Missing required fields: storageKey, filename, mimeType' },
        { status: 400 }
      );
    }

    // Get customerId from the quote
    const prisma = (await import('@/lib/db')).default;
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { customer_id: true },
    });

    if (!quote) {
      logger.error('[Create Drawing API] Quote not found');
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    if (!quote.customer_id) {
      logger.error('[Create Drawing API] Quote has no customer assigned');
      return NextResponse.json(
        { error: 'Quote has no customer assigned' },
        { status: 400 }
      );
    }

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

    logger.info('[Create Drawing API] Drawing created:', drawing.id);

    return NextResponse.json(drawing);
  } catch (error) {
    logger.error('[Create Drawing API] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create drawing record' },
      { status: 500 }
    );
  }
}
