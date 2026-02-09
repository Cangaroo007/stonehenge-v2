import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { company: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const projects = await prisma.unit_block_projects.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: { id: true, name: true, company: true },
        },
        _count: {
          select: { units: true },
        },
      },
    });

    const result = projects.map((p) => ({
      id: p.id,
      name: p.name,
      projectType: p.projectType,
      status: p.status,
      customerId: p.customerId,
      customer: p.customer,
      address: p.address,
      suburb: p.suburb,
      state: p.state,
      postcode: p.postcode,
      totalUnits: p._count.units,
      totalLevels: p.totalLevels,
      description: p.description,
      notes: p.notes,
      volumeTier: p.volumeTier,
      volumeDiscount: p.volumeDiscount,
      totalArea_sqm: p.totalArea_sqm,
      subtotalExGst: p.subtotalExGst,
      discountAmount: p.discountAmount,
      gstAmount: p.gstAmount,
      grandTotal: p.grandTotal,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching unit block projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const data = await request.json();

    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      return NextResponse.json({ error: 'Project name is required' }, { status: 400 });
    }

    const project = await prisma.unit_block_projects.create({
      data: {
        name: data.name.trim(),
        projectType: data.projectType || 'APARTMENTS',
        customerId: data.customerId || null,
        address: data.address || null,
        suburb: data.suburb || null,
        state: data.state || null,
        postcode: data.postcode || null,
        description: data.description || null,
        notes: data.notes || null,
        totalLevels: data.totalLevels || null,
        createdById: authResult.user.id,
      },
      include: {
        customer: {
          select: { id: true, name: true, company: true },
        },
        units: true,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Error creating unit block project:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
