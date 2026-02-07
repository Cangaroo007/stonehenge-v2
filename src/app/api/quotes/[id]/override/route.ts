import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';
import { logActivity } from '@/lib/audit';

// POST /api/quotes/[id]/override
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    const quoteId = parseInt(params.id);
    
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
        overrideAt: new Date()
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
        overrideBy: quote.overrideByUser,
        overrideAt: quote.overrideAt
      }
    });
  } catch (error: any) {
    console.error('Error applying quote override:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to apply override' },
      { status: 400 }
    );
  }
}

// DELETE /api/quotes/[id]/override - Clear all overrides
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request);
    const quoteId = parseInt(params.id);
    
    if (isNaN(quoteId)) {
      return NextResponse.json(
        { error: 'Invalid quote ID' },
        { status: 400 }
      );
    }
    
    const quote = await prisma.quotes.update({
      where: { id: quoteId },
      data: {
        overrideSubtotal: null,
        overrideTotal: null,
        overrideDeliveryCost: null,
        overrideTemplatingCost: null,
        overrideReason: null,
        overrideBy: null,
        overrideAt: null
      }
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
    
    return NextResponse.json({
      success: true,
      message: 'Quote overrides cleared'
    });
  } catch (error: any) {
    console.error('Error clearing quote overrides:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to clear overrides' },
      { status: 400 }
    );
  }
}
