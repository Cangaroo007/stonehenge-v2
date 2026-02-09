/**
 * POST /api/templates/from-analysis
 *
 * Converts drawing analysis results into a unit type template.
 * Maps extracted pieces, edges, and cutouts into the TemplateData format.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type { Prisma } from '@prisma/client';
import type {
  TemplateData,
  TemplateRoom,
  TemplatePiece,
  TemplateEdge,
  TemplateCutout,
  MaterialRole,
} from '@/lib/types/unit-templates';

/**
 * Map a room name to a material role.
 */
function roomToMaterialRole(roomName: string, pieceName: string): MaterialRole {
  const roomLower = roomName.toLowerCase();
  const pieceLower = pieceName.toLowerCase();

  // Check piece name first for splashback detection
  if (pieceLower.includes('splashback') || pieceLower.includes('splash back')) {
    return 'SPLASHBACK';
  }

  if (roomLower.includes('kitchen') || roomLower.includes('island') || roomLower.includes('pantry')) {
    return 'PRIMARY_BENCHTOP';
  }
  if (roomLower.includes('bathroom') || roomLower.includes('ensuite') || roomLower.includes('vanity')) {
    return 'VANITY';
  }
  if (roomLower.includes('laundry')) {
    return 'LAUNDRY';
  }
  if (roomLower.includes('bar') || roomLower.includes('outdoor')) {
    return 'SECONDARY_BENCHTOP';
  }

  return 'PRIMARY_BENCHTOP';
}

/**
 * Map a room name to a room type code.
 */
function roomToRoomType(roomName: string): string {
  const lower = roomName.toLowerCase();
  if (lower.includes('kitchen') || lower.includes('island') || lower.includes('pantry')) return 'KITCHEN';
  if (lower.includes('bathroom')) return 'BATHROOM';
  if (lower.includes('ensuite')) return 'ENSUITE';
  if (lower.includes('laundry')) return 'LAUNDRY';
  return 'OTHER';
}

/**
 * Map an edge finish string from analysis to a TemplateEdge.
 */
function mapEdgeFinish(finish: string | undefined, profileType?: string): TemplateEdge {
  if (!finish || finish === 'RAW' || finish === 'UNKNOWN') {
    return { finish: 'RAW' };
  }

  // Determine finish category
  let templateFinish: TemplateEdge['finish'] = 'POLISHED';
  if (finish.includes('40MM') || finish === 'POLISHED_40MM') {
    templateFinish = 'LAMINATED';
  }

  return {
    finish: templateFinish,
    profileType: profileType || mapProfileFromFinish(finish),
  };
}

/**
 * Infer profile type from edge finish string.
 */
function mapProfileFromFinish(finish: string): string | undefined {
  if (finish.includes('PENCIL') || finish === 'PENCIL_ROUND') return 'PENCIL_ROUND';
  if (finish.includes('BULLNOSE') || finish === 'BULLNOSE') return 'BULLNOSE';
  if (finish.includes('BEVEL')) return 'BEVELED';
  return 'PENCIL_ROUND'; // default profile
}

/**
 * Map cutout type from analysis format to template format.
 */
function mapCutoutType(type: string): string {
  const typeMap: Record<string, string> = {
    'HOTPLATE': 'COOKTOP',
    'FLUSH_COOKTOP': 'COOKTOP',
    'UNDERMOUNT_SINK': 'UNDERMOUNT_SINK',
    'DROP_IN_SINK': 'DROP_IN_SINK',
    'BASIN': 'BASIN',
    'GPO': 'GPO',
    'TAP': 'TAP_HOLE',
    'DRAINER': 'DRAINER',
  };
  return typeMap[type] || type;
}

// Raw edge from the analysis result
interface RawEdge {
  side?: string;
  finish?: string;
  profileType?: string;
}

// Raw cutout from the analysis result
interface RawCutout {
  type: string;
  quantity?: number;
}

// Raw piece from the analysis result (flexible shape from AI output)
interface RawPiece {
  name?: string;
  pieceNumber?: number;
  pieceType?: string;
  length?: number;
  width?: number;
  thickness?: number;
  cutouts?: RawCutout[];
  edges?: RawEdge[];
  notes?: string | null;
  confidence?: number;
}

// Raw room from the analysis result
interface RawRoom {
  name: string;
  pieces: RawPiece[];
}

// Analysis result shape (from quote_drawing_analyses.raw_results or direct input)
interface RawAnalysisResult {
  rooms?: RawRoom[];
  metadata?: {
    defaultThickness?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { analysisId, analysisData, name, unitTypeCode, projectId } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!unitTypeCode || typeof unitTypeCode !== 'string' || unitTypeCode.trim().length === 0) {
      return NextResponse.json({ error: 'unitTypeCode is required' }, { status: 400 });
    }

