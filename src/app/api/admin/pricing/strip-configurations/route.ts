import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';
import { z } from 'zod';

// Validation schema
const stripConfigSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
  finalThickness: z.number().int().min(20).max(200),
  primaryStripWidth: z.number().int().min(0).max(1000).optional().nullable(),
  laminationStripWidth: z.number().int().min(10).max(200),
  kerfAllowance: z.number().int().min(0).max(20).default(8),
  usageType: z.enum(['EDGE_LAMINATION', 'WATERFALL_STANDARD', 'WATERFALL_EXTENDED', 'APRON', 'CUSTOM']),
  applicableEdgeTypes: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

// GET /api/admin/pricing/strip-configurations
export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const usageType = searchParams.get('usageType');
    const activeOnly = searchParams.get('activeOnly') === 'true';

    const where: Record<string, unknown> = {
      companyId: userWithCompany.companyId,
    };

    if (usageType) {
      where.usageType = usageType;
    }

    if (activeOnly) {
      where.isActive = true;
    }

    const configurations = await prisma.stripConfiguration.findMany({
      where,
      orderBy: [
        { usageType: 'asc' },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    // Serialize for JSON response
    const serialized = configurations.map(config => ({
      ...config,
      // Ensure arrays are properly formatted
      applicableEdgeTypes: config.applicableEdgeTypes || [],
    }));

    return NextResponse.json(serialized);
  } catch (error: unknown) {
    console.error('Error fetching strip configurations:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch strip configurations';
    return NextResponse.json(
      { error: message },
      { status: message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

// POST /api/admin/pricing/strip-configurations
export async function POST(request: NextRequest) {
  try {
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
    const validationResult = stripConfigSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Calculate total material width
    const totalMaterialWidth = 
      (data.primaryStripWidth ?? 0) + data.laminationStripWidth + data.kerfAllowance;

    // If setting as default, unset other defaults for same usage type
    if (data.isDefault) {
      await prisma.stripConfiguration.updateMany({
        where: {
          companyId: userWithCompany.companyId,
          usageType: data.usageType,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    const configuration = await prisma.stripConfiguration.create({
      data: {
        ...data,
        companyId: userWithCompany.companyId,
        totalMaterialWidth,
        // CRITICAL: Cast for Railway TypeScript compatibility
        applicableEdgeTypes: data.applicableEdgeTypes as unknown as string[],
      },
    });

    return NextResponse.json(configuration, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating strip configuration:', error);
    
    // Handle unique constraint violation
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'A strip configuration with this name already exists' },
        { status: 409 }
      );
    }

    const message = error instanceof Error ? error.message : 'Failed to create strip configuration';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
