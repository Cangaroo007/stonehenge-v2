import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getUnitChangeHistory,
  recordBuyerChange,
  applyMaterialChange,
  applyEdgeChange,
  applyThicknessChange,
  addCutout,
} from '@/lib/services/buyer-change-tracker';

/**
 * GET /api/unit-blocks/[id]/units/[unitId]/changes
 * Returns the change history for a unit.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; unitId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { unitId } = await params;
    const unitIdNum = parseInt(unitId, 10);
    if (isNaN(unitIdNum)) {
      return NextResponse.json({ error: 'Invalid unit ID' }, { status: 400 });
    }

    const history = await getUnitChangeHistory(unitIdNum);
    return NextResponse.json(history);
  } catch (error) {
    console.error('Error fetching change history:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch change history';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/unit-blocks/[id]/units/[unitId]/changes
 * Record a buyer change for a unit.
 *
 * Body: {
 *   changeType: 'MATERIAL_UPGRADE' | 'EDGE_CHANGE' | 'CUTOUT_CHANGE' | 'THICKNESS_CHANGE' | 'OTHER',
 *   description: string,
 *   pieceIndex?: number,
 *   newMaterialId?: number,
 *   edge?: 'top' | 'bottom' | 'left' | 'right',
 *   newFinish?: string,
 *   newProfile?: string,
 *   cutoutType?: string,
 *   cutoutQuantity?: number,
 *   newThickness?: number,
 *   // For generic/other changes:
 *   originalValue?: string,
 *   newValue?: string,
 *   costImpact?: number,
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; unitId: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { unitId } = await params;
    const unitIdNum = parseInt(unitId, 10);
    if (isNaN(unitIdNum)) {
      return NextResponse.json({ error: 'Invalid unit ID' }, { status: 400 });
    }

    const body = await request.json();
    const { changeType, description } = body;

    if (!changeType || !description) {
      return NextResponse.json(
        { error: 'changeType and description are required' },
        { status: 400 }
      );
    }

    let change;

    switch (changeType) {
      case 'MATERIAL_UPGRADE': {
        if (body.pieceIndex == null || !body.newMaterialId) {
          return NextResponse.json(
            { error: 'pieceIndex and newMaterialId are required for material changes' },
            { status: 400 }
          );
        }
        change = await applyMaterialChange(unitIdNum, body.pieceIndex, body.newMaterialId);
        break;
      }

      case 'EDGE_CHANGE': {
        if (body.pieceIndex == null || !body.edge || !body.newFinish) {
          return NextResponse.json(
            { error: 'pieceIndex, edge, and newFinish are required for edge changes' },
            { status: 400 }
          );
        }
        change = await applyEdgeChange(
          unitIdNum,
          body.pieceIndex,
          body.edge,
          body.newFinish,
          body.newProfile
        );
        break;
      }

      case 'THICKNESS_CHANGE': {
        if (body.pieceIndex == null || !body.newThickness) {
          return NextResponse.json(
            { error: 'pieceIndex and newThickness are required for thickness changes' },
            { status: 400 }
          );
        }
        change = await applyThicknessChange(unitIdNum, body.pieceIndex, body.newThickness);
        break;
      }

      case 'CUTOUT_CHANGE': {
        if (body.pieceIndex == null || !body.cutoutType || !body.cutoutQuantity) {
          return NextResponse.json(
            { error: 'pieceIndex, cutoutType, and cutoutQuantity are required for cutout changes' },
            { status: 400 }
          );
        }
        change = await addCutout(unitIdNum, body.pieceIndex, body.cutoutType, body.cutoutQuantity);
        break;
      }

      case 'LAYOUT_CHANGE':
      case 'OTHER':
      default: {
        // Generic change — record without modifying the quote
        change = await recordBuyerChange(unitIdNum, {
          unitId: unitIdNum,
          unitNumber: body.unitNumber || '',
          changeType: changeType || 'OTHER',
          description,
          originalValue: body.originalValue || '',
          newValue: body.newValue || '',
          costImpact: body.costImpact || 0,
        });
        break;
      }
    }

    return NextResponse.json(change, { status: 201 });
  } catch (error) {
    console.error('Error recording buyer change:', error);
    const message = error instanceof Error ? error.message : 'Failed to record change';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
