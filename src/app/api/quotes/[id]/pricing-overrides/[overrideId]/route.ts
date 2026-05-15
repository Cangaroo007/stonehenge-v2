import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';

const VALID_TYPES = new Set(['MULTIPLIER', 'LM', 'FIXED_DELTA', 'FIXED_ADJUSTMENT']);

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

async function recalculateQuote(quoteId: number) {
  try {
    const calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
    await prisma.quotes.update({
      where: { id: quoteId },
      data: {
        subtotal: calcResult.subtotal,
        total: calcResult.total,
        tax_amount: calcResult.gstAmount,
        calculated_total: calcResult.total,
        calculated_at: new Date(),
        calculation_breakdown: calcResult as unknown as object,
      },
    });
  } catch (error) {
    console.error('Pricing override changed but recalculation failed:', error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; overrideId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, overrideId } = await params;
    const quoteId = Number(id);
    const overrideIdNum = Number(overrideId);
    if (!Number.isInteger(quoteId) || !Number.isInteger(overrideIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const existing = await prisma.quote_pricing_overrides.findFirst({
      where: { id: overrideIdNum, quote_id: quoteId, company_id: auth.user.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.category !== undefined) data.category = normalizeToken(body.category);
    if (body.overrideType !== undefined || body.override_type !== undefined) {
      const overrideType = normalizeToken(body.overrideType ?? body.override_type);
      if (!VALID_TYPES.has(overrideType)) {
        return NextResponse.json({ error: 'Invalid override type' }, { status: 400 });
      }
      data.override_type = overrideType;
    }
    if (body.value !== undefined) {
      const value = Number(body.value);
      const type = String(data.override_type ?? existing.override_type);
      if (!Number.isFinite(value)) {
        return NextResponse.json({ error: 'Override value must be a number' }, { status: 400 });
      }
      if ((type === 'MULTIPLIER' || type === 'LM') && value < 0) {
        return NextResponse.json({ error: 'Multiplier and LM overrides cannot be negative' }, { status: 400 });
      }
      data.value = value;
    }
    if (body.reason !== undefined) {
      data.reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
    }
    if (body.source !== undefined) {
      data.source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : null;
    }
    if (body.isActive !== undefined) data.is_active = Boolean(body.isActive);

    const updated = await prisma.quote_pricing_overrides.update({
      where: { id: overrideIdNum },
      data,
    });

    await recalculateQuote(quoteId);

    return NextResponse.json({
      id: updated.id,
      quoteId: updated.quote_id,
      pieceId: updated.piece_id,
      category: updated.category,
      overrideType: updated.override_type,
      value: Number(updated.value),
      reason: updated.reason,
      source: updated.source,
      isActive: updated.is_active,
    });
  } catch (error) {
    console.error('Error updating pricing override:', error);
    return NextResponse.json({ error: 'Failed to update pricing override' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; overrideId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id, overrideId } = await params;
    const quoteId = Number(id);
    const overrideIdNum = Number(overrideId);
    if (!Number.isInteger(quoteId) || !Number.isInteger(overrideIdNum)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const existing = await prisma.quote_pricing_overrides.findFirst({
      where: { id: overrideIdNum, quote_id: quoteId, company_id: auth.user.companyId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }

    await prisma.quote_pricing_overrides.delete({ where: { id: overrideIdNum } });
    await recalculateQuote(quoteId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting pricing override:', error);
    return NextResponse.json({ error: 'Failed to delete pricing override' }, { status: 500 });
  }
}
