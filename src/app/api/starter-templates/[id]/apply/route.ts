import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { applyTemplateToQuote } from '@/lib/services/template-applier';
import type { MaterialRole } from '@/lib/types/starter-templates';

// POST — Apply this template to a quote (create pieces from template)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;

    // Verify template exists and is accessible
    const template = await prisma.starter_templates.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const body = await request.json();
    const { materialAssignments, quoteId, customerId, contactId, projectName } = body;

    // Validate materialAssignments
    if (!materialAssignments || typeof materialAssignments !== 'object') {
      return NextResponse.json(
        { error: 'materialAssignments is required' },
        { status: 400 }
      );
    }

    // Validate at least PRIMARY_BENCHTOP is assigned
    if (!materialAssignments.PRIMARY_BENCHTOP) {
      return NextResponse.json(
        { error: 'materialAssignments must include PRIMARY_BENCHTOP' },
        { status: 400 }
      );
    }

    // If quoteId provided, verify it exists
    if (quoteId) {
      const quote = await prisma.quotes.findUnique({
        where: { id: Number(quoteId) },
      });
      if (!quote) {
        return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
      }
    }

    // If no quoteId, customerId is required
    if (!quoteId && !customerId) {
      return NextResponse.json(
        { error: 'customerId is required when creating a new quote' },
        { status: 400 }
      );
    }

    const result = await applyTemplateToQuote({
      templateId: id,
      materialAssignments: materialAssignments as Record<MaterialRole, number>,
      quoteId: quoteId ? Number(quoteId) : undefined,
      customerId: customerId ? Number(customerId) : undefined,
      contactId: contactId ? Number(contactId) : undefined,
      projectName,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to apply template';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
