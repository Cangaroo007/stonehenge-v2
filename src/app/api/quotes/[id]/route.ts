import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createQuoteVersion, createQuoteSnapshot } from '@/lib/services/quote-version-service';
import { checkAndRecordQuoteChanges } from '@/lib/services/buyer-change-tracker';

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

interface CalculationData {
  quoteId: string;
  subtotal: number;
  totalDiscount: number;
  total: number;
  breakdown: Record<string, unknown>;
  appliedRules: unknown[];
  discounts: unknown[];
  price_books: { id: string; name: string } | null;
  calculated_at: string;
}

interface QuoteUpdateData {
  customerId?: number | null;
  projectName?: string | null;
  projectAddress?: string | null;
  status?: string;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  total?: number;
  notes?: string | null;
  rooms?: RoomData[];
  drawingAnalysis?: DrawingAnalysisData | null;
  // Calculation save support
  saveCalculation?: boolean;
  calculation?: CalculationData | null;
  // Delivery & Templating
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quote = await prisma.quotes.findUnique({
      where: { id: parseInt(id) },
      include: {
        customers: {
          include: {
            client_types: true,
            client_tiers: true,
          },
        },
        price_books: true,

        quote_rooms: {
          orderBy: { sort_order: 'asc' },
          include: {
            quote_pieces: {
              orderBy: { sort_order: 'asc' },
              include: {
                piece_features: true,
                materials: true,
                sourceRelationships: true,
                targetRelationships: true,
              },
            },
          },
        },
        quote_files: true,
        quote_drawing_analyses: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json(transformQuoteForClient(quote));
  } catch (error) {
    console.error('Error fetching quote:', error);
    return NextResponse.json({ error: 'Failed to fetch quote' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id);
    const data: QuoteUpdateData = await request.json();

    // Get user ID for version tracking
    let userId = 1; // fallback
    try {
      const authResult = await requireAuth();
      if (!('error' in authResult)) {
        userId = authResult.user.id;
      }
    } catch { /* use fallback */ }

    // Take snapshot before any changes for version diff
    let previousSnapshot;
    try {
      previousSnapshot = await createQuoteSnapshot(quoteId);
    } catch { /* quote may not exist yet in version system */ }

    // Handle calculation save (partial update)
    if (data.saveCalculation) {
      if (!data.calculation) {
        // No calculation data yet — not an error, return current quote
        const quote = await prisma.quotes.findUnique({
          where: { id: quoteId },
          include: {
            customers: {
              include: {
                client_types: true,
                client_tiers: true,
              },
            },
            price_books: true,
          },
        });
        return NextResponse.json(quote);
      }
      const GST_RATE = 0.10;
      const subtotal = data.calculation.total;
      const gst = subtotal * GST_RATE;
      const grandTotal = subtotal + gst;

      const quote = await prisma.quotes.update({
        where: { id: quoteId },
        data: {
          calculated_total: grandTotal,
          calculated_at: new Date(data.calculation.calculated_at),
          calculation_breakdown: data.calculation as unknown as Prisma.InputJsonValue,
          // Also update the totals on the quote
          subtotal: data.calculation.total,
          tax_amount: gst,
          total: grandTotal,
        },
        include: {
          customers: {
            include: {
              client_types: true,
              client_tiers: true,
            },
          },
          price_books: true,
        },
      });

      // Record version
      try {
        await createQuoteVersion(quoteId, userId, 'PRICING_RECALCULATED', undefined, previousSnapshot);
      } catch (versionError) {
        console.error('Error creating version (non-blocking):', versionError);
      }

      // Auto-record buyer changes if this quote is linked to a unit
      try {
        await checkAndRecordQuoteChanges(quoteId, String(userId));
      } catch (changeError) {
        console.error('Error checking buyer changes (non-blocking):', changeError);
      }

      return NextResponse.json(quote);
    }

    // Handle partial update (metadata, status, notes — no room rebuild)
    if (!data.rooms) {
      const updateFields: Record<string, unknown> = {};
      if (data.status !== undefined) updateFields.status = data.status;
      if (data.customerId !== undefined) updateFields.customer_id = data.customerId;
      if (data.projectName !== undefined) updateFields.project_name = data.projectName;
      if (data.projectAddress !== undefined) updateFields.project_address = data.projectAddress;
      if (data.notes !== undefined) updateFields.notes = data.notes;
      // Delivery & templating fields
      if (data.deliveryAddress !== undefined) updateFields.deliveryAddress = data.deliveryAddress;
      if (data.deliveryDistanceKm !== undefined) updateFields.deliveryDistanceKm = data.deliveryDistanceKm;
      if (data.deliveryCost !== undefined) updateFields.deliveryCost = data.deliveryCost;
      if (data.overrideDeliveryCost !== undefined) updateFields.overrideDeliveryCost = data.overrideDeliveryCost;
      if (data.templatingRequired !== undefined) updateFields.templatingRequired = data.templatingRequired;
      if (data.templatingDistanceKm !== undefined) updateFields.templatingDistanceKm = data.templatingDistanceKm;
      if (data.templatingCost !== undefined) updateFields.templatingCost = data.templatingCost;
      if (data.overrideTemplatingCost !== undefined) updateFields.overrideTemplatingCost = data.overrideTemplatingCost;

      if (Object.keys(updateFields).length === 0) {
        return NextResponse.json({ error: 'No valid update data provided' }, { status: 400 });
      }

      const quote = await prisma.quotes.update({
        where: { id: quoteId },
        data: updateFields,
        include: {
          customers: {
            include: {
              client_types: true,
              client_tiers: true,
            },
          },
          price_books: true,
        },
      });

      // Record version
      try {
        const changeType = data.status ? 'STATUS_CHANGED' : 'UPDATED';
        await createQuoteVersion(quoteId, userId, changeType, undefined, previousSnapshot);
      } catch (versionError) {
        console.error('Error creating version (non-blocking):', versionError);
      }

      return NextResponse.json(quote);
    }

    // Full update with rooms (original behavior)
    if (data.rooms) {
      // Delete existing rooms (cascade deletes pieces and features)
      await prisma.quote_rooms.deleteMany({
        where: { quote_id: quoteId },
      });

      // Handle drawing analysis - upsert or delete
      if (data.drawingAnalysis) {
        await prisma.quote_drawing_analyses.upsert({
          where: { quote_id: quoteId },
          create: {
            quote_id: quoteId,
            filename: data.drawingAnalysis.filename,
            analyzed_at: new Date(data.drawingAnalysis.analyzedAt),
            drawing_type: data.drawingAnalysis.drawingType,
            raw_results: data.drawingAnalysis.rawResults as unknown as Prisma.InputJsonValue,
            metadata: data.drawingAnalysis.metadata as unknown as Prisma.InputJsonValue,
            imported_pieces: [],
          },
          update: {
            filename: data.drawingAnalysis.filename,
            analyzed_at: new Date(data.drawingAnalysis.analyzedAt),
            drawing_type: data.drawingAnalysis.drawingType,
            raw_results: data.drawingAnalysis.rawResults as unknown as Prisma.InputJsonValue,
            metadata: data.drawingAnalysis.metadata as unknown as Prisma.InputJsonValue,
          },
        });
      }

      // Update quote with new rooms
      const quote = await prisma.quotes.update({
        where: { id: quoteId },
        data: {
          customer_id: data.customerId,
          project_name: data.projectName,
          project_address: data.projectAddress,
          status: data.status,
          subtotal: data.subtotal,
          tax_rate: data.taxRate,
          tax_amount: data.taxAmount,
          total: data.total,
          notes: data.notes,
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
        },
        include: {
          quote_drawing_analyses: true,
        },
      });

      // Record version
      try {
        await createQuoteVersion(quoteId, userId, 'UPDATED', undefined, previousSnapshot);
      } catch (versionError) {
        console.error('Error creating version (non-blocking):', versionError);
      }

      // Auto-record buyer changes if this quote is linked to a unit
      try {
        await checkAndRecordQuoteChanges(quoteId, String(userId));
      } catch (changeError) {
        console.error('Error checking buyer changes (non-blocking):', changeError);
      }

      return NextResponse.json(quote);
    }

    // No valid update data provided
    return NextResponse.json({ error: 'No valid update data provided' }, { status: 400 });
  } catch (error) {
    console.error('Error updating quote:', error);
    return NextResponse.json({ error: 'Failed to update quote' }, { status: 500 });
  }
}

// ============================================================================
// Response Transforms - convert Prisma snake_case to client camelCase
// ============================================================================

function transformPieceForClient(piece: any) {
  return {
    ...piece,
    lengthMm: piece.length_mm,
    widthMm: piece.width_mm,
    thicknessMm: piece.thickness_mm,
    materialId: piece.material_id,
    materialName: piece.material_name,
    edgeTop: piece.edge_top,
    edgeBottom: piece.edge_bottom,
    edgeLeft: piece.edge_left,
    edgeRight: piece.edge_right,
    sortOrder: piece.sort_order,
    totalCost: Number(piece.total_cost || 0),
    areaSqm: Number(piece.area_sqm || 0),
    materialCost: Number(piece.material_cost || 0),
    featuresCost: Number(piece.features_cost || 0),
  };
}

function transformQuoteForClient(quote: any) {
  return {
    ...quote,
    // Add camelCase aliases for relations
    customer: quote.customers || null,
    rooms: (quote.quote_rooms || []).map((room: any) => ({
      ...room,
      sortOrder: room.sort_order,
      pieces: (room.quote_pieces || []).map((piece: any) => transformPieceForClient(piece)),
    })),
  };
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.quotes.delete({
      where: { id: parseInt(id) },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting quote:', error);
    return NextResponse.json({ error: 'Failed to delete quote' }, { status: 500 });
  }
}
