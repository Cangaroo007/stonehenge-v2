import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET: Correction statistics for this tenant
export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalCorrections, byType, byConfidence, recentCorrections] =
      await Promise.all([
        // Total corrections
        prisma.drawing_corrections.count({
          where: { company_id: companyId },
        }),

        // Corrections by type
        prisma.drawing_corrections.groupBy({
          by: ['correction_type'],
          where: { company_id: companyId },
          _count: { id: true },
        }),

        // Corrections by AI confidence
        prisma.drawing_corrections.groupBy({
          by: ['ai_confidence'],
          where: { company_id: companyId },
          _count: { id: true },
        }),

        // Recent corrections (last 30 days)
        prisma.drawing_corrections.count({
          where: {
            company_id: companyId,
            created_at: { gte: thirtyDaysAgo },
          },
        }),
      ]);

    // Transform grouped results into maps
    const byTypeMap: Record<string, number> = {};
    for (const row of byType) {
      byTypeMap[row.correction_type] = row._count.id;
    }

    const byConfidenceMap: Record<string, number> = {
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      UNKNOWN: 0,
    };
    for (const row of byConfidence) {
      const key = row.ai_confidence ?? 'UNKNOWN';
      byConfidenceMap[key] = row._count.id;
    }

    return NextResponse.json({
      totalCorrections,
      byType: byTypeMap,
      byConfidence: byConfidenceMap,
      recentCorrections,
    });
  } catch (error) {
    console.error('Error fetching correction stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch correction stats' },
      { status: 500 }
    );
  }
}
