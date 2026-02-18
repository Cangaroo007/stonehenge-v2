import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { logActivity } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createQuoteVersion, createQuoteSnapshot } from '@/lib/services/quote-version-service';

// POST /api/quotes/[id]/override
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json(
        { error: 'Invalid quote ID' },
        { status: 400 }
      );
    }

    // Verify quote belongs to user's company
    const quoteCheck = await verifyQuoteOwnership(quoteId, user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();

    // Validate that at least one override is provided
    if (
      !body.overrideSubtotal &&
      !body.overrideTotal &&
      !body.overrideDeliveryCost &&
      !body.overrideTemplatingCost
    ) {
      return NextResponse.json(
        { error: 'At least one override value must be provided' },
        { status: 400 }
      );
    }

    // Capture snapshot before changes for version diff
    let previousSnapshot;
    try {
      previousSnapshot = await createQuoteSnapshot(quoteId);
    } catch { /* quote may not exist in version system yet */ }

    // Update quote with overrides
    const quote = await prisma.quotes.update({
      where: { id: quoteId },
      data: {
        overrideSubtotal: body.overrideSubtotal !== undefined ? body.overrideSubtotal : undefined,
        overrideTotal: body.overrideTotal !== undefined ? body.overrideTotal : undefined,
        overrideDeliveryCost: body.overrideDeliveryCost !== undefined ? body.overrideDeliveryCost : undefined,
        overrideTemplatingCost: body.overrideTemplatingCost !== undefined ? body.overrideTemplatingCost : undefined,
        overrideReason: body.reason || null,
        overrideBy: user.id,
        overrideAt: new Date(),
      },
      include: {
        customers: true,
      }
    });

    // Log the override action
    await logActivity({
      userId: user.id,
      action: 'QUOTE_OVERRIDE_APPLIED',
      entity: 'QUOTE',
      entityId: quoteId.toString(),
      details: {
        overrideSubtotal: body.overrideSubtotal,
        overrideTotal: body.overrideTotal,
        overrideDeliveryCost: body.overrideDeliveryCost,
        overrideTemplatingCost: body.overrideTemplatingCost,
        reason: body.reason,
        originalSubtotal: Number(quote.subtotal),
        originalTotal: Number(quote.total),
        originalDeliveryCost: quote.deliveryCost ? Number(quote.deliveryCost) : null,
        originalTemplatingCost: quote.templatingCost ? Number(quote.templatingCost) : null
      }
    });

    // Record version snapshot
    try {
      await createQuoteVersion(quoteId, user.id, 'UPDATED', 'Override applied', previousSnapshot);
    } catch (versionError) {
      console.error('Error creating version (non-blocking):', versionError);
    }

    return NextResponse.json({
      success: true,
      quote: {
        id: quote.id,
        quote_number: quote.quote_number,
        subtotal: Number(quote.subtotal),
        total: Number(quote.total),
        calculated_total: quote.calculated_total ? Number(quote.calculated_total) : null,
        overrideSubtotal: quote.overrideSubtotal ? Number(quote.overrideSubtotal) : null,
        overrideTotal: quote.overrideTotal ? Number(quote.overrideTotal) : null,
        overrideDeliveryCost: quote.overrideDeliveryCost ? Number(quote.overrideDeliveryCost) : null,
        overrideTemplatingCost: quote.overrideTemplatingCost ? Number(quote.overrideTemplatingCost) : null,
        overrideReason: quote.overrideReason,
        overrideBy: quote.overrideBy,
        overrideAt: quote.overrideAt
      }
    });
  } catch (error: unknown) {
    logger.error('Error applying quote override:', error);
    const message = error instanceof Error ? error.message : 'Failed to apply override';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}

// DELETE /api/quotes/[id]/override - Clear all overrides
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const user = auth.user;

    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json(
        { error: 'Invalid quote ID' },
        { status: 400 }
      );
    }

    // Verify quote belongs to user's company
    const quoteCheck = await verifyQuoteOwnership(quoteId, user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Capture snapshot before changes for version diff
    let previousSnapshot;
    try {
      previousSnapshot = await createQuoteSnapshot(quoteId);
    } catch { /* quote may not exist in version system yet */ }

    const quote = await prisma.quotes.update({
      where: { id: quoteId },
      data: {
        overrideSubtotal: null,
        overrideTotal: null,
        overrideDeliveryCost: null,
        overrideTemplatingCost: null,
        overrideReason: null,
        overrideBy: null,
        overrideAt: null,
      },
    });

    // Log the override removal
    await logActivity({
      userId: user.id,
      action: 'QUOTE_OVERRIDE_REMOVED',
      entity: 'QUOTE',
      entityId: quoteId.toString(),
      details: {
        quote_number: quote.quote_number
      }
    });

    // Record version snapshot
    try {
      await createQuoteVersion(quoteId, user.id, 'UPDATED', 'Override removed', previousSnapshot);
    } catch (versionError) {
      console.error('Error creating version (non-blocking):', versionError);
    }

    return NextResponse.json({
      success: true,
      message: 'Quote overrides cleared'
    });
  } catch (error: unknown) {
    logger.error('Error clearing quote overrides:', error);
    const message = error instanceof Error ? error.message : 'Failed to clear overrides';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
