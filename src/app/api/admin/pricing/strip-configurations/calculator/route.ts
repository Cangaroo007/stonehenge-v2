import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';

interface PieceInput {
  id: number;
  name: string;
  edgeLength: number;
  thickness: number;
  edgeType: string | null;
}

// POST /api/admin/pricing/strip-configurations/calculator
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
    const { pieces, defaultKerfWidth = 8 } = body;

    if (!Array.isArray(pieces) || pieces.length === 0) {
      return NextResponse.json(
        { error: 'Pieces array is required' },
        { status: 400 }
      );
    }

    // Fetch all active strip configurations
    const configurations = await prisma.stripConfiguration.findMany({
      where: {
        companyId: userWithCompany.companyId,
        isActive: true,
      },
    });

    // Calculate requirements for each piece
    const requirements: Array<{
      pieceId: number;
      pieceName: string;
      edgeLength: number;
      thickness: number;
      edgeType: string | null;
      matchedConfig: {
        id: number;
        name: string;
        totalMaterialWidth: number;
        primaryStripWidth: number | null;
        laminationStripWidth: number;
        kerfAllowance: number;
      } | null;
      calculatedStrips: {
        quantity: number;
        totalLength: number;
        totalMaterial: number;
        breakdown: string;
      };
    }> = [];

    for (const piece of pieces as PieceInput[]) {
      const { id, name, edgeLength, thickness, edgeType } = piece;

      // Find matching configuration
      let matchedConfig = configurations.find(
        (c) => c.finalThickness === thickness && 
               (edgeType ? c.applicableEdgeTypes.includes(edgeType) : c.isDefault)
      );

      // Fallback to default for thickness
      if (!matchedConfig) {
        matchedConfig = configurations.find(
          (c) => c.finalThickness === thickness && c.isDefault
        );
      }

      // Calculate strip requirements
      const stripWidth = matchedConfig?.totalMaterialWidth ?? (thickness + defaultKerfWidth);
      const totalMaterial = edgeLength * stripWidth;

      // Generate breakdown description
      let breakdown = `${edgeLength}mm length × ${stripWidth}mm width = ${(totalMaterial / 1000000).toFixed(4)} m²`;
      if (matchedConfig) {
        const parts = [];
        if (matchedConfig.primaryStripWidth) {
          parts.push(`${matchedConfig.primaryStripWidth}mm primary`);
        }
        parts.push(`${matchedConfig.laminationStripWidth}mm lamination`);
        parts.push(`${matchedConfig.kerfAllowance}mm kerf`);
        breakdown = `${stripWidth}mm strip (${parts.join(' + ')}) × ${edgeLength}mm = ${(totalMaterial / 1000000).toFixed(4)} m²`;
      }

      requirements.push({
        pieceId: id,
        pieceName: name,
        edgeLength,
        thickness,
        edgeType,
        matchedConfig: matchedConfig ? {
          id: matchedConfig.id,
          name: matchedConfig.name,
          totalMaterialWidth: matchedConfig.totalMaterialWidth,
          primaryStripWidth: matchedConfig.primaryStripWidth,
          laminationStripWidth: matchedConfig.laminationStripWidth,
          kerfAllowance: matchedConfig.kerfAllowance,
        } : null,
        calculatedStrips: {
          quantity: 1, // Could be calculated based on slab dimensions
          totalLength: edgeLength,
          totalMaterial,
          breakdown,
        },
      });
    }

    // Calculate totals
    const totals = {
      totalStripLength: requirements.reduce((sum, r) => sum + r.edgeLength, 0),
      totalMaterialArea: requirements.reduce((sum, r) => sum + r.calculatedStrips.totalMaterial, 0),
      totalMaterialAreaSqm: requirements.reduce((sum, r) => sum + r.calculatedStrips.totalMaterial, 0) / 1000000,
    };

    return NextResponse.json({
      requirements,
      totals,
      configurations: configurations.map((c) => ({
        id: c.id,
        name: c.name,
        usageType: c.usageType,
        finalThickness: c.finalThickness,
        totalMaterialWidth: c.totalMaterialWidth,
      })),
    });
  } catch (error: unknown) {
    console.error('Error calculating strip requirements:', error);
    const message = error instanceof Error ? error.message : 'Failed to calculate strip requirements';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
