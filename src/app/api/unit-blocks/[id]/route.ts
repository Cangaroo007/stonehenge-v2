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
      include: {
        customer: {
          select: { id: true, name: true, company: true },
        },
        units: {
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
        },
        files: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error fetching unit block project:', error);
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 });
  }
}

export async function PATCH(
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

    const existing = await prisma.unit_block_projects.findUnique({
      where: { id: projectId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const data = await request.json();

    const allowedFields = [
      'name', 'projectType', 'status', 'customerId',
      'address', 'suburb', 'state', 'postcode',
      'totalLevels', 'description', 'notes',
      'finishesRegisterId',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in data) {
        updateData[field] = data[field];
      }
    }

    const project = await prisma.unit_block_projects.update({
      where: { id: projectId },
      data: updateData,
      include: {
        customer: {
          select: { id: true, name: true, company: true },
        },
        units: {
          orderBy: { unitNumber: 'asc' },
        },
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error updating unit block project:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(
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

    const existing = await prisma.unit_block_projects.findUnique({
      where: { id: projectId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Cascade delete handles units and files
    await prisma.unit_block_projects.delete({
      where: { id: projectId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting unit block project:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
