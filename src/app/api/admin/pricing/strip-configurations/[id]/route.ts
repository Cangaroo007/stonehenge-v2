import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  finalThickness: z.number().int().min(20).max(200).optional(),
  primaryStripWidth: z.number().int().min(0).max(1000).optional().nullable(),
  laminationStripWidth: z.number().int().min(10).max(200).optional(),
  kerfAllowance: z.number().int().min(0).max(20).optional(),
  usageType: z.enum(['EDGE_LAMINATION', 'WATERFALL_STANDARD', 'WATERFALL_EXTENDED', 'APRON', 'CUSTOM']).optional(),
  applicableEdgeTypes: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// GET /api/admin/pricing/strip-configurations/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth(request, ['ADMIN', 'SALES_MANAGER']);
    
    // Get user's company
    const userWithCompany = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyId: true }
    });
    
    if (!userWithCompany?.companyId) {
      return NextResponse.json(
        { error: 'User is not associated with a company' },
        { status: 400 }
      );
    }

    const configuration = await prisma.stripConfiguration.findFirst({
      where: {
        id: parseInt(id),
        companyId: userWithCompany.companyId,
      },
    });

    if (!configuration) {
      return NextResponse.json({ error: 'Strip configuration not found' }, { status: 404 });
    }

    return NextResponse.json(configuration);
  } catch (error: unknown) {
    console.error('Error fetching strip configuration:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch strip configuration';
    return NextResponse.json(
      { error: message },
      { status: message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

// PUT /api/admin/pricing/strip-configurations/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth(request, ['ADMIN', 'SALES_MANAGER']);
    
    // Get user's company
    const userWithCompany = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyId: true }
    });
    
    if (!userWithCompany?.companyId) {
      return NextResponse.json(
        { error: 'User is not associated with a company' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validationResult = updateSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verify ownership
    const existing = await prisma.stripConfiguration.findFirst({
      where: {
        id: parseInt(id),
        companyId: userWithCompany.companyId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Strip configuration not found' }, { status: 404 });
    }

    // Calculate new total if dimensions changed
    let totalMaterialWidth = existing.totalMaterialWidth;
    const primaryWidth = data.primaryStripWidth !== undefined ? data.primaryStripWidth : existing.primaryStripWidth;
    const laminationWidth = data.laminationStripWidth ?? existing.laminationStripWidth;
    const kerf = data.kerfAllowance ?? existing.kerfAllowance;
    
    if (data.primaryStripWidth !== undefined || data.laminationStripWidth !== undefined || data.kerfAllowance !== undefined) {
      totalMaterialWidth = (primaryWidth ?? 0) + laminationWidth + kerf;
    }

    // Handle default flag
    if (data.isDefault) {
      const usageType = data.usageType ?? existing.usageType;
      await prisma.stripConfiguration.updateMany({
        where: {
          companyId: userWithCompany.companyId,
          usageType,
          isDefault: true,
          id: { not: parseInt(id) },
        },
        data: { isDefault: false },
      });
    }

    const updated = await prisma.stripConfiguration.update({
      where: { id: parseInt(id) },
      data: {
        ...data,
        totalMaterialWidth,
        // CRITICAL: Cast for Railway TypeScript compatibility
        applicableEdgeTypes: data.applicableEdgeTypes 
          ? (data.applicableEdgeTypes as unknown as string[])
          : undefined,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('Error updating strip configuration:', error);
    const message = error instanceof Error ? error.message : 'Failed to update strip configuration';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}

// DELETE /api/admin/pricing/strip-configurations/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await requireAuth(request, ['ADMIN']);
    
    // Get user's company
    const userWithCompany = await prisma.user.findUnique({
      where: { id: user.id },
      select: { companyId: true }
    });
    
    if (!userWithCompany?.companyId) {
      return NextResponse.json(
        { error: 'User is not associated with a company' },
        { status: 400 }
      );
    }

    // Verify ownership
    const existing = await prisma.stripConfiguration.findFirst({
      where: {
        id: parseInt(id),
        companyId: userWithCompany.companyId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Strip configuration not found' }, { status: 404 });
    }

    // Soft delete
    await prisma.stripConfiguration.update({
      where: { id: parseInt(id) },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting strip configuration:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete strip configuration';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
