import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

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
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const project = await prisma.unit_block_projects.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const level = searchParams.get('level');

    const where: Record<string, unknown> = { projectId };
    if (status) {
      where.status = status;
    }
    if (level) {
      where.level = parseInt(level, 10);
    }

    const units = await prisma.unit_block_units.findMany({
      where,
      orderBy: { unitNumber: 'asc' },
      include: {
        quote: {
          select: {
            id: true,
            quote_number: true,
            status: true,
            subtotal: true,
            total: true,
          },
        },
      },
    });

    return NextResponse.json(units);
  } catch (error) {
    console.error('Error fetching units:', error);
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const project = await prisma.unit_block_projects.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const data = await request.json();

    if (!data.unitNumber || typeof data.unitNumber !== 'string' || data.unitNumber.trim().length === 0) {
      return NextResponse.json({ error: 'Unit number is required' }, { status: 400 });
    }

    // Check for duplicate unit number within project
    const existing = await prisma.unit_block_units.findUnique({
      where: {
        projectId_unitNumber: {
          projectId,
          unitNumber: data.unitNumber.trim(),
        },
      },
    });
    if (existing) {
      return NextResponse.json({ error: 'Unit number already exists in this project' }, { status: 409 });
    }

    const [unit] = await prisma.$transaction([
      prisma.unit_block_units.create({
        data: {
          projectId,
          unitNumber: data.unitNumber.trim(),
          level: data.level ?? null,
          unitTypeCode: data.unitTypeCode || null,
          finishLevel: data.finishLevel || null,
          colourScheme: data.colourScheme || null,
          status: data.status || 'PENDING',
          notes: data.notes || null,
          quoteId: data.quoteId || null,
        },
        include: {
          quote: {
            select: {
              id: true,
              quote_number: true,
              status: true,
              subtotal: true,
              total: true,
            },
          },
        },
      }),
      prisma.unit_block_projects.update({
        where: { id: projectId },
        data: { totalUnits: { increment: 1 } },
      }),
    ]);

    return NextResponse.json(unit, { status: 201 });
  } catch (error) {
    console.error('Error creating unit:', error);
    return NextResponse.json({ error: 'Failed to create unit' }, { status: 500 });
  }
}
