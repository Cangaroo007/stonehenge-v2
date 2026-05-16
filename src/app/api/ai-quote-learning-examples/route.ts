import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

const VALID_STATUSES = new Set([
  'NEEDS_REVIEW',
  'APPROVED',
  'READY_FOR_TRAINING',
  'REJECTED',
]);

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

function parseOptionalId(value: unknown, label: string) {
  if (value == null || value === '') return { value: null };

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return { error: `Invalid ${label}` };
  }

  return { value: parsed };
}

function parseStatus(status: unknown) {
  if (status == null || status === '') return 'NEEDS_REVIEW';
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) return null;
  return status;
}

async function verifyDrawingOwnership(drawingId: string, companyId: number) {
  const drawing = await prisma.drawings.findUnique({
    where: { id: drawingId },
    select: {
      id: true,
      quoteId: true,
      quotes: {
        select: { company_id: true },
      },
    },
  });

  if (!drawing || drawing.quotes.company_id !== companyId) return null;
  return drawing;
}

async function verifyAnalysisOwnership(analysisId: number, companyId: number) {
  const analysis = await prisma.quote_drawing_analyses.findUnique({
    where: { id: analysisId },
    select: {
      id: true,
      quote_id: true,
      quotes: {
        select: { company_id: true },
      },
    },
  });

  if (!analysis || analysis.quotes.company_id !== companyId) return null;
  return analysis;
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
    const sourceQuoteNumber = searchParams.get('sourceQuoteNumber');

    if (status && !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const parsedQuoteId = parseOptionalId(quoteId, 'quote ID');
    if ('error' in parsedQuoteId) {
      return NextResponse.json({ error: parsedQuoteId.error }, { status: 400 });
    }

    const examples = await prisma.ai_quote_learning_examples.findMany({
      where: {
        company_id: auth.user.companyId,
        ...(parsedQuoteId.value ? { quote_id: parsedQuoteId.value } : {}),
        ...(status ? { status } : {}),
        ...(sourceQuoteNumber ? { source_quote_number: sourceQuoteNumber } : {}),
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
    const parsedQuoteId = parseOptionalId(body.quoteId, 'quote ID');
    if ('error' in parsedQuoteId) {
      return NextResponse.json({ error: parsedQuoteId.error }, { status: 400 });
    }

    let quoteId = parsedQuoteId.value;

    if (quoteId != null) {
      const quoteCheck = await verifyQuoteOwnership(quoteId, auth.user.companyId);
      if (!quoteCheck) {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
      }
    }

    const drawingId = typeof body.drawingId === 'string' && body.drawingId.trim()
      ? body.drawingId.trim()
      : null;
    if (drawingId) {
      const drawing = await verifyDrawingOwnership(drawingId, auth.user.companyId);
      if (!drawing) {
        return NextResponse.json({ error: 'Drawing not found' }, { status: 404 });
      }
      if (quoteId != null && drawing.quoteId !== quoteId) {
        return NextResponse.json(
          { error: 'Drawing does not belong to the selected quote' },
          { status: 400 }
        );
      }
      if (quoteId == null) quoteId = drawing.quoteId;
    }

    const parsedAnalysisId = parseOptionalId(body.analysisId, 'analysis ID');
    if ('error' in parsedAnalysisId) {
      return NextResponse.json({ error: parsedAnalysisId.error }, { status: 400 });
    }

    const analysisId = parsedAnalysisId.value;
    if (analysisId != null) {
      const analysis = await verifyAnalysisOwnership(analysisId, auth.user.companyId);
      if (!analysis) {
        return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
      }
      if (quoteId != null && analysis.quote_id !== quoteId) {
        return NextResponse.json(
          { error: 'Analysis does not belong to the selected quote' },
          { status: 400 }
        );
      }
      if (quoteId == null) quoteId = analysis.quote_id;
    }

    if (!body.expectedData || typeof body.expectedData !== 'object') {
      return NextResponse.json({ error: 'expectedData is required' }, { status: 400 });
    }

    const status = parseStatus(body.status);
    if (!status) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const example = await prisma.ai_quote_learning_examples.create({
      data: {
        quote_id: quoteId,
        drawing_id: drawingId,
        analysis_id: analysisId,
        company_id: auth.user.companyId,
        source_quote_number: typeof body.sourceQuoteNumber === 'string' ? body.sourceQuoteNumber : null,
        source_system: typeof body.sourceSystem === 'string' ? body.sourceSystem : 'NCS_ACRUAL',
        expected_data: body.expectedData,
        extracted_data: body.extractedData ?? undefined,
        comparison_data: body.comparisonData ?? undefined,
        status,
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

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const parsedId = parseOptionalId(body.id, 'learning example ID');
    if ('error' in parsedId || parsedId.value == null) {
      return NextResponse.json(
        { error: parsedId.error ?? 'Learning example ID is required' },
        { status: 400 }
      );
    }

    const existing = await prisma.ai_quote_learning_examples.findFirst({
      where: { id: parsedId.value, company_id: auth.user.companyId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Learning example not found' }, { status: 404 });
    }

    const data: {
      status?: string;
      notes?: string | null;
    } = {};

    if ('status' in body) {
      const status = parseStatus(body.status);
      if (!status) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      data.status = status;
    }

    if ('notes' in body) {
      data.notes = typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim()
        : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'No learning example updates provided' },
        { status: 400 }
      );
    }

    const updated = await prisma.ai_quote_learning_examples.update({
      where: { id: parsedId.value },
      data,
    });

    return NextResponse.json(serializeExample(updated));
  } catch (error) {
    console.error('Error updating AI quote learning example:', error);
    return NextResponse.json({ error: 'Failed to update learning example' }, { status: 500 });
  }
}
