import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

function serializeExample(example: {
  id: number;
  quote_id: number | null;
  drawing_id: string | null;
  analysis_id: number | null;
  company_id: number;
  source_quote_number: string | null;
  source_system: string | null;
  expected_data: unknown;
  extracted_data: unknown;
  comparison_data: unknown;
  status: string;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: example.id,
    quoteId: example.quote_id,
    drawingId: example.drawing_id,
    analysisId: example.analysis_id,
    companyId: example.company_id,
    sourceQuoteNumber: example.source_quote_number,
    sourceSystem: example.source_system,
    expectedData: example.expected_data,
    extractedData: example.extracted_data,
    comparisonData: example.comparison_data,
    status: example.status,
    notes: example.notes,
    createdAt: example.created_at,
    updatedAt: example.updated_at,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const quoteId = searchParams.get('quoteId');
    const status = searchParams.get('status');

    const examples = await prisma.ai_quote_learning_examples.findMany({
      where: {
        company_id: auth.user.companyId,
        ...(quoteId ? { quote_id: Number(quoteId) } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: 200,
    });

    return NextResponse.json(examples.map(serializeExample));
  } catch (error) {
    console.error('Error fetching AI quote learning examples:', error);
    return NextResponse.json({ error: 'Failed to fetch learning examples' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const quoteId = body.quoteId == null ? null : Number(body.quoteId);

    if (quoteId != null) {
      if (!Number.isInteger(quoteId)) {
        return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
      }
      const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
      if (!quoteCheck) {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
      }
    }

    if (!body.expectedData || typeof body.expectedData !== 'object') {
      return NextResponse.json({ error: 'expectedData is required' }, { status: 400 });
    }

    const example = await prisma.ai_quote_learning_examples.create({
      data: {
        quote_id: quoteId,
        drawing_id: typeof body.drawingId === 'string' ? body.drawingId : null,
        analysis_id: body.analysisId == null ? null : Number(body.analysisId),
        company_id: auth.user.companyId,
        source_quote_number: typeof body.sourceQuoteNumber === 'string' ? body.sourceQuoteNumber : null,
        source_system: typeof body.sourceSystem === 'string' ? body.sourceSystem : 'NCS_ACRUAL',
        expected_data: body.expectedData,
        extracted_data: body.extractedData ?? undefined,
        comparison_data: body.comparisonData ?? undefined,
        status: typeof body.status === 'string' ? body.status : 'NEEDS_REVIEW',
        notes: typeof body.notes === 'string' ? body.notes : null,
        created_by: auth.user.id,
      },
    });

    return NextResponse.json(serializeExample(example), { status: 201 });
  } catch (error) {
    console.error('Error creating AI quote learning example:', error);
    return NextResponse.json({ error: 'Failed to create learning example' }, { status: 500 });
  }
}
