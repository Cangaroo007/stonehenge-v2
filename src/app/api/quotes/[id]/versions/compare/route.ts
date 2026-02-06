import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { compareSnapshots, QuoteSnapshot } from '@/lib/services/quote-version-service';

// GET - Compare two versions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const fromVersion = parseInt(searchParams.get('from') || '0');
    const toVersion = parseInt(searchParams.get('to') || '0');

    if (!fromVersion || !toVersion) {
      return NextResponse.json(
        { error: 'Both "from" and "to" version numbers are required' },
        { status: 400 }
      );
    }

    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const quoteId = parseInt(id);

    // Verify quote exists and user has access
    const quote = await prisma.quote.findFirst({
      where: {
        id: quoteId,
        OR: [
          { createdBy: authResult.user.id },
          { customer: { users: { some: { id: authResult.user.id } } } },
        ],
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Fetch both versions
    const [fromVersionRecord, toVersionRecord] = await Promise.all([
      prisma.quoteVersion.findUnique({
        where: { quoteId_version: { quoteId, version: fromVersion } },
      }),
      prisma.quoteVersion.findUnique({
        where: { quoteId_version: { quoteId, version: toVersion } },
      }),
    ]);

    if (!fromVersionRecord || !toVersionRecord) {
      return NextResponse.json({ error: 'One or both versions not found' }, { status: 404 });
    }

    // Compare snapshots
    const fromSnapshot = fromVersionRecord.snapshotData as unknown as QuoteSnapshot;
    const toSnapshot = toVersionRecord.snapshotData as unknown as QuoteSnapshot;
    const differences = compareSnapshots(fromSnapshot, toSnapshot);

    return NextResponse.json({
      fromVersion: {
        version: fromVersionRecord.version,
        changedAt: fromVersionRecord.changedAt,
        snapshot: fromSnapshot,
      },
      toVersion: {
        version: toVersionRecord.version,
        changedAt: toVersionRecord.changedAt,
        snapshot: toSnapshot,
      },
      differences,
      differenceCount: Object.keys(differences).length,
    });
  } catch (error) {
    console.error('Error comparing quote versions:', error);
    return NextResponse.json(
      { error: 'Failed to compare quote versions' },
      { status: 500 }
    );
  }
}
