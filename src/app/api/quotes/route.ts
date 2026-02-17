import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createInitialVersion } from '@/lib/services/quote-version-service';

interface RoomData {
  name: string;
  sortOrder: number;
  pieces: PieceData[];
}

interface PieceData {
  description: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId: number | null;
  materialName: string | null;
  areaSqm: number;
  materialCost: number;
  featuresCost: number;
  totalCost: number;
  sortOrder: number;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  piece_features: FeatureData[];
}

interface FeatureData {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface DrawingAnalysisData {
  filename: string;
  analyzedAt: string;
  drawingType: string;
  rawResults: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
}

interface QuoteCreateData {
  quote_number: string;
  customerId: number | null;
  // Accept both camelCase and snake_case
  project_name?: string | null;
  projectName?: string | null;
  project_address?: string | null;
  projectAddress?: string | null;
  status?: string;
  subtotal: number;
  tax_rate?: number;
  taxRate?: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  created_by: number | null;
  rooms: RoomData[];
  // Accept both field names for drawing analysis
  drawingAnalysis?: DrawingAnalysisData | null;
  quote_drawing_analyses?: DrawingAnalysisData | null;
  // Delivery & Templating (accepted but not persisted to quotes table)
  deliveryAddress?: string | null;
  deliveryDistanceKm?: number | null;
  deliveryZoneId?: number | null;
  deliveryCost?: number | null;
  overrideDeliveryCost?: number | null;
  templatingRequired?: boolean;
  templatingDistanceKm?: number | null;
  templatingCost?: number | null;
  overrideTemplatingCost?: number | null;
}

export async function GET() {
  try {
    const quotes = await prisma.quotes.findMany({
      orderBy: { created_at: 'desc' },
      include: { customers: true },
    });
    return NextResponse.json(quotes);
  } catch (error) {
    console.error('Error fetching quotes:', error);
    return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data: QuoteCreateData = await request.json();

    // Normalise field names: accept both camelCase and snake_case
    const projectName = data.project_name ?? data.projectName ?? null;
    const projectAddress = data.project_address ?? data.projectAddress ?? null;
    const taxRate = data.tax_rate ?? data.taxRate ?? 10;
    const drawingAnalysis = data.drawingAnalysis ?? data.quote_drawing_analyses ?? null;

    // Create the quote with rooms and pieces
    const quote = await prisma.quotes.create({
      data: {
        quote_number: data.quote_number,
        customer_id: data.customerId,
        project_name: projectName,
        project_address: projectAddress,
        status: data.status || 'draft',
        subtotal: data.subtotal,
        tax_rate: taxRate,
        tax_amount: data.tax_amount,
        total: data.total,
        notes: data.notes,
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        created_by: data.created_by,
        updated_at: new Date(),
        quote_rooms: {
          create: data.rooms.map((room: RoomData) => ({
            name: room.name,
            sort_order: room.sortOrder,
            quote_pieces: {
              create: room.pieces.map((piece: PieceData) => ({
                description: piece.description,
                length_mm: piece.lengthMm,
                width_mm: piece.widthMm,
                thickness_mm: piece.thicknessMm,
                material_id: piece.materialId,
                material_name: piece.materialName,
                area_sqm: piece.areaSqm,
                material_cost: piece.materialCost,
                features_cost: piece.featuresCost,
                total_cost: piece.totalCost,
                sort_order: piece.sortOrder,
                edge_top: piece.edgeTop,
                edge_bottom: piece.edgeBottom,
                edge_left: piece.edgeLeft,
                edge_right: piece.edgeRight,
                piece_features: {
                  create: piece.piece_features.map((feature: FeatureData) => ({
                    name: feature.name,
                    quantity: feature.quantity,
                    unit_price: feature.unitPrice,
                    total_price: feature.totalPrice,
                  })),
                },
              })),
            },
          })),
        },
        // Create drawing analysis if provided
        ...(drawingAnalysis && {
          quote_drawing_analyses: {
            create: {
              filename: drawingAnalysis.filename,
              analyzed_at: new Date(drawingAnalysis.analyzedAt),
              drawing_type: drawingAnalysis.drawingType,
              raw_results: drawingAnalysis.rawResults as unknown as Prisma.InputJsonValue,
              metadata: drawingAnalysis.metadata as unknown as Prisma.InputJsonValue,
              imported_pieces: [],
            },
          },
        }),
      } as any,
    });

    // Create initial version for version history
    try {
      const authResult = await requireAuth();
      const userId = 'error' in authResult ? (data.created_by ?? 1) : authResult.user.id;
      await createInitialVersion(quote.id, userId);
    } catch (versionError) {
      console.error('Error creating initial version (non-blocking):', versionError);
    }

    return NextResponse.json(quote, { status: 201 });
  } catch (error) {
    console.error('Error creating quote:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to create quote', details: message },
      { status: 500 }
    );
  }
}
