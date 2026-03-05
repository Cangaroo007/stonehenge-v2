import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import crypto from 'crypto';

const asStr = (v: unknown): string =>
  typeof v === 'string' ? v : JSON.stringify(v);

// GET: Identify correction patterns (fields corrected 3+ times with 70%+ agreement)
export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    // Group corrections by type + field + corrected_value
    const grouped = await prisma.drawing_corrections.groupBy({
      by: ['correction_type', 'field_name', 'corrected_value', 'ai_confidence'],
      where: { company_id: companyId },
      _count: { id: true },
    });

    // Aggregate: combine across ai_confidence levels per (type, field, corrected_value)
    const patternMap = new Map<
      string,
      {
        correctionType: string;
        fieldName: string;
        correctedValue: string;
        correctionCount: number;
        confidenceCounts: { HIGH: number; MEDIUM: number; LOW: number; UNKNOWN: number };
      }
    >();

    for (const row of grouped) {
      const key = `${row.correction_type}::${row.field_name}::${asStr(row.corrected_value)}`;
      const existing = patternMap.get(key);
      const confKey = (row.ai_confidence ?? 'UNKNOWN') as 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

      if (existing) {
        existing.correctionCount += row._count.id;
        existing.confidenceCounts[confKey] += row._count.id;
      } else {
        patternMap.set(key, {
          correctionType: row.correction_type,
          fieldName: row.field_name,
          correctedValue: asStr(row.corrected_value),
          correctionCount: row._count.id,
          confidenceCounts: {
            HIGH: confKey === 'HIGH' ? row._count.id : 0,
            MEDIUM: confKey === 'MEDIUM' ? row._count.id : 0,
            LOW: confKey === 'LOW' ? row._count.id : 0,
            UNKNOWN: confKey === 'UNKNOWN' ? row._count.id : 0,
          },
        });
      }
    }

    // Get total corrections per (type, field) to calculate agreement percentage
    const fieldTotals = new Map<string, number>();
    const allPatterns = Array.from(patternMap.values());
    for (const p of allPatterns) {
      const fieldKey = `${p.correctionType}::${p.fieldName}`;
      fieldTotals.set(fieldKey, (fieldTotals.get(fieldKey) ?? 0) + p.correctionCount);
    }

    // Filter: 3+ corrections and 70%+ agreement
    const qualifiedPatterns = allPatterns
      .filter((p) => {
        if (p.correctionCount < 3) return false;
        const fieldKey = `${p.correctionType}::${p.fieldName}`;
        const total = fieldTotals.get(fieldKey) ?? p.correctionCount;
        return p.correctionCount / total >= 0.7;
      })
      .sort((a, b) => b.correctionCount - a.correctionCount);

    // Check which patterns already have rules
    const existingRules = await prisma.drawing_learning_rules.findMany({
      where: { company_id: companyId, is_active: true },
      select: { field_name: true, correct_value: true },
    });
    const ruleSet = new Set(
      existingRules.map((r) => `${r.field_name}::${r.correct_value}`)
    );

    const patterns = qualifiedPatterns.map((p) => {
      const id = crypto
        .createHash('md5')
        .update(`${p.correctionType}::${p.fieldName}::${p.correctedValue}`)
        .digest('hex')
        .slice(0, 12);

      // Determine dominant confidence
      const { HIGH, MEDIUM, LOW, UNKNOWN } = p.confidenceCounts;
      const total = HIGH + MEDIUM + LOW + UNKNOWN;
      let avgAiConfidence: string;
      if (HIGH >= total * 0.5) avgAiConfidence = 'HIGH';
      else if (MEDIUM >= total * 0.5) avgAiConfidence = 'MEDIUM';
      else avgAiConfidence = 'LOW';

      const suggestion = `${p.fieldName} — AI is corrected to "${p.correctedValue}" ${p.correctionCount} times. Consider making this the default.`;

      return {
        id,
        correctionType: p.correctionType,
        fieldName: p.fieldName,
        originalValue: null as string | null,
        correctedValue: p.correctedValue,
        correctionCount: p.correctionCount,
        avgAiConfidence,
        suggestion,
        hasRule: ruleSet.has(`${p.fieldName}::${p.correctedValue}`),
      };
    });

    return NextResponse.json({ patterns });
  } catch (error) {
    console.error('Error fetching correction patterns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch correction patterns' },
      { status: 500 }
    );
  }
}

// POST: Approve a pattern and create a learning rule
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const body = await request.json();
    const {
      field_name,
      correction_type,
      correct_value,
      description,
      correction_count,
      drawing_type,
    } = body;

    if (!field_name || !correct_value || !description) {
      return NextResponse.json(
        { error: 'field_name, correct_value, and description are required' },
        { status: 400 }
      );
    }

    // Calculate confidence from correction count (simple heuristic)
    const confidence = Math.min(1.0, (correction_count ?? 3) / 20);

    const rule = await prisma.drawing_learning_rules.create({
      data: {
        company_id: companyId,
        field_name,
        drawing_type: drawing_type ?? null,
        correct_value,
        description,
        correction_count: correction_count ?? 0,
        confidence,
        is_active: true,
        approved_by: String(auth.user.id),
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error('Error creating learning rule:', error);
    return NextResponse.json(
      { error: 'Failed to create learning rule' },
      { status: 500 }
    );
  }
}
