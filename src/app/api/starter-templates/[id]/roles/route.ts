import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type {
  StarterTemplateData,
  MaterialRole,
} from '@/lib/types/starter-templates';
import { inferMaterialRole, MATERIAL_ROLE_LABELS } from '@/lib/types/starter-templates';

// GET — Returns the distinct material roles used in this template
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;

    const template = await prisma.starter_templates.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const templateData = template.templateData as unknown as StarterTemplateData;
    const rooms = templateData.rooms || [];

    // Collect role usage across all rooms and pieces
    const roleMap = new Map<MaterialRole, { pieceCount: number; roomNames: Set<string> }>();

    for (const room of rooms) {
      for (const piece of room.pieces) {
        const role = (piece.materialRole || inferMaterialRole(room.name, piece.pieceType)) as MaterialRole;

        if (!roleMap.has(role)) {
          roleMap.set(role, { pieceCount: 0, roomNames: new Set<string>() });
        }

        const entry = roleMap.get(role)!;
        entry.pieceCount++;
        entry.roomNames.add(room.name);
      }
    }

    // Build response
    const roles = Array.from(roleMap.entries()).map(([role, info]) => ({
      role,
      label: MATERIAL_ROLE_LABELS[role] || role,
      pieceCount: info.pieceCount,
      roomNames: Array.from(info.roomNames),
    }));

    return NextResponse.json({ roles });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch template roles';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
