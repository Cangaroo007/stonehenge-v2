import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { generateProjectQuotes } from '@/lib/services/bulk-quote-generator';

/**
 * POST /api/unit-blocks/[id]/generate
 *
 * Generate quotes for units in a project. Supports dry-run mode
 * for pre-flight validation before actual generation.
 *
 * Body: {
 *   unitIds?: number[],        // optional: specific units only
 *   overwriteExisting?: boolean,
 *   dryRun?: boolean
 * }
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

    const body = await request.json();
    const {
      unitIds,
      overwriteExisting = false,
      dryRun = false,
    } = body as {
      unitIds?: number[];
      overwriteExisting?: boolean;
      dryRun?: boolean;
    };

    // Always run dry-run first for validation, even for actual runs
    const dryRunResult = await generateProjectQuotes({
      projectId,
      unitIds,
      overwriteExisting,
      dryRun: true,
    });

    if (dryRun) {
      const ready = dryRunResult.results.filter(r => r.status === 'created').length;
      const skipped = dryRunResult.results.filter(r => r.status === 'skipped').length;
      const failed = dryRunResult.results.filter(r => r.status === 'failed').length;

      return NextResponse.json({
        dryRun: true,
        ready,
        skipped,
        failed,
        results: dryRunResult.results,
        errors: dryRunResult.errors,
      });
    }

    // Check if there are any units ready to generate
    const readyCount = dryRunResult.results.filter(r => r.status === 'created').length;
    if (readyCount === 0) {
      return NextResponse.json({
        message: 'No units ready for quote generation',
        results: dryRunResult.results,
        errors: dryRunResult.errors,
      }, { status: 422 });
    }

    // Run actual generation
    const result = await generateProjectQuotes({
      projectId,
      unitIds,
      overwriteExisting,
      dryRun: false,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error generating project quotes:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate quotes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
