import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';
import { buildQuotePricingUpdate } from '@/lib/services/quote-pricing-persistence';

const VALID_TYPES = new Set(['MULTIPLIER', 'LM', 'FIXED_DELTA', 'FIXED_ADJUSTMENT']);
const VALID_LM_CATEGORIES = new Set(['NORMAL_CUT', 'MITRE_CUT', 'NORMAL_POLISH', 'MITRE_POLISH']);

function normalizeToken(value: unknown): string {
  return String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function serializeOverride(o: {
  id: number;
  quote_id: number;
  piece_id: number | null;
  company_id: number;
  category: string;
  override_type: string;
  value: { toNumber: () => number } | number;
  reason: string | null;
  source: string | null;
  is_active: boolean;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: o.id,
    quoteId: o.quote_id,
    pieceId: o.piece_id,
    companyId: o.company_id,
    category: o.category,
    overrideType: o.override_type,
    value: typeof o.value === 'number' ? o.value : o.value.toNumber(),
    reason: o.reason,
    source: o.source,
    isActive: o.is_active,
    createdBy: o.created_by,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const quoteId = Number(id);
    if (!Number.isInteger(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const overrides = await prisma.quote_pricing_overrides.findMany({
      where: { quote_id: quoteId, company_id: auth.user.companyId },
      orderBy: [{ is_active: 'desc' }, { created_at: 'asc' }],
    });

    return NextResponse.json(overrides.map(serializeOverride));
  } catch (error) {
    console.error('Error fetching pricing overrides:', error);
    return NextResponse.json({ error: 'Failed to fetch pricing overrides' }, { status: 500 });
  }
}

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
    const quoteId = Number(id);
    if (!Number.isInteger(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();
    const category = normalizeToken(body.category);
    const overrideType = normalizeToken(body.overrideType ?? body.override_type);
    const value = Number(body.value);
    const pieceId = body.pieceId == null ? null : Number(body.pieceId);

    if (!category) {
      return NextResponse.json({ error: 'Category is required' }, { status: 400 });
    }
    if (!VALID_TYPES.has(overrideType)) {
      return NextResponse.json({ error: 'Invalid override type' }, { status: 400 });
    }
    if (overrideType === 'LM' && !VALID_LM_CATEGORIES.has(category)) {
      return NextResponse.json({ error: 'Chargeable LM overrides are only available for cut and edge LM categories' }, { status: 400 });
    }
    if (!Number.isFinite(value)) {
      return NextResponse.json({ error: 'Override value must be a number' }, { status: 400 });
    }
    if ((overrideType === 'MULTIPLIER' || overrideType === 'LM') && value < 0) {
      return NextResponse.json({ error: 'Multiplier and LM overrides cannot be negative' }, { status: 400 });
    }
    if (pieceId != null && !Number.isInteger(pieceId)) {
      return NextResponse.json({ error: 'Invalid piece ID' }, { status: 400 });
    }

    if (pieceId != null) {
      const piece = await prisma.quote_pieces.findFirst({
        where: {
          id: pieceId,
          quote_rooms: { quote_id: quoteId },
        },
        select: { id: true },
      });
      if (!piece) {
        return NextResponse.json({ error: 'Piece not found for quote' }, { status: 404 });
      }
    }

    const override = await prisma.quote_pricing_overrides.create({
      data: {
        quote_id: quoteId,
        piece_id: pieceId,
        company_id: auth.user.companyId,
        category,
        override_type: overrideType,
        value,
        reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null,
        source: typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'manual',
        created_by: auth.user.id,
        is_active: body.isActive === undefined ? true : Boolean(body.isActive),
      },
    });

    try {
      const calcResult = await calculateQuotePrice(String(quoteId), { forceRecalculate: true });
      await prisma.quotes.update({
        where: { id: quoteId },
        data: buildQuotePricingUpdate(calcResult),
      });
    } catch (recalcError) {
      console.error('Pricing override saved but recalculation failed:', recalcError);
    }

    return NextResponse.json(serializeOverride(override), { status: 201 });
  } catch (error) {
    console.error('Error creating pricing override:', error);
    return NextResponse.json({ error: 'Failed to create pricing override' }, { status: 500 });
  }
}
