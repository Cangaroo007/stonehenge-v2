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

    const [
      totalCorrections,
      byType,
      byConfidence,
      recentCorrectionCount,
      mostCorrectedFields,
      recentCorrections,
      activeRules,
    ] = await Promise.all([
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

      // Recent corrections count (last 30 days)
      prisma.drawing_corrections.count({
        where: {
          company_id: companyId,
          created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),

      // Most corrected fields — raw SQL for groupBy + ordering
      prisma.$queryRaw<
        { field_name: string; count: bigint; top_correction: string }[]
      >`
        SELECT
          field_name,
          COUNT(*) as count,
          (
            SELECT corrected_value::text
            FROM drawing_corrections dc2
            WHERE dc2.company_id = ${companyId}
              AND dc2.field_name = dc.field_name
            GROUP BY corrected_value::text
            ORDER BY COUNT(*) DESC
            LIMIT 1
          ) as top_correction
        FROM drawing_corrections dc
        WHERE company_id = ${companyId}
        GROUP BY field_name
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `,

      // Recent corrections (last 20)
      prisma.drawing_corrections.findMany({
        where: { company_id: companyId },
        orderBy: { created_at: 'desc' },
        take: 20,
        select: {
          id: true,
          correction_type: true,
          field_name: true,
          original_value: true,
          corrected_value: true,
          ai_confidence: true,
          created_at: true,
        },
      }),

      // Active learning rules count
      prisma.drawing_learning_rules.count({
        where: { company_id: companyId, is_active: true },
      }),
    ]);

    // Transform grouped results
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

    const correctionsByType = byType.map(row => ({
      type: row.correction_type,
      count: row._count.id,
      percentage: totalCorrections > 0
        ? Math.round((row._count.id / totalCorrections) * 100)
        : 0,
    }));

    return NextResponse.json({
      totalCorrections,
      byType: byTypeMap,
      byConfidence: byConfidenceMap,
      recentCorrectionCount,
      correctionsByType,
      mostCorrectedFields: mostCorrectedFields.map(row => ({
        fieldName: row.field_name,
        count: Number(row.count),
        topCorrection: stripJsonQuotes(row.top_correction),
      })),
      recentCorrections: recentCorrections.map(row => ({
        id: row.id,
        correctionType: row.correction_type,
        fieldName: row.field_name,
        originalValue: row.original_value,
        correctedValue: row.corrected_value,
        aiConfidence: row.ai_confidence,
        createdAt: row.created_at.toISOString(),
      })),
      activeRules,
    });
  } catch (error) {
    console.error('Error fetching correction stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch correction stats' },
      { status: 500 }
    );
  }
}

function stripJsonQuotes(value: string | null): string | null {
  if (value === null) return null;
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}
