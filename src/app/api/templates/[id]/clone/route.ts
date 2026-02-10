import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { cloneTemplateToQuote } from '@/lib/services/template-cloner';
import type { MaterialAssignments, EdgeOverrides } from '@/lib/types/unit-templates';

// POST: Clone template into a new quote
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
    const templateId = parseInt(id, 10);

    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.materialAssignments || typeof body.materialAssignments !== 'object') {
      return NextResponse.json(
        { error: 'materialAssignments is required and must be an object mapping materialRole to materialId' },
        { status: 400 }
      );
    }

    // Validate materialAssignments values are numbers
    const materialAssignments = body.materialAssignments as MaterialAssignments;
    for (const [role, materialId] of Object.entries(materialAssignments)) {
      if (typeof materialId !== 'number' || materialId <= 0) {
        return NextResponse.json(
          { error: `Invalid materialId for role "${role}": must be a positive number` },
          { status: 400 }
        );
      }
    }

    if (!body.customerId && body.customerId !== 0) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    const edgeOverrides = body.edgeOverrides as EdgeOverrides | undefined;

    const result = await cloneTemplateToQuote({
      templateId,
      customerId: body.customerId,
      unitNumber: body.unitNumber || '',
      projectName: body.projectName,
      materialAssignments,
      edgeOverrides,
    });

    return NextResponse.json({
      quoteId: result.quoteId,
      pieceCount: result.pieceCount,
      totalExGst: result.totalExGst,
      totalIncGst: result.totalIncGst,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to clone template';
    console.error('Error cloning template:', error);

    // Return 404 for "not found" errors, 400 for validation errors
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes('inactive')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
