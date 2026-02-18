import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, verifyQuoteOwnership } from '@/lib/auth';

// GET - Get a specific version's full snapshot
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const { id, version } = await params;
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const quoteId = parseInt(id);
    const versionNumber = parseInt(version);

    // Verify quote belongs to user's company
    const quoteCheck = await verifyQuoteOwnership(quoteId, authResult.user.companyId);
    if (!quoteCheck) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { id: true, revision: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Fetch the specific version
    const versionRecord = await prisma.quote_versions.findUnique({
      where: {
        quoteId_version: {
          quoteId,
          version: versionNumber,
        },
      },
      include: {
        changedByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!versionRecord) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: versionRecord.id,
      version: versionRecord.version,
      changeType: versionRecord.changeType,
      changeReason: versionRecord.changeReason,
      changeSummary: versionRecord.changeSummary,
      changes: versionRecord.changes,
      changedBy: versionRecord.changedByUser,
      changedAt: versionRecord.changedAt,
      rolledBackFromVersion: versionRecord.rolledBackFromVersion,
      snapshot: versionRecord.snapshotData,
      isCurrent: versionRecord.version === quote.revision,
    });
  } catch (error) {
    console.error('Error fetching quote version:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quote version' },
      { status: 500 }
    );
  }
}
