import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getProjectChangeReport } from '@/lib/services/buyer-change-tracker';

/**
 * GET /api/unit-blocks/[id]/change-report
 * Returns the project-level change report with aggregated buyer changes.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const report = await getProjectChangeReport(projectId);
    return NextResponse.json(report);
  } catch (error) {
    console.error('Error fetching change report:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch change report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
