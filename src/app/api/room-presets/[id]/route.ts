import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { deletePreset } from '@/lib/services/room-preset-service';

/**
 * DELETE /api/room-presets/[id]
 *
 * Remove a custom preset. Company-scoped — only deletes if the preset
 * belongs to the authenticated user's company.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { companyId } = auth.user;
  const presetId = params.id;

  if (!presetId) {
    return NextResponse.json({ error: 'Preset ID is required' }, { status: 400 });
  }

  try {
    const deleted = await deletePreset(companyId, presetId);

    if (!deleted) {
      return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[room-presets] Failed to delete preset:', error);
    return NextResponse.json(
      { error: 'Failed to delete preset' },
      { status: 500 },
    );
  }
}
