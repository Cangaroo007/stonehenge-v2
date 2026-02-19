import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

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
      suggestions: suggestions.map(s => s.description),
    });
  } catch (error) {
    console.error('Error fetching custom charge suggestions:', error);
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
}
