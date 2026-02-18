import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getPopularPresets, searchPresets } from '@/lib/services/room-preset-service';

/**
 * GET /api/room-presets
 *
 * Returns custom room presets for the authenticated company.
 * - With ?q=kitchen → fuzzy search by name
 * - Without query → returns top presets by usage_count (default limit 6)
 * - With ?limit=N → override default limit
 */
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { companyId } = auth.user;
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') || '';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '6', 10) || 6, 1), 50);

  try {
    const presets = query
      ? await searchPresets(companyId, query, limit)
      : await getPopularPresets(companyId, limit);

    return NextResponse.json({ presets });
  } catch (error) {
    console.error('[room-presets] Failed to fetch presets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch presets' },
      { status: 500 },
    );
  }
}
