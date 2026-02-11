import { NextRequest, NextResponse } from 'next/server';
import { getFromR2 } from '@/lib/storage/r2';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { generateAndStoreThumbnail } from '@/lib/services/pdfThumbnail';
import { logger } from '@/lib/logger';

/**
 * POST /api/drawings/backfill-thumbnails
 *
 * Generates thumbnails for all existing PDF drawings that don't have one yet.
 * This is an admin-only endpoint for one-time backfill after deploying
 * the thumbnail feature.
 *
 * Query params:
 *   ?limit=10  - Max number of drawings to process (default: 50)
 *   ?dryRun=true - Only report what would be processed
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = parseInt(
      request.nextUrl.searchParams.get('limit') || '50',
      10
    );
    const dryRun =
      request.nextUrl.searchParams.get('dryRun') === 'true';

    // Find all PDF drawings without thumbnails
    const drawings = await prisma.drawings.findMany({
      where: {
        mimeType: 'application/pdf',
        thumbnailKey: null,
      },
      select: {
        id: true,
        filename: true,
        storageKey: true,
      },
      take: limit,
      orderBy: { uploadedAt: 'desc' },
    });

    logger.info(
      `[Backfill] Found ${drawings.length} PDF drawings without thumbnails`
    );

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        count: drawings.length,
        drawings: drawings.map((d: { id: string; filename: string }) => ({
          id: d.id,
          filename: d.filename,
        })),
      });
    }

    const results: Array<{
      id: string;
      filename: string;
      status: 'success' | 'error';
      error?: string;
    }> = [];

    for (const drawing of drawings) {
      try {
        logger.info(
          `[Backfill] Processing: ${drawing.filename} (${drawing.id})`
        );

        const pdfBuffer = await getFromR2(drawing.storageKey);
        if (!pdfBuffer) {
          results.push({
            id: drawing.id,
            filename: drawing.filename,
            status: 'error',
            error: 'PDF not found in storage',
          });
          continue;
        }

        await generateAndStoreThumbnail(
          drawing.id,
          pdfBuffer,
          drawing.storageKey
        );

        results.push({
          id: drawing.id,
          filename: drawing.filename,
          status: 'success',
        });
      } catch (err) {
        logger.error(
          `[Backfill] Failed for ${drawing.id}:`,
          err instanceof Error ? err.message : err
        );
        results.push({
          id: drawing.id,
          filename: drawing.filename,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const duration = Date.now() - startTime;

    logger.info(
      `[Backfill] Complete: ${succeeded} succeeded, ${failed} failed in ${duration}ms`
    );

    return NextResponse.json({
      total: drawings.length,
      succeeded,
      failed,
      durationMs: duration,
      results,
    });
  } catch (error) {
    logger.error('[Backfill] Error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Backfill failed',
      },
      { status: 500 }
    );
  }
}
