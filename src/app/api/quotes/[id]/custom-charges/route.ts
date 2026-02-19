import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

/**
 * GET /api/quotes/[id]/custom-charges
 * List custom charges for a quote, ordered by sort_order.
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
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const charges = await prisma.quote_custom_charges.findMany({
      where: { quote_id: quoteId },
      orderBy: { sort_order: 'asc' },
    });

    return NextResponse.json(
      charges.map(c => ({
        id: c.id,
        quoteId: c.quote_id,
        description: c.description,
        amount: Number(c.amount),
        sortOrder: c.sort_order,
      }))
    );
  } catch (error) {
    console.error('Error fetching custom charges:', error);
    return NextResponse.json({ error: 'Failed to fetch custom charges' }, { status: 500 });
  }
}

/**
 * POST /api/quotes/[id]/custom-charges
 * Add a custom charge to a quote.
 * Body: { description: string, amount: number, sortOrder?: number }
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
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();
    const { description, amount, sortOrder } = body;

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
    }

    const charge = await prisma.quote_custom_charges.create({
      data: {
        quote_id: quoteId,
        company_id: auth.user.companyId,
        description: description.trim(),
        amount,
        sort_order: typeof sortOrder === 'number' ? sortOrder : 0,
      },
    });

    return NextResponse.json({
      id: charge.id,
      quoteId: charge.quote_id,
      description: charge.description,
      amount: Number(charge.amount),
      sortOrder: charge.sort_order,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating custom charge:', error);
    return NextResponse.json({ error: 'Failed to create custom charge' }, { status: 500 });
  }
}
