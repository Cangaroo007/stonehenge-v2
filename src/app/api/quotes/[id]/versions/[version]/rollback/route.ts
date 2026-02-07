import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { hasPermission, Permission } from '@/lib/permissions';
import { rollbackToVersion } from '@/lib/services/quote-version-service';

// POST - Rollback to a specific version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; version: string }> }
) {
  try {
    const { id, version } = await params;
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    // Check permission
    if (!hasPermission(authResult.user, Permission.EDIT_QUOTES)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const quoteId = parseInt(id);
    const versionNumber = parseInt(version);

    // Get optional reason from body
    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body.reason;
    } catch {
      // No body provided, that's fine
    }

    // Verify quote exists and user has access
    const quote = await prisma.quotes.findFirst({
      where: {
        id: quoteId,
        OR: [
          { created_by: authResult.user.id },
          { customers: { user: { some: { id: authResult.user.id } } } },
        ],
      },
      select: { id: true },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Check if already at this version
    if ((quote as any).revision === versionNumber) {
      return NextResponse.json(
        { error: 'Quote is already at this version' },
        { status: 400 }
      );
    }

    // Perform rollback
    await rollbackToVersion(quoteId, versionNumber, authResult.user.id, reason);

    // Get updated quote info
    const updatedQuote = await prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { revision: true },
    });

    return NextResponse.json({
      success: true,
      message: `Rolled back to version ${versionNumber}`,
      newVersion: updatedQuote?.revision,
    });
  } catch (error) {
    console.error('Error rolling back quote version:', error);
    return NextResponse.json(
      { error: 'Failed to rollback quote version' },
      { status: 500 }
    );
  }
}
