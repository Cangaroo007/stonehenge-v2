import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const DEFAULT_CUSTOM_CHARGE_SUGGESTIONS = [
  'Measure / travel charge',
  'Regional measure / travel charge',
  'Extended travel / remote measure charge',
  'Small job setup charge',
  'Additional install allowance',
  'Difficult access / site handling allowance',
  'Extra templating / site revisit',
  'Manual commercial adjustment',
  'Manual credit / goodwill adjustment',
  'Supply-only credit',
];

/**
 * GET /api/custom-charge-suggestions?q=cra
 * Autocomplete suggestions for custom charge descriptions.
 * Returns distinct descriptions ranked by frequency (most used first).
 * Scoped to the authenticated user's company.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const companyId = auth.user.companyId;

    // Raw query needed for GROUP BY + COUNT pattern with ILIKE
    const suggestions = await prisma.$queryRaw<Array<{ description: string; usage_count: bigint }>>`
      SELECT description, COUNT(*) as usage_count
      FROM quote_custom_charges
      WHERE company_id = ${companyId}
      AND description ILIKE ${`%${query}%`}
      GROUP BY description
      ORDER BY usage_count DESC
      LIMIT 10
    `;

    return NextResponse.json({
      suggestions: [
        ...suggestions.map(s => s.description),
        ...DEFAULT_CUSTOM_CHARGE_SUGGESTIONS.filter(s =>
          s.toLowerCase().includes(query.toLowerCase())
        ),
      ].filter((suggestion, index, all) =>
        suggestion && all.findIndex(s => s.toLowerCase() === suggestion.toLowerCase()) === index
      ).slice(0, 10),
    });
  } catch (error) {
    console.error('Error fetching custom charge suggestions:', error);
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
}
