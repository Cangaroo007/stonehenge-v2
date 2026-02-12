/**
 * POST /api/unit-blocks/[id]/auto-generate-templates
 *
 * Automatically generates unit_type_templates from parsed schedule specs.
 * Uses sensible defaults for dimensions, edges, cutouts, and material roles
 * based on room + application combinations extracted from the finishes schedule.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import {
  autoGenerateTemplates,
  type ScheduleSpecInput,
} from '@/lib/services/template-auto-generator';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) {
      return NextResponse.json(
        { error: 'Invalid project ID' },
        { status: 400 }
      );
    }

    // Verify project exists
    const project = await prisma.unit_block_projects.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Parse body
    const body = await request.json();
    const { specs, unitTypeCodes } = body as {
      specs: ScheduleSpecInput[];
      unitTypeCodes?: string[];
    };

    if (!specs || !Array.isArray(specs) || specs.length === 0) {
      return NextResponse.json(
        { error: 'At least one schedule spec is required' },
        { status: 400 }
      );
    }

    // Resolve unit type codes if not provided
    let codes = unitTypeCodes;
    if (!codes || codes.length === 0) {
      const units = await prisma.unit_block_units.findMany({
        where: { projectId },
        select: { unitTypeCode: true },
      });
      codes = Array.from(
        new Set(units.map((u) => u.unitTypeCode).filter(Boolean))
      ) as string[];
    }

    if (codes.length === 0) {
      return NextResponse.json(
        { error: 'No unit type codes found for this project. Upload a unit register first.' },
        { status: 400 }
      );
    }

    const result = await autoGenerateTemplates({
      projectId,
      specs,
      unitTypeCodes: codes,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[AutoGenerateTemplates] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to auto-generate templates',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
