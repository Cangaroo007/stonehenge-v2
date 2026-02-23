import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// ── Default suggestions for new tenants with no history ──────────────────────

const DEFAULT_ROOM_NAMES = [
  'Kitchen',
  'Bathroom',
  'En Suite',
  'Laundry',
  "Butler's Pantry",
  'Outdoor Kitchen',
  'Bar',
  'Wet Area',
];

const DEFAULT_PIECE_NAMES = [
  'Benchtop',
  'Island Bench',
  'Vanity Top',
  'Splashback',
  'Waterfall End',
  'Window Sill',
  'Shelf',
  'Return Panel',
];

// ── GET /api/suggestions?type=room_names|piece_names&prefix=... ──────────────

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const companyId = authResult.user.companyId;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const prefix = searchParams.get('prefix')?.toLowerCase() || '';

    if (!type || !['room_names', 'piece_names'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type parameter. Use room_names or piece_names.' },
        { status: 400 }
      );
    }

    let suggestions: string[] = [];

    if (type === 'room_names') {
      // Get distinct room names from quotes owned by this company's users
      const rooms = await prisma.quote_rooms.findMany({
        where: {
          quotes: {
            user: {
              company_id: companyId,
            },
          },
          name: { not: '' },
        },
        select: { name: true },
        distinct: ['name'],
        orderBy: { name: 'asc' },
      });

      suggestions = rooms.map((r) => r.name);

      // If no previous data, return defaults
      if (suggestions.length === 0) {
        suggestions = [...DEFAULT_ROOM_NAMES];
      }
    } else if (type === 'piece_names') {
      // Get distinct piece names from quotes owned by this company's users
      const pieces = await prisma.quote_pieces.findMany({
        where: {
          quote_rooms: {
            quotes: {
              user: {
                company_id: companyId,
              },
            },
          },
          name: { not: 'Piece' },
        },
        select: { name: true },
        distinct: ['name'],
        orderBy: { name: 'asc' },
      });

      suggestions = pieces.map((p) => p.name);

      // If no previous data, return defaults
      if (suggestions.length === 0) {
        suggestions = [...DEFAULT_PIECE_NAMES];
      }
    }

    // Server-side prefix filtering
    if (prefix) {
      suggestions = suggestions.filter((s) =>
        s.toLowerCase().includes(prefix)
      );
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Suggestions API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch suggestions' },
      { status: 500 }
    );
  }
}
