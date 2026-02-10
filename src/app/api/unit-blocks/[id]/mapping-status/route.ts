import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { checkProjectMappingReadiness } from '@/lib/services/finish-tier-resolver';

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

    const readiness = await checkProjectMappingReadiness(projectId);

    return NextResponse.json(readiness);
  } catch (error) {
    console.error('Error checking mapping readiness:', error);
    return NextResponse.json({ error: 'Failed to check mapping readiness' }, { status: 500 });
  }
}
