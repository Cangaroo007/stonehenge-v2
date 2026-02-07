import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { createQuoteVersion, createQuoteSnapshot } from '@/lib/services/quote-version-service';

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
  features: FeatureData[];
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
  calculatedAt: string;
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
        customer: {
          include: {
            client_types: true,
            client_tiers: true,
          },
        },
        price_books: true,
        deliveryZone: true,
        rooms: {
          orderBy: { sortOrder: 'asc' },
          include: {
            pieces: {
              orderBy: { sortOrder: 'asc' },
              include: {
                features: true,
                material: true,
              },
            },
          },
        },
        files: true,
        drawingAnalysis: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json(quote);
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
    if (data.saveCalculation && data.calculation) {
      const GST_RATE = 0.10;
      const subtotal = data.calculation.total;
      const gst = subtotal * GST_RATE;
      const grandTotal = subtotal + gst;

      const quote = await prisma.quotes.update({
        where: { id: quoteId },
        data: {
          calculatedTotal: grandTotal,
          calculatedAt: new Date(data.calculation.calculatedAt),
          calculationBreakdown: data.calculation as unknown as Prisma.InputJsonValue,
          // Also update the totals on the quote
          subtotal: data.calculation.total,
          taxAmount: gst,
          total: grandTotal,
        },
        include: {
          customer: {
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

      return NextResponse.json(quote);
    }

    // Handle status-only update
    if (data.status && !data.rooms) {
      const quote = await prisma.quotes.update({
        where: { id: quoteId },
        data: {
          status: data.status,
        },
        include: {
          customer: {
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
        await createQuoteVersion(quoteId, userId, 'STATUS_CHANGED', undefined, previousSnapshot);
      } catch (versionError) {
        console.error('Error creating version (non-blocking):', versionError);
      }

      return NextResponse.json(quote);
    }

    // Full update with rooms (original behavior)
    if (data.rooms) {
      // Delete existing rooms (cascade deletes pieces and features)
      await prisma.quote_rooms.deleteMany({
        where: { quoteId },
      });

      // Handle drawing analysis - upsert or delete
      if (data.drawingAnalysis) {
        await prisma.quote_drawing_analysis.upsert({
          where: { quoteId },
          create: {
            quoteId,
            filename: data.drawingAnalysis.filename,
            analyzedAt: new Date(data.drawingAnalysis.analyzedAt),
            drawingType: data.drawingAnalysis.drawingType,
            rawResults: data.drawingAnalysis.rawResults as unknown as Prisma.InputJsonValue,
            metadata: data.drawingAnalysis.metadata as unknown as Prisma.InputJsonValue,
            importedPieces: [],
          },
          update: {
            filename: data.drawingAnalysis.filename,
            analyzedAt: new Date(data.drawingAnalysis.analyzedAt),
            drawingType: data.drawingAnalysis.drawingType,
            rawResults: data.drawingAnalysis.rawResults as unknown as Prisma.InputJsonValue,
            metadata: data.drawingAnalysis.metadata as unknown as Prisma.InputJsonValue,
          },
        });
      }

      // Update quote with new rooms
      const quote = await prisma.quotes.update({
        where: { id: quoteId },
        data: {
          customerId: data.customerId,
          projectName: data.projectName,
          projectAddress: data.projectAddress,
          status: data.status,
          subtotal: data.subtotal,
          taxRate: data.taxRate,
          taxAmount: data.taxAmount,
          total: data.total,
          notes: data.notes,
          // Delivery & Templating
          deliveryAddress: data.deliveryAddress,
          deliveryDistanceKm: data.deliveryDistanceKm,
          deliveryZoneId: data.deliveryZoneId,
          deliveryCost: data.deliveryCost,
          overrideDeliveryCost: data.overrideDeliveryCost,
          templatingRequired: data.templatingRequired,
          templatingDistanceKm: data.templatingDistanceKm,
          templatingCost: data.templatingCost,
          overrideTemplatingCost: data.overrideTemplatingCost,
          rooms: {
            create: data.rooms.map((room: RoomData) => ({
              name: room.name,
              sortOrder: room.sortOrder,
              pieces: {
                create: room.pieces.map((piece: PieceData) => ({
                  description: piece.description,
                  lengthMm: piece.lengthMm,
                  widthMm: piece.widthMm,
                  thicknessMm: piece.thicknessMm,
                  materialId: piece.materialId,
                  materialName: piece.materialName,
                  areaSqm: piece.areaSqm,
                  materialCost: piece.materialCost,
                  featuresCost: piece.featuresCost,
                  totalCost: piece.totalCost,
                  sortOrder: piece.sortOrder,
                  edgeTop: piece.edgeTop,
                  edgeBottom: piece.edgeBottom,
                  edgeLeft: piece.edgeLeft,
                  edgeRight: piece.edgeRight,
                  features: {
                    create: piece.features.map((feature: FeatureData) => ({
                      name: feature.name,
                      quantity: feature.quantity,
                      unitPrice: feature.unitPrice,
                      totalPrice: feature.totalPrice,
                    })),
                  },
                })),
              },
            })),
          },
        },
        include: {
          drawingAnalysis: true,
        },
      });

      // Record version
      try {
        await createQuoteVersion(quoteId, userId, 'UPDATED', undefined, previousSnapshot);
      } catch (versionError) {
        console.error('Error creating version (non-blocking):', versionError);
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
