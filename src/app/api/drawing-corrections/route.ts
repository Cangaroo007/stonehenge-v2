import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { requireAuth } from '@/lib/auth';

// POST: Log a correction
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const body = await request.json();
    const {
      drawing_id,
      analysis_id,
      quote_id,
      piece_id,
      correction_type,
      field_name,
      original_value,
      corrected_value,
      ai_confidence,
    } = body;

    // Validate required fields
    if (!correction_type || !field_name || corrected_value === undefined) {
      return NextResponse.json(
        { error: 'correction_type, field_name, and corrected_value are required' },
        { status: 400 }
      );
    }

    const correction = await prisma.drawing_corrections.create({
      data: {
        drawing_id: drawing_id ?? null,
        analysis_id: analysis_id ?? null,
        quote_id: quote_id ?? null,
        piece_id: piece_id ?? null,
        company_id: companyId,
        correction_type,
        field_name,
        original_value: original_value as unknown as Prisma.InputJsonValue ?? undefined,
        corrected_value: corrected_value as unknown as Prisma.InputJsonValue,
        ai_confidence: ai_confidence ?? null,
        created_by: String(auth.user.id),
      },
    });

    return NextResponse.json(
      { id: correction.id, created_at: correction.created_at },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error logging correction:', error);
    return NextResponse.json(
      { error: 'Failed to log correction' },
      { status: 500 }
    );
  }
}

// GET: List corrections for a company
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const { searchParams } = new URL(request.url);
    const drawingId = searchParams.get('drawing_id');
    const quoteId = searchParams.get('quote_id');
    const correctionType = searchParams.get('correction_type');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const where: Prisma.drawing_correctionsWhereInput = {
      company_id: companyId,
    };

    if (drawingId) {
      where.drawing_id = drawingId;
    }
    if (quoteId) {
      where.quote_id = parseInt(quoteId, 10);
    }
    if (correctionType) {
      where.correction_type = correctionType;
    }

    const [corrections, total] = await Promise.all([
      prisma.drawing_corrections.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.drawing_corrections.count({ where }),
    ]);

    return NextResponse.json({
      corrections,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching corrections:', error);
    return NextResponse.json(
      { error: 'Failed to fetch corrections' },
      { status: 500 }
    );
  }
}
