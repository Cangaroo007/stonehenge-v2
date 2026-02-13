import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';
import { logActivity } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { createQuoteVersion, createQuoteSnapshot } from '@/lib/services/quote-version-service';

// Fields that exist in the database but are not yet in the Prisma schema.
// Used for double-cast pattern when reading/writing override fields.
interface QuoteOverrideFields {
  overrideSubtotal: number | null;
  overrideTotal: number | null;
  overrideDeliveryCost: number | null;
  overrideTemplatingCost: number | null;
  overrideReason: string | null;
  overrideBy: number | null;
  overrideAt: Date | null;
  deliveryCost: number | null;
  templatingCost: number | null;
}

// Typed update data for override fields (not yet in Prisma schema)
interface QuoteOverrideUpdateData {
  overrideSubtotal?: number | null;
  overrideTotal?: number | null;
  overrideDeliveryCost?: number | null;
  overrideTemplatingCost?: number | null;
  overrideReason?: string | null;
  overrideBy?: number | null;
  overrideAt?: Date | null;
}

// POST /api/quotes/[id]/override
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json(
        { error: 'Invalid quote ID' },
        { status: 400 }
      );
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

    // Take snapshot before changes for version diff
    let previousSnapshot;
    try {
      previousSnapshot = await createQuoteSnapshot(quoteId);
    } catch { /* quote may not exist yet in version system */ }

    // Update quote with overrides (fields are planned schema additions)
    const overrideData: QuoteOverrideUpdateData = {
      overrideSubtotal: body.overrideSubtotal !== undefined ? body.overrideSubtotal : undefined,
      overrideTotal: body.overrideTotal !== undefined ? body.overrideTotal : undefined,
      overrideDeliveryCost: body.overrideDeliveryCost !== undefined ? body.overrideDeliveryCost : undefined,
      overrideTemplatingCost: body.overrideTemplatingCost !== undefined ? body.overrideTemplatingCost : undefined,
      overrideReason: body.reason || null,
      overrideBy: user.id,
      overrideAt: new Date(),
    };

    const quote = await prisma.quotes.update({
      where: { id: quoteId },
      data: overrideData as unknown as Record<string, unknown>,
      include: {
        customers: true,
      }
    });

    // Double-cast to access override fields not yet in Prisma schema
    const ext = quote as unknown as QuoteOverrideFields;

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
        originalDeliveryCost: ext.deliveryCost ? Number(ext.deliveryCost) : null,
        originalTemplatingCost: ext.templatingCost ? Number(ext.templatingCost) : null
      }
    });

    // Record version snapshot after override
    try {
      await createQuoteVersion(quoteId, user.id, 'UPDATED', body.reason || 'Pricing override applied', previousSnapshot);
    } catch (versionError) {
      console.error('Error creating version after override (non-blocking):', versionError);
    }

    return NextResponse.json({
      success: true,
      quote: {
        id: quote.id,
        quote_number: quote.quote_number,
        subtotal: Number(quote.subtotal),
        total: Number(quote.total),
        calculated_total: quote.calculated_total ? Number(quote.calculated_total) : null,
        overrideSubtotal: ext.overrideSubtotal ? Number(ext.overrideSubtotal) : null,
        overrideTotal: ext.overrideTotal ? Number(ext.overrideTotal) : null,
        overrideDeliveryCost: ext.overrideDeliveryCost ? Number(ext.overrideDeliveryCost) : null,
        overrideTemplatingCost: ext.overrideTemplatingCost ? Number(ext.overrideTemplatingCost) : null,
        overrideReason: ext.overrideReason,
        overrideBy: ext.overrideBy,
        overrideAt: ext.overrideAt
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
    const user = await requireAuth(request);
    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json(
        { error: 'Invalid quote ID' },
        { status: 400 }
      );
    }

    // Take snapshot before changes for version diff
    let previousSnapshot;
    try {
      previousSnapshot = await createQuoteSnapshot(quoteId);
    } catch { /* quote may not exist yet in version system */ }

    const clearData: QuoteOverrideUpdateData = {
      overrideSubtotal: null,
      overrideTotal: null,
      overrideDeliveryCost: null,
      overrideTemplatingCost: null,
      overrideReason: null,
      overrideBy: null,
      overrideAt: null,
    };

    const quote = await prisma.quotes.update({
      where: { id: quoteId },
      data: clearData as unknown as Record<string, unknown>,
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

    // Record version snapshot after clearing overrides
    try {
      await createQuoteVersion(quoteId, user.id, 'UPDATED', 'Pricing overrides cleared', previousSnapshot);
    } catch (versionError) {
      console.error('Error creating version after override clear (non-blocking):', versionError);
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
