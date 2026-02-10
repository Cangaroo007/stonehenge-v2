import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { dryRunGeneration, generateQuotes } from '@/lib/services/bulk-quote-generator';

export const maxDuration = 120; // 2 minutes — Railway/Vercel max

/**
 * GET: Dry run — check which units are ready for quote generation.
 * Returns: { ready: [...], notReady: [...] }
 * UI calls this first to show the user what will happen.
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

    // Check project exists
    const project = await prisma.unit_block_projects.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const forceRegenerate = request.nextUrl.searchParams.get('forceRegenerate') === 'true';

    const result = await dryRunGeneration(projectId, { forceRegenerate });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in dry run generation:', error);
    return NextResponse.json(
      { error: 'Failed to check generation readiness' },
      { status: 500 }
    );
  }
}

/**
 * POST: Generate quotes for ready units.
 * Body: {
 *   unitIds?: number[],
 *   forceRegenerate?: boolean,
 *   customerId?: number
 * }
 * Returns: BulkGenerationResult
 *
 * Synchronous — may take 30-60+ seconds for large projects.
 */
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
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    // Check project exists
    const project = await prisma.unit_block_projects.findUnique({
      where: { id: projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { unitIds, forceRegenerate, customerId } = body as {
      unitIds?: number[];
      forceRegenerate?: boolean;
      customerId?: number;
    };

    // Generate quotes
    const result = await generateQuotes(projectId, {
      unitIds,
      forceRegenerate: forceRegenerate ?? false,
      customerId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating quotes:', error);
    return NextResponse.json(
      { error: 'Failed to generate quotes' },
      { status: 500 }
    );
  }
}
