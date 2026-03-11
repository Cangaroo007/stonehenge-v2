import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET: List all learning rules for this tenant
export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const rules = await prisma.drawing_learning_rules.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('Error fetching learning rules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch learning rules' },
      { status: 500 }
    );
  }
}

// PATCH: Toggle a rule's is_active status
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const body = await request.json();
    const { id, is_active } = body;

    if (typeof id !== 'number' || typeof is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'id (number) and is_active (boolean) are required' },
        { status: 400 }
      );
    }

    // Ensure rule belongs to this company
    const existing = await prisma.drawing_learning_rules.findFirst({
      where: { id, company_id: companyId },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const updated = await prisma.drawing_learning_rules.update({
      where: { id },
      data: { is_active },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating learning rule:', error);
    return NextResponse.json(
      { error: 'Failed to update learning rule' },
      { status: 500 }
    );
  }
}
