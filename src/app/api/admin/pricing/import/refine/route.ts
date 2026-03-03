import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { refineProposal, type Proposal } from '@/lib/services/material-ingestor';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN', 'SALES_MANAGER']);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json() as { proposal: Proposal; command: string };

    if (!body.proposal || !body.command?.trim()) {
      return NextResponse.json(
        { error: 'proposal and command are required' },
        { status: 400 },
      );
    }

    const updated = await refineProposal(body.proposal, body.command.trim());

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Import refine error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refine proposal' },
      { status: 500 },
    );
  }
}
