import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import {
  runElevationPipeline,
  getDefaultSlabConfig,
} from '@/lib/services/elevation-pipeline';
import { ElevationAnalysis } from '@/lib/types/drawing-analysis';

export async function POST(request: NextRequest) {
  // Auth check
  const authResult = await requireAuth();
  if ('error' in authResult) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const body = await request.json();
    const {
      elevationAnalysis,
      materialCategory = 'ENGINEERED_QUARTZ_JUMBO',
      thickness = 20,
      quoteId,
    } = body as {
      elevationAnalysis: ElevationAnalysis;
      materialCategory?: string;
      thickness?: number;
      quoteId?: number;
    };

    if (!elevationAnalysis?.stoneFaces?.length) {
      return NextResponse.json(
        { error: 'No stone faces provided in elevation analysis' },
        { status: 400 }
      );
    }

    const config = getDefaultSlabConfig(materialCategory, thickness);
    const result = runElevationPipeline(elevationAnalysis, config);

    // Save to database if quoteId is provided
    if (quoteId) {
      await prisma.slab_optimizations.create({
        data: {
          id: crypto.randomUUID(),
          quoteId,
          slabWidth: config.slabWidth,
          slabHeight: config.slabHeight,
          kerfWidth: config.kerfWidth,
          totalSlabs: result.slabCount,
          totalWaste: result.optimizerResult.totalWasteArea,
          wastePercent: result.totalWastePercent,
          placements: result.optimizerResult.placements as unknown as object,
          updatedAt: new Date(),
        } as never,
      });
    }

    return NextResponse.json({
      success: true,
      result,
      summary: {
        totalFaces: elevationAnalysis.stoneFaces.length,
        totalPieces: result.pieces.length,
        slabsRequired: result.slabCount,
        wastePercent: result.totalWastePercent,
        netArea_sqm: result.totalNetArea_sqm,
        cuttingPerimeter_Lm: result.totalCuttingPerimeter_Lm,
        unplacedCount: result.unplacedPieces.length,
      },
    });
  } catch (error) {
    console.error('Elevation pipeline error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Pipeline failed',
      },
      { status: 500 }
    );
  }
}