    // Load analysis data from either analysisId or direct data
    let rawAnalysis: RawAnalysisResult;

    if (analysisId) {
      const analysis = await prisma.quote_drawing_analyses.findUnique({
        where: { id: parseInt(analysisId, 10) },
      });

      if (!analysis) {
        return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
      }

      rawAnalysis = analysis.raw_results as unknown as RawAnalysisResult;
    } else if (analysisData) {
      rawAnalysis = analysisData as RawAnalysisResult;
    } else {
      return NextResponse.json(
        { error: 'Either analysisId or analysisData is required' },
        { status: 400 }
      );
    }

    if (!rawAnalysis.rooms || rawAnalysis.rooms.length === 0) {
      return NextResponse.json(
        { error: 'Analysis contains no rooms or pieces' },
        { status: 400 }
      );
    }

    // Convert analysis rooms/pieces to template format
    const templateRooms: TemplateRoom[] = [];
    let totalPieces = 0;
    let totalArea = 0;
    const defaultThickness = rawAnalysis.metadata?.defaultThickness || 20;

    for (const rawRoom of rawAnalysis.rooms) {
      const pieces: TemplatePiece[] = [];

      for (const rawPiece of rawRoom.pieces) {
        const lengthMm = Math.round(rawPiece.length || 0);
        const widthMm = Math.round(rawPiece.width || 0);
        const thicknessMm = rawPiece.thickness || defaultThickness;

        if (lengthMm <= 0 || widthMm <= 0) continue;

        const pieceName = rawPiece.name || `Piece ${totalPieces + 1}`;

        // Map edges — analysis may provide edges array with side/finish
        const edgeMap: Record<string, TemplateEdge> = {
          top: { finish: 'RAW' },
          bottom: { finish: 'RAW' },
          left: { finish: 'RAW' },
          right: { finish: 'RAW' },
        };

        if (rawPiece.edges && Array.isArray(rawPiece.edges)) {
          for (const rawEdge of rawPiece.edges) {
            const side = (rawEdge.side || '').toLowerCase();
            // Map FRONT to top (common in drawings)
            const mappedSide = side === 'front' ? 'top' : side === 'back' ? 'bottom' : side;
            if (mappedSide in edgeMap) {
              edgeMap[mappedSide] = mapEdgeFinish(rawEdge.finish, rawEdge.profileType);
            }
          }
        }

        // Map cutouts
        const cutouts: TemplateCutout[] = [];
        if (rawPiece.cutouts && Array.isArray(rawPiece.cutouts)) {
          for (const rawCutout of rawPiece.cutouts) {
            cutouts.push({
              type: mapCutoutType(rawCutout.type),
              quantity: rawCutout.quantity || 1,
            });
          }
        }

        const piece: TemplatePiece = {
          label: pieceName,
          length_mm: lengthMm,
          width_mm: widthMm,
          thickness_mm: thicknessMm,
          edges: {
            top: edgeMap.top,
            bottom: edgeMap.bottom,
            left: edgeMap.left,
            right: edgeMap.right,
          },
          cutouts,
          materialRole: roomToMaterialRole(rawRoom.name, pieceName),
          notes: rawPiece.notes || undefined,
        };

        pieces.push(piece);
        totalPieces++;
        totalArea += (lengthMm * widthMm) / 1_000_000;
      }

      if (pieces.length > 0) {
        templateRooms.push({
          name: rawRoom.name,
          roomType: roomToRoomType(rawRoom.name),
          pieces,
        });
      }
    }

    if (totalPieces === 0) {
      return NextResponse.json(
        { error: 'No valid pieces found in analysis results' },
        { status: 400 }
      );
    }

    // Build template data
    const templateData: TemplateData = {
      rooms: templateRooms,
      totalPieces,
      estimatedArea_sqm: Math.round(totalArea * 10000) / 10000,
    };

    // Create template record
    const template = await prisma.unit_type_templates.create({
      data: {
        name: name.trim(),
        unitTypeCode: unitTypeCode.trim(),
        description: `Created from drawing analysis${analysisId ? ` (analysis #${analysisId})` : ''}`,
        projectId: projectId || null,
        sourceDrawingId: analysisId ? parseInt(analysisId, 10) : null,
        templateData: templateData as unknown as Prisma.InputJsonValue,
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({
      ...template,
      templateData,
      pieceCount: totalPieces,
      estimatedArea_sqm: templateData.estimatedArea_sqm,
      roomCount: templateRooms.length,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating template from analysis:', error);
    return NextResponse.json({ error: 'Failed to create template from analysis' }, { status: 500 });
  }
}
