import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import crypto from 'crypto';

// GET: Identify correction patterns (fields corrected 3+ times with 70%+ agreement)
export async function GET() {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    // Group corrections by type + field + original + corrected
    // Prisma groupBy doesn't support grouping by Json fields directly,
    // so we use raw SQL to cast them to text
    const grouped = await prisma.$queryRaw<
      {
        correction_type: string;
        field_name: string;
        original_value: string | null;
        corrected_value: string;
        correction_count: bigint;
        avg_confidence: number | null;
      }[]
    >`
      SELECT
        correction_type,
        field_name,
        original_value::text as original_value,
        corrected_value::text as corrected_value,
        COUNT(*) as correction_count,
        AVG(CASE
          WHEN ai_confidence = 'HIGH' THEN 1.0
          WHEN ai_confidence = 'MEDIUM' THEN 0.5
          ELSE 0.0
        END) as avg_confidence
      FROM drawing_corrections
      WHERE company_id = ${companyId}
      GROUP BY correction_type, field_name, original_value::text, corrected_value::text
      HAVING COUNT(*) >= 3
      ORDER BY COUNT(*) DESC
    `;

    // Also get total corrections per field to calculate agreement percentage
    const fieldTotals = await prisma.$queryRaw<
      { correction_type: string; field_name: string; total: bigint }[]
    >`
      SELECT correction_type, field_name, COUNT(*) as total
      FROM drawing_corrections
      WHERE company_id = ${companyId}
      GROUP BY correction_type, field_name
    `;

    const totalMap = new Map<string, number>();
    for (const row of fieldTotals) {
      totalMap.set(`${row.correction_type}::${row.field_name}`, Number(row.total));
    }

    // Load existing rules to mark patterns that already have rules
    const existingRules = await prisma.drawing_learning_rules.findMany({
      where: { company_id: companyId },
      select: { field_name: true, correct_value: true },
    });
    const ruleSet = new Set(
      existingRules.map(r => `${r.field_name}::${r.correct_value}`)
    );

    const patterns = grouped
      .map(row => {
        const count = Number(row.correction_count);
        const fieldTotal = totalMap.get(`${row.correction_type}::${row.field_name}`) || count;
        const agreement = count / fieldTotal;

        // Only include patterns with 70%+ agreement
        if (agreement < 0.7) return null;

        const original = stripJsonQuotes(row.original_value);
        const corrected = stripJsonQuotes(row.corrected_value);
        const id = crypto
          .createHash('md5')
          .update(`${row.correction_type}::${row.field_name}::${row.original_value}::${row.corrected_value}`)
          .digest('hex');

        const avgConf = row.avg_confidence ?? 0;
        const avgConfLabel = avgConf >= 0.75 ? 'HIGH' : avgConf >= 0.4 ? 'MEDIUM' : 'LOW';

        const suggestion = original
          ? `${row.field_name} — AI says ${original} but is corrected to ${corrected} ${count} times`
          : `${row.field_name} — corrected to ${corrected} ${count} times`;

        return {
          id,
          correctionType: row.correction_type,
          fieldName: row.field_name,
          originalValue: original,
          correctedValue: corrected,
          correctionCount: count,
          avgAiConfidence: avgConfLabel,
          suggestion,
          hasRule: ruleSet.has(`${row.field_name}::${corrected}`),
        };
      })
      .filter(Boolean);

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

    const rule = await prisma.drawing_learning_rules.create({
      data: {
        company_id: companyId,
        field_name,
        correct_value,
        description,
        correction_count: correction_count ?? 0,
        confidence: correction_count ? Math.min(correction_count / 20, 1.0) : 0,
        drawing_type: drawing_type ?? null,
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

function stripJsonQuotes(value: string | null): string | null {
  if (value === null) return null;
  // Remove surrounding quotes from JSON string values like '"POLISHED"' -> 'POLISHED'
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}
