import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

/**
 * PATCH /api/quotes/[id]/custom-charges/[chargeId]
 * Update a custom charge's description, amount, or sort order.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, chargeId } = await params;
    const quoteId = parseInt(id, 10);
    const chargeIdNum = parseInt(chargeId, 10);
    if (isNaN(quoteId) || isNaN(chargeIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Verify charge belongs to this quote
    const existing = await prisma.quote_custom_charges.findFirst({
      where: { id: chargeIdNum, quote_id: quoteId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.description !== undefined) {
      if (typeof body.description !== 'string' || body.description.trim().length === 0) {
        return NextResponse.json({ error: 'Description must be a non-empty string' }, { status: 400 });
      }
      updateData.description = body.description.trim();
    }

    if (body.amount !== undefined) {
      if (typeof body.amount !== 'number' || body.amount <= 0) {
        return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 });
      }
      updateData.amount = body.amount;
    }

    if (body.sortOrder !== undefined) {
      if (typeof body.sortOrder !== 'number') {
        return NextResponse.json({ error: 'Sort order must be a number' }, { status: 400 });
      }
      updateData.sort_order = body.sortOrder;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid update fields provided' }, { status: 400 });
    }

    const charge = await prisma.quote_custom_charges.update({
      where: { id: chargeIdNum },
      data: updateData,
    });

    return NextResponse.json({
      id: charge.id,
      quoteId: charge.quote_id,
      description: charge.description,
      amount: Number(charge.amount),
      sortOrder: charge.sort_order,
    });
  } catch (error) {
    console.error('Error updating custom charge:', error);
    return NextResponse.json({ error: 'Failed to update custom charge' }, { status: 500 });
  }
}

/**
 * DELETE /api/quotes/[id]/custom-charges/[chargeId]
 * Remove a custom charge from a quote.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; chargeId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, chargeId } = await params;
    const quoteId = parseInt(id, 10);
    const chargeIdNum = parseInt(chargeId, 10);
    if (isNaN(quoteId) || isNaN(chargeIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Verify charge belongs to this quote
    const existing = await prisma.quote_custom_charges.findFirst({
      where: { id: chargeIdNum, quote_id: quoteId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 });
    }

    await prisma.quote_custom_charges.delete({
      where: { id: chargeIdNum },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting custom charge:', error);
    return NextResponse.json({ error: 'Failed to delete custom charge' }, { status: 500 });
  }
}
