import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const asStr = (v: unknown): string =>
  typeof v === 'string' ? v : JSON.stringify(v);

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

    const [
      totalCorrections,
      byType,
      byConfidence,
      recentCorrectionsCount,
      byField,
      recentCorrectionsList,
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
          created_at: { gte: thirtyDaysAgo },
        },
      }),

      // Corrections by field
      prisma.drawing_corrections.groupBy({
        by: ['field_name'],
        where: { company_id: companyId },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 20,
      }),

      // Recent corrections list (last 20)
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

    // Transform grouped results into maps — preserve existing shape
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

    // correctionsByField
    const correctionsByField = byField.map((row) => ({
      fieldName: row.field_name,
      count: row._count.id,
    }));

    // mostCorrectedFields — need top correction per field
    // Get all corrections for top fields to find dominant corrected_value
    const topFieldNames = byField.slice(0, 10).map((r) => r.field_name);
    const topFieldCorrections = topFieldNames.length > 0
      ? await prisma.drawing_corrections.groupBy({
          by: ['field_name', 'corrected_value'],
          where: {
            company_id: companyId,
            field_name: { in: topFieldNames },
          },
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        })
      : [];

    // Find top correction per field
    const topCorrectionByField = new Map<string, string>();
    for (const row of topFieldCorrections) {
      if (!topCorrectionByField.has(row.field_name)) {
        topCorrectionByField.set(row.field_name, asStr(row.corrected_value));
      }
    }

    const mostCorrectedFields = byField.slice(0, 10).map((row) => ({
      fieldName: row.field_name,
      count: row._count.id,
      topCorrection: topCorrectionByField.get(row.field_name) ?? '',
    }));

    // Format recent corrections list
    const recentCorrectionsFormatted = recentCorrectionsList.map((c) => ({
      id: c.id,
      correctionType: c.correction_type,
      fieldName: c.field_name,
      originalValue: c.original_value != null ? asStr(c.original_value) : null,
      correctedValue: asStr(c.corrected_value),
      aiConfidence: c.ai_confidence,
      createdAt: c.created_at.toISOString(),
    }));

    return NextResponse.json({
      // Existing fields — preserved exactly
      totalCorrections,
      byType: byTypeMap,
      byConfidence: byConfidenceMap,
      recentCorrections: recentCorrectionsCount,
      // New fields
      correctionsByField,
      mostCorrectedFields,
      recentCorrectionsList: recentCorrectionsFormatted,
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
