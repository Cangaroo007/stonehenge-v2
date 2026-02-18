import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';
import { saveQuoteAsTemplate } from '@/lib/services/template-saver';

// POST — Save this quote's pieces as a reusable starter template
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;

    const { id } = await params;
    const quoteId = parseInt(id, 10);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    const quoteCheck = await verifyQuoteOwnership(quoteId, user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, description, category } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    const result = await saveQuoteAsTemplate(
      { quoteId, name, description, category },
      user.companyId,
      user.id
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A template with this name already exists' },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to save quote as template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
